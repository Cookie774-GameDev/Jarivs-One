import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessBanner, type AccessBannerProps } from './AccessBanner';

function props(overrides: Partial<AccessBannerProps> = {}): AccessBannerProps {
  return {
    displayState: 'active',
    onManageBilling: vi.fn(),
    onSubscribe: vi.fn(),
    ...overrides,
  };
}

describe('AccessBanner', () => {
  it.each(['prelaunch', 'active', 'locked', 'unknown'] as const)(
    'does not render a route-level banner for %s',
    (displayState) => {
      const view = render(<AccessBanner {...props({ displayState })} />);
      expect(view.container.textContent).toBe('');
    },
  );

  it('does not warn throughout the entire trial', () => {
    const view = render(
      <AccessBanner
        {...props({
          displayState: 'trialing',
          trialDaysRemaining: 8,
        })}
      />,
    );
    expect(view.container.textContent).toBe('');
  });

  it.each([
    [7, '7 days'],
    [3, '3 days'],
    [1, '1 day'],
    [0, 'final day'],
  ] as const)('shows the required trial warning at %s days', (remaining, label) => {
    render(
      <AccessBanner
        {...props({
          displayState: 'trialing',
          trialDaysRemaining: remaining,
          trialEndsAt: '2026-08-27',
        })}
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(new RegExp(label, 'i'));
    expect(screen.getByText(/Aug 27, 2026/)).toBeTruthy();
  });

  it('does not invent a countdown when trial days are absent or invalid', () => {
    const view = render(
      <AccessBanner
        {...props({
          displayState: 'trialing',
          trialDaysRemaining: -1,
        })}
      />,
    );
    expect(view.container.textContent).toBe('');
  });

  it('shows an exact paid-through date and reactivation action after cancellation', () => {
    const onSubscribe = vi.fn();
    render(
      <AccessBanner
        {...props({
          displayState: 'cancel-at-period-end',
          onSubscribe,
          paidThroughDate: '2026-09-04',
        })}
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(/Sep 4, 2026/);
    fireEvent.click(screen.getByRole('button', { name: /reactivate/i }));
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });

  it('announces past-due state immediately and routes payment repair to billing', () => {
    const onManageBilling = vi.fn();
    render(
      <AccessBanner
        {...props({
          displayState: 'past-due',
          onManageBilling,
        })}
      />,
    );

    expect(screen.getByRole('alert').textContent).toMatch(/payment/i);
    fireEvent.click(screen.getByRole('button', { name: /fix payment/i }));
    expect(onManageBilling).toHaveBeenCalledTimes(1);
  });

  it('announces the exact server grace deadline and does not derive it locally', () => {
    render(
      <AccessBanner
        {...props({
          displayState: 'grace',
          graceEndsAt: '2026-08-02T14:30:00Z',
        })}
      />,
    );

    expect(screen.getByRole('alert').textContent).toMatch(/Aug 2, 2026/);
    expect(screen.getByRole('alert').textContent).toMatch(/2:30 PM UTC/);
  });

  it('preserves an invalid server date as text instead of guessing', () => {
    render(
      <AccessBanner
        {...props({
          displayState: 'grace',
          graceEndsAt: 'not-a-date',
        })}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('not-a-date');
  });

  it('disables only the pending action and keeps warning text visible', () => {
    render(
      <AccessBanner
        {...props({
          displayState: 'past-due',
          pendingAction: 'manage-billing',
        })}
      />,
    );

    expect(
      (screen.getByRole('button', { name: /opening billing/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/payment/i);
  });
});
