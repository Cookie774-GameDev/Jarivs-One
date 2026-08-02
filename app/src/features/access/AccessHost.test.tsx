import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AccessHost,
  useAccessHost,
  useCanUseApp,
  useCanEditApp,
  useCanExportData,
  useAccessDisplayState,
  type AccessHostSnapshot,
  type AccessHostValue,
} from './AccessHost';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const ACTIVE_SNAPSHOT: AccessHostSnapshot = {
  capturedAt: 1_784_979_600_000,
  displayState: 'active',
  featureTier: 'free',
  usable: true,
};

function SnapshotProbe() {
  const access = useAccessHost();
  return (
    <output data-testid="snapshot">
      {access.phase}:{access.snapshot?.displayState ?? 'none'}:{String(useCanUseApp())}
    </output>
  );
}

function SelectorProbe() {
  const displayState = useAccessDisplayState();
  const canUse = useCanUseApp();
  const canEdit = useCanEditApp();
  const canExport = useCanExportData();
  return (
    <output data-testid="selectors">{[displayState, canUse, canEdit, canExport].join('|')}</output>
  );
}

describe('AccessHost', () => {
  it('leaves current beta builds usable without loading when the gate is disabled', () => {
    const loadAccess = vi.fn();

    render(
      <AccessHost loadAccess={loadAccess}>
        <p>Protected workspace</p>
        <SnapshotProbe />
      </AccessHost>,
    );

    expect(screen.getByText('Protected workspace')).toBeTruthy();
    expect(screen.getByTestId('snapshot').textContent).toBe('disabled:prelaunch:true');
    expect(loadAccess).not.toHaveBeenCalled();
  });

  it('does not flash protected content while an enabled gate is loading', () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(screen.queryByText('Protected workspace')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/checking vibespace access/i);
  });

  it('renders protected content only after an authoritative usable snapshot resolves', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <p>Protected workspace</p>
        <SnapshotProbe />
      </AccessHost>,
    );

    await act(async () => request.resolve(ACTIVE_SNAPSHOT));

    expect(screen.getByText('Protected workspace')).toBeTruthy();
    expect(screen.getByTestId('snapshot').textContent).toBe('ready:active:true');
  });

  it('hides protected content synchronously when an existing host is enabled', () => {
    const request = deferred<AccessHostSnapshot>();
    const view = render(
      <AccessHost loadAccess={() => request.promise}>
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(screen.getByText('Protected workspace')).toBeTruthy();
    view.rerender(
      <AccessHost enabled loadAccess={() => request.promise}>
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(screen.queryByText('Protected workspace')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('keeps locked snapshots out of protected content and provides refresh', async () => {
    const loadAccess = vi.fn().mockResolvedValue({
      ...ACTIVE_SNAPSHOT,
      displayState: 'locked',
      usable: false,
    } satisfies AccessHostSnapshot);

    render(
      <AccessHost
        enabled
        loadAccess={loadAccess}
        renderBlocked={({ refresh, snapshot }) => (
          <button type="button" onClick={refresh}>
            Restore {snapshot.displayState}
          </button>
        )}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByRole('button', { name: 'Restore locked' })).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore locked' })));
    expect(loadAccess).toHaveBeenCalledTimes(2);
  });

  it('fails closed on loader errors without exposing protected content', async () => {
    const error = new Error('network detail must not become authority');

    render(
      <AccessHost
        enabled
        loadAccess={() => Promise.reject(error)}
        renderError={({ error: receivedError, refresh }) => (
          <button type="button" onClick={refresh}>
            Retry after {receivedError.message}
          </button>
        )}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(
      await screen.findByRole('button', {
        name: 'Retry after network detail must not become authority',
      }),
    ).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('fails closed when a loader throws before returning a promise', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() => {
          throw new Error('synchronous adapter failure');
        }}
        renderError={({ error }) => <p>Denied: {error.message}</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Denied: synchronous adapter failure')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('rejects an impossible usable grant for a locked snapshot', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() =>
          Promise.resolve({
            ...ACTIVE_SNAPSHOT,
            displayState: 'locked',
            usable: true,
          })
        }
        renderBlocked={({ snapshot }) => <p>Denied: {snapshot.displayState}</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Denied: locked')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('ignores a stale request after a refresh', async () => {
    const first = deferred<AccessHostSnapshot>();
    const second = deferred<AccessHostSnapshot>();
    const loadAccess = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    render(
      <AccessHost
        enabled
        loadAccess={loadAccess}
        loadingFallback={({ refresh }) => (
          <button type="button" onClick={refresh}>
            Refresh access
          </button>
        )}
        renderBlocked={({ snapshot }) => <p>Blocked: {snapshot.displayState}</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    await act(async () => second.resolve(ACTIVE_SNAPSHOT));
    expect(screen.getByText('Protected workspace')).toBeTruthy();

    await act(async () =>
      first.resolve({ ...ACTIVE_SNAPSHOT, displayState: 'locked', usable: false }),
    );
    expect(screen.getByText('Protected workspace')).toBeTruthy();
    expect(screen.queryByText('Blocked: locked')).toBeNull();
  });

  it('withdraws a ready grant in the same render that requests a refresh', async () => {
    const second = deferred<AccessHostSnapshot>();
    const loadAccess = vi
      .fn()
      .mockResolvedValueOnce(ACTIVE_SNAPSHOT)
      .mockImplementationOnce(() => second.promise);
    let protectedRenderCount = 0;

    function ProtectedWorkspace() {
      protectedRenderCount += 1;
      const { refresh } = useAccessHost();
      return (
        <button type="button" onClick={refresh}>
          Refresh protected access
        </button>
      );
    }

    render(
      <AccessHost enabled loadAccess={loadAccess}>
        <ProtectedWorkspace />
      </AccessHost>,
    );

    const refreshButton = await screen.findByRole('button', {
      name: 'Refresh protected access',
    });
    expect(protectedRenderCount).toBe(1);

    fireEvent.click(refreshButton);

    expect(protectedRenderCount).toBe(1);
    expect(screen.queryByRole('button', { name: 'Refresh protected access' })).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('withdraws a ready grant before a replacement loader can resolve', async () => {
    const replacement = deferred<AccessHostSnapshot>();
    const firstLoader = vi.fn().mockResolvedValue(ACTIVE_SNAPSHOT);
    const replacementLoader = vi.fn(() => replacement.promise);
    let protectedRenderCount = 0;

    function ProtectedWorkspace() {
      protectedRenderCount += 1;
      return <p>Protected workspace</p>;
    }

    const view = render(
      <AccessHost enabled loadAccess={firstLoader}>
        <ProtectedWorkspace />
      </AccessHost>,
    );

    expect(await screen.findByText('Protected workspace')).toBeTruthy();
    expect(protectedRenderCount).toBe(1);

    view.rerender(
      <AccessHost enabled loadAccess={replacementLoader}>
        <ProtectedWorkspace />
      </AccessHost>,
    );

    expect(protectedRenderCount).toBe(1);
    expect(screen.queryByText('Protected workspace')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('aborts the active request when it unmounts', async () => {
    let receivedSignal: AbortSignal | undefined;
    const view = render(
      <AccessHost
        enabled
        loadAccess={(signal) => {
          receivedSignal = signal;
          return new Promise(() => undefined);
        }}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    await act(async () => Promise.resolve());
    expect(receivedSignal?.aborted).toBe(false);
    view.unmount();
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('exposes full-access typed selectors without loading when the gate is disabled', () => {
    const loadAccess = vi.fn();

    render(
      <AccessHost loadAccess={loadAccess}>
        <SelectorProbe />
      </AccessHost>,
    );

    expect(screen.getByTestId('selectors').textContent).toBe('prelaunch|true|true|true');
    expect(loadAccess).not.toHaveBeenCalled();
  });

  it('derives edit and export from authoritative defaults once a usable snapshot resolves', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost
        enabled
        loadAccess={() => request.promise}
        loadingFallback={() => (
          <>
            <p>Resolving access</p>
            <SelectorProbe />
          </>
        )}
      >
        <SelectorProbe />
      </AccessHost>,
    );

    // While loading, no snapshot has resolved: the display state fails closed to
    // 'unknown' and every capability selector denies access.
    expect(screen.getByTestId('selectors').textContent).toBe('unknown|false|false|false');

    await act(async () => request.resolve(ACTIVE_SNAPSHOT));

    expect(screen.getByTestId('selectors').textContent).toBe('active|true|true|true');
  });

  it('ignores non-contract capability overrides on a usable host snapshot', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <SelectorProbe />
      </AccessHost>,
    );

    await act(async () =>
      request.resolve({
        ...ACTIVE_SNAPSHOT,
        canEdit: false,
        canExport: false,
      } as AccessHostSnapshot),
    );

    expect(screen.getByTestId('selectors').textContent).toBe('active|true|true|true');
  });

  it('keeps data export available while denying use and edit in a blocked mode', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost
        enabled
        loadAccess={() => request.promise}
        renderBlocked={({ snapshot }) => (
          <>
            <p>Blocked: {snapshot.displayState}</p>
            <SelectorProbe />
          </>
        )}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    await act(async () =>
      request.resolve({ ...ACTIVE_SNAPSHOT, displayState: 'locked', usable: false }),
    );

    expect(screen.getByText('Blocked: locked')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
    expect(screen.getByTestId('selectors').textContent).toBe('locked|false|false|true');
  });

  it('preserves export recovery despite a non-contract blocked-snapshot override', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost
        enabled
        loadAccess={() => request.promise}
        renderBlocked={() => (
          <>
            <p>Blocked</p>
            <SelectorProbe />
          </>
        )}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    await act(async () =>
      request.resolve({
        ...ACTIVE_SNAPSHOT,
        displayState: 'locked',
        usable: false,
        canExport: false,
      } as AccessHostSnapshot),
    );

    expect(screen.getByTestId('selectors').textContent).toBe('locked|false|false|true');
  });

  it('never grants app access from feature tier alone', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost
        enabled
        loadAccess={() => request.promise}
        renderBlocked={() => (
          <>
            <p>Blocked despite tier</p>
            <SelectorProbe />
          </>
        )}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    await act(async () =>
      request.resolve({
        ...ACTIVE_SNAPSHOT,
        featureTier: 'pro-plus-max',
        displayState: 'past-due',
        usable: false,
      }),
    );

    expect(screen.getByText('Blocked despite tier')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
    expect(screen.getByTestId('selectors').textContent).toBe('past-due|false|false|true');
  });

  it('grants access for a usable snapshot regardless of a low feature tier', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <p>Protected workspace</p>
        <SelectorProbe />
      </AccessHost>,
    );

    await act(async () => request.resolve({ ...ACTIVE_SNAPSHOT, featureTier: 'free' }));

    expect(screen.getByText('Protected workspace')).toBeTruthy();
    expect(screen.getByTestId('selectors').textContent).toBe('active|true|true|true');
  });

  it('grants access from a verified offline lease projection supplied by the loader', async () => {
    const verifiedOfflineSnapshot: AccessHostSnapshot = {
      capturedAt: 1_784_979_600_000,
      displayState: 'active',
      featureTier: 'unknown',
      usable: true,
    };
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <p>Protected workspace</p>
        <SelectorProbe />
      </AccessHost>,
    );

    await act(async () => request.resolve(verifiedOfflineSnapshot));

    expect(screen.getByText('Protected workspace')).toBeTruthy();
    expect(screen.getByTestId('selectors').textContent).toBe('active|true|true|true');
  });

  it('fails closed when the offline lease cannot be verified and the loader rejects', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() => Promise.reject(new Error('offline lease expired or unverifiable'))}
        renderError={({ error }) => <p>Denied: {error.message}</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Denied: offline lease expired or unverifiable')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('fails closed when the loader resolves a malformed snapshot', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() =>
          Promise.resolve({
            displayState: 'not-a-state',
            featureTier: 'x',
            usable: 'yes',
            capturedAt: 1,
          } as unknown as AccessHostSnapshot)
        }
        renderError={() => <p>Invalid snapshot</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Invalid snapshot')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('fails closed when capturedAt is not trusted view-model time', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() => Promise.resolve({ ...ACTIVE_SNAPSHOT, capturedAt: -1 })}
        renderError={() => <p>Invalid capture time</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Invalid capture time')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('ignores a malformed non-contract capability property', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() =>
          Promise.resolve({ ...ACTIVE_SNAPSHOT, canEdit: 'nope' } as unknown as AccessHostSnapshot)
        }
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Protected workspace')).toBeTruthy();
  });

  it('fails closed for an unknown display state reported as not usable', async () => {
    render(
      <AccessHost
        enabled
        loadAccess={() =>
          Promise.resolve({ ...ACTIVE_SNAPSHOT, displayState: 'unknown', usable: false })
        }
        renderBlocked={({ snapshot }) => <p>Blocked: {snapshot.displayState}</p>}
      >
        <p>Protected workspace</p>
      </AccessHost>,
    );

    expect(await screen.findByText('Blocked: unknown')).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();
  });

  it('freezes the authoritative snapshot and ignores later caller mutation', async () => {
    const mutable: AccessHostSnapshot = { ...ACTIVE_SNAPSHOT };
    const request = deferred<AccessHostSnapshot>();
    let exposed: AccessHostValue | undefined;

    function Capture() {
      exposed = useAccessHost();
      return null;
    }

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <Capture />
        <p>Protected workspace</p>
      </AccessHost>,
    );

    await act(async () => request.resolve(mutable));

    expect(screen.getByText('Protected workspace')).toBeTruthy();
    const frozenSnapshot = exposed?.snapshot;
    expect(frozenSnapshot).toBeTruthy();
    expect(Object.isFrozen(frozenSnapshot)).toBe(true);

    mutable.displayState = 'locked';
    mutable.usable = false;
    expect(exposed?.snapshot?.displayState).toBe('active');
    expect(exposed?.snapshot?.usable).toBe(true);

    expect(() => {
      frozenSnapshot!.usable = false;
    }).toThrow();
  });

  it('exposes accessible loading and blocked fallbacks', async () => {
    const request = deferred<AccessHostSnapshot>();

    render(
      <AccessHost enabled loadAccess={() => request.promise}>
        <p>Protected workspace</p>
      </AccessHost>,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.getAttribute('aria-live')).toBe('polite');

    await act(async () =>
      request.resolve({ ...ACTIVE_SNAPSHOT, displayState: 'locked', usable: false }),
    );

    expect(screen.getByRole('heading', { name: 'VibeSpace Access is required' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check access again' })).toBeTruthy();
  });
});
