import * as React from 'react';
import {
  Lock,
  CreditCard,
  RefreshCw,
  LogOut,
  Download,
  ShieldCheck,
  FileText,
  ScrollText,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  HelpCircle,
  CalendarClock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Authoritative display states provided by the server/host.
 * The component never calculates or grants entitlement locally.
 */
export type AccessDisplayState =
  | 'prelaunch'
  | 'trialing'
  | 'active'
  | 'cancel-at-period-end'
  | 'past-due'
  | 'grace'
  | 'locked'
  | 'unknown';

/** Which async action is currently in flight, if any. */
export type PendingAction =
  | 'continue'
  | 'subscribe'
  | 'manage-billing'
  | 'restore'
  | 'sign-out'
  | 'export'
  | null;

export interface AccessPaywallProps {
  /** Authoritative server/host display state. Never inferred locally. */
  displayState: AccessDisplayState;

  /** Existing feature-plan tier (free, starter, pro, ultra, apex). */
  featureTier: string;

  /** Monthly price in USD for VibeSpace Access. Default 20. */
  priceMonthly?: number;

  /** Total launch-trial length in days. Default 30. */
  trialDaysTotal?: number;

  /** Exact server-provided trial days remaining. */
  trialDaysRemaining?: number;

  /** ISO date string for trial end, from server. */
  trialEndDate?: string;

  /** Exact server-provided grace days remaining. */
  graceDaysRemaining?: number;

  /** ISO date string for grace period end, from server. */
  graceEndDate?: string;

  /** ISO date string for paid-through date, from server. */
  paidThroughDate?: string;

  /** Whether the screen is in a loading/busy state. */
  loading?: boolean;

  /** Actionable error message from the host. */
  error?: string | null;

  /** Which action is currently pending. */
  pendingAction?: PendingAction;

  /* --- Callbacks --- */
  onContinue: () => void;
  onSubscribe: () => void;
  onManageBilling: () => void;
  onRestoreAccess: () => void;
  onSignOut: () => void;
  onExportData: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}

/* ------------------------------------------------------------------ */
/*  Date formatting helper                                             */
/* ------------------------------------------------------------------ */

function formatDateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return iso;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/* ------------------------------------------------------------------ */
/*  Status icon map (non-color cue)                                    */
/* ------------------------------------------------------------------ */

const STATUS_ICONS: Record<AccessDisplayState, React.ReactNode> = {
  prelaunch: <Sparkles className="h-5 w-5" aria-hidden="true" />,
  trialing: <Clock className="h-5 w-5" aria-hidden="true" />,
  active: <CheckCircle2 className="h-5 w-5" aria-hidden="true" />,
  'cancel-at-period-end': <CalendarClock className="h-5 w-5" aria-hidden="true" />,
  'past-due': <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
  grace: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
  locked: <Lock className="h-5 w-5" aria-hidden="true" />,
  unknown: <HelpCircle className="h-5 w-5" aria-hidden="true" />,
};

const STATUS_LABELS: Record<AccessDisplayState, string> = {
  prelaunch: 'Coming soon',
  trialing: 'Trial active',
  active: 'Active',
  'cancel-at-period-end': 'Cancels at period end',
  'past-due': 'Payment past due',
  grace: 'Grace period',
  locked: 'Locked',
  unknown: 'Unknown',
};

const STATUS_BADGE_VARIANT: Record<
  AccessDisplayState,
  'default' | 'success' | 'warning' | 'destructive' | 'secondary'
> = {
  prelaunch: 'secondary',
  trialing: 'default',
  active: 'success',
  'cancel-at-period-end': 'warning',
  'past-due': 'destructive',
  grace: 'warning',
  locked: 'destructive',
  unknown: 'secondary',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AccessPaywall({
  displayState,
  featureTier,
  priceMonthly = 20,
  trialDaysTotal = 30,
  trialDaysRemaining,
  trialEndDate,
  graceDaysRemaining,
  graceEndDate,
  paidThroughDate,
  loading = false,
  error = null,
  pendingAction = null,
  onContinue,
  onSubscribe,
  onManageBilling,
  onRestoreAccess,
  onSignOut,
  onExportData,
  onPrivacy,
  onTerms,
}: AccessPaywallProps) {
  const isBusy = loading || pendingAction !== null;
  const canContinue =
    displayState === 'trialing' ||
    displayState === 'active' ||
    displayState === 'cancel-at-period-end' ||
    displayState === 'past-due' ||
    displayState === 'grace';

  return (
    <main
      className={cn(
        'mc7f-access-paywall mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10 [html[data-theme=monochrome]_&]:max-w-xl [html[data-theme=monochrome]_&]:font-mono [html[data-theme=monochrome]_&_*]:rounded-none [html[data-theme=monochrome]_&_*]:shadow-none',
        'text-foreground',
      )}
    >
      {/* Loading / busy announcement */}
      {loading && (
        <div role="status" aria-live="polite" className="sr-only">
          Checking your access status…
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-secondary text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Header */}
      <header className="mb-6 text-center">
        <div className="mb-3 inline-flex items-center justify-center rounded-2xl border border-border/60 bg-elevated p-3 shadow-[var(--shadow-soft)]">
          <ShieldCheck className="h-8 w-8 text-accent-cyan" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">VibeSpace Access</h1>
        <p className="mt-1 text-secondary text-muted-foreground">
          ${priceMonthly}
          <span className="text-metadata">/month</span>
        </p>
      </header>

      {/* Status card */}
      <section
        aria-label="Access status"
        className="rounded-2xl border border-border/70 bg-panel/80 p-5 shadow-[var(--shadow-soft)]"
      >
        {/* Status badge with icon (non-color cue) */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[displayState]}>
            {STATUS_ICONS[displayState]}
            {STATUS_LABELS[displayState]}
          </Badge>
          <span className="text-metadata text-muted-foreground">
            Plan: <strong className="font-medium text-foreground">{featureTier}</strong>
          </span>
        </div>

        {/* State-specific information */}
        <StateDetails
          displayState={displayState}
          trialDaysTotal={trialDaysTotal}
          trialDaysRemaining={trialDaysRemaining}
          trialEndDate={trialEndDate}
          graceDaysRemaining={graceDaysRemaining}
          graceEndDate={graceEndDate}
          paidThroughDate={paidThroughDate}
        />
      </section>

      {/* Feature-plan distinction note */}
      <p className="mt-3 text-center text-metadata leading-relaxed text-muted-foreground">
        VibeSpace Access is separate from optional AI, voice, and cloud plans. Your{' '}
        <strong className="font-medium">{featureTier}</strong> feature plan does not include app
        access.
      </p>

      {/* Primary actions */}
      <div className="mt-6 flex flex-col gap-2">
        {canContinue && (
          <Button
            type="button"
            variant="accent"
            size="lg"
            className="w-full"
            disabled={isBusy}
            onClick={onContinue}
          >
            {pendingAction === 'continue' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            Continue to VibeSpace
          </Button>
        )}

        {displayState === 'trialing' && (
          <Button
            type="button"
            variant="accent"
            size="lg"
            className="w-full"
            disabled={isBusy}
            onClick={onSubscribe}
          >
            {pendingAction === 'subscribe' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            )}
            Subscribe
          </Button>
        )}

        {displayState !== 'prelaunch' && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={isBusy}
            onClick={onManageBilling}
          >
            {pendingAction === 'manage-billing' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            )}
            Manage Billing
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={isBusy}
          onClick={onRestoreAccess}
        >
          {pendingAction === 'restore' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Restore / Check Access
        </Button>
      </div>

      {/* Secondary safe actions — always reachable, even when locked */}
      <div className="mt-4 flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          disabled={pendingAction === 'export'}
          onClick={onExportData}
        >
          {pendingAction === 'export' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Export / Backup Data
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          disabled={pendingAction === 'sign-out'}
          onClick={onSignOut}
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign Out
        </Button>
      </div>

      {/* Legal links */}
      <footer className="mt-6 flex items-center justify-center gap-4">
        <Button type="button" variant="ghost" size="sm" onClick={onPrivacy}>
          <FileText className="h-3 w-3" aria-hidden="true" />
          Privacy
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onTerms}>
          <ScrollText className="h-3 w-3" aria-hidden="true" />
          Terms
        </Button>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  State-specific detail panel                                        */
/* ------------------------------------------------------------------ */

function StateDetails({
  displayState,
  trialDaysTotal,
  trialDaysRemaining,
  trialEndDate,
  graceDaysRemaining,
  graceEndDate,
  paidThroughDate,
}: Pick<
  AccessPaywallProps,
  | 'displayState'
  | 'trialDaysTotal'
  | 'trialDaysRemaining'
  | 'trialEndDate'
  | 'graceDaysRemaining'
  | 'graceEndDate'
  | 'paidThroughDate'
>) {
  switch (displayState) {
    case 'prelaunch':
      return (
        <p className="text-secondary leading-relaxed text-muted-foreground">
          VibeSpace Access is launching soon. Stay tuned for early access.
        </p>
      );

    case 'trialing':
      return (
        <div role="status" aria-live="polite">
          <p className="text-secondary leading-relaxed text-foreground">
            You are on the {trialDaysTotal}-day launch trial.
            {typeof trialDaysRemaining === 'number' && (
              <>
                {' '}
                <strong className="font-semibold">{trialDaysRemaining}</strong>{' '}
                {trialDaysRemaining === 1 ? 'day' : 'days'} remaining.
              </>
            )}
          </p>
          {trialEndDate && (
            <p className="mt-1 text-metadata text-muted-foreground">
              Trial ends {formatDateLabel(trialEndDate)}.
            </p>
          )}
        </div>
      );

    case 'active':
      return (
        <div>
          <p className="text-secondary leading-relaxed text-foreground">
            Your VibeSpace Access subscription is active.
          </p>
          {paidThroughDate && (
            <p className="mt-1 text-metadata text-muted-foreground">
              Paid through {formatDateLabel(paidThroughDate)}.
            </p>
          )}
        </div>
      );

    case 'cancel-at-period-end':
      return (
        <div>
          <p className="text-secondary leading-relaxed text-foreground">
            Your subscription is set to cancel at the end of the current period.
          </p>
          {paidThroughDate && (
            <p className="mt-1 text-metadata text-muted-foreground">
              Access remains until {formatDateLabel(paidThroughDate)}.
            </p>
          )}
        </div>
      );

    case 'past-due':
      return (
        <p className="text-secondary leading-relaxed text-foreground">
          Your last payment could not be processed. Update your payment method to keep VibeSpace
          Access active.
        </p>
      );

    case 'grace':
      return (
        <div role="status" aria-live="polite">
          <p className="text-secondary leading-relaxed text-foreground">
            Your account is in a grace period.
            {typeof graceDaysRemaining === 'number' && (
              <>
                {' '}
                <strong className="font-semibold">{graceDaysRemaining}</strong>{' '}
                {graceDaysRemaining === 1 ? 'day' : 'days'} remaining before access is locked.
              </>
            )}
          </p>
          {graceEndDate && (
            <p className="mt-1 text-metadata text-muted-foreground">
              Grace period ends {formatDateLabel(graceEndDate)}.
            </p>
          )}
        </div>
      );

    case 'locked':
      return (
        <p className="text-secondary leading-relaxed text-foreground">
          VibeSpace Access is locked. Your account, data, and billing remain reachable. Subscribe or
          restore access to continue using the app.
        </p>
      );

    case 'unknown':
      return (
        <p className="text-secondary leading-relaxed text-muted-foreground">
          Unable to determine your access status. Check your connection and try again.
        </p>
      );

    default:
      return null;
  }
}
