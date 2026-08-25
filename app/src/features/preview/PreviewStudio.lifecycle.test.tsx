import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { PreviewStudio } from './PreviewStudio';

const observerState = vi.hoisted(() => ({
  observed: 0,
  disconnected: 0,
}));

class TestResizeObserver {
  observe() {
    observerState.observed += 1;
  }

  disconnect() {
    observerState.disconnected += 1;
  }
}

beforeEach(() => {
  observerState.observed = 0;
  observerState.disconnected = 0;
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  useUIStore.setState({ route: 'files' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useUIStore.setState({ route: 'chat' });
});

describe('PreviewStudio cached-route lifecycle', () => {
  it('observes host geometry only while Preview is visible and reconnects on return', () => {
    render(<PreviewStudio />);
    expect(observerState.observed).toBe(0);

    act(() => {
      useUIStore.setState({ route: 'preview' });
    });
    expect(observerState.observed).toBeGreaterThan(0);
    const activeObserverCount = observerState.observed;

    act(() => {
      useUIStore.setState({ route: 'files' });
    });
    expect(observerState.disconnected).toBeGreaterThanOrEqual(activeObserverCount);

    act(() => {
      useUIStore.setState({ route: 'preview' });
    });
    expect(observerState.observed).toBeGreaterThan(activeObserverCount);
  });
});
