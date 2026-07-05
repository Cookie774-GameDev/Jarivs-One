import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  consumePendingJarvisCreatorStart,
  JARVIS_CREATOR_START_EVENT,
  startJarvisCreator,
} from './launcher';
import { useUIStore } from '@/stores/ui';

describe('startJarvisCreator', () => {
  beforeEach(() => {
    useUIStore.setState({ inspectorOpen: false });
    consumePendingJarvisCreatorStart();
  });

  it('opens the Inspector and stores the creator start when the panel is closed', () => {
    startJarvisCreator({ kind: 'agent', currentName: 'Existing Agent' });

    expect(useUIStore.getState().inspectorOpen).toBe(true);
    expect(consumePendingJarvisCreatorStart()).toMatchObject({
      kind: 'agent',
      currentName: 'Existing Agent',
    });
  });

  it('dispatches immediately when the Inspector is already open', () => {
    useUIStore.setState({ inspectorOpen: true });
    const listener = vi.fn();
    window.addEventListener(JARVIS_CREATOR_START_EVENT, listener);

    startJarvisCreator({ kind: 'skill', currentName: 'Custom Skill' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: { kind: 'skill', currentName: 'Custom Skill' },
    });
    expect(consumePendingJarvisCreatorStart()).toBeNull();
    window.removeEventListener(JARVIS_CREATOR_START_EVENT, listener);
  });
});
