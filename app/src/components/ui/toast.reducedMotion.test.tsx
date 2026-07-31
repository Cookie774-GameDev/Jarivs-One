import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => reducedMotion.current,
  motion: {
    div: ({
      animate,
      children,
      exit,
      initial,
      layout,
      transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      exit?: unknown;
      initial?: unknown;
      layout?: unknown;
      transition?: unknown;
    }) => (
      <div
        {...props}
        data-motion-animate={animate === undefined ? 'none' : JSON.stringify(animate)}
        data-motion-exit={exit === undefined ? 'none' : JSON.stringify(exit)}
        data-motion-initial={initial === false ? 'false' : JSON.stringify(initial)}
        data-motion-layout={String(layout)}
        data-motion-transition={transition === undefined ? 'none' : JSON.stringify(transition)}
      >
        {children}
      </div>
    ),
  },
}));

import { Toaster, toast } from './toast';

describe('Toaster reduced-motion behavior', () => {
  beforeEach(() => {
    reducedMotion.current = false;
  });

  afterEach(() => {
    act(() => toast.clear());
    cleanup();
  });

  it('renders the final toast state without layout, entrance, or exit animation', () => {
    reducedMotion.current = true;
    render(<Toaster />);
    act(() => {
      toast.info('Reduced notification', undefined, 0);
    });

    const notification = screen.getByRole('status');
    expect(notification.dataset.motionLayout).toBe('false');
    expect(notification.dataset.motionInitial).toBe('false');
    expect(notification.dataset.motionAnimate).toBe('none');
    expect(notification.dataset.motionExit).toBe('none');
    expect(notification.dataset.motionTransition).toBe('{"duration":0}');
  });

  it('retains the ordinary spring entrance and layout animation', () => {
    render(<Toaster />);
    act(() => {
      toast.info('Animated notification', undefined, 0);
    });

    const notification = screen.getByRole('status');
    expect(notification.dataset.motionLayout).toBe('true');
    expect(notification.dataset.motionInitial).not.toBe('false');
    expect(notification.dataset.motionAnimate).not.toBe('none');
    expect(notification.dataset.motionExit).not.toBe('none');
    expect(notification.dataset.motionTransition).not.toBe('none');
  });
});
