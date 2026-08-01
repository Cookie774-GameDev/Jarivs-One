import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useCallStore } from './store';
import { useUIStore } from '@/stores/ui';
import { CallModal } from './CallModal';

describe('CallModal orb presentation', () => {
  const initialUiState = useUIStore.getState();

  afterEach(() => {
    act(() => useUIStore.setState(initialUiState));
    act(() => useCallStore.getState().resetCall());
  });

  it('selects the flat orb only for the monochrome theme', () => {
    act(() => {
      useUIStore.setState({ callModalOpen: true, theme: 'monochrome' });
    });
    render(<CallModal runtimeEffectsEnabled={false} />);

    expect(screen.getByRole('dialog', { name: 'Jarvis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hang up' })).toBeTruthy();

    const orb = screen.getByRole('img', { name: 'Voice orb (idle)' });
    expect(screen.getByRole('dialog', { name: 'Jarvis' }).getAttribute('data-sakura-surface')).toBe(
      'call',
    );
    expect(
      screen.getByText('Ready').closest('[data-call-status]')?.getAttribute('data-call-status'),
    ).toBe('idle');
    expect(document.querySelector('[data-sakura-surface="call-transcript"]')).not.toBeNull();
    expect(orb.getAttribute('data-orb-presentation')).toBe('monochrome-flat');

    for (const theme of ['default', 'jarvis', 'vibespace'] as const) {
      act(() => {
        useUIStore.setState({ theme });
      });
      expect(orb.getAttribute('data-orb-presentation')).toBe('default');
    }
  });

  it('projects real error and confirmation states into semantic presentation hooks', () => {
    act(() => {
      useUIStore.setState({ callModalOpen: true, theme: 'sakura' });
      useCallStore.getState().setStatus('error', 'Microphone permission denied');
      useCallStore.getState().setAwaitingConfirm({
        tool: 'files.write',
        summary: 'Update the launch notes',
      });
    });

    render(<CallModal runtimeEffectsEnabled={false} />);

    expect(document.querySelector('[data-call-state="error"]')?.textContent).toContain(
      'Microphone permission denied',
    );
    expect(document.querySelector('[data-call-state="confirmation"]')?.textContent).toContain(
      'Update the launch notes',
    );
  });
});
