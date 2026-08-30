import type { InstantResult } from '../types';

type PlaybackAction =
  'play' | 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'mute' | 'unmute';

export type MediaCommandPort = Readonly<{
  action: (action: PlaybackAction) => void | Promise<void>;
  setVolume: (value: number) => number | Promise<number>;
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

export async function executeMediaCommand(
  request: Readonly<{ id: string; value?: number }>,
  port: MediaCommandPort,
): Promise<InstantResult> {
  if (request.id === 'music.volume') {
    if (!Number.isFinite(request.value)) {
      return { ok: false, code: 'queue_failed', message: 'Music volume must be a number.' };
    }
    const requested = Math.max(0, Math.min(100, Math.round(request.value!)));
    const observed = await port.setVolume(requested);
    return { ok: true, code: 'opened', message: `Music volume is ${observed}.` };
  }
  const action = ACTION_BY_ID[request.id];
  if (!action) return { ok: false, code: 'queue_failed', message: 'Unknown media command.' };
  await port.action(action);
  return { ok: true, code: 'opened', message: `Music ${action}.` };
}
