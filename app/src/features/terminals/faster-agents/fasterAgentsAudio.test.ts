import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPENWHIP_CRACK_URLS,
  playOpenWhipCrack,
  preloadOpenWhipCracks,
  resetFasterAgentsAudioForTests,
} from './fasterAgentsAudio';

describe('Faster Agents audio', () => {
  afterEach(() => {
    resetFasterAgentsAudioForTests();
    vi.unstubAllGlobals();
  });

  it('preloads all five attributed OpenWhip crack sounds and reuses players', async () => {
    expect(OPENWHIP_CRACK_URLS).toEqual([
      '/audio/openwhip/A.mp3',
      '/audio/openwhip/B.mp3',
      '/audio/openwhip/C.mp3',
      '/audio/openwhip/D.mp3',
      '/audio/openwhip/E.mp3',
    ]);
    const load = vi.fn();
    const play = vi.fn(async () => undefined);
    const pause = vi.fn();
    const removeAttribute = vi.fn();
    const instances: Array<{ src: string }> = [];
    vi.stubGlobal(
      'Audio',
      class {
        preload = '';
        volume = 1;
        currentTime = 0;
        constructor(public src: string) {
          instances.push(this);
        }
        load = load;
        play = play;
        pause = pause;
        removeAttribute = removeAttribute;
      },
    );

    preloadOpenWhipCracks();
    expect(instances.map((instance) => instance.src)).toEqual(OPENWHIP_CRACK_URLS);
    expect(load).toHaveBeenCalledTimes(5);
    expect(await playOpenWhipCrack(() => 0.999)).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    expect(instances).toHaveLength(5);
  });

  it('reports playback failure so the caller can use a bundled fallback', async () => {
    vi.stubGlobal(
      'Audio',
      class {
        preload = '';
        volume = 1;
        currentTime = 0;
        load() {}
        play() {
          return Promise.reject(new Error('offline'));
        }
        pause() {}
        removeAttribute() {}
      },
    );
    expect(await playOpenWhipCrack(() => 0)).toBe(false);
  });
});
