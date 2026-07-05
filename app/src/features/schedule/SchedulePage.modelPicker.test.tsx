import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import type { WorkspaceId } from '@/types/common';
import { SchedulePage } from './SchedulePage';

const { createEvent } = vi.hoisted(() => ({
  createEvent: vi.fn(),
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
}));

describe('SchedulePage Jarvis Action model picker', () => {
  beforeEach(() => {
    createEvent.mockReset();
    createEvent.mockResolvedValue({});
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

    fireEvent.click(screen.getByRole('button', { name: /Jarvis Action/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /Save event/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).toContain('gemini-2.5-flash');
    expect(JSON.stringify(createEvent.mock.calls[0]?.[0])).not.toContain('gemini-2.5-flash-lite');
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({
      all_day: false,
      reminders: [],
    });
  });
});
