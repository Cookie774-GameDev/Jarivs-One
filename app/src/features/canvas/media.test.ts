import { describe, expect, it } from 'vitest';
import {
  CANVAS_MEDIA_AUTOPLAY_ALLOWED,
  CANVAS_MEDIA_KINDS,
  CANVAS_SAFE_AUDIO_MIME_TYPES,
  CANVAS_SAFE_VIDEO_MIME_TYPES,
  CanvasMediaError,
  assertMediaScope,
  createCanvasAudio,
  createCanvasVideo,
  isCanvasMedia,
  isMediaInScope,
  linkMediaProjectFile,
  linkMediaTranscript,
  markMediaMissing,
  restoreMedia,
  setAudioWaveform,
  setMediaOpen,
  setMediaTrim,
  setVideoCrop,
  setVideoPoster,
  updateMediaPlayback,
  validateCanvasMedia,
  validateCanvasMediaReference,
} from './media';
import { CANVAS_MAX_ASSET_BYTES, CanvasSecurityError } from './security';

const digest = (char: string): string => char.repeat(64);

const validVideoReference = {
  id: 'media_1',
  projectId: 'proj_1',
  ownerId: 'owner_1',
  kind: 'video' as const,
  sourceKind: 'remote' as const,
  source: 'https://cdn.example.com/vid/clip.mp4',
  mimeType: 'video/mp4',
  filename: 'clip.mp4',
  byteSize: 5_000_000,
  checksum: { algorithm: 'sha-256' as const, digest: digest('c') },
  durationMs: 30_000,
  width: 1280,
  height: 720,
  missing: false,
  createdAt: 1_000,
};

const validAudioReference = {
  id: 'media_2',
  projectId: 'proj_1',
  ownerId: 'owner_1',
  kind: 'audio' as const,
  sourceKind: 'local' as const,
  source: 'audio/song.mp3',
  mimeType: 'audio/mpeg',
  filename: 'song.mp3',
  byteSize: 3_000_000,
  checksum: { algorithm: 'sha-256' as const, digest: digest('d') },
  durationMs: 180_000,
  width: null,
  height: null,
  missing: false,
  createdAt: 1_000,
};

const scope = { projectId: 'proj_1', ownerId: 'owner_1' };

describe('canvas media reference validation', () => {
  it('builds a frozen video reference with safe remote source and dimensions', () => {
    const reference = validateCanvasMediaReference(validVideoReference);

    expect(reference.id).toBe('media_1');
    expect(reference.kind).toBe('video');
    expect(reference.mimeType).toBe('video/mp4');
    expect(reference.durationMs).toBe(30_000);
    expect(reference.width).toBe(1280);
    expect(reference.height).toBe(720);
    expect(reference.missing).toBe(false);
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.checksum)).toBe(true);
  });

  it('normalizes safe local audio sources through the import-path primitive', () => {
    const reference = validateCanvasMediaReference(validAudioReference);

    expect(reference.kind).toBe('audio');
    expect(reference.source).toBe('audio/song.mp3');
    expect(reference.width).toBeNull();
    expect(reference.height).toBeNull();
  });

  it('exposes the supported media kinds and safe mime allowlists', () => {
    expect(CANVAS_MEDIA_KINDS).toEqual(['video', 'audio']);
    expect(CANVAS_SAFE_VIDEO_MIME_TYPES).toContain('video/mp4');
    expect(CANVAS_SAFE_AUDIO_MIME_TYPES).toContain('audio/mpeg');
  });

  it.each([
    ['javascript remote source', { ...validVideoReference, source: 'javascript:alert(1)' }],
    ['data uri source', { ...validVideoReference, source: 'data:video/mp4;base64,AAAA' }],
    ['file scheme source', { ...validVideoReference, source: 'file:///etc/passwd' }],
    ['traversal local source', { ...validAudioReference, source: '../secrets/song.mp3' }],
  ])('fails closed through security primitives for %s', (_label, input) => {
    expect(() => validateCanvasMediaReference(input)).toThrow(CanvasSecurityError);
  });

  it.each([
    ['unsupported video mime', { ...validVideoReference, mimeType: 'video/x-msvideo' }],
    ['audio mime on video kind', { ...validVideoReference, mimeType: 'audio/mpeg' }],
    ['video mime on audio kind', { ...validAudioReference, mimeType: 'video/mp4' }],
    ['oversized byte size', { ...validVideoReference, byteSize: CANVAS_MAX_ASSET_BYTES + 1 }],
    ['non-positive byte size', { ...validVideoReference, byteSize: 0 }],
    [
      'bad checksum digest',
      { ...validVideoReference, checksum: { algorithm: 'sha-256', digest: 'xyz' } },
    ],
    ['audio with dimensions', { ...validAudioReference, width: 320, height: 240 }],
    ['negative duration', { ...validVideoReference, durationMs: -1 }],
    ['huge duration', { ...validVideoReference, durationMs: 999_999_999_999 }],
    ['invalid id', { ...validVideoReference, id: '!!bad!!' }],
    ['unknown field', { ...validVideoReference, extra: 1 }],
    ['non-boolean missing', { ...validVideoReference, missing: 'no' }],
  ])('fails closed for %s', (_label, input) => {
    expect(() => validateCanvasMediaReference(input)).toThrow(CanvasMediaError);
  });
});

describe('media playback and the no-autoplay invariant', () => {
  it('disallows autoplay at the domain level', () => {
    expect(CANVAS_MEDIA_AUTOPLAY_ALLOWED).toBe(false);
  });

  it('creates video and audio states paused with user-controlled defaults', () => {
    const video = createCanvasVideo(validateCanvasMediaReference(validVideoReference));
    const audio = createCanvasAudio(validateCanvasMediaReference(validAudioReference));

    expect(video.kind).toBe('video');
    expect(video.playback).toEqual({ playing: false, muted: false, timeMs: 0, volume: 1 });
    expect(audio.kind).toBe('audio');
    expect(audio.playback.playing).toBe(false);
    expect(Object.isFrozen(video)).toBe(true);
    expect(Object.isFrozen(video.playback)).toBe(true);
  });

  it('rejects kind mismatches and missing references at creation', () => {
    const videoRef = validateCanvasMediaReference(validVideoReference);
    const audioRef = validateCanvasMediaReference(validAudioReference);

    expect(() => createCanvasVideo(audioRef)).toThrow(CanvasMediaError);
    expect(() => createCanvasAudio(videoRef)).toThrow(CanvasMediaError);
    expect(() => createCanvasVideo(markMediaMissing(videoRef))).toThrow(CanvasMediaError);
  });

  it('toggles play/pause and mute immutably', () => {
    const state = createCanvasVideo(validateCanvasMediaReference(validVideoReference));

    const playing = updateMediaPlayback(state, { playing: true });
    expect(playing.playback.playing).toBe(true);
    expect(state.playback.playing).toBe(false);

    const muted = updateMediaPlayback(playing, { muted: true });
    expect(muted.playback.muted).toBe(true);
    expect(muted.playback.playing).toBe(true);
    expect(playing.playback.muted).toBe(false);
  });

  it('returns the same state when playback is unchanged', () => {
    const state = createCanvasAudio(validateCanvasMediaReference(validAudioReference));
    expect(updateMediaPlayback(state, {})).toBe(state);
    expect(updateMediaPlayback(state, { volume: 1, muted: false })).toBe(state);
  });

  it('bounds timestamps to the known duration and volume to [0, 1]', () => {
    const state = createCanvasVideo(validateCanvasMediaReference(validVideoReference));

    expect(updateMediaPlayback(state, { timeMs: 30_000 }).playback.timeMs).toBe(30_000);
    expect(updateMediaPlayback(state, { volume: 0 }).playback.volume).toBe(0);

    expect(() => updateMediaPlayback(state, { timeMs: 30_001 })).toThrow(CanvasMediaError);
    expect(() => updateMediaPlayback(state, { timeMs: -1 })).toThrow(CanvasMediaError);
    expect(() => updateMediaPlayback(state, { volume: 1.5 })).toThrow(CanvasMediaError);
    expect(() => updateMediaPlayback(state, { volume: -0.1 })).toThrow(CanvasMediaError);
  });
});

describe('video poster, crop and frame', () => {
  const videoState = () => createCanvasVideo(validateCanvasMediaReference(validVideoReference));

  const poster = {
    assetId: 'poster_1',
    source: 'https://cdn.example.com/vid/clip-poster.png',
    checksum: { algorithm: 'sha-256' as const, digest: digest('e') },
    width: 640,
    height: 360,
    timeMs: 5_000,
  };

  it('attaches and clears a poster frame reference', () => {
    const withPoster = setVideoPoster(videoState(), poster);
    expect(withPoster.poster?.assetId).toBe('poster_1');
    expect(withPoster.poster?.timeMs).toBe(5_000);
    expect(setVideoPoster(withPoster, null).poster).toBeNull();
  });

  it('rejects poster frames beyond the duration or with unsafe sources', () => {
    expect(() => setVideoPoster(videoState(), { ...poster, timeMs: 40_000 })).toThrow(
      CanvasMediaError,
    );
    expect(() =>
      setVideoPoster(videoState(), { ...poster, source: 'javascript:alert(1)' }),
    ).toThrow(CanvasSecurityError);
  });

  it('attaches a normalized crop and refuses crop on audio states', () => {
    const cropped = setVideoCrop(videoState(), { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 });
    expect(cropped.crop).toEqual({ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 });
    expect(() => setVideoCrop(videoState(), { left: 0.9, top: 0, right: 0.1, bottom: 1 })).toThrow(
      CanvasMediaError,
    );

    const audio = createCanvasAudio(validateCanvasMediaReference(validAudioReference));
    expect(() => setVideoCrop(audio, { left: 0, top: 0, right: 1, bottom: 1 })).toThrow(
      CanvasMediaError,
    );
    expect(() => setVideoPoster(audio, poster)).toThrow(CanvasMediaError);
  });
});

describe('audio waveform metadata', () => {
  const audioState = () => createCanvasAudio(validateCanvasMediaReference(validAudioReference));
  const waveform = { samples: [0, 0.5, 1], intervalMs: 100, channels: 2 };

  it('attaches and clears bounded waveform metadata', () => {
    const withWaveform = setAudioWaveform(audioState(), waveform);
    expect(withWaveform.waveform?.samples).toEqual([0, 0.5, 1]);
    expect(withWaveform.waveform?.channels).toBe(2);
    expect(setAudioWaveform(withWaveform, null).waveform).toBeNull();
  });

  it('fails closed on malformed waveform metadata', () => {
    expect(() => setAudioWaveform(audioState(), { ...waveform, samples: [0, 1.5] })).toThrow(
      CanvasMediaError,
    );
    expect(() => setAudioWaveform(audioState(), { ...waveform, samples: [] })).toThrow(
      CanvasMediaError,
    );
    expect(() =>
      setAudioWaveform(audioState(), { ...waveform, samples: new Array(4097).fill(0) }),
    ).toThrow(CanvasMediaError);
    expect(() => setAudioWaveform(audioState(), { ...waveform, channels: 3 })).toThrow(
      CanvasMediaError,
    );
    expect(() => setAudioWaveform(audioState(), { ...waveform, intervalMs: 0 })).toThrow(
      CanvasMediaError,
    );
  });

  it('refuses waveform metadata on video states', () => {
    const video = createCanvasVideo(validateCanvasMediaReference(validVideoReference));
    expect(() => setAudioWaveform(video, waveform)).toThrow(CanvasMediaError);
  });
});

describe('trim markers', () => {
  const videoState = () => createCanvasVideo(validateCanvasMediaReference(validVideoReference));

  it('attaches and clears trim markers within the duration', () => {
    const trimmed = setMediaTrim(videoState(), { startMs: 1_000, endMs: 5_000 });
    expect(trimmed.trim).toEqual({ startMs: 1_000, endMs: 5_000 });
    expect(setMediaTrim(trimmed, null).trim).toBeNull();
  });

  it('fails closed on inverted, negative or out-of-range trim markers', () => {
    expect(() => setMediaTrim(videoState(), { startMs: 5_000, endMs: 1_000 })).toThrow(
      CanvasMediaError,
    );
    expect(() => setMediaTrim(videoState(), { startMs: 0, endMs: 40_000 })).toThrow(
      CanvasMediaError,
    );
    expect(() => setMediaTrim(videoState(), { startMs: -1, endMs: 5_000 })).toThrow(
      CanvasMediaError,
    );
  });
});

describe('transcript and project-file links', () => {
  const videoState = () => createCanvasVideo(validateCanvasMediaReference(validVideoReference));

  it('links and clears a transcript reference', () => {
    const linked = linkMediaTranscript(videoState(), {
      blockId: 'block_1',
      source: 'https://cdn.example.com/vid/clip.vtt',
      language: 'en',
    });
    expect(linked.transcript?.blockId).toBe('block_1');
    expect(linked.transcript?.language).toBe('en');
    expect(linkMediaTranscript(linked, null).transcript).toBeNull();
  });

  it('rejects unsafe transcript sources', () => {
    expect(() =>
      linkMediaTranscript(videoState(), {
        blockId: null,
        source: 'javascript:alert(1)',
        language: null,
      }),
    ).toThrow(CanvasSecurityError);
  });

  it('links a project file and rejects unsafe filenames', () => {
    const linked = linkMediaProjectFile(videoState(), {
      source: 'https://cdn.example.com/vid/clip.prproj',
      filename: 'clip.prproj',
      checksum: { algorithm: 'sha-256', digest: digest('f') },
    });
    expect(linked.projectFile?.filename).toBe('clip.prproj');
    expect(() =>
      linkMediaProjectFile(videoState(), {
        source: 'https://cdn.example.com/vid/x.prproj',
        filename: 'a/b.prproj',
        checksum: null,
      }),
    ).toThrow(CanvasMediaError);
  });

  it('sets a safe external open action and rejects unsafe targets', () => {
    const opened = setMediaOpen(videoState(), {
      kind: 'url',
      target: 'https://cdn.example.com/vid/clip.mp4',
      label: 'Open original',
    });
    expect(opened.open?.target).toBe('https://cdn.example.com/vid/clip.mp4');
    expect(() =>
      setMediaOpen(videoState(), { kind: 'url', target: 'javascript:alert(1)', label: null }),
    ).toThrow(CanvasSecurityError);
  });
});

describe('media scope isolation', () => {
  it('accepts a matching scope and fails closed on mismatch', () => {
    const reference = validateCanvasMediaReference(validVideoReference);

    expect(assertMediaScope(reference, scope)).toBe(reference);
    expect(isMediaInScope(reference, scope)).toBe(true);

    const otherProject = { projectId: 'proj_2', ownerId: 'owner_1' };
    expect(() => assertMediaScope(reference, otherProject)).toThrow(CanvasMediaError);
    expect(isMediaInScope(reference, otherProject)).toBe(false);
  });
});

describe('media state parsing, missing state and immutability', () => {
  it('round-trips a created video state through the parser', () => {
    const state = setVideoPoster(
      createCanvasVideo(validateCanvasMediaReference(validVideoReference)),
      {
        assetId: 'poster_1',
        source: 'https://cdn.example.com/vid/clip-poster.png',
        checksum: { algorithm: 'sha-256', digest: digest('e') },
        width: 640,
        height: 360,
        timeMs: 5_000,
      },
    );

    expect(validateCanvasMedia(state)).toEqual(state);
    expect(isCanvasMedia(state)).toBe(true);
    expect(isCanvasMedia({ kind: 'video' })).toBe(false);
  });

  it('rejects a state whose reference kind does not match', () => {
    const video = createCanvasVideo(validateCanvasMediaReference(validVideoReference));
    const forged = { ...video, reference: validateCanvasMediaReference(validAudioReference) };
    expect(() => validateCanvasMedia(forged)).toThrow(CanvasMediaError);
  });

  it('toggles missing state immutably while preserving identity', () => {
    const reference = validateCanvasMediaReference(validVideoReference);
    const missing = markMediaMissing(reference);

    expect(missing.missing).toBe(true);
    expect(reference.missing).toBe(false);
    expect(restoreMedia(missing).missing).toBe(false);
    expect(restoreMedia(reference)).toBe(reference);
  });
});
