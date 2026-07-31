import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from './store';
import { VoiceCaption } from './VoiceCaption';

const foreground = vi.hoisted(() => ({ current: true }));

vi.mock('./useAppForeground', () => ({
  useAppForeground: () => foreground.current,
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  motion: {
    div: ({
      children,
      layout,
      initial: _initial,
      animate,
      exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      layout?: boolean;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <div
        {...props}
        data-layout={String(Boolean(layout))}
        data-enter-motion={String(Boolean(animate))}
        data-exit-motion={String(Boolean(exit))}
      >
        {children}
      </div>
    ),
  },
}));

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('VoiceCaption accessibility', () => {
  beforeEach(() => {
    useVoiceStore.getState().reset();
    foreground.current = true;
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows interim recognition text without turning each update into a live announcement', () => {
    render(<VoiceCaption />);

    act(() => useVoiceStore.getState().setPartialTranscript('interim speech'));

    expect(screen.getByText('interim speech')).toBeTruthy();
    expect(screen.getByLabelText('Live voice caption').getAttribute('aria-live')).toBe('off');
  });

  it('disables caption layout and transition motion when reduced motion is requested', () => {
    setReducedMotion(true);
    render(<VoiceCaption />);

    act(() => useVoiceStore.getState().setPartialTranscript('reduced motion speech'));

    const surface = screen.getByText('reduced motion speech').parentElement;
    expect(screen.getByLabelText('Live voice caption').dataset.motionEnabled).toBe('false');
    expect(surface?.dataset.layout).toBe('false');
    expect(surface?.dataset.enterMotion).toBe('false');
    expect(surface?.dataset.exitMotion).toBe('false');
  });

  it('disables caption motion while the app is backgrounded', () => {
    foreground.current = false;
    render(<VoiceCaption />);

    act(() => useVoiceStore.getState().setPartialTranscript('background speech'));

    const surface = screen.getByText('background speech').parentElement;
    expect(screen.getByLabelText('Live voice caption').dataset.motionEnabled).toBe('false');
    expect(surface?.dataset.layout).toBe('false');
    expect(surface?.dataset.enterMotion).toBe('false');
  });

  it('preserves the complete caption as bounded, scrollable, wrapping text', () => {
    const longCaption = `A long caption ${'with additional words '.repeat(20)}`.trim();
    render(<VoiceCaption />);

    act(() => useVoiceStore.getState().setPartialTranscript(longCaption));

    const text = screen.getByText(longCaption);
    expect(text.classList.contains('line-clamp-2')).toBe(false);
    expect(text.classList.contains('whitespace-pre-wrap')).toBe(true);
    expect(text.classList.contains('break-words')).toBe(true);
    expect(text.parentElement?.classList.contains('overflow-y-auto')).toBe(true);
  });
});
