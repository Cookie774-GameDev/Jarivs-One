import { describe, expect, it } from 'vitest';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import type { ProviderId } from '@/types';
import { resolveComposerCaoBootstrap } from './Composer';

const deepSeekSelection: ChatModelSelection = {
  mode: 'single',
  providerId: 'opencode' as ProviderId,
  modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
  connectionId: OPENCODE_CLI_CONNECTION.id,
  connectionMode: OPENCODE_CLI_CONNECTION.mode,
  authSource: OPENCODE_CLI_CONNECTION.authSource,
  capabilities: OPENCODE_CLI_CONNECTION.capabilities,
};

describe('Composer CAO bootstrap', () => {
  it('replaces the user-facing student selection with the fixed native learner authority', () => {
    const resolved = resolveComposerCaoBootstrap({
      text: 'Have CAO learn the terminal cancellation workflow',
      confirmedReferenceKeys: [],
      selectedModel: deepSeekSelection,
      skillIds: ['analyze'],
    });

    expect(resolved).toMatchObject({
      modelSelection: {
        mode: 'single',
        providerId: 'openai',
        connectionId: 'openai-codex',
        modelId: 'gpt-5.6-terra',
      },
      reasoningPreference: { mode: 'normal', effortOverride: 'high' },
      skillIds: ['analyze', 'jarvis-cao'],
      publicStatus: { identity: 'Jarvis CAO', status: 'queued' },
    });
    expect(resolved?.modelSelection).not.toEqual(deepSeekSelection);
  });

  it('gives a confirmed @CAO reference and action-oriented natural language the identical route', () => {
    const selected = resolveComposerCaoBootstrap({
      text: 'Learn the terminal cancellation workflow',
      confirmedReferenceKeys: ['cao:jarvis-cao'],
      selectedModel: deepSeekSelection,
      skillIds: [],
    });
    const natural = resolveComposerCaoBootstrap({
      text: 'Have Jarvis CAO learn the terminal cancellation workflow',
      confirmedReferenceKeys: [],
      selectedModel: deepSeekSelection,
      skillIds: [],
    });

    expect(selected).not.toBeNull();
    expect(natural).not.toBeNull();
    expect(selected).toEqual(natural);
  });

  it('leaves ordinary and ambiguous Chat turns on their selected model', () => {
    for (const text of ['Explain the cancellation workflow', 'Should CAO learn this?']) {
      expect(
        resolveComposerCaoBootstrap({
          text,
          confirmedReferenceKeys: [],
          selectedModel: deepSeekSelection,
          skillIds: ['analyze'],
        }),
      ).toBeNull();
    }
  });
});
