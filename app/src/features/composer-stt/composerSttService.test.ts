import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import {
  COMPOSER_STT_STOP_EVENT,
  COMPOSER_STT_TOGGLE_EVENT,
  requestComposerSttFromToolbar,
  requestComposerSttToggle,
} from './composerSttService';

describe('composerSttService toolbar routing', () => {
  beforeEach(() => {
    useUIStore.setState({ route: 'terminal', composerStt: true, composerSttListening: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not change route when toolbar mic is pressed', () => {
    const toggle = vi.fn();
    window.addEventListener(COMPOSER_STT_TOGGLE_EVENT, toggle);
    expect(requestComposerSttFromToolbar()).toBe(true);
    expect(useUIStore.getState().route).toBe('terminal');
    expect(toggle).toHaveBeenCalledTimes(1);
    window.removeEventListener(COMPOSER_STT_TOGGLE_EVENT, toggle);
  });

  it('dispatches stop instead of toggle when already listening', () => {
    useUIStore.setState({ composerSttListening: true });
    const stop = vi.fn();
    const toggle = vi.fn();
    window.addEventListener(COMPOSER_STT_STOP_EVENT, stop);
    window.addEventListener(COMPOSER_STT_TOGGLE_EVENT, toggle);
    expect(requestComposerSttFromToolbar()).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
    window.removeEventListener(COMPOSER_STT_STOP_EVENT, stop);
    window.removeEventListener(COMPOSER_STT_TOGGLE_EVENT, toggle);
  });

  it('requestComposerSttToggle includes source detail', () => {
    const received: CustomEvent<{ source?: string }>[] = [];
    const handler = (event: Event) => received.push(event as CustomEvent<{ source?: string }>);
    window.addEventListener(COMPOSER_STT_TOGGLE_EVENT, handler);
    requestComposerSttToggle('toolbar');
    expect(received[0]?.detail?.source).toBe('toolbar');
    window.removeEventListener(COMPOSER_STT_TOGGLE_EVENT, handler);
  });
});
