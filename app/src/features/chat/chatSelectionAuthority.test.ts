import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@/types';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { selectionFromOption } from '@/lib/ai/modelSelection';
import { PROVIDER_CONNECTIONS } from '@/lib/ai/adapters/catalog';
import { restoreExactChatSelection, type ExactChatSelection } from './chatSelectionAuthority';

const openCodeConnection = PROVIDER_CONNECTIONS.find(
  (connection) => connection.id === 'opencode-cli',
)!;
const selected = selectionFromOption(
  openCodeConnection.providerId as ProviderId,
  'opencode-go/deepseek-v4-flash-vision-exp',
  openCodeConnection,
);
if (selected.mode !== 'single') throw new Error('expected exact OpenCode selection');
const exact: ExactChatSelection = selected;

describe('restoreExactChatSelection', () => {
  it('restores the retained per-chat route after late global none hydration', () => {
    expect(restoreExactChatSelection({ mode: 'none' }, exact)).toEqual(exact);
  });

  it('never replaces a newer explicit global selection', () => {
    const newer: ChatModelSelection = {
      mode: 'single',
      providerId: 'groq',
      modelId: 'llama-3.3-70b-versatile',
    };
    expect(restoreExactChatSelection(newer, exact)).toBe(newer);
  });

  it('stays fail-closed when no exact chat route was retained', () => {
    const none = { mode: 'none' } as const;
    expect(restoreExactChatSelection(none, null)).toBe(none);
  });
});
