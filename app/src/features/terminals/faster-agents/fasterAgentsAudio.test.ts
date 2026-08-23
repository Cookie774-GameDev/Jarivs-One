import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPENWHIP_AUDIO_VOICES_PER_SOUND,
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

  it('preloads independent voices so a rapid crack never rewinds an in-flight sound', async () => {
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
    const instances: Array<{ src: string; currentTime: number }> = [];
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
    preloadOpenWhipCracks();
    expect(instances.map((instance) => instance.src)).toEqual(
      OPENWHIP_CRACK_URLS.flatMap((url) => Array(OPENWHIP_AUDIO_VOICES_PER_SOUND).fill(url)),
    );
    expect(load).toHaveBeenCalledTimes(
      OPENWHIP_CRACK_URLS.length * OPENWHIP_AUDIO_VOICES_PER_SOUND,
    );
    expect(await playOpenWhipCrack(() => 0.999)).toBe(true);
    expect(await playOpenWhipCrack(() => 0.999)).toBe(true);
    expect(instances.at(-OPENWHIP_AUDIO_VOICES_PER_SOUND)?.currentTime).toBe(0);
    expect(instances.at(-OPENWHIP_AUDIO_VOICES_PER_SOUND + 1)?.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);
    expect(instances).toHaveLength(OPENWHIP_CRACK_URLS.length * OPENWHIP_AUDIO_VOICES_PER_SOUND);
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
