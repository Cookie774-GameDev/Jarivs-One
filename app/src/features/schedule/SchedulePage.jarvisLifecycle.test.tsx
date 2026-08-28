import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import { useAuthStore } from '@/stores/auth';
import type { WorkspaceId } from '@/types/common';
import type { EventRow } from '@/types/event';
import type { RecurrenceInstance } from './recurrence';
import {
  parseJarvisScheduleMetadata,
  serializeJarvisScheduleMetadata,
  type JarvisScheduleMetadata,
} from './jarvisSchedules';
import { SchedulePage } from './SchedulePage';

const {
  accessibleModelsState,
  createEvent,
  deleteEvent,
  jarvisEventsState,
  updateEvent,
  upcomingEventsState,
} = vi.hoisted(() => ({
  accessibleModelsState: { current: null as object | null },
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  jarvisEventsState: { rows: [] as EventRow[] },
  updateEvent: vi.fn(),
  upcomingEventsState: { rows: [] as RecurrenceInstance[] },
}));

vi.mock('@/lib/ai/useAccessibleChatModels', () => ({
  useAccessibleChatModels: () => accessibleModelsState.current,
}));

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    eventRepo: {
      create: createEvent,
      update: updateEvent,
      delete: deleteEvent,
    },
  };
});

vi.mock('@/features/tasks', () => ({
  completeTask: vi.fn(),
  useUpcomingTasks: () => [],
}));

vi.mock('./hooks', () => ({
  useUpcomingEvents: () => upcomingEventsState.rows,
  useJarvisScheduleEvents: () => jarvisEventsState.rows,
}));

function buildJarvisEvent(status: EventRow['status']): EventRow {
  const startAt = new Date(2026, 8, 1, 9, 0, 0, 0).getTime();
  const metadata: JarvisScheduleMetadata = {
    kind: 'jarvis_schedule',
    prompt: 'Keep the exact route and summarize the release.',
    recurrence: 'daily',
    modelSelection: {
      mode: 'single',
      providerId: OPENCODE_CLI_CONNECTION.providerId as never,
      modelId: 'openai/gpt-5.6-sol-fast',
      connectionId: OPENCODE_CLI_CONNECTION.id,
      connectionMode: OPENCODE_CLI_CONNECTION.mode,
      authSource: OPENCODE_CLI_CONNECTION.authSource,
      capabilities: OPENCODE_CLI_CONNECTION.capabilities,
    },
    agentId: 'agent_jarvis',
    createdBy: 'jarvis',
    nextRunAt: startAt,
    outputChatId: 'chat_schedule_output',
    runHistory: [
      {
        schemaVersion: 1,
        at: startAt - 86_400_000,
        runId: 'run_1',
        requestId: 'request_1',
        status: 'completed',
      },
    ],
    errorHistory: [{ at: startAt - 43_200_000, error: 'Prior bounded failure' }],
  };
  return {
    id: 'event_jarvis_lifecycle' as EventRow['id'],
    workspace_id: 'workspace_1' as WorkspaceId,
    title: 'Jarvis Scheduled — Release brief',
    description: metadata.prompt,
    start_at: startAt,
    end_at: startAt + 30 * 60 * 1000,
    all_day: false,
    timezone: 'America/Chicago',
    attendees: [],
    source: 'ai',
    source_ref: {
      context: {
        kind: 'memory',
        id: serializeJarvisScheduleMetadata(metadata),
        excerpt: metadata.prompt,
      },
    },
    recurrence_rule: 'daily',
    reminders: [],
    status,
    created_by: 'agent_jarvis',
    created_at: startAt - 1000,
    updated_at: startAt - 1000,
  } as EventRow;
}

describe('SchedulePage Jarvis lifecycle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    createEvent.mockReset().mockResolvedValue({});
    updateEvent.mockReset().mockResolvedValue({});
    deleteEvent.mockReset().mockResolvedValue(undefined);

    const route = {
      id: `${OPENCODE_CLI_CONNECTION.id}:openai/gpt-5.6-sol-fast`,
      provider: 'opencode',
      modelId: 'openai/gpt-5.6-sol-fast',
      label: 'GPT-5.6 Sol Fast',
      connection: OPENCODE_CLI_CONNECTION,
      connectionId: OPENCODE_CLI_CONNECTION.id,
      available: true,
    };
    accessibleModelsState.current = {
      groups: [
        {
          id: `connection:${OPENCODE_CLI_CONNECTION.id}`,
          provider: 'opencode',
          label: 'OpenCode',
          options: [route],
        },
      ],
      flatOptions: [route],
      hasAny: true,
      ollamaCount: 0,
      refreshModels: vi.fn(),
    };
    const event = buildJarvisEvent('scheduled');
    jarvisEventsState.rows = [event];
    upcomingEventsState.rows = [
      {
        event,
        instanceStartMs: event.start_at,
        instanceEndMs: event.end_at,
        isRecurrence: false,
      },
    ];
    useAuthStore.setState({
      workspaceId: 'workspace_1' as WorkspaceId,
      localUserId: 'usr_local',
      chatModelSelection: { mode: 'none' },
    });
  });

  it('edits, cancels, and reopens a Jarvis schedule without losing route or run state', async () => {
    const view = render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Jarvis Scheduled — Release brief' }));
    expect((screen.getByLabelText(/action title/i) as HTMLInputElement).value).toBe(
      'Release brief',
    );
    expect(screen.getByText(/Selected:.*GPT-5\.6 Sol Fast/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Daily$/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.change(screen.getByLabelText(/action title/i), {
      target: { value: 'Updated release brief' },
    });
    fireEvent.change(screen.getByLabelText(/instruction/i), {
      target: { value: 'Updated prompt on the same exact route.' },
    });
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-09-02T11:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Update Jarvis Action/i }));

    await waitFor(() => expect(updateEvent).toHaveBeenCalledOnce());
    expect(createEvent).not.toHaveBeenCalled();
    const [updatedId, patch] = updateEvent.mock.calls[0]!;
    expect(updatedId).toBe('event_jarvis_lifecycle');
    expect(patch.end_at - patch.start_at).toBe(30 * 60 * 1000);
    const updatedMetadata = parseJarvisScheduleMetadata({
      ...buildJarvisEvent('scheduled'),
      ...patch,
    } as EventRow);
    expect(updatedMetadata).toMatchObject({
      prompt: 'Updated prompt on the same exact route.',
      recurrence: 'daily',
      modelSelection: {
        providerId: 'opencode',
        modelId: 'openai/gpt-5.6-sol-fast',
        connectionId: OPENCODE_CLI_CONNECTION.id,
      },
      outputChatId: 'chat_schedule_output',
      runHistory: [{ runId: 'run_1', status: 'completed' }],
      errorHistory: [{ error: 'Prior bounded failure' }],
    });

    updateEvent.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel Jarvis Scheduled — Release brief' }),
    );
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith('event_jarvis_lifecycle', {
        status: 'cancelled',
      }),
    );

    updateEvent.mockClear();
    const cancelled = buildJarvisEvent('cancelled');
    jarvisEventsState.rows = [cancelled];
    upcomingEventsState.rows = [
      {
        event: cancelled,
        instanceStartMs: cancelled.start_at,
        instanceEndMs: cancelled.end_at,
        isRecurrence: false,
      },
    ];
    view.rerender(<SchedulePage />);
    fireEvent.click(screen.getByRole('button', { name: /Jarvis Actions1/i }));
    const actionTitle = screen.getByText('Release brief');
    fireEvent.click(actionTitle.closest('button')!);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reopen Jarvis Scheduled — Release brief' }),
    );
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith('event_jarvis_lifecycle', {
        status: 'scheduled',
      }),
    );
  });

  it('keeps a saved exact route editable while its live catalog row is unavailable', async () => {
    accessibleModelsState.current = {
      groups: [],
      flatOptions: [],
      hasAny: false,
      ollamaCount: 0,
      refreshModels: vi.fn(),
    };
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Jarvis Scheduled — Release brief' }));
    expect(
      screen
        .getAllByText(/saved route unavailable/i)
        .some((element) => element.textContent?.includes('openai/gpt-5.6-sol-fast')),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(/action title/i), {
      target: { value: 'Retained route edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Update Jarvis Action/i }));

    await waitFor(() => expect(updateEvent).toHaveBeenCalledOnce());
    const metadata = parseJarvisScheduleMetadata({
      ...buildJarvisEvent('scheduled'),
      ...updateEvent.mock.calls[0]?.[1],
    } as EventRow);
    expect(metadata?.modelSelection).toMatchObject({
      providerId: 'opencode',
      modelId: 'openai/gpt-5.6-sol-fast',
      connectionId: OPENCODE_CLI_CONNECTION.id,
      connectionMode: OPENCODE_CLI_CONNECTION.mode,
      authSource: OPENCODE_CLI_CONNECTION.authSource,
    });
  });
});
