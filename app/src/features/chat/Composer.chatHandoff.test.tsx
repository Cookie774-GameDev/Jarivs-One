import { describe, expect, it } from 'vitest';
import type { ChatHandoffProjectionV1 } from './chatHandoffProjection';
import { buildComposerChatHandoffPayload } from './Composer';

const projection: ChatHandoffProjectionV1 = {
  version: 1,
  policyVersion: 1,
  source: {
    chatId: 'chat-source',
    title: 'Source chat',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
  },
  snapshotAt: 100,
  boundaryAt: 10,
  boundaryMessageId: 'message-1',
  goal: 'Finish Task 2',
  status: 'Last visible assistant activity',
  lastMeaningfulActivity: 'Projection is green.',
  recentSections: [
    {
      messageId: 'message-1',
      role: 'assistant',
      createdAt: 99,
      visibleText: 'Projection is green.',
      chunks: ['Projection is green.'],
    },
  ],
  olderDigest: 'No older visible history.',
  summaries: { files: [], tools: [], actions: [], decisions: [], blockers: [], results: [] },
};

describe('Composer chat handoff send payload', () => {
  it('combines the editable instruction and draft with one safe structured handoff part', () => {
    const result = buildComposerChatHandoffPayload({
      projection,
      instruction: 'Review the source carefully.',
      draftText: 'Then continue Task 2.',
    });

    expect(result.text).toContain('Review the source carefully.\n\nThen continue Task 2.');
    expect(result.text).toContain('Projection is green.');
    expect(result.part).toEqual({
      kind: 'chat_handoff',
      handoff: {
        version: 1,
        sourceChatId: 'chat-source',
        sourceTitle: 'Source chat',
        snapshotAt: 100,
        boundaryMessageId: 'message-1',
        instruction: 'Review the source carefully.\n\nThen continue Task 2.',
        projection,
      },
    });
  });
});
