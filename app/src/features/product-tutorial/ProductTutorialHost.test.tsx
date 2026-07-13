/**
 * Component tests for the product tutorial offer → tour wiring.
 * Drives the real Host with a controlled UI store status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useUIStore } from '@/stores/ui';
import { ProductTutorialHost } from './ProductTutorialHost';
import { TUTORIAL_STEP_COUNT } from './tutorialState';

beforeEach(() => {
  cleanup();
  useUIStore.setState({
    onboardingComplete: true,
    productTutorialStatus: 'pending',
    route: 'chat',
    settingsOpen: false,
    actionsPaletteOpen: false,
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductTutorialHost', () => {
  it('shows the offer on first start when status is pending', async () => {
    render(<ProductTutorialHost />);
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(await screen.findByText(/Quick tour\?/i)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Do the tutorial/i)).toBeTruthy();
    expect(screen.getByText(/No thanks — skip/i)).toBeTruthy();
  });

  it('skip from offer persists skipped and hides the tutorial', async () => {
    render(<ProductTutorialHost />);
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(await screen.findByText(/No thanks — skip/i));
    expect(useUIStore.getState().productTutorialStatus).toBe('skipped');
    expect(screen.queryByText(/Quick tour\?/i)).toBeNull();
  });

  it('starting the tutorial advances through all 5 steps to completed', async () => {
    render(<ProductTutorialHost />);
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Do the tutorial/i }));

    // Step 1 — coach card is live (not the offer)
    expect(await screen.findByText(/Step 1 of 5/i)).toBeTruthy();
    expect(screen.getByText(/Chat with Jarvis/i)).toBeTruthy();

    // Advance with the Next control (data-tutorial-next) through steps 1–4
    for (let i = 0; i < TUTORIAL_STEP_COUNT - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    }

    expect(await screen.findByText(/Step 5 of 5/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Finish tour/i }));

    await waitFor(() => {
      expect(useUIStore.getState().productTutorialStatus).toBe('completed');
    });
    expect(screen.queryByText(/Step 5 of 5/i)).toBeNull();
  });

  it('does not show offer when status is already completed', async () => {
    useUIStore.setState({ productTutorialStatus: 'completed' });
    render(<ProductTutorialHost />);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/Quick tour\?/i)).toBeNull();
  });

  it('yields tour under Actions/Settings dialogs (z-40) when Peek/Open fires', async () => {
    render(<ProductTutorialHost />);
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Do the tutorial/i }));
    expect(await screen.findByText(/Step 1 of 5/i)).toBeTruthy();

    const shell = document.querySelector('[data-product-tutorial="tour"]') as HTMLElement;
    expect(shell).toBeTruthy();
    expect(shell.getAttribute('data-tutorial-z')).toBe('z-[90]');
    expect(shell.getAttribute('data-tutorial-yields-modal')).toBe('false');

    // Peek at Actions opens the real palette (Dialog z-50) — tour must drop under it.
    fireEvent.click(screen.getByRole('button', { name: /Peek at Actions/i }));
    expect(useUIStore.getState().actionsPaletteOpen).toBe(true);
    await waitFor(() => {
      const el = document.querySelector('[data-product-tutorial="tour"]') as HTMLElement;
      expect(el?.getAttribute('data-tutorial-z')).toBe('z-40');
      expect(el?.getAttribute('data-tutorial-yields-modal')).toBe('true');
      expect(el?.className).toMatch(/\bz-40\b/);
    });

    // Advance to final step and open Settings the same way.
    for (let i = 0; i < TUTORIAL_STEP_COUNT - 1; i++) {
      await act(async () => {
        useUIStore.getState().setActionsPaletteOpen(false);
      });
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    }
    expect(await screen.findByText(/Step 5 of 5/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open Settings/i }));
    expect(useUIStore.getState().settingsOpen).toBe(true);
    await waitFor(() => {
      const el = document.querySelector('[data-product-tutorial="tour"]') as HTMLElement;
      expect(el?.getAttribute('data-tutorial-z')).toBe('z-40');
      expect(el?.className).toMatch(/\bz-40\b/);
    });
  });
});
