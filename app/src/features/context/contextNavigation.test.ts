import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_NAVIGATION_EVENT,
  requestContextNavigation,
  subscribeContextNavigation,
  type ContextNavigationIntent,
} from './contextNavigation';

describe('Context navigation intents', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers the overview and exact-map intents through one bounded subscription', () => {
    vi.useFakeTimers();
    const received: ContextNavigationIntent[] = [];
    const unsubscribe = subscribeContextNavigation((intent) => received.push(intent));

    requestContextNavigation({ target: 'overview' });
    requestContextNavigation({ target: 'map', mapId: 'map-ar-outreach' });
    vi.runAllTimers();

    expect(received).toEqual([{ target: 'overview' }, { target: 'map', mapId: 'map-ar-outreach' }]);
    unsubscribe();
  });

  it('ignores malformed or empty exact-map intents', () => {
    const received: ContextNavigationIntent[] = [];
    const unsubscribe = subscribeContextNavigation((intent) => received.push(intent));

    window.dispatchEvent(
      new CustomEvent(CONTEXT_NAVIGATION_EVENT, {
        detail: { target: 'map', mapId: '' },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(CONTEXT_NAVIGATION_EVENT, {
        detail: { target: 'unknown', mapId: 'map-ar-outreach' },
      }),
    );

    expect(received).toEqual([]);
    unsubscribe();
  });
});
