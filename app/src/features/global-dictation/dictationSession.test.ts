import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Engine resolution for the Ctrl+Space overlay must mirror VibeSpace chat
 * STT settings and must NEVER fall back to OS dictation (Windows Win+H).
 */

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  voiceService: {
    isSupported: vi.fn(() => false),
    startListening: vi.fn(() => true),
    stopListening: vi.fn(),
    setInactivityTimeoutMs: vi.fn(),
    on: vi.fn(() => () => undefined),
  },
  composer: {
    provider: 'system' as 'system' | 'faster-whisper',
    model: 'small',
    startBatchAudioRecorder: vi.fn(async () => ({
      captureWav: () => new Blob(['x'], { type: 'audio/wav' }),
      stop: vi.fn(),
    })),
    transcribeFasterWhisper: vi.fn(async () => 'local text'),
    transcribeGroq: vi.fn(async () => 'groq text'),
  },
  fasterWhisper: {
    checkInstalled: vi.fn(async () => false),
  },
  deepgramKey: { value: '' as string },
  deepgramSession: vi.fn(async () => ({
    stop: vi.fn(),
    getFinalText: () => 'deepgram text',
  })),
}));

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get isTauri() {
    return mocks.isTauri.value;
  },
}));

vi.mock('@/features/voice/VoiceService', () => ({
  VoiceService: mocks.voiceService,
}));

vi.mock('@/features/composer-stt/composerSttService', () => ({
  getComposerSttProvider: () => mocks.composer.provider,
  getFasterWhisperModel: () => mocks.composer.model,
  startBatchAudioRecorder: mocks.composer.startBatchAudioRecorder,
  transcribeFasterWhisper: mocks.composer.transcribeFasterWhisper,
  transcribeGroq: mocks.composer.transcribeGroq,
}));

vi.mock('@/features/composer-stt/fasterWhisperManager', () => ({
  FasterWhisperManager: mocks.fasterWhisper,
}));

vi.mock('@/features/composer-stt/audio', () => ({
  getAudioContextCtor: () => function FakeAudioContext() {},
}));

vi.mock('@/lib/security/voiceKeys', () => ({
  getDeepgramVoiceKey: async () => mocks.deepgramKey.value,
}));

vi.mock('./deepgramDictation', () => ({
  createDeepgramDictationSession: mocks.deepgramSession,
}));

import { createGlobalDictationSession, NO_ENGINE_MESSAGE } from './dictationSession';
import { useAuthStore } from '@/stores/auth';

function stubMic(available: boolean) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: available ? { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } : {},
  });
}

describe('createGlobalDictationSession engine resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri.value = true;
    mocks.composer.provider = 'system';
    mocks.voiceService.isSupported.mockReturnValue(false);
    mocks.voiceService.startListening.mockReturnValue(true);
    mocks.fasterWhisper.checkInstalled.mockResolvedValue(false);
    mocks.deepgramKey.value = '';
    useAuthStore.setState({ apiKeys: {} });
    stubMic(true);
  });

  it('uses the configured local faster-whisper model first (same as composer STT)', async () => {
    mocks.composer.provider = 'faster-whisper';
    mocks.fasterWhisper.checkInstalled.mockResolvedValue(true);

    const session = await createGlobalDictationSession();

    expect(session.engine).toBe('faster-whisper');
    expect(session.streaming).toBe(false);
    await session.stop();
    expect(mocks.composer.transcribeFasterWhisper).toHaveBeenCalled();
    expect(session.getFinalText()).toBe('local text');
  });

  it('uses the built-in Web Speech engine when available (default chat STT engine)', async () => {
    mocks.voiceService.isSupported.mockReturnValue(true);

    const session = await createGlobalDictationSession();

    expect(session.engine).toBe('web-speech');
    expect(session.streaming).toBe(true);
    expect(mocks.voiceService.startListening).toHaveBeenCalled();
    session.cancel();
    expect(mocks.voiceService.stopListening).toHaveBeenCalled();
  });

  it('uses Deepgram streaming when a voice key is configured', async () => {
    mocks.deepgramKey.value = 'dg_key';

    const session = await createGlobalDictationSession();

    expect(session.engine).toBe('deepgram');
    expect(mocks.deepgramSession).toHaveBeenCalled();
    expect(session.getFinalText()).toBe('deepgram text');
  });

  it('uses Groq Whisper when only a Groq key is configured', async () => {
    useAuthStore.setState({ apiKeys: { groq: 'gsk_test' } });

    const session = await createGlobalDictationSession();

    expect(session.engine).toBe('groq');
    await session.stop();
    expect(mocks.composer.transcribeGroq).toHaveBeenCalled();
    expect(session.getFinalText()).toBe('groq text');
  });

  it('fails with a clear fix path (and an explicit no-Win+H statement) when no engine exists', async () => {
    await expect(createGlobalDictationSession()).rejects.toThrow(/Settings → Speech to Text/);
    await expect(createGlobalDictationSession()).rejects.toThrow(/never uses Windows Win\+H/);
    expect(NO_ENGINE_MESSAGE).toContain('never uses Windows Win+H');
  });

  it('reports a microphone problem distinctly when capture is unavailable', async () => {
    stubMic(false);
    await expect(createGlobalDictationSession()).rejects.toThrow(/microphone permission/i);
  });
});
