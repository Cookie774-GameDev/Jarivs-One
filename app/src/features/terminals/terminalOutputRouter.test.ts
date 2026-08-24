import { describe, expect, it, vi } from 'vitest';
import {
  createTerminalOutputIndex,
  createTerminalOutputRouter,
  type TerminalOutputPayload,
} from './terminalOutputRouter';

describe('terminal output subscription index', () => {
  it('selects only unbound startup listeners and the exact session bucket', () => {
    const index = createTerminalOutputIndex();
    index.add(1);
    index.add(2);
    index.add(3);
    index.bind(2, 'tty_first');
    index.bind(3, 'tty_second');

    expect(index.targets('tty_first')).toEqual([1, 2]);
    expect(index.targets('tty_second')).toEqual([1, 3]);
    expect(index.targets('tty_unknown')).toEqual([1]);

    index.bind(1, 'tty_first');
    index.bind(2, 'tty_second');
    expect(index.targets('tty_first')).toEqual([1]);
    expect(index.targets('tty_second')).toEqual([2, 3]);

    index.remove(2);
    expect(index.targets('tty_second')).toEqual([3]);
  });
});

describe('terminal output router', () => {
  it('uses one native listener and routes bound sessions without cross-talk', async () => {
    let emitNative: ((payload: TerminalOutputPayload) => void) | undefined;
    const detach = vi.fn();
    const attach = vi.fn(async (listener: (payload: TerminalOutputPayload) => void) => {
      emitNative = listener;
      return detach;
    });
    const router = createTerminalOutputRouter(attach);
    const first = vi.fn();
    const second = vi.fn();

    const firstSubscription = await router.subscribe(first);
    const secondSubscription = await router.subscribe(second);
    firstSubscription.bind('tty_first');
    secondSubscription.bind('tty_second');

    emitNative?.({ sessionId: 'tty_first', data: 'alpha' });
    emitNative?.({ sessionId: 'tty_second', data: 'beta' });

    expect(attach).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ sessionId: 'tty_first', data: 'alpha' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ sessionId: 'tty_second', data: 'beta' });
    expect(second).toHaveBeenCalledTimes(1);

    firstSubscription.unsubscribe();
    expect(detach).not.toHaveBeenCalled();
    secondSubscription.unsubscribe();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('keeps an unbound startup subscriber until its session id is known', async () => {
    let emitNative: ((payload: TerminalOutputPayload) => void) | undefined;
    const router = createTerminalOutputRouter(async (listener) => {
      emitNative = listener;
      return () => undefined;
    });
    const startup = vi.fn();
    const subscription = await router.subscribe(startup);

    emitNative?.({ sessionId: 'tty_new', data: 'first prompt' });
    subscription.bind('tty_new');
    emitNative?.({ sessionId: 'tty_other', data: 'ignore me' });

    expect(startup).toHaveBeenCalledTimes(1);
    expect(startup).toHaveBeenCalledWith({ sessionId: 'tty_new', data: 'first prompt' });
  });

  it('isolates a broken pane listener so other panes still receive output', async () => {
    let emitNative: ((payload: TerminalOutputPayload) => void) | undefined;
    const router = createTerminalOutputRouter(async (listener) => {
      emitNative = listener;
      return () => undefined;
    });
    const broken = await router.subscribe(() => {
      throw new Error('pane render failed');
    });
    const healthyListener = vi.fn();
    const healthy = await router.subscribe(healthyListener);
    broken.bind('tty_shared');
    healthy.bind('tty_shared');

    expect(() => emitNative?.({ sessionId: 'tty_shared', data: 'still delivered' })).not.toThrow();
    expect(healthyListener).toHaveBeenCalledWith({
      sessionId: 'tty_shared',
      data: 'still delivered',
    });
  });
});
