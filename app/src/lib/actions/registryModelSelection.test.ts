import { describe, expect, it, vi } from 'vitest';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { GEMINI_API_CONNECTION } from '@/lib/ai/adapters/nativeCatalog';
import {
  buildJarvisModelSwitchCandidates,
  createModelSelectionActions,
  type JarvisModelSelectionActionState,
} from './registryModelSelection';
import type { JarvisModelSwitchCandidate } from '@/lib/jarvis/modelSwitchDecision';

function selection(
  providerId: Extract<ChatModelSelection, { mode: 'single' }>['providerId'],
  modelId: string,
): Extract<ChatModelSelection, { mode: 'single' }> {
  return { mode: 'single', providerId, modelId };
}

function state(
  overrides: Partial<JarvisModelSelectionActionState> = {},
): JarvisModelSelectionActionState {
  return {
    chatModelSelection: selection('openai', 'gpt-4o-mini'),
    previousChatModelSelection: { mode: 'none' },
    selectedModels: { openai: 'gpt-4o-mini' },
    apiKeys: {},
    offlineMode: false,
    plan: 'free',
    defaultLocalModel: 'llama3.2',
    ...overrides,
  };
}

function candidate(
  providerId: Extract<ChatModelSelection, { mode: 'single' }>['providerId'],
  modelId: string,
  overrides: Partial<JarvisModelSwitchCandidate> = {},
): JarvisModelSwitchCandidate {
  return {
    selection: selection(providerId, modelId),
    connected: true,
    available: true,
    supportsImages: true,
    supportsTools: true,
    codingRank: 50,
    costClass: 'standard',
    ...overrides,
  };
}

describe('buildJarvisModelSwitchCandidates', () => {
  it('derives connection, capability, preference, and cost truth without copying keys', () => {
    const auth = state({
      chatModelSelection: selection('google', 'gemini-2.5-flash'),
      selectedModels: { google: 'gemini-2.5-flash' },
      apiKeys: { google: 'must-not-escape' },
    });
    const candidates = buildJarvisModelSwitchCandidates(auth, {
      connections: [GEMINI_API_CONNECTION],
      connectionStates: {
        'google-gemini-api': { available: true, auth: 'authenticated' },
      },
      modelOptions: [
        {
          provider: 'google',
          id: 'gemini-2.5-flash',
          label: 'Gemini 2.5 Flash',
        },
      ],
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        selection: expect.objectContaining({
          providerId: 'google',
          modelId: 'gemini-2.5-flash',
          connectionId: 'google-gemini-api',
        }),
        preferred: true,
        connected: true,
        available: true,
        supportsImages: true,
      }),
    ]);
    expect(JSON.stringify(candidates)).not.toMatch(/must-not-escape|apiKeys|accountLabel|error/);
    expect(Object.isFrozen(candidates)).toBe(true);
  });

  it('does not promote an observed unauthenticated connection', () => {
    const candidates = buildJarvisModelSwitchCandidates(state(), {
      connections: [GEMINI_API_CONNECTION],
      connectionStates: {
        'google-gemini-api': { available: true, auth: 'unauthenticated' },
      },
      modelOptions: [
        {
          provider: 'google',
          id: 'gemini-2.5-flash',
          label: 'Gemini 2.5 Flash',
        },
      ],
    });

    expect(candidates[0]).toMatchObject({ connected: false, available: false });
  });
});

describe('chat.model.switch action', () => {
  function setup(input: {
    initial?: JarvisModelSelectionActionState;
    candidates: readonly JarvisModelSwitchCandidate[];
    apply?: (selection: ChatModelSelection) => void;
  }) {
    let current = input.initial ?? state();
    const apply =
      input.apply ??
      vi.fn((next: ChatModelSelection) => {
        current = {
          ...current,
          previousChatModelSelection: current.chatModelSelection,
          chatModelSelection: next,
        };
      });
    const action = createModelSelectionActions({
      getState: () => current,
      buildCandidates: () => input.candidates,
      applySelection: apply,
    })[0]!;
    return { action, apply, getState: () => current };
  }

  it('applies and verifies only a ready decision', async () => {
    const test = setup({
      candidates: [candidate('openai', 'gpt-4o-mini'), candidate('google', 'gemini-2.5-flash')],
    });

    const result = await test.action.run({ request: 'Switch to Gemini.' }, { source: 'ai' });

    expect(result).toMatchObject({
      ok: true,
      summary: expect.stringMatching(/Model switched.*google\/gemini-2.5-flash/i),
    });
    expect(test.apply).toHaveBeenCalledOnce();
    expect(test.getState().chatModelSelection).toEqual(selection('google', 'gemini-2.5-flash'));
  });

  it.each([
    [
      'not connected',
      state(),
      [candidate('google', 'gemini', { connected: false, available: false })],
      'Switch to Gemini.',
    ],
    [
      'additional privacy and cost approval',
      state({
        chatModelSelection: selection('ollama', 'llama3.2'),
        selectedModels: { ollama: 'llama3.2' },
      }),
      [
        candidate('ollama', 'llama3.2', { costClass: 'free' }),
        candidate('google', 'gemini', { costClass: 'premium' }),
      ],
      'Switch to Gemini.',
    ],
  ])('refuses %s with zero mutation', async (_label, initial, candidates, request) => {
    const apply = vi.fn();
    const test = setup({ initial, candidates, apply });

    const result = await test.action.run({ request }, { source: 'ai' });

    expect(result.ok).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('returns a verified no-op when the requested model is already selected', async () => {
    const apply = vi.fn();
    const test = setup({
      initial: state({
        chatModelSelection: selection('google', 'gemini'),
        selectedModels: { google: 'gemini' },
      }),
      candidates: [candidate('google', 'gemini')],
      apply,
    });

    const result = await test.action.run({ request: 'Switch to Gemini.' }, { source: 'ai' });

    expect(result).toMatchObject({ ok: true, summary: expect.stringMatching(/already selected/i) });
    expect(apply).not.toHaveBeenCalled();
  });

  it('fails closed when the post-write selection cannot be verified', async () => {
    const test = setup({
      candidates: [candidate('openai', 'gpt-4o-mini'), candidate('google', 'gemini')],
      apply: vi.fn(),
    });

    const result = await test.action.run({ request: 'Switch to Gemini.' }, { source: 'ai' });

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/verification failed/i),
    });
  });
});
