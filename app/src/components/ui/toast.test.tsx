import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster, toast } from './toast';

describe('Toaster announcements', () => {
  afterEach(() => {
    act(() => toast.clear());
    cleanup();
  });

  it('announces a non-destructive notification as an atomic polite status', () => {
    render(<Toaster />);

    act(() => {
      toast.info('Workspace ready', 'The local workspace finished loading.', 0);
    });

    const announcement = screen.getByRole('status');
    expect(announcement.getAttribute('aria-live')).toBe('polite');
    expect(announcement.getAttribute('aria-atomic')).toBe('true');
    expect(announcement.textContent).toContain('Workspace ready');
  });

  it('announces a destructive notification as an atomic assertive alert', () => {
    render(<Toaster />);

    act(() => {
      toast.error('Save failed', 'The workspace could not be saved.', 0);
    });

    const announcement = screen.getByRole('alert');
    expect(announcement.getAttribute('aria-live')).toBe('assertive');
    expect(announcement.getAttribute('aria-atomic')).toBe('true');
    expect(announcement.textContent).toContain('Save failed');
  });

  it('retains the ordinary elevation while opting MonoChrome out of large shadows and motion', () => {
    render(<Toaster />);

    act(() => {
      toast.info('Workspace ready', undefined, 0);
    });

    const notification = screen.getByRole('status');
    expect(notification.getAttribute('data-monochrome-surface')).toBe('toaster');
    expect(notification.className).toContain('shadow-2xl');
    expect(notification.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(notification.className).toContain('motion-reduce:!transform-none');
    expect(notification.className).toContain('motion-reduce:!opacity-100');
  });
});
