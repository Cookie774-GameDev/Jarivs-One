import type { InstantResult } from '../types';

type PlaybackAction =
  'play' | 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'mute' | 'unmute';

export type MediaCommandPort = Readonly<{
  action: (action: PlaybackAction) => void | Promise<void>;
  setVolume: (value: number) => number | Promise<number>;
  selectTrack?: (query: string) => void | Promise<void>;
  setAmbient?: (preset: string) => void | Promise<void>;
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
  request: Readonly<{ id: string; value?: number; text?: string }>,
  port: MediaCommandPort,
): Promise<InstantResult> {
  try {
    if (request.id === 'music.volume') {
      if (!Number.isFinite(request.value)) {
        return { ok: false, code: 'queue_failed', message: 'Music volume must be a number.' };
      }
      const requested = Math.max(0, Math.min(100, Math.round(request.value!)));
      const observed = await port.setVolume(requested);
      if (!Number.isFinite(observed)) {
        return { ok: false, code: 'queue_failed', message: 'Music volume is unavailable.' };
      }
      const canonical = Math.max(0, Math.min(100, Math.round(observed)));
      return { ok: true, code: 'opened', message: `Music volume is ${canonical}.` };
    }

    if (request.id === 'music.track' || request.id === 'ambient.set') {
      const text = request.text?.trim() ?? '';
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
      await capability(text);
      return request.id === 'music.track'
        ? { ok: true, code: 'opened', message: 'Music track changed.' }
        : { ok: true, code: 'opened', message: 'Ambient sound changed.' };
    }

    const action = ACTION_BY_ID[request.id];
    if (!action) return { ok: false, code: 'queue_failed', message: 'Unknown media command.' };
    await port.action(action);
    return { ok: true, code: 'opened', message: `Music ${action}.` };
  } catch {
    return { ok: false, code: 'queue_failed', message: 'Media command failed.' };
  }
}
