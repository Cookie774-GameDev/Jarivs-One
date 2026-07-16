import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  consumePendingJarvisCreatorStart,
  JARVIS_CREATOR_START_EVENT,
  requeueJarvisCreatorStart,
  startJarvisCreator,
} from './launcher';
import { useUIStore } from '@/stores/ui';

describe('startJarvisCreator', () => {
  beforeEach(() => {
    useUIStore.setState({ inspectorOpen: false });
    consumePendingJarvisCreatorStart();
  });

  it('opens the Inspector and stores the creator start when the panel is closed', () => {
    const tabListener = vi.fn();
    window.addEventListener('jarvis:inspector:tab', tabListener);

    startJarvisCreator({ kind: 'agent', currentName: 'Existing Agent' });

    expect(useUIStore.getState().inspectorOpen).toBe(true);
    expect(tabListener).toHaveBeenCalledOnce();
    expect(tabListener.mock.calls[0]?.[0]).toMatchObject({
      detail: { tab: 'jarvis' },
    });
    expect(consumePendingJarvisCreatorStart()).toMatchObject({
      kind: 'agent',
      currentName: 'Existing Agent',
    });

    window.removeEventListener('jarvis:inspector:tab', tabListener);
  });

  it('dispatches immediately when the Inspector is already open', () => {
    useUIStore.setState({ inspectorOpen: true });
    const listener = vi.fn();
    const tabListener = vi.fn();
    window.addEventListener(JARVIS_CREATOR_START_EVENT, listener);
    window.addEventListener('jarvis:inspector:tab', tabListener);

    startJarvisCreator({ kind: 'skill', currentName: 'Custom Skill' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: { kind: 'skill', currentName: 'Custom Skill' },
    });
    expect(tabListener).toHaveBeenCalledOnce();
    expect(consumePendingJarvisCreatorStart()).toBeNull();
    window.removeEventListener(JARVIS_CREATOR_START_EVENT, listener);
    window.removeEventListener('jarvis:inspector:tab', tabListener);
  });

  it('can requeue a start when Jarvis is not ready yet', () => {
    requeueJarvisCreatorStart({ kind: 'agent', currentName: 'Queued' });
    expect(consumePendingJarvisCreatorStart()).toMatchObject({
      kind: 'agent',
      currentName: 'Queued',
    });
    expect(consumePendingJarvisCreatorStart()).toBeNull();
  });
});
