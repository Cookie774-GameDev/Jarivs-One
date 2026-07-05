import { describe, expect, it, vi } from 'vitest';
import type { EventRow } from '@/types/event';
import type { WorkspaceId } from '@/types/common';
import {
  buildJarvisScheduleEventInput,
  findScheduleConflicts,
  isJarvisScheduleEvent,
  scheduleActionSummary,
} from './jarvisSchedules';

describe('Jarvis schedules', () => {
  it('builds a real event row input with Jarvis schedule metadata', () => {
    const input = buildJarvisScheduleEventInput({
      workspaceId: 'workspace_1' as WorkspaceId,
      createdBy: 'agent_jarvis',
      title: 'AI news',
      prompt: 'Summarize AI news',
      startAt: Date.UTC(2026, 5, 25, 13, 0),
      recurrence: 'daily',
      timezone: 'America/Chicago',
      modelSelection: { mode: 'single', providerId: 'openai', modelId: 'gpt-4o' },
      agentId: 'agent_jarvis',
    });

    expect(input.title).toBe('Jarvis Scheduled — AI news');
    expect(input.source).toBe('ai');
    expect(input.recurrence_rule).toBe('daily');
    expect(input.source_ref?.context?.kind).toBe('memory');
    expect(JSON.stringify(input.source_ref)).toContain('gpt-4o');
    expect(input.end_at - input.start_at).toBe(30 * 60 * 1000);
    expect(input.all_day).toBe(false);
    expect(input.reminders).toEqual([]);
  });

  it('detects same-time conflicts without overwriting user events', () => {
    const existing = [
      {
        id: 'evt_1',
        title: 'User standup',
        start_at: 1000,
        end_at: 2000,
        source: 'manual',
      },
      {
        id: 'evt_2',
        title: 'Later',
        start_at: 5000,
        end_at: 6000,
        source: 'manual',
      },
    ] as EventRow[];

    expect(findScheduleConflicts(existing, 1500, 1800).map((event) => event.id)).toEqual(['evt_1']);
  });

  it('identifies Jarvis-created schedule events and formats short summaries', () => {
    const event = {
      id: 'evt_ai',
      title: 'Jarvis Scheduled — AI news',
      source: 'ai',
      source_ref: { context: { kind: 'memory', id: 'jarvis_schedule:daily:agent_jarvis' } },
      recurrence_rule: 'daily',
      status: 'scheduled',
    } as EventRow;

    expect(isJarvisScheduleEvent(event)).toBe(true);
    expect(scheduleActionSummary('created', event)).toBe('Created Jarvis Scheduled — AI news.');
  });

  it('uses repository updates for pause, resume, and delete actions', async () => {
    const eventRepo = {
      update: vi.fn().mockResolvedValue({ title: 'Jarvis Scheduled — AI news' }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await eventRepo.update('evt_1', { status: 'cancelled' });
    await eventRepo.update('evt_1', { status: 'scheduled' });
    await eventRepo.delete('evt_1');

    expect(eventRepo.update).toHaveBeenNthCalledWith(1, 'evt_1', { status: 'cancelled' });
    expect(eventRepo.update).toHaveBeenNthCalledWith(2, 'evt_1', { status: 'scheduled' });
    expect(eventRepo.delete).toHaveBeenCalledWith('evt_1');
  });
});
