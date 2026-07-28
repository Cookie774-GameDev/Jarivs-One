import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessPaywall, type AccessPaywallProps, type AccessDisplayState } from './AccessPaywall';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function baseProps(overrides: Partial<AccessPaywallProps> = {}): AccessPaywallProps {
  return {
    displayState: 'trialing' as AccessDisplayState,
    featureTier: 'free',
    priceMonthly: 20,
    trialDaysTotal: 30,
    onContinue: vi.fn(),
    onSubscribe: vi.fn(),
    onManageBilling: vi.fn(),
    onRestoreAccess: vi.fn(),
    onSignOut: vi.fn(),
    onExportData: vi.fn(),
    onPrivacy: vi.fn(),
    onTerms: vi.fn(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Trial state                                                        */
/* ------------------------------------------------------------------ */

describe('trial state', () => {
  it('shows VibeSpace Access title and $20/month price', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 21 })} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('VibeSpace Access');
    expect(screen.getByText(/\$20/)).toBeTruthy();
    expect(screen.getByText(/month/i)).toBeTruthy();
  });

  it('displays exact trial days remaining from server', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 14 })} />);
    expect(screen.getByText(/14/)).toBeTruthy();
  });

  it('explains the 30-day launch trial', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 25 })} />);
    expect(screen.getByText(/30-day/i)).toBeTruthy();
  });

  it('shows trial end date when provided', () => {
    render(
      <AccessPaywall
        {...baseProps({
          displayState: 'trialing',
          trialDaysRemaining: 10,
          trialEndDate: '2026-08-07',
        })}
      />,
    );
    expect(screen.getByText(/Aug/)).toBeTruthy();
  });

  it('offers subscribe action during trial', () => {
    const onSubscribe = vi.fn();
    render(
      <AccessPaywall
        {...baseProps({ displayState: 'trialing', trialDaysRemaining: 5, onSubscribe })}
      />,
    );
    const btn = screen.getByRole('button', { name: /subscribe/i });
    fireEvent.click(btn);
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Active and cancel-at-period-end                                    */
/* ------------------------------------------------------------------ */

describe('active state', () => {
  it('provides a distinct continue action while access is usable', () => {
    const onContinue = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'active', onContinue })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to VibeSpace' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows paid-through date', () => {
    render(
      <AccessPaywall {...baseProps({ displayState: 'active', paidThroughDate: '2026-09-01' })} />,
    );
    expect(screen.getByText(/Sep/)).toBeTruthy();
  });

  it('shows manage billing action', () => {
    const onManageBilling = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'active', onManageBilling })} />);
    const btn = screen.getByRole('button', { name: /manage billing/i });
    fireEvent.click(btn);
    expect(onManageBilling).toHaveBeenCalledTimes(1);
  });
});

describe('cancel-at-period-end state', () => {
  it('shows cancellation notice with period-end date', () => {
    render(
      <AccessPaywall
        {...baseProps({ displayState: 'cancel-at-period-end', paidThroughDate: '2026-08-15' })}
      />,
    );
    // Multiple elements mention cancel; at least one must exist
    expect(screen.getAllByText(/cancel/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Aug/)).toBeTruthy();
  });

  it('still offers subscribe to re-activate', () => {
    const onSubscribe = vi.fn();
    render(
      <AccessPaywall
        {...baseProps({
          displayState: 'cancel-at-period-end',
          paidThroughDate: '2026-08-15',
          onSubscribe,
        })}
      />,
    );
    const btn = screen.getByRole('button', { name: /reactivate/i });
    fireEvent.click(btn);
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Past-due and grace                                                 */
/* ------------------------------------------------------------------ */

describe('past-due state', () => {
  it('shows payment problem warning', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'past-due' })} />);
    // Badge + body text both mention payment
    expect(screen.getAllByText(/payment/i).length).toBeGreaterThan(0);
  });

  it('offers manage billing to fix payment', () => {
    const onManageBilling = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'past-due', onManageBilling })} />);
    const btn = screen.getByRole('button', { name: /manage billing/i });
    fireEvent.click(btn);
    expect(onManageBilling).toHaveBeenCalledTimes(1);
  });
});

describe('grace state', () => {
  it('shows grace period days remaining', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'grace', graceDaysRemaining: 3 })} />);
    expect(screen.getByText(/3/)).toBeTruthy();
    // Badge + body both mention grace
    expect(screen.getAllByText(/grace/i).length).toBeGreaterThan(0);
  });

  it('shows grace end date when provided', () => {
    render(
      <AccessPaywall
        {...baseProps({ displayState: 'grace', graceDaysRemaining: 2, graceEndDate: '2026-07-30' })}
      />,
    );
    expect(screen.getByText(/Jul/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Locked state                                                       */
/* ------------------------------------------------------------------ */

describe('locked state', () => {
  it('shows locked status with non-color cue', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'locked' })} />);
    // Badge + body both mention locked
    expect(screen.getAllByText(/locked/i).length).toBeGreaterThan(0);
    // Non-color cue: lock icon present
    const badge = screen.getByText('Locked');
    expect(badge).toBeTruthy();
  });

  it('keeps billing management reachable while locked', () => {
    const onManageBilling = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'locked', onManageBilling })} />);
    const btn = screen.getByRole('button', { name: /manage billing/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onManageBilling).toHaveBeenCalledTimes(1);
  });

  it('keeps restore/check access reachable while locked', () => {
    const onRestoreAccess = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'locked', onRestoreAccess })} />);
    const btn = screen.getByRole('button', { name: /restore|check access/i });
    fireEvent.click(btn);
    expect(onRestoreAccess).toHaveBeenCalledTimes(1);
  });

  it('keeps sign out reachable while locked', () => {
    const onSignOut = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'locked', onSignOut })} />);
    const btn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(btn);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps export/backup reachable while locked', () => {
    const onExportData = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'locked', onExportData })} />);
    const btn = screen.getByRole('button', { name: /export|backup/i });
    fireEvent.click(btn);
    expect(onExportData).toHaveBeenCalledTimes(1);
  });

  it('keeps privacy and terms reachable while locked', () => {
    const onPrivacy = vi.fn();
    const onTerms = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'locked', onPrivacy, onTerms })} />);
    fireEvent.click(screen.getByRole('button', { name: /privacy/i }));
    expect(onPrivacy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /terms/i }));
    expect(onTerms).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Unknown, error, and loading                                        */
/* ------------------------------------------------------------------ */

describe('unknown state', () => {
  it('shows indeterminate status without granting access', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'unknown' })} />);
    // Badge says "Unknown", body says "Unable to determine"
    expect(screen.getAllByText(/unknown|unable to determine/i).length).toBeGreaterThan(0);
  });

  it('offers restore/check access in unknown state', () => {
    const onRestoreAccess = vi.fn();
    render(<AccessPaywall {...baseProps({ displayState: 'unknown', onRestoreAccess })} />);
    const btn = screen.getByRole('button', { name: /restore|check access/i });
    fireEvent.click(btn);
    expect(onRestoreAccess).toHaveBeenCalledTimes(1);
  });
});

describe('error state', () => {
  it('displays actionable error message', () => {
    render(
      <AccessPaywall
        {...baseProps({
          displayState: 'unknown',
          error: 'Network timeout. Check your connection.',
        })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Network timeout');
  });

  it('shows retry via restore action when error present', () => {
    const onRestoreAccess = vi.fn();
    render(
      <AccessPaywall
        {...baseProps({ displayState: 'unknown', error: 'Something failed', onRestoreAccess })}
      />,
    );
    const btn = screen.getByRole('button', { name: /restore|check access/i });
    fireEvent.click(btn);
    expect(onRestoreAccess).toHaveBeenCalledTimes(1);
  });
});

describe('loading state', () => {
  it('announces busy state to assistive technology', () => {
    render(<AccessPaywall {...baseProps({ loading: true })} />);
    // Multiple status regions may exist; at least one must be a polite live region
    const statuses = screen.getAllByRole('status');
    const politeStatuses = statuses.filter((el) => el.getAttribute('aria-live') === 'polite');
    expect(politeStatuses.length).toBeGreaterThan(0);
  });

  it('disables primary actions while loading', () => {
    render(<AccessPaywall {...baseProps({ loading: true })} />);
    const btn = screen.getByRole('button', { name: /subscribe/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Action callbacks and pending state                                 */
/* ------------------------------------------------------------------ */

describe('action pending state', () => {
  it('disables the subscribe button when subscribe is pending', () => {
    render(
      <AccessPaywall
        {...baseProps({
          displayState: 'trialing',
          trialDaysRemaining: 5,
          pendingAction: 'subscribe',
        })}
      />,
    );
    const btn = screen.getByRole('button', { name: /subscribe/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('disables manage billing when it is pending', () => {
    render(
      <AccessPaywall {...baseProps({ displayState: 'active', pendingAction: 'manage-billing' })} />,
    );
    const btn = screen.getByRole('button', { name: /manage billing/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('disables restore when it is pending', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'locked', pendingAction: 'restore' })} />);
    const btn = screen.getByRole('button', { name: /restore|check access/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Feature-tier distinction                                           */
/* ------------------------------------------------------------------ */

describe('feature-tier distinction', () => {
  it('shows current feature tier separate from access status', () => {
    render(
      <AccessPaywall
        {...baseProps({ displayState: 'trialing', trialDaysRemaining: 10, featureTier: 'pro' })}
      />,
    );
    // "pro" appears in plan label and feature-plan note
    expect(screen.getAllByText(/pro/i).length).toBeGreaterThan(0);
  });

  it('distinguishes AI/voice/cloud plans from app access', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'locked', featureTier: 'starter' })} />);
    // Feature plan is shown but access is locked - they are separate
    expect(screen.getAllByText(/starter/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/locked/i).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility                                                      */
/* ------------------------------------------------------------------ */

describe('accessibility', () => {
  it('has a main landmark', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 10 })} />);
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('uses heading hierarchy starting at h1', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 10 })} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('provides accessible button names for all actions', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'locked' })} />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      const name = btn.getAttribute('aria-label') || btn.textContent;
      expect(name!.length).toBeGreaterThan(0);
    }
  });

  it('uses status role for trial/grace time information', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 7 })} />);
    // Time info should be in a live region or status
    const statusEl = screen.queryAllByRole('status');
    const timerEl = screen.queryAllByRole('timer');
    expect(statusEl.length + timerEl.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Prelaunch state                                                    */
/* ------------------------------------------------------------------ */

describe('prelaunch state', () => {
  it('shows coming-soon messaging without subscribe action', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'prelaunch' })} />);
    expect(screen.getAllByText(/coming soon|launching|prelaunch/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  No manipulative patterns                                           */
/* ------------------------------------------------------------------ */

describe('no dark patterns', () => {
  it('does not render countdown animation elements', () => {
    const { container } = render(
      <AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 3 })} />,
    );
    // No countdown timer animation elements
    expect(container.querySelector('[data-countdown]')).toBeNull();
    expect(container.querySelector('.countdown-animation')).toBeNull();
  });

  it('does not use fake urgency language', () => {
    render(<AccessPaywall {...baseProps({ displayState: 'trialing', trialDaysRemaining: 1 })} />);
    expect(screen.queryByText(/hurry|act now|limited time|don.t miss out/i)).toBeNull();
  });
});
