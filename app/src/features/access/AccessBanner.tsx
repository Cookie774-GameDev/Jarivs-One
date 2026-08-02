import * as React from 'react';
import { AlertTriangle, CalendarClock, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AccessDisplayState } from './AccessPaywall';
import './sakura-access.css';

export type AccessBannerPendingAction = 'manage-billing' | 'subscribe' | null;

export interface AccessBannerProps {
  /** Authoritative display state from the app-level access host. */
  displayState: AccessDisplayState;
  /** Exact server-derived whole days remaining; never computed here. */
  trialDaysRemaining?: number;
  trialEndsAt?: string;
  paidThroughDate?: string;
  graceEndsAt?: string;
  pendingAction?: AccessBannerPendingAction;
  onManageBilling: () => void;
  onSubscribe: () => void;
  className?: string;
}

interface BannerContent {
  action: 'manage-billing' | 'subscribe';
  actionLabel: string;
  message: React.ReactNode;
  tone: 'warning' | 'danger';
}

function formatServerDate(value: string, includeTime = false): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return value;
    }
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    });
  }

  if (!includeTime) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  });
}

function trialLabel(days: number): string {
  if (days === 0) return 'This is the final day of your VibeSpace Access trial.';
  if (days === 1) return '1 day remains in your VibeSpace Access trial.';
  return `${days} days remain in your VibeSpace Access trial.`;
}

function resolveContent(props: AccessBannerProps): BannerContent | null {
  switch (props.displayState) {
    case 'trialing': {
      const days = props.trialDaysRemaining;
      if (!Number.isInteger(days) || days === undefined || days < 0 || days > 7) return null;
      return {
        action: 'subscribe',
        actionLabel: 'Subscribe',
        message: (
          <>
            {trialLabel(days)}
            {props.trialEndsAt ? <> It ends {formatServerDate(props.trialEndsAt)}.</> : null}
          </>
        ),
        tone: 'warning',
      };
    }
    case 'cancel-at-period-end':
      return {
        action: 'subscribe',
        actionLabel: 'Reactivate access',
        message: props.paidThroughDate ? (
          <>Your access is paid through {formatServerDate(props.paidThroughDate)}.</>
        ) : (
          <>Your access will end after the current paid period.</>
        ),
        tone: 'warning',
      };
    case 'past-due':
      return {
        action: 'manage-billing',
        actionLabel: 'Fix payment',
        message: <>There is a payment problem. Update billing to prevent an access interruption.</>,
        tone: 'danger',
      };
    case 'grace':
      return {
        action: 'manage-billing',
        actionLabel: 'Fix payment',
        message: props.graceEndsAt ? (
          <>Your grace period ends {formatServerDate(props.graceEndsAt, true)}.</>
        ) : (
          <>Your account is in a limited grace period. Check billing for the server deadline.</>
        ),
        tone: 'danger',
      };
    default:
      return null;
  }
}

/**
 * Persistent account-level reminder for time-sensitive access states.
 *
 * It intentionally does not dismiss itself or calculate entitlement. Route
 * integration should mount one instance above page navigation.
 */
export function AccessBanner(props: AccessBannerProps) {
  const content = resolveContent(props);
  if (!content) return null;

  const urgent = content.tone === 'danger';
  const pending = props.pendingAction === content.action;
  const Icon = urgent ? AlertTriangle : content.action === 'subscribe' ? Clock : CalendarClock;
  const onAction = content.action === 'manage-billing' ? props.onManageBilling : props.onSubscribe;

  return (
    <aside
      className={cn(
        'mc7f-access-banner flex flex-col gap-3 border-b px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between [html[data-theme=monochrome]_&]:border-y [html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-current [html[data-theme=monochrome]_&]:bg-background [html[data-theme=monochrome]_&]:font-mono [html[data-theme=monochrome]_&]:shadow-none [html[data-theme=monochrome]_&_*]:rounded-none [html[data-theme=monochrome]_&_*]:shadow-none',
        urgent
          ? 'border-destructive/30 bg-destructive/10 text-foreground'
          : 'border-warning/30 bg-warning/10 text-foreground',
        props.className,
      )}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      data-sakura-tone={content.tone}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon
          className={cn('mt-0.5 h-4 w-4 shrink-0', urgent ? 'text-destructive' : 'text-warning')}
          aria-hidden="true"
        />
        <p>{content.message}</p>
      </div>
      <Button
        type="button"
        variant={urgent ? 'destructive' : 'outline'}
        size="sm"
        disabled={pending}
        onClick={onAction}
      >
        {pending
          ? content.action === 'manage-billing'
            ? 'Opening billing…'
            : 'Opening checkout…'
          : content.actionLabel}
      </Button>
    </aside>
  );
}
