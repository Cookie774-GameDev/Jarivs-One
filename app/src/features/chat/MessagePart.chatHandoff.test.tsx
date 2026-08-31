import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Part } from '@/types/chat';
import { MessagePart } from './MessagePart';

const part: Extract<Part, { kind: 'chat_handoff' }> = {
  kind: 'chat_handoff',
  handoff: {
    version: 1,
    sourceChatId: 'chat-source',
    sourceTitle: 'Source chat',
    snapshotAt: 100,
    boundaryMessageId: 'message-1',
    instruction: 'Review and continue the work.',
    projection: {
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
      goal: 'Ship the release',
      status: 'Last visible assistant activity',
      lastMeaningfulActivity: 'All tests passed.',
      recentSections: [],
      olderDigest: 'No older visible history.',
      summaries: {
        files: [],
        tools: [],
        actions: [],
        decisions: [],
        blockers: [],
        results: [],
      },
    },
  },
};

describe('MessagePart chat handoff', () => {
  it('renders a safe durable handoff summary without dumping the transcript', () => {
    render(<MessagePart part={part} allParts={[part]} />);

    expect(screen.getByText('Handoff from Source chat')).toBeTruthy();
    expect(screen.getByText('Review and continue the work.')).toBeTruthy();
    expect(screen.getByText('Ship the release')).toBeTruthy();
    expect(screen.queryByText('No older visible history.')).toBeNull();
  });
});
