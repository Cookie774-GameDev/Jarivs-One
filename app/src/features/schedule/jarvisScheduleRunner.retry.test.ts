import { describe, expect, it } from 'vitest';
import type { EventRow } from '@/types/event';
import type { WorkspaceId } from '@/types/common';
import {
  buildJarvisScheduleEventInput,
  parseJarvisScheduleMetadata,
} from './jarvisSchedules';
import {
  runDueJarvisSchedules,
  type JarvisScheduleRunnerDeps,
} from './jarvisScheduleRunner';

const WORKSPACE = 'wks_schedule_retry' as WorkspaceId;
const NOW = new Date(2026, 6, 9, 12, 0, 0, 0).getTime();

function buildOneShot(): EventRow {
  const startAt = NOW - 60_000;
  const input = buildJarvisScheduleEventInput({
    workspaceId: WORKSPACE,
    createdBy: 'usr_local',
    title: 'Retry test',
    prompt: 'Run the retry test action.',
    startAt,
    recurrence: 'once',
    timezone: 'UTC',
    modelSelection: {
      mode: 'single',
      provider: 'google',
      modelId: 'gemini-2.0-flash',
    } as never,
    agentId: 'agent_jarvis',
  });

  return {
    id: 'evt_schedule_retry_after_message_failure' as EventRow['id'],
    attendees: [],
    created_at: startAt - 1000,
    updated_at: startAt - 1000,
    ...input,
    status: 'scheduled',
  } as EventRow;
}

describe('Jarvis schedule retry recovery', () => {
  it('restores and retries a one-shot when message creation fails after pre-advance', async () => {
    const event = buildOneShot();
    const chats: string[] = [];
    const dispatched: CustomEvent[] = [];
    let messageAttempts = 0;

    const deps: JarvisScheduleRunnerDeps = {
      listEvents: async () => [event],
      updateEvent: async (id, patch) => {
        expect(id).toBe(event.id);
        Object.assign(event, patch);
      },
      createChat: async (input) => {
        chats.push(String(input.id));
      },
      createMessage: async () => {
        messageAttempts += 1;
        if (messageAttempts === 1) {
          throw new Error('message store temporarily unavailable');
        }
      },
      dispatchEvent: (customEvent) => {
        dispatched.push(customEvent);
      },
      now: () => NOW,
    };

    const first = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(first.ran).toEqual([]);
    expect(dispatched).toHaveLength(0);
    expect(event.status).toBe('scheduled');

    const failedMetadata = parseJarvisScheduleMetadata(event)!;
    expect(failedMetadata.nextRunAt).toBe(event.start_at);
    expect(failedMetadata.outputChatId).toBe(chats[0]);
    expect(failedMetadata.runHistory).toHaveLength(0);
    expect(failedMetadata.errorHistory.at(-1)?.error).toContain(
      'message store temporarily unavailable',
    );

    const second = await runDueJarvisSchedules(WORKSPACE, deps);

    expect(second.ran).toEqual([String(event.id)]);
    expect(messageAttempts).toBe(2);
    expect(chats).toHaveLength(1);
    expect(dispatched).toHaveLength(1);
    expect(event.status).toBe('done');

    const completedMetadata = parseJarvisScheduleMetadata(event)!;
    expect(completedMetadata.outputChatId).toBe(chats[0]);
    expect(completedMetadata.runHistory).toHaveLength(1);
  });
});
