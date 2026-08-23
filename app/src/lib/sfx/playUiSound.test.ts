import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import {
  pickComposerKeySoundId,
  playComposerKeySound,
  playUiSound,
  resetUiSoundPlaybackState,
  shouldPlayComposerKey,
} from './playUiSound';
import { COMPOSER_KEY_SOUND_IDS, VIBESPACE_SOUNDS } from './soundRegistry';

describe('VibeSpace SFX', () => {
  beforeEach(() => {
    resetUiSoundPlaybackState();
    useUIStore.setState({ uiSounds: true, notificationSound: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetUiSoundPlaybackState();
  });

  it('maps every registry id to a public audio path', () => {
    for (const [id, spec] of Object.entries(VIBESPACE_SOUNDS)) {
      expect(spec.src).toMatch(new RegExp(`^/audio/ui/.+\\.(wav|mp3)$`));
      expect(spec.volume).toBeGreaterThan(0);
      expect(id.length).toBeGreaterThan(0);
    }
    expect(COMPOSER_KEY_SOUND_IDS).toHaveLength(6);
  });

  it('does not throw when Audio is unavailable', () => {
    const original = globalThis.Audio;
    // @ts-expect-error test double
    globalThis.Audio = undefined;
    expect(() => playUiSound('chat_message_send')).not.toThrow();
    expect(playUiSound('chat_message_send')).toBe(false);
    globalThis.Audio = original;
  });

  it('gates interaction sounds with uiSounds and completion sounds with notificationSound', () => {
    const play = vi.fn(async () => undefined);
    class FakeAudio {
      volume = 1;
      currentTime = 0;
      preload = '';
      src = '';
      constructor(src: string) {
        this.src = src;
      }
      play() {
        return play();
      }
    }
    // @ts-expect-error test double
    globalThis.Audio = FakeAudio;

    useUIStore.setState({ uiSounds: false, notificationSound: true });
    expect(playUiSound('chat_message_send')).toBe(false);
    expect(play).not.toHaveBeenCalled();

    useUIStore.setState({ uiSounds: true, notificationSound: false });
    expect(playUiSound('notification_complete')).toBe(false);
    expect(playUiSound('chat_message_send')).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('picks a non-repeating composer key and rate-limits repeats/paste modifiers', () => {
    expect(pickComposerKeySoundId('composer_key', () => 0)).not.toBe('composer_key');
    expect(shouldPlayComposerKey({ key: 'a' })).toBe(true);
    expect(shouldPlayComposerKey({ key: 'a', repeat: true })).toBe(false);
    expect(shouldPlayComposerKey({ key: 'a', ctrlKey: true })).toBe(false);
    expect(shouldPlayComposerKey({ key: 'Enter' })).toBe(false);
    expect(shouldPlayComposerKey({ key: 'a', isComposing: true })).toBe(false);
    expect(playComposerKeySound({ key: 'v', ctrlKey: true })).toBe(false);
  });
});
