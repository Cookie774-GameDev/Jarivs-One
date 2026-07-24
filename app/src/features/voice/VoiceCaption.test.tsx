import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from './store';
import { VoiceCaption } from './VoiceCaption';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('VoiceCaption accessibility', () => {
  beforeEach(() => {
    useVoiceStore.getState().reset();
  });

  it('shows interim recognition text without turning each update into a live announcement', () => {
    render(<VoiceCaption />);

    act(() => useVoiceStore.getState().setPartialTranscript('interim speech'));

    expect(screen.getByText('interim speech')).toBeTruthy();
    expect(screen.getByLabelText('Live voice caption').getAttribute('aria-live')).toBe('off');
  });
});
