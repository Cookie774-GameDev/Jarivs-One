import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import { findMusicTrack, MUSIC_STUDIO_LIBRARY } from './catalog';

export const MUSIC_PROJECT_MAX_CLIPS = 100;
export const MUSIC_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface MusicClip {
  id: string;
  source: 'cloud' | 'local';
  trackId?: string;
  name: string;
  url?: string;
  trimStart: number;
  trimEnd: number | null;
  speed: number;
  missing?: boolean;
}

export interface MusicProjectSnapshot {
  name: string;
  clips: MusicClip[];
  loop: boolean;
  enabledForAmbient: boolean;
  savedAt: number | null;
}

export function createDefaultMusicMix(): MusicClip[] {
  return MUSIC_STUDIO_LIBRARY.map((track) => ({
    id: `default-${track.id}`,
    source: 'cloud' as const,
    trackId: track.id,
    name: track.name,
    trimStart: 0,
    trimEnd: null,
    speed: 1,
  }));
}

export function dedupeMusicClips(clips: readonly MusicClip[]): MusicClip[] {
  const cloudContent = new Set<string>();
  return clips.filter((clip) => {
    if (clip.source !== 'cloud') return true;
    const digest = findMusicTrack(clip.trackId ?? '')?.sha256;
    if (!digest || cloudContent.has(digest)) return false;
    cloudContent.add(digest);
    return true;
  });
}

export function restoreMusicProjectSnapshot(
  persisted: Partial<MusicProjectSnapshot> | undefined,
  current: MusicProjectSnapshot,
): MusicProjectSnapshot {
  const restoredClips = Array.isArray(persisted?.clips)
    ? dedupeMusicClips(
        persisted.clips.map(normalizeMusicClip).filter((clip): clip is MusicClip => Boolean(clip)),
      ).slice(0, MUSIC_PROJECT_MAX_CLIPS)
    : current.clips;
  const untouchedEmpty = restoredClips.length === 0 && persisted?.savedAt == null;
  return {
    name: typeof persisted?.name === 'string' ? persisted.name.slice(0, 120) : current.name,
    clips: untouchedEmpty ? createDefaultMusicMix() : restoredClips,
    loop: persisted?.loop !== false,
    enabledForAmbient: persisted?.enabledForAmbient === true,
    savedAt: typeof persisted?.savedAt === 'number' ? persisted.savedAt : null,
  };
}

function id(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function normalizeMusicClip(value: unknown): MusicClip | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<MusicClip>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null;
  if (item.source !== 'cloud' && item.source !== 'local') return null;
  if (item.source === 'cloud' && (!item.trackId || !findMusicTrack(item.trackId))) return null;
  const trimStart = Number.isFinite(item.trimStart) ? Math.max(0, Number(item.trimStart)) : 0;
  const trimEnd = Number.isFinite(item.trimEnd) ? Math.max(trimStart, Number(item.trimEnd)) : null;
  const speed = MUSIC_SPEEDS.includes(item.speed as (typeof MUSIC_SPEEDS)[number])
    ? Number(item.speed)
    : 1;
  return {
    id: item.id,
    source: item.source,
    trackId: item.trackId,
    name: item.name.slice(0, 180),
    url: item.source === 'local' && typeof item.url === 'string' ? item.url : undefined,
    trimStart,
    trimEnd,
    speed,
    missing: item.source === 'local' ? item.missing === true || !item.url : false,
  };
}

export function musicClipUrl(clip: MusicClip): string | null {
  if (clip.source === 'cloud') return findMusicTrack(clip.trackId ?? '')?.url ?? null;
  return clip.missing ? null : (clip.url ?? null);
}

interface MusicProjectState extends MusicProjectSnapshot {
  addCloudTrack: (trackId: string) => boolean;
  addLocalFile: (file: File, url: string) => boolean;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, direction: -1 | 1) => void;
  moveClipTo: (clipId: string, targetIndex: number) => void;
  updateClip: (
    clipId: string,
    update: Partial<Pick<MusicClip, 'trimStart' | 'trimEnd' | 'speed'>>,
  ) => void;
  setLoop: (loop: boolean) => void;
  setEnabledForAmbient: (enabled: boolean) => void;
  save: () => void;
  clear: () => void;
}

export const useMusicProjectStore = create<MusicProjectState>()(
  persist(
    (set, get) => ({
      name: 'My Vibe Mix',
      clips: createDefaultMusicMix(),
      loop: true,
      enabledForAmbient: false,
      savedAt: null,
      addCloudTrack: (trackId) => {
        const track = findMusicTrack(trackId);
        if (
          !track ||
          get().clips.length >= MUSIC_PROJECT_MAX_CLIPS ||
          get().clips.some(
            (clip) =>
              clip.source === 'cloud' &&
              findMusicTrack(clip.trackId ?? '')?.sha256 === track.sha256,
          )
        )
          return false;
        set((state) => ({
          clips: [
            ...state.clips,
            {
              id: id(),
              source: 'cloud',
              trackId,
              name: track.name,
              trimStart: 0,
              trimEnd: null,
              speed: 1,
            },
          ],
        }));
        return true;
      },
      addLocalFile: (file, url) => {
        if (!file.type.startsWith('audio/') || get().clips.length >= MUSIC_PROJECT_MAX_CLIPS)
          return false;
        set((state) => ({
          clips: [
            ...state.clips,
            {
              id: id(),
              source: 'local',
              name: file.name.slice(0, 180),
              url,
              trimStart: 0,
              trimEnd: null,
              speed: 1,
              missing: false,
            },
          ],
        }));
        return true;
      },
      removeClip: (clipId) =>
        set((state) => ({ clips: state.clips.filter((clip) => clip.id !== clipId) })),
      moveClip: (clipId, direction) =>
        set((state) => {
          const index = state.clips.findIndex((clip) => clip.id === clipId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= state.clips.length) return state;
          const clips = [...state.clips];
          [clips[index], clips[target]] = [clips[target]!, clips[index]!];
          return { clips };
        }),
      moveClipTo: (clipId, targetIndex) =>
        set((state) => {
          const from = state.clips.findIndex((clip) => clip.id === clipId);
          const boundedTarget = Math.max(0, Math.min(state.clips.length - 1, targetIndex));
          if (from < 0 || from === boundedTarget) return state;
          const clips = [...state.clips];
          const [clip] = clips.splice(from, 1);
          clips.splice(boundedTarget, 0, clip!);
          return { clips };
        }),
      updateClip: (clipId, update) =>
        set((state) => ({
          clips: state.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            const normalized = normalizeMusicClip({ ...clip, ...update });
            return normalized ?? clip;
          }),
        })),
      setLoop: (loop) => set({ loop }),
      setEnabledForAmbient: (enabledForAmbient) => set({ enabledForAmbient }),
      save: () => set({ savedAt: Date.now() }),
      clear: () => set({ clips: [], enabledForAmbient: false, savedAt: Date.now() }),
    }),
    {
      name: 'vibespace-music-project',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        name: state.name,
        clips: state.clips.map((clip) =>
          clip.source === 'local' ? { ...clip, url: undefined, missing: true } : clip,
        ),
        loop: state.loop,
        enabledForAmbient: state.enabledForAmbient,
        savedAt: state.savedAt,
      }),
      merge: (persisted, current) => {
        const value = persisted as Partial<MusicProjectSnapshot> | undefined;
        return {
          ...current,
          ...restoreMusicProjectSnapshot(value, current),
        };
      },
    },
  ),
);

export function revokeLocalMusicClip(clip: MusicClip): void {
  if (clip.source === 'local' && clip.url?.startsWith('blob:')) URL.revokeObjectURL(clip.url);
}
