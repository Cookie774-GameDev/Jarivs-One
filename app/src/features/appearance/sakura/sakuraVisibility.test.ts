import { describe, expect, it, vi } from 'vitest';
import {
  readSakuraVisibility,
  subscribeToSakuraVisibility,
  type SakuraVisibilityEnvironment,
} from './sakuraVisibility';

function createEnvironment() {
  const documentTarget = new EventTarget() as EventTarget & {
    visibilityState: DocumentVisibilityState;
    hasFocus(): boolean;
  };
  const windowTarget = new EventTarget();
  let visibilityState: DocumentVisibilityState = 'visible';
  let focused = true;
  Object.defineProperty(documentTarget, 'visibilityState', {
    configurable: true,
    get: () => visibilityState,
  });
  documentTarget.hasFocus = () => focused;

  return {
    environment: {
      documentTarget,
      windowTarget,
    } satisfies SakuraVisibilityEnvironment,
    setFocused(value: boolean) {
      focused = value;
    },
    setVisibility(value: DocumentVisibilityState) {
      visibilityState = value;
    },
  };
}

describe('Sakura visibility policy', () => {
  it('pauses while hidden, blurred, or minimized through WebView visibility mapping', () => {
    const fixture = createEnvironment();
    expect(readSakuraVisibility(fixture.environment)).toEqual({
      documentVisible: true,
      windowFocused: true,
      paused: false,
    });

    fixture.setFocused(false);
    expect(readSakuraVisibility(fixture.environment).paused).toBe(true);
    fixture.setFocused(true);
    fixture.setVisibility('hidden');
    expect(readSakuraVisibility(fixture.environment).paused).toBe(true);
  });

  it('publishes focus, blur, page, and document transitions and removes every listener', () => {
    const fixture = createEnvironment();
    const listener = vi.fn();
    const removeDocument = vi.spyOn(fixture.environment.documentTarget, 'removeEventListener');
    const removeWindow = vi.spyOn(fixture.environment.windowTarget, 'removeEventListener');

    const unsubscribe = subscribeToSakuraVisibility(fixture.environment, listener);
    expect(listener).toHaveBeenCalledTimes(1);

    fixture.setFocused(false);
    fixture.environment.windowTarget.dispatchEvent(new Event('blur'));
    fixture.setVisibility('hidden');
    fixture.environment.documentTarget.dispatchEvent(new Event('visibilitychange'));
    fixture.setVisibility('visible');
    fixture.setFocused(true);
    fixture.environment.windowTarget.dispatchEvent(new Event('pageshow'));

    expect(listener).toHaveBeenLastCalledWith({
      documentVisible: true,
      windowFocused: true,
      paused: false,
    });

    unsubscribe();
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('pageshow', expect.any(Function));

    const count = listener.mock.calls.length;
    fixture.environment.windowTarget.dispatchEvent(new Event('focus'));
    expect(listener).toHaveBeenCalledTimes(count);
  });
});
