import { AmbientAudioEngine } from '@/features/ambient/ambientAudio';
import { AMBIENT_TRACKS } from '@/features/ambient/tracks';
import { useUIStore, type AmbientTrack } from '@/stores/ui';
import type { InstantResult } from '../types';

type PlaybackAction =
  'play' | 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'mute' | 'unmute';

export type MediaTrack = Readonly<{ id: string; label: string }>;
export type MediaTrackResolution =
  | Readonly<{ status: 'resolved'; id: string }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'ambiguous'; candidateIds: readonly string[] }>;
export type MediaSelectionOutcome =
  | Readonly<{ status: 'selected'; canonical: string }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'ambiguous'; candidateIds: readonly string[] }>;
export type MediaCommandRequest = Readonly<{ id: string; value?: number; text?: string }>;

export type MediaCommandPort = Readonly<{
  action: (action: PlaybackAction) => void | Promise<void>;
  setVolume: (value: number) => number | Promise<number>;
  selectTrack?: (query: string) => MediaSelectionOutcome | Promise<MediaSelectionOutcome>;
  setAmbient?: (preset: string) => MediaSelectionOutcome | Promise<MediaSelectionOutcome>;
}>;

type CanonicalMediaState = Readonly<{
  ambientTrack: string;
  ambientVolume: number;
  ambientAlwaysPlay: boolean;
  setAmbientTrack: (value: string) => void;
  setAmbientVolume: (value: number) => void;
  setAmbientAlwaysPlay: (value: boolean) => void;
}>;

type CanonicalMediaEngine = Readonly<{
  play: (track: string, volume: number) => void;
  stop: () => void;
  setTrack: (track: string) => void;
  setVolume: (volume: number) => void;
}>;

type CanonicalMediaPortDependencies = Readonly<{
  readState: () => CanonicalMediaState;
  engine: CanonicalMediaEngine;
  tracks: readonly MediaTrack[];
}>;

const ACTION_BY_ID: Readonly<Record<string, PlaybackAction>> = Object.freeze({
  'music.play': 'play',
  'music.pause': 'pause',
  'music.resume': 'resume',
  'music.stop': 'stop',
  'music.next': 'next',
  'music.previous': 'previous',
  'music.mute': 'mute',
  'music.unmute': 'unmute',
});
const MEDIA_COMMANDS = new Set([
  ...Object.keys(ACTION_BY_ID),
  'music.volume',
  'music.track',
  'ambient.set',
]);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function normalizeTrackName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function resolveMediaTrack(
  tracks: readonly MediaTrack[],
  query: string,
): MediaTrackResolution {
  if (
    !Array.isArray(tracks) ||
    tracks.length === 0 ||
    tracks.length > 64 ||
    typeof query !== 'string' ||
    !query.trim() ||
    query.length > 200 ||
    CONTROL_CHARACTER.test(query) ||
    tracks.some(
      (track) =>
        !track ||
        typeof track.id !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(track.id) ||
        typeof track.label !== 'string' ||
        !track.label.trim() ||
        track.label.length > 200 ||
        CONTROL_CHARACTER.test(track.label),
    )
  ) {
    return Object.freeze({ status: 'missing' });
  }
  const exactIds = tracks.filter((track) => track.id === query.trim());
  if (exactIds.length === 1) return Object.freeze({ status: 'resolved', id: exactIds[0]!.id });
  if (exactIds.length > 1) {
    return Object.freeze({
      status: 'ambiguous',
      candidateIds: Object.freeze([...new Set(exactIds.map((track) => track.id))]),
    });
  }
  const normalized = normalizeTrackName(query);
  const labels = tracks.filter((track) => normalizeTrackName(track.label) === normalized);
  if (labels.length === 1) return Object.freeze({ status: 'resolved', id: labels[0]!.id });
  if (labels.length > 1) {
    return Object.freeze({
      status: 'ambiguous',
      candidateIds: Object.freeze([...new Set(labels.map((track) => track.id))]),
    });
  }
  return Object.freeze({ status: 'missing' });
}

function defaultCanonicalDependencies(): CanonicalMediaPortDependencies {
  const engine = AmbientAudioEngine.getInstance();
  return {
    readState: () => {
      const state = useUIStore.getState();
      return {
        ambientTrack: state.ambientTrack,
        ambientVolume: state.ambientVolume,
        ambientAlwaysPlay: state.ambientAlwaysPlay,
        setAmbientTrack: (value) => state.setAmbientTrack(value as AmbientTrack),
        setAmbientVolume: state.setAmbientVolume,
        setAmbientAlwaysPlay: state.setAmbientAlwaysPlay,
      };
    },
    engine: {
      play: (track, volume) => engine.play(track as AmbientTrack, volume),
      stop: () => engine.stop(),
      setTrack: (track) => engine.setTrack(track as AmbientTrack),
      setVolume: (volume) => engine.setVolume(volume),
    },
    tracks: AMBIENT_TRACKS.map(({ id, label }) => Object.freeze({ id, label })),
  };
}

export function createCanonicalMediaCommandPort(
  dependencies: CanonicalMediaPortDependencies = defaultCanonicalDependencies(),
): MediaCommandPort {
  const { readState, engine, tracks } = dependencies;
  const select = (query: string): MediaSelectionOutcome => {
    const resolution = resolveMediaTrack(tracks, query);
    if (resolution.status !== 'resolved') return resolution;
    const state = readState();
    state.setAmbientTrack(resolution.id);
    engine.setTrack(resolution.id);
    return Object.freeze({ status: 'selected', canonical: resolution.id });
  };
  return Object.freeze({
    action: (action) => {
      const state = readState();
      if (action === 'play' || action === 'resume') {
        state.setAmbientAlwaysPlay(true);
        engine.play(state.ambientTrack, state.ambientVolume);
        return;
      }
      if (action === 'pause' || action === 'stop') {
        state.setAmbientAlwaysPlay(false);
        engine.stop();
        return;
      }
      if (action === 'mute') {
        engine.setVolume(0);
        return;
      }
      if (action === 'unmute') {
        engine.setVolume(state.ambientVolume);
        return;
      }
      const current = tracks.findIndex((track) => track.id === state.ambientTrack);
      if (current < 0) throw new Error('media_track_state_invalid');
      const offset = action === 'next' ? 1 : -1;
      const next = tracks[(current + offset + tracks.length) % tracks.length];
      if (!next) throw new Error('media_playlist_unavailable');
      state.setAmbientTrack(next.id);
      engine.setTrack(next.id);
    },
    setVolume: (value) => {
      const state = readState();
      state.setAmbientVolume(value);
      const canonical = readState().ambientVolume;
      engine.setVolume(canonical);
      return canonical;
    },
    selectTrack: select,
    setAmbient: select,
  });
}

function hasExactKeys(value: object, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validRequestSchema(request: Readonly<{ id: string; value?: number; text?: string }>) {
  if (request.id === 'music.volume') return hasExactKeys(request, ['id', 'value']);
  if (request.id === 'music.track' || request.id === 'ambient.set') {
    return hasExactKeys(request, ['id', 'text']);
  }
  return hasExactKeys(request, ['id']);
}

export async function executeMediaCommand(
  request: MediaCommandRequest,
  port: MediaCommandPort = createCanonicalMediaCommandPort(),
  signal?: AbortSignal,
): Promise<InstantResult> {
  try {
    if (signal?.aborted) {
      return { ok: false, code: 'queue_failed', message: 'The instant command deadline elapsed.' };
    }
    if (typeof request.id !== 'string' || !MEDIA_COMMANDS.has(request.id)) {
      return { ok: false, code: 'queue_failed', message: 'Unknown media command.' };
    }
    if (!validRequestSchema(request)) {
      return { ok: false, code: 'queue_failed', message: 'Media command arguments are invalid.' };
    }
    if (request.id === 'music.volume') {
      if (!Number.isFinite(request.value)) {
        return { ok: false, code: 'queue_failed', message: 'Music volume must be a number.' };
      }
      const requested = Math.max(0, Math.min(100, Math.round(request.value!)));
      const observed = await port.setVolume(requested);
      if (signal?.aborted) {
        return {
          ok: false,
          code: 'queue_failed',
          message: 'The instant command deadline elapsed.',
        };
      }
      if (!Number.isFinite(observed) || observed < 0 || observed > 100) {
        return { ok: false, code: 'queue_failed', message: 'Music volume is unavailable.' };
      }
      const canonical = Math.max(0, Math.min(100, Math.round(observed)));
      return { ok: true, code: 'opened', message: `Music volume is ${canonical}.` };
    }

    if (request.id === 'music.track' || request.id === 'ambient.set') {
      const text = typeof request.text === 'string' ? request.text.trim() : '';
      if (!text || text.length > 200 || /[\u0000-\u001f\u007f]/u.test(text)) {
        const subject = request.id === 'music.track' ? 'track' : 'ambient sound';
        return { ok: false, code: 'queue_failed', message: `Name a bounded ${subject}.` };
      }
      const capability = request.id === 'music.track' ? port.selectTrack : port.setAmbient;
      if (!capability) {
        return {
          ok: false,
          code: 'queue_failed',
          message: 'That media capability is unavailable.',
        };
      }
      const outcome = await capability(text);
      if (signal?.aborted) {
        return {
          ok: false,
          code: 'queue_failed',
          message: 'The instant command deadline elapsed.',
        };
      }
      if (outcome.status === 'ambiguous') {
        return {
          ok: false,
          code: 'target_ambiguous',
          message: 'More than one media track matches.',
        };
      }
      if (outcome.status === 'missing') {
        return { ok: false, code: 'target_missing', message: 'No media track matches.' };
      }
      return request.id === 'music.track'
        ? { ok: true, code: 'opened', message: 'Music track changed.' }
        : { ok: true, code: 'opened', message: 'Ambient sound changed.' };
    }

    const action = Object.prototype.hasOwnProperty.call(ACTION_BY_ID, request.id)
      ? ACTION_BY_ID[request.id]
      : undefined;
    if (!action) return { ok: false, code: 'queue_failed', message: 'Unknown media command.' };
    await port.action(action);
    if (signal?.aborted) {
      return { ok: false, code: 'queue_failed', message: 'The instant command deadline elapsed.' };
    }
    return { ok: true, code: 'opened', message: `Music ${action}.` };
  } catch {
    return { ok: false, code: 'queue_failed', message: 'Media command failed.' };
  }
}
