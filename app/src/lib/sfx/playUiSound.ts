import { useUIStore } from '@/stores/ui';
import {
  COMPLETION_SFX_IDS,
  COMPOSER_KEY_SOUND_IDS,
  FREQUENT_SFX_IDS,
  VIBESPACE_SOUNDS,
  type VibeSpaceSoundId,
} from './soundRegistry';

const players = new Map<VibeSpaceSoundId, HTMLAudioElement>();
let lastComposerKeyId: VibeSpaceSoundId | null = null;
let lastComposerKeyAt = 0;
const COMPOSER_KEY_COOLDOWN_MS = 42;

function canUseAudio(): boolean {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

function acquirePlayer(id: VibeSpaceSoundId): HTMLAudioElement | null {
  if (!canUseAudio()) return null;
  const existing = players.get(id);
  if (existing) return existing;
  const spec = VIBESPACE_SOUNDS[id];
  const audio = new Audio(spec.src);
  audio.preload = 'auto';
  audio.volume = spec.volume;
  players.set(id, audio);
  return audio;
}

export function preloadFrequentUiSounds(): void {
  for (const id of FREQUENT_SFX_IDS) {
    try {
      acquirePlayer(id);
    } catch {
      /* ignore */
    }
  }
}

export function uiSoundsEnabled(): boolean {
  return useUIStore.getState().uiSounds !== false;
}

export function completionSoundsEnabled(): boolean {
  return useUIStore.getState().notificationSound !== false;
}

export function playUiSound(id: VibeSpaceSoundId): boolean {
  try {
    if (COMPLETION_SFX_IDS.has(id)) {
      if (!completionSoundsEnabled()) return false;
    } else if (!uiSoundsEnabled()) {
      return false;
    }
    const player = acquirePlayer(id);
    if (!player) return false;
    player.volume = VIBESPACE_SOUNDS[id].volume;
    player.currentTime = 0;
    void player.play().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export function pickComposerKeySoundId(
  previous = lastComposerKeyId,
  random = Math.random,
): VibeSpaceSoundId {
  const pool =
    previous == null
      ? COMPOSER_KEY_SOUND_IDS
      : COMPOSER_KEY_SOUND_IDS.filter((id) => id !== previous);
  const index = Math.floor(random() * pool.length);
  return pool[Math.max(0, Math.min(pool.length - 1, index))] ?? 'composer_key';
}

export function shouldPlayComposerKey(event: {
  repeat?: boolean;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  key?: string;
}): boolean {
  if (event.repeat) return false;
  if (event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const key = event.key ?? '';
  if (key === 'Process' || key === 'Dead') return false;
  if (key === 'Enter' || key === 'Tab' || key === 'Escape') return false;
  if (key.length !== 1 && key !== 'Backspace' && key !== ' ') return false;
  return Date.now() - lastComposerKeyAt >= COMPOSER_KEY_COOLDOWN_MS;
}

export function playComposerKeySound(event: {
  repeat?: boolean;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  key?: string;
}): boolean {
  if (!shouldPlayComposerKey(event)) return false;
  const id = pickComposerKeySoundId(lastComposerKeyId);
  lastComposerKeyId = id;
  lastComposerKeyAt = Date.now();
  return playUiSound(id);
}

export function resetUiSoundPlaybackState(): void {
  lastComposerKeyId = null;
  lastComposerKeyAt = 0;
}
