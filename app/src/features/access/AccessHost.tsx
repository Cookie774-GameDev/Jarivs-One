import * as React from 'react';
import type { AccessDisplayState } from './AccessPaywall';

export interface AccessHostSnapshot {
  /** Server- or verified-lease-derived state. */
  displayState: AccessDisplayState;
  /** Existing additive feature tier; never used to grant base app access. */
  featureTier: string;
  /** Authoritative policy decision supplied by the access adapter. */
  usable: boolean;
  /** Trusted capture time in Unix milliseconds. */
  capturedAt: number;
}

export type AccessHostPhase = 'disabled' | 'loading' | 'ready' | 'blocked' | 'error';

export interface AccessHostValue {
  phase: AccessHostPhase;
  snapshot: AccessHostSnapshot | null;
  refresh: () => void;
}

interface AccessHostInternalValue extends AccessHostValue {
  attempt: number;
  error: Error | null;
  loader: AccessHostProps['loadAccess'];
}

interface LoadingFallbackProps {
  refresh: () => void;
}

interface BlockedFallbackProps {
  refresh: () => void;
  snapshot: AccessHostSnapshot;
}

interface ErrorFallbackProps {
  error: Error;
  refresh: () => void;
}

export interface AccessHostProps {
  children: React.ReactNode;
  /**
   * Launch gate switch. It intentionally defaults to false so merging the
   * implementation cannot lock development or beta builds.
   */
  enabled?: boolean;
  /** Loads a server snapshot or a cryptographically verified offline lease. */
  loadAccess: (signal: AbortSignal) => Promise<AccessHostSnapshot>;
  loadingFallback?: (props: LoadingFallbackProps) => React.ReactNode;
  renderBlocked?: (props: BlockedFallbackProps) => React.ReactNode;
  renderError?: (props: ErrorFallbackProps) => React.ReactNode;
}

const DISABLED_SNAPSHOT: AccessHostSnapshot = Object.freeze({
  capturedAt: 0,
  displayState: 'prelaunch',
  featureTier: 'unknown',
  usable: true,
});

const AccessHostContext = React.createContext<AccessHostValue | null>(null);

export function useAccessHost(): AccessHostValue {
  const value = React.useContext(AccessHostContext);
  if (!value) {
    throw new Error('useAccessHost must be used within AccessHost');
  }
  return value;
}

/** Typed selector for consumers that only need the effective app-use decision. */
export function useCanUseApp(): boolean {
  const value = useAccessHost();
  return (value.phase === 'disabled' || value.phase === 'ready') && value.snapshot?.usable === true;
}

/**
 * Typed selector for the authoritative display state. Fails closed to
 * 'unknown' until a snapshot resolves so consumers never scatter raw checks.
 */
export function useAccessDisplayState(): AccessDisplayState {
  const value = useAccessHost();
  return value.snapshot?.displayState ?? 'unknown';
}

/**
 * Typed selector for mutation/edit capability. Requires an effective use grant
 * and parallels the accepted access contract, where mutation tracks production
 * use. Never derived from feature tier, app version, or extra caller fields.
 */
export function useCanEditApp(): boolean {
  const value = useAccessHost();
  if (value.phase !== 'disabled' && value.phase !== 'ready') return false;
  const snapshot = value.snapshot;
  if (!snapshot || snapshot.usable !== true) return false;
  return true;
}

/**
 * Typed selector for export/data-recovery capability. Authoritative policy
 * permits export in every resolved state, so it stays available in blocked
 * modes. Requires a resolved snapshot (disabled/ready/blocked); loading/error
 * have no authority.
 */
export function useCanExportData(): boolean {
  const value = useAccessHost();
  const snapshot = value.snapshot;
  if (!snapshot) return false;
  if (value.phase !== 'disabled' && value.phase !== 'ready' && value.phase !== 'blocked') {
    return false;
  }
  return true;
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('Unable to verify VibeSpace Access.');
}

function isSnapshot(value: unknown): value is AccessHostSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AccessHostSnapshot>;
  return (
    typeof candidate.displayState === 'string' &&
    [
      'prelaunch',
      'trialing',
      'active',
      'cancel-at-period-end',
      'past-due',
      'grace',
      'locked',
      'unknown',
    ].includes(candidate.displayState) &&
    typeof candidate.featureTier === 'string' &&
    candidate.featureTier.length > 0 &&
    typeof candidate.usable === 'boolean' &&
    typeof candidate.capturedAt === 'number' &&
    Number.isSafeInteger(candidate.capturedAt) &&
    candidate.capturedAt >= 0
  );
}

function defaultLoadingFallback() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      Checking VibeSpace Access…
    </div>
  );
}

function defaultBlockedFallback({ refresh }: BlockedFallbackProps) {
  return (
    <section aria-labelledby="access-blocked-title">
      <h1 id="access-blocked-title">VibeSpace Access is required</h1>
      <p>Your local data remains intact. Restore access or export it from the access screen.</p>
      <button type="button" onClick={refresh}>
        Check access again
      </button>
    </section>
  );
}

function defaultErrorFallback({ refresh }: ErrorFallbackProps) {
  return (
    <section aria-labelledby="access-check-error-title">
      <h1 id="access-check-error-title">Access could not be verified</h1>
      <p>Protected actions remain paused until VibeSpace can verify your access.</p>
      <button type="button" onClick={refresh}>
        Try again
      </button>
    </section>
  );
}

/**
 * Single fail-closed application access boundary.
 *
 * The host owns loading/cancellation and never derives entitlement from a
 * feature tier or local user-editable state. Its loader must return a
 * server-authoritative snapshot or a verified offline lease projection.
 */
export function AccessHost({
  children,
  enabled = false,
  loadAccess,
  loadingFallback = defaultLoadingFallback,
  renderBlocked = defaultBlockedFallback,
  renderError = defaultErrorFallback,
}: AccessHostProps) {
  const [attempt, setAttempt] = React.useState(0);
  const [value, setValue] = React.useState<AccessHostInternalValue>(() => ({
    attempt: 0,
    error: null,
    loader: loadAccess,
    phase: enabled ? 'loading' : 'disabled',
    snapshot: enabled ? null : DISABLED_SNAPSHOT,
    refresh: () => undefined,
  }));
  const requestGeneration = React.useRef(0);
  const refresh = React.useCallback(() => setAttempt((current) => current + 1), []);

  React.useEffect(() => {
    if (!enabled) {
      requestGeneration.current += 1;
      setValue({
        attempt,
        error: null,
        loader: loadAccess,
        phase: 'disabled',
        snapshot: DISABLED_SNAPSHOT,
        refresh,
      });
      return;
    }

    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    setValue({
      attempt,
      error: null,
      loader: loadAccess,
      phase: 'loading',
      snapshot: null,
      refresh,
    });

    void Promise.resolve()
      .then(() => loadAccess(controller.signal))
      .then(
        (snapshot) => {
          if (controller.signal.aborted || generation !== requestGeneration.current) return;
          if (!isSnapshot(snapshot)) {
            setValue({
              attempt,
              error: new Error('The access service returned an invalid snapshot.'),
              loader: loadAccess,
              phase: 'error',
              snapshot: null,
              refresh,
            });
            return;
          }

          const impossibleGrant =
            snapshot.usable &&
            (snapshot.displayState === 'locked' || snapshot.displayState === 'unknown');
          const stableSnapshot: AccessHostSnapshot = Object.freeze({
            capturedAt: snapshot.capturedAt,
            displayState: snapshot.displayState,
            featureTier: snapshot.featureTier,
            usable: snapshot.usable,
          });
          setValue({
            attempt,
            error: null,
            loader: loadAccess,
            phase: snapshot.usable && !impossibleGrant ? 'ready' : 'blocked',
            snapshot: stableSnapshot,
            refresh,
          });
        },
        (reason: unknown) => {
          if (controller.signal.aborted || generation !== requestGeneration.current) return;
          setValue({
            attempt,
            error: toError(reason),
            loader: loadAccess,
            phase: 'error',
            snapshot: null,
            refresh,
          });
        },
      );

    return () => controller.abort();
  }, [attempt, enabled, loadAccess, refresh]);

  const effectiveValue: AccessHostValue =
    enabled &&
    (value.phase === 'disabled' || value.attempt !== attempt || value.loader !== loadAccess)
      ? { phase: 'loading', refresh, snapshot: null }
      : !enabled && value.phase !== 'disabled'
        ? { phase: 'disabled', refresh, snapshot: DISABLED_SNAPSHOT }
        : { phase: value.phase, refresh, snapshot: value.snapshot };

  let content: React.ReactNode;
  if (effectiveValue.phase === 'disabled' || effectiveValue.phase === 'ready') {
    content = children;
  } else if (effectiveValue.phase === 'blocked' && effectiveValue.snapshot) {
    content = renderBlocked({ refresh, snapshot: effectiveValue.snapshot });
  } else if (effectiveValue.phase === 'error' && value.error) {
    content = renderError({ error: value.error, refresh });
  } else {
    content = loadingFallback({ refresh });
  }

  return <AccessHostContext.Provider value={effectiveValue}>{content}</AccessHostContext.Provider>;
}
