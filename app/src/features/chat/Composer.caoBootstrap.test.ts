import { describe, expect, it } from 'vitest';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import type { ProviderId } from '@/types';
import { resolveComposerCaoBootstrap, resolveComposerCaoControl } from './Composer';
import { bootstrapCaoLearning } from '@/features/cao/bootstrap';

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
      decision: bootstrapCaoLearning({
        text: 'Have CAO learn the terminal cancellation workflow',
      }),
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
      decision: bootstrapCaoLearning({
        text: 'Learn the terminal cancellation workflow',
        confirmedReferenceKeys: ['cao:jarvis-cao'],
      }),
      selectedModel: deepSeekSelection,
      skillIds: [],
    });
    const natural = resolveComposerCaoBootstrap({
      decision: bootstrapCaoLearning({
        text: 'Have Jarvis CAO learn the terminal cancellation workflow',
      }),
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
          decision: bootstrapCaoLearning({ text }),
          selectedModel: deepSeekSelection,
          skillIds: ['analyze'],
        }),
      ).toBeNull();
    }
  });

  it('cannot acquire CAO authority from an automatic rewrite of rejected original text', () => {
    const originalDecision = bootstrapCaoLearning({ text: 'Should CAO learn this workflow?' });
    const rewrittenDecision = bootstrapCaoLearning({
      text: 'Have CAO learn this workflow',
    });

    expect(originalDecision).toBeNull();
    expect(rewrittenDecision).not.toBeNull();
    expect(
      resolveComposerCaoBootstrap({
        decision: originalDecision,
        selectedModel: deepSeekSelection,
        skillIds: ['analyze'],
      }),
    ).toBeNull();
  });

  it('resolves explicit multi-target control only inside the active project scope', () => {
    const scope = { accountId: 'account-1', workspaceId: 'workspace-1', projectId: 'project-1' };
    const decision = bootstrapCaoLearning({ text: '@CAO verify chat:chat-1 terminal:terminal-1' });
    expect(
      resolveComposerCaoControl({
        decision,
        scope,
        candidates: [
          {
            ...scope,
            kind: 'chat',
            targetId: 'chat-1',
            title: 'Chat',
            revision: 2,
            selected: true,
            locked: false,
          },
          {
            ...scope,
            kind: 'terminal',
            targetId: 'terminal-1',
            title: 'Terminal',
            revision: 3,
            selected: true,
            locked: false,
          },
        ],
      })?.targets,
    ).toEqual([
      { kind: 'chat', targetId: 'chat-1', revision: 2 },
      { kind: 'terminal', targetId: 'terminal-1', revision: 3 },
    ]);
  });
});
