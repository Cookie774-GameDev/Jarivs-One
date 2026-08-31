import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoiceStore } from '@/features/voice/store';
import { setJarvisPlaybackEnergy } from '@/features/voice/jarvisPlaybackEnergy';
import { useUIStore } from '@/stores/ui';
import { setJarvisInputEnergy } from './voiceEnergy';
import { JarvisAmbientHost } from './JarvisAmbientHost';

const invoke = vi.fn(async () => undefined);

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('JarvisAmbientHost', () => {
  beforeEach(() => {
    invoke.mockClear();
    useVoiceStore.getState().reset();
    useUIStore.setState({ voiceModalOpen: false });
    setJarvisInputEnergy(0);
    setJarvisPlaybackEnergy(0);
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('publishes real user and Jarvis speech energy to the native aura', async () => {
    const view = render(<JarvisAmbientHost />);
    await waitFor(() => expect(invoke).toHaveBeenCalled());

    act(() => {
      useVoiceStore.getState().setState('listening');
      setJarvisInputEnergy(0.74);
    });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'set_jarvis_ambient_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({ state: 'listening', energy: 0.74 }),
        }),
      ),
    );

    act(() => {
      useVoiceStore.getState().setState('speaking');
      setJarvisPlaybackEnergy(0.61);
    });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'set_jarvis_ambient_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({ state: 'speaking', energy: 0.61 }),
        }),
      ),
    );
    view.unmount();
  });

  it('publishes a visible physical-screen aura as soon as Jarvis is opened', async () => {
    render(<JarvisAmbientHost />);
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    invoke.mockClear();

    act(() => useUIStore.getState().setVoiceModalOpen(true));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'set_jarvis_ambient_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({ state: 'listening', source: 'voice' }),
        }),
      ),
    );
  });

  it('does not invoke native commands in an ordinary browser test surface', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    render(<JarvisAmbientHost />);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(invoke).not.toHaveBeenCalled();
  });
});
