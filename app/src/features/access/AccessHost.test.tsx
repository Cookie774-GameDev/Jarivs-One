import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessHost, useAccessHost, useCanUseApp, type AccessHostSnapshot } from './AccessHost';

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
});
