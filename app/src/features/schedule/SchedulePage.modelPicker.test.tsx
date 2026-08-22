import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import type { WorkspaceId } from '@/types/common';
import type { EventRow } from '@/types/event';
import type { Task } from '@/types/task';
import { fromLocalDateTimeInput } from './localDateTime';
import type { RecurrenceInstance } from './recurrence';
import { SchedulePage } from './SchedulePage';

const {
  completeTaskMock,
  createEvent,
  deleteEvent,
  accessibleModelsState,
  jarvisEventsState,
  upcomingEventsState,
  upcomingTasksState,
} = vi.hoisted(() => ({
  completeTaskMock: vi.fn(),
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  accessibleModelsState: { current: null as object | null },
  jarvisEventsState: { rows: [] as unknown[] },
  upcomingEventsState: { rows: [] as RecurrenceInstance[] },
  upcomingTasksState: { rows: [] as Task[] },
}));

vi.mock('@/lib/ai/useAccessibleChatModels', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/useAccessibleChatModels')>(
    '@/lib/ai/useAccessibleChatModels',
  );
  return {
    ...actual,
    useAccessibleChatModels: () =>
      accessibleModelsState.current ?? actual.useAccessibleChatModels(),
  };
});

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    eventRepo: {
      create: createEvent,
      delete: deleteEvent,
    },
  };
});

vi.mock('@/features/tasks', () => ({
  completeTask: completeTaskMock,
  useUpcomingTasks: () => upcomingTasksState.rows,
}));

vi.mock('./hooks', () => ({
  useUpcomingEvents: () => upcomingEventsState.rows,
  useJarvisScheduleEvents: () => jarvisEventsState.rows,
}));

describe('SchedulePage Jarvis Action model picker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    createEvent.mockReset();
    createEvent.mockResolvedValue({});
    deleteEvent.mockReset();
    deleteEvent.mockResolvedValue(undefined);
    completeTaskMock.mockReset();
    completeTaskMock.mockResolvedValue(undefined);
    accessibleModelsState.current = null;
    jarvisEventsState.rows = [];
    upcomingEventsState.rows = [];
    upcomingTasksState.rows = [];
    useAuthStore.setState({
      workspaceId: 'workspace_1' as WorkspaceId,
      localUserId: 'usr_local',
      apiKeys: { google: 'test-key' },
      offlineMode: false,
      plan: 'free',
      defaultLocalModel: '',
      chatModelSelection: {
        mode: 'single',
        providerId: 'google',
        modelId: 'gemini-2.5-flash-lite',
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('restores an unfinished event draft and clears it only after persistence succeeds', async () => {
    window.localStorage.setItem(
      'vibespace-schedule-draft-v1:workspace_1',
      JSON.stringify({
        schemaVersion: 1,
        quick: '',
        title: 'Recovered planning session',
        startInput: '2026-08-10T09:00',
        endInput: '2026-08-10T10:00',
        allDay: false,
        description: 'This draft survived an abrupt shutdown.',
        reminderOffsets: [15],
        scheduleMode: 'event',
        jarvisRecurrence: 'once',
        intervalAmount: 2,
        intervalUnit: 'hours',
        jarvisModelOptionId: '',
      }),
    );
    let resolveCreate: ((value: unknown) => void) | undefined;
    createEvent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    render(<SchedulePage />);

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Recovered planning session',
    );
    expect((screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement).value).toBe(
      'This draft survived an abrupt shutdown.',
    );
    fireEvent.click(screen.getByRole('button', { name: /Save event/i }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem('vibespace-schedule-draft-v1:workspace_1')).toBeTruthy();

    await act(async () => resolveCreate?.({}));
    await waitFor(() =>
      expect(window.localStorage.getItem('vibespace-schedule-draft-v1:workspace_1')).toBeNull(),
    );
  });

  it('rehydrates the selected workspace without copying another workspace draft', async () => {
    const draftFor = (title: string) =>
      JSON.stringify({
        schemaVersion: 1,
        quick: '',
        title,
        startInput: '2026-08-10T09:00',
        endInput: '2026-08-10T10:00',
        allDay: false,
        description: '',
        reminderOffsets: [15],
        scheduleMode: 'event',
        jarvisRecurrence: 'once',
        intervalAmount: 2,
        intervalUnit: 'hours',
        jarvisModelOptionId: '',
      });
    window.localStorage.setItem(
      'vibespace-schedule-draft-v1:workspace_1',
      draftFor('Workspace one draft'),
    );
    window.localStorage.setItem(
      'vibespace-schedule-draft-v1:workspace_2',
      draftFor('Workspace two draft'),
    );
    render(<SchedulePage />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Workspace one draft');

    act(() => {
      useAuthStore.setState({ workspaceId: 'workspace_2' as WorkspaceId });
    });

    await waitFor(() =>
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Workspace two draft',
      ),
    );
    expect(
      JSON.parse(window.localStorage.getItem('vibespace-schedule-draft-v1:workspace_2') ?? '{}')
        .title,
    ).toBe('Workspace two draft');
  });

  it('saves a Jarvis Action with the selected connected model', async () => {
    const success = vi.spyOn(toast, 'success');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis Action$/i }));
    expect(screen.queryByLabelText('All day')).toBeNull();
    expect(screen.queryByText('Reminders')).toBeNull();
    // Redundant natural-language "schedule request" field is gone in Action mode.
    expect(screen.queryByLabelText(/schedule request/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/action model/i));
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
      'Encountered two children with the same key',
    );
    consoleError.mockRestore();
    // Prefer non-Lite Flash when multiple Gemini 2.5 Flash options appear.
    const flashOptions = screen.getAllByRole('button', {
      name: /Select Gemini 2\.5 Flash/i,
    });
    const nonLite = flashOptions.find((el) => !/Lite/i.test(el.textContent ?? ''));
    fireEvent.click(nonLite ?? flashOptions[0]!);
    fireEvent.change(screen.getByLabelText(/action title/i), {
      target: { value: 'Review release notes' },
    });
    fireEvent.change(screen.getByLabelText(/instruction/i), {
      target: { value: 'Review the release notes before publishing.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Jarvis Action/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).toContain('gemini-2.5-flash');
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).not.toContain('gemini-2.5-flash-lite');
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({
      all_day: false,
      reminders: [],
    });
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).toContain('google-gemini-api');
    expect(success).toHaveBeenCalledWith(
      'Jarvis Action saved',
      'Completed, sir. “Review release notes” will run once while VibeSpace is open.',
    );
  });

  it('selects and persists an exact alternative route from one logical model row', async () => {
    const baseRoute = {
      id: 'opencode-cli:openai/gpt-5.6-sol',
      provider: 'opencode',
      modelId: 'openai/gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      connection: OPENCODE_CLI_CONNECTION,
      connectionId: OPENCODE_CLI_CONNECTION.id,
      available: true,
    };
    const fastRoute = {
      ...baseRoute,
      id: 'opencode-cli:openai/gpt-5.6-sol-fast',
      modelId: 'openai/gpt-5.6-sol-fast',
      label: 'GPT-5.6 Sol Fast',
    };
    const unavailableRoute = {
      ...baseRoute,
      id: 'opencode-cli:openai/gpt-5.6-sol-preview',
      modelId: 'openai/gpt-5.6-sol-preview',
      label: 'GPT-5.6 Sol Preview',
      available: false,
    };
    accessibleModelsState.current = {
      groups: [
        {
          id: 'opencode:openai-subscription',
          provider: 'opencode',
          label: 'OpenAI Subscription',
          options: [
            {
              ...baseRoute,
              alternativeRoutes: [baseRoute, fastRoute, unavailableRoute],
            },
          ],
        },
      ],
      flatOptions: [baseRoute, fastRoute, unavailableRoute],
      hasAny: true,
      ollamaCount: 0,
      refreshModels: vi.fn(),
    };

    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis Action$/i }));
    fireEvent.click(screen.getByLabelText(/action model/i));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Select GPT-5.6 Sol' })).toHaveLength(1);
    const unavailable = screen.getByRole('button', { name: 'Use GPT-5.6 Sol Preview' });
    expect((unavailable as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(unavailable);
    expect(unavailable.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Use GPT-5.6 Sol Fast' }));
    expect(screen.queryByRole('group', { name: 'Connected models' })).toBeNull();
    fireEvent.click(screen.getByLabelText(/action model/i));
    expect(
      screen.getByRole('button', { name: 'Use GPT-5.6 Sol Fast' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByLabelText(/action model/i));
    fireEvent.change(screen.getByLabelText(/action title/i), {
      target: { value: 'Review the Fast route' },
    });
    fireEvent.change(screen.getByLabelText(/instruction/i), {
      target: { value: 'Verify the exact scheduled model route.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Jarvis Action/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledOnce());
    const metadataId = createEvent.mock.calls[0]?.[0]?.source_ref?.context?.id;
    expect(typeof metadataId).toBe('string');
    const metadata = JSON.parse(String(metadataId).slice('jarvis_schedule:'.length)) as {
      modelSelection?: Record<string, unknown>;
    };
    expect(metadata.modelSelection).toMatchObject({
      mode: 'single',
      providerId: 'opencode',
      modelId: 'openai/gpt-5.6-sol-fast',
      connectionId: 'opencode-cli',
      connectionMode: OPENCODE_CLI_CONNECTION.mode,
      authSource: OPENCODE_CLI_CONNECTION.authSource,
    });
  });

  it('narrates a manual event only after persistence resolves', async () => {
    const success = vi.spyOn(toast, 'success');
    let resolveCreate: ((value: unknown) => void) | undefined;
    createEvent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<SchedulePage />);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Team sync' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save event/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(success).not.toHaveBeenCalled();
    await act(async () => resolveCreate?.({}));
    expect(success).toHaveBeenCalledWith(
      'Event saved',
      'Completed, sir. “Team sync” is on your schedule.',
    );
  });

  it('saves a recurring Jarvis Action when a repeat preset is selected', async () => {
    const success = vi.spyOn(toast, 'success');
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis Action$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Daily$/i }));
    fireEvent.change(screen.getByLabelText(/action title/i), {
      target: { value: 'Football news' },
    });
    fireEvent.change(screen.getByLabelText(/instruction/i), {
      target: { value: 'Give me the top football headlines.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Jarvis Action/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({ recurrence_rule: 'daily' });
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).toContain('recurrence\\":\\"daily');
    expect(success).toHaveBeenCalledWith(
      'Jarvis Action saved',
      'Completed, sir. “Football news” will run daily while VibeSpace is open.',
    );
  });

  it('narrates persisted event removal and task completion', async () => {
    const now = Date.now();
    const event = {
      id: 'event_remove',
      workspace_id: 'workspace_1',
      title: 'Planning review',
      start_at: now + 60_000,
      end_at: now + 120_000,
      all_day: false,
      timezone: 'UTC',
      attendees: [],
      source: 'manual',
      reminders: [],
      status: 'scheduled',
      created_by: 'usr_local',
      created_at: now,
      updated_at: now,
    } as unknown as EventRow;
    upcomingEventsState.rows = [
      {
        event,
        instanceStartMs: event.start_at,
        instanceEndMs: event.end_at,
        isRecurrence: false,
      },
    ];
    upcomingTasksState.rows = [
      {
        id: 'task_complete',
        workspace_id: 'workspace_1',
        title: 'Publish notes',
        status: 'open',
        priority: 'normal',
        due_at: now + 180_000,
        effort: 1,
        context_tags: [],
        energy_required: 'low',
        reminders: [],
        created_by: 'user_text',
        source_refs: [],
        created_at: now,
        updated_at: now,
      } as unknown as Task,
    ];
    let resolveDelete: (() => void) | undefined;
    deleteEvent.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    let resolveComplete: (() => void) | undefined;
    completeTaskMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveComplete = resolve;
        }),
    );
    const success = vi.spyOn(toast, 'success');
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Planning review' }));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith('event_remove'));
    expect(success).not.toHaveBeenCalled();
    await act(async () => resolveDelete?.());
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        'Event removed',
        'Completed, sir. “Planning review” is gone.',
      ),
    );
    success.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Publish notes' }));
    await waitFor(() => expect(completeTaskMock).toHaveBeenCalledWith('task_complete'));
    expect(success).not.toHaveBeenCalled();
    await act(async () => resolveComplete?.());
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        'Task completed',
        'Completed, sir. “Publish notes” is done.',
      ),
    );
  });

  it('blocks duplicate Jarvis Actions with the same title and start time', async () => {
    const fixedStart = '2027-01-01T08:00';
    jarvisEventsState.rows = [
      {
        id: 'evt_existing',
        title: 'Jarvis Scheduled — Football news',
        start_at: fromLocalDateTimeInput(fixedStart),
        status: 'scheduled',
        source: 'ai',
        source_ref: {
          context: {
            kind: 'memory',
            id: 'jarvis_schedule:{"kind":"jarvis_schedule","prompt":"x","recurrence":"once","modelSelection":{"mode":"single","providerId":"google","modelId":"m"},"agentId":"agent_jarvis","createdBy":"user","runHistory":[],"errorHistory":[]}',
          },
        },
      },
    ];
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis Action$/i }));
    fireEvent.change(screen.getByLabelText('Jarvis action title'), {
      target: { value: 'Football news' },
    });
    fireEvent.change(screen.getByLabelText('Run at'), { target: { value: fixedStart } });
    const warn = vi.spyOn(toast, 'warning');
    fireEvent.click(screen.getByRole('button', { name: /Save Jarvis Action/i }));

    await waitFor(() => expect(warn).toHaveBeenCalledWith('Already scheduled', expect.any(String)));
    expect(createEvent).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
