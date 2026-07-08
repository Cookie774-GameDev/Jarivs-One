import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import type { WorkspaceId } from '@/types/common';
import { fromLocalDateTimeInput } from './localDateTime';
import { SchedulePage } from './SchedulePage';

const { createEvent, jarvisEventsState } = vi.hoisted(() => ({
  createEvent: vi.fn(),
  jarvisEventsState: { rows: [] as unknown[] },
}));

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    eventRepo: {
      create: createEvent,
      delete: vi.fn(),
    },
  };
});

vi.mock('@/features/tasks', () => ({
  completeTask: vi.fn(),
  useUpcomingTasks: () => [],
}));

vi.mock('./hooks', () => ({
  useUpcomingEvents: () => [],
  useJarvisScheduleEvents: () => jarvisEventsState.rows,
}));

describe('SchedulePage Jarvis Action model picker', () => {
  beforeEach(() => {
    createEvent.mockReset();
    createEvent.mockResolvedValue({});
    jarvisEventsState.rows = [];
    useAuthStore.setState({
      workspaceId: 'workspace_1' as WorkspaceId,
      localUserId: 'usr_local',
      apiKeys: { google: 'test-key' },
      offlineMode: false,
      plan: 'free',
      defaultLocalModel: '',
      chatModelSelection: { mode: 'single', providerId: 'google', modelId: 'gemini-2.5-flash-lite' },
    });
  });

  it('saves a Jarvis Action with the selected connected model', async () => {
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis Action$/i }));
    expect(screen.queryByLabelText('All day')).toBeNull();
    expect(screen.queryByText('Reminders')).toBeNull();
    fireEvent.change(screen.getByLabelText('Jarvis action model'), {
      target: { value: 'google:gemini-2.5-flash' },
    });
    fireEvent.change(screen.getByLabelText('Jarvis action title'), {
      target: { value: 'Review release notes' },
    });
    fireEvent.change(screen.getByLabelText('System prompt'), {
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
  });

  it('saves a recurring Jarvis Action when a repeat preset is selected', async () => {
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis Action$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Daily$/i }));
    fireEvent.change(screen.getByLabelText('Jarvis action title'), {
      target: { value: 'Football news' },
    });
    fireEvent.change(screen.getByLabelText('System prompt'), {
      target: { value: 'Give me the top football headlines.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Jarvis Action/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({ recurrence_rule: 'daily' });
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).toContain('recurrence\\":\\"daily');
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
        source_ref: { context: { kind: 'memory', id: 'jarvis_schedule:{"kind":"jarvis_schedule","prompt":"x","recurrence":"once","modelSelection":{"mode":"single","providerId":"google","modelId":"m"},"agentId":"agent_jarvis","createdBy":"user","runHistory":[],"errorHistory":[]}' } },
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
