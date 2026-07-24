import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { GEMINI_API_CONNECTION } from '@/lib/ai/adapters/nativeCatalog';
import { CODEX_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import {
  markConnectionSessionChecked,
  resetConnectionSessionChecksForTests,
  writeConnectionMetadata,
  writeConnectionPickerStates,
} from '@/lib/ai/connectionState';
import {
  buildJarvisModelSwitchCandidates,
  createModelSelectionActions,
  type JarvisModelSelectionActionState,
} from './registryModelSelection';
import type { JarvisModelSwitchCandidate } from '@/lib/jarvis/modelSwitchDecision';
import { DEFAULT_CUSTOM_STEPS } from '@/lib/ai/stacks/presets';

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
    stackCustomSteps: DEFAULT_CUSTOM_STEPS,
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
    speedRank: 50,
    costClass: 'standard',
    ...overrides,
  };
}

function hiveCandidates(): readonly JarvisModelSwitchCandidate[] {
  return [
    candidate('google', 'gemini-ready', { costClass: 'premium' }),
    candidate('openrouter', 'openrouter-ready', { costClass: 'premium' }),
    candidate('deepseek', 'deepseek-ready', { costClass: 'premium' }),
    candidate('openai', 'openai-ready', { costClass: 'premium' }),
  ];
}

describe('buildJarvisModelSwitchCandidates', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConnectionSessionChecksForTests();
  });

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

  it('uses only current-session authority and exact Codex subscription models by default', () => {
    writeConnectionPickerStates({
      'openai-codex': { available: true, auth: 'authenticated' },
    });

    const stale = buildJarvisModelSwitchCandidates(state(), {
      connections: [CODEX_CLI_CONNECTION],
    }).filter((candidate) => candidate.selection.connectionId === 'openai-codex');
    expect(stale.map((candidate) => candidate.selection.modelId)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
    expect(stale.every((candidate) => !candidate.connected && !candidate.available)).toBe(true);

    writeConnectionMetadata({
      'openai-codex': {
        installation: 'installed',
        auth: 'authenticated',
      },
    });
    markConnectionSessionChecked(['openai-codex']);
    const current = buildJarvisModelSwitchCandidates(state(), {
      connections: [CODEX_CLI_CONNECTION],
    }).filter((candidate) => candidate.selection.connectionId === 'openai-codex');
    expect(current.map((candidate) => candidate.selection.modelId)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
    expect(current.every((candidate) => candidate.connected && candidate.available)).toBe(true);
  });
});

describe('chat.model.switch action', () => {
  function setup(input: {
    initial?: JarvisModelSelectionActionState;
    candidates: readonly JarvisModelSwitchCandidate[];
    apply?: (selection: ChatModelSelection) => void;
    validate?: (
      selection: ChatModelSelection,
      state: JarvisModelSelectionActionState,
      requirements: Readonly<{ images?: boolean; tools?: boolean }>,
    ) => { ok: true; selection: ChatModelSelection } | { ok: false; message: string };
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
      validateSelection: input.validate ?? ((selection) => ({ ok: true, selection })),
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
      summary: expect.stringMatching(
        /Model switched.*google\/gemini-2.5-flash.*next turn.*current response keeps its captured model/i,
      ),
    });
    expect(test.apply).toHaveBeenCalledOnce();
    expect(test.getState().chatModelSelection).toEqual(selection('google', 'gemini-2.5-flash'));
  });

  it('applies a verified Hive Balanced request and refuses it when readiness validation fails', async () => {
    const ready = setup({
      initial: state({
        chatModelSelection: selection('openai', 'current-premium'),
        selectedModels: { openai: 'current-premium' },
      }),
      candidates: [
        candidate('openai', 'current-premium', { costClass: 'premium' }),
        ...hiveCandidates(),
      ],
    });
    await expect(
      ready.action.run({ request: 'Use Hive Balanced.' }, { source: 'user' }),
    ).resolves.toMatchObject({
      ok: true,
      data: { hiveId: 'balanced' },
    });
    expect(ready.getState().chatModelSelection).toEqual({
      mode: 'hive',
      hiveId: 'balanced',
    });

    const blocked = setup({
      candidates: hiveCandidates(),
      validate: () => ({ ok: false, message: 'Hive providers are not connected.' }),
      apply: vi.fn(),
    });
    await expect(
      blocked.action.run({ request: 'Use Hive Balanced.' }, { source: 'user' }),
    ).resolves.toEqual({
      ok: false,
      error: 'Hive providers are not connected.',
    });
    expect(blocked.apply).not.toHaveBeenCalled();
  });

  it('passes requested capabilities through the final Hive readiness gate', async () => {
    const apply = vi.fn();
    const validate = vi.fn(
      (
        selection: ChatModelSelection,
        _state: JarvisModelSelectionActionState,
        requirements: Readonly<{ images?: boolean; tools?: boolean }>,
      ) =>
        requirements.tools
          ? ({ ok: false, message: 'Hive Balanced cannot use these tools.' } as const)
          : ({ ok: true, selection } as const),
    );
    const test = setup({
      initial: state({
        chatModelSelection: selection('openai', 'current-premium'),
        selectedModels: { openai: 'current-premium' },
      }),
      candidates: [
        candidate('openai', 'current-premium', { costClass: 'premium' }),
        ...hiveCandidates(),
      ],
      validate,
      apply,
    });

    await expect(
      test.action.run({ request: 'Use Hive Balanced.', needsTools: true }, { source: 'user' }),
    ).resolves.toEqual({
      ok: false,
      error: 'Hive Balanced cannot use these tools.',
    });
    expect(validate).toHaveBeenCalledWith(
      { mode: 'hive', hiveId: 'balanced' },
      expect.any(Object),
      { images: false, tools: true },
    );
    expect(apply).not.toHaveBeenCalled();
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

  it('consumes privacy and cost approval only from a complete canonical execution context', async () => {
    const initial = state({
      chatModelSelection: selection('ollama', 'llama3.2'),
      selectedModels: { ollama: 'llama3.2' },
    });
    const candidates = [
      candidate('ollama', 'llama3.2', { costClass: 'free' }),
      candidate('google', 'gemini', { costClass: 'premium' }),
    ];
    const legacy = setup({ initial, candidates });

    await expect(
      legacy.action.run(
        { request: 'Switch to Gemini.' },
        { source: 'ai', approvalId: 'approval-shaped-but-incomplete' },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/additional approval required/i),
    });
    expect(legacy.apply).not.toHaveBeenCalled();

    const correlationOnly = setup({ initial, candidates });
    await expect(
      correlationOnly.action.run(
        { request: 'Switch to Gemini.' },
        {
          source: 'ai',
          accountId: 'account-kernel',
          runId: 'run-kernel',
          approvalId: 'approval-kernel',
          requestId: 'request-kernel',
          attemptNumber: 1,
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/additional approval required/i),
    });
    expect(correlationOnly.apply).not.toHaveBeenCalled();

    const canonical = setup({ initial, candidates });
    await expect(
      canonical.action.run(
        { request: 'Switch to Gemini.' },
        {
          source: 'ai',
          accountId: 'account-kernel',
          runId: 'run-kernel',
          approvalId: 'approval-kernel',
          requestId: 'request-kernel',
          attemptNumber: 1,
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      summary: expect.stringMatching(/Model switched.*google\/gemini/i),
    });
    expect(canonical.apply).toHaveBeenCalledOnce();
    expect(canonical.getState().chatModelSelection).toEqual(selection('google', 'gemini'));
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
