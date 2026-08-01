import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const notificationState = vi.hoisted(() => ({
  notificationMaster: true,
  setNotificationMaster: vi.fn(),
  doneNotifications: {
    jarvis: true,
    terminal: true,
    tasks: true,
    contextMaps: true,
    skills: true,
  },
  setDoneNotification: vi.fn(),
  aiCompletionCue: true,
  setAiCompletionCue: vi.fn(),
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: typeof notificationState) => unknown) =>
    selector(notificationState),
}));

vi.mock('@/lib/notifications', () => ({
  DONE_NOTIFICATION_LABELS: {
    jarvis: 'Jarvis responses',
    terminal: 'Terminal exits',
    tasks: 'Tasks',
    contextMaps: 'Context maps',
    skills: 'Skill changes',
  },
  notifyDone: vi.fn(),
}));

import { Notifications } from './Notifications';

describe('Notifications MonoChrome appearance', () => {
  afterEach(cleanup);

  it('flattens every visible Switch thumb and disables track/thumb motion only in MonoChrome or reduced motion', () => {
    render(<Notifications />);

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(7);

    for (const control of switches) {
      expect(control.firstElementChild?.className).toContain('shadow-lg');
      expect(control.className).toContain('[html[data-theme=monochrome]_&_span]:shadow-none');
      expect(control.className).toContain('[html[data-theme=monochrome]_&]:transition-none');
      expect(control.className).toContain('[html[data-theme=monochrome]_&_span]:transition-none');
      expect(control.className).toContain('motion-reduce:transition-none');
      expect(control.className).toContain('motion-reduce:[&_span]:transition-none');
    }
  });
});
