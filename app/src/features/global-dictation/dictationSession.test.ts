import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Engine resolution for the Ctrl+Space overlay must mirror VibeSpace chat
 * STT settings and must NEVER fall back to OS dictation (Windows Win+H).
 */

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  voiceHandlers: new Map<string, (payload: never) => void>(),
  voiceService: {
    isSupported: vi.fn(() => false),
    startListening: vi.fn(() => true),
    stopListening: vi.fn(),
    setInactivityTimeoutMs: vi.fn(),
    on: vi.fn<(event: string, handler: (payload: never) => void) => () => void>(
      () => () => undefined,
    ),
  },
  composer: {
    provider: 'system' as 'system' | 'faster-whisper' | 'deepgram',
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

vi.mock('@/features/voice/VoiceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/voice/VoiceService')>()),
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
import { formatVoiceFailure } from '@/features/voice/VoiceService';
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
    mocks.voiceHandlers.clear();
    mocks.voiceService.on.mockImplementation((event, handler) => {
      mocks.voiceHandlers.set(event, handler);
      return () => {
        mocks.voiceHandlers.delete(event);
      };
    });
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

  it('reports a safe shared batch-transcription failure without provider details', async () => {
    mocks.composer.provider = 'faster-whisper';
    mocks.fasterWhisper.checkInstalled.mockResolvedValue(true);
    mocks.composer.transcribeFasterWhisper.mockRejectedValueOnce(
      new Error('synthetic local model path and provider detail'),
    );
    const onError = vi.fn();

    const session = await createGlobalDictationSession({ onError });
    await session.stop();

    expect(onError).toHaveBeenCalledWith(
      'The action failed, sir. Action: Local faster-whisper transcription. ' +
        'Cause: Captured audio could not be transcribed. ' +
        'Check the selected engine and connection, then retry.',
    );
    expect(onError.mock.calls[0]?.[0]).not.toContain('synthetic local model path');
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

  it('preserves the closed browser-recognition startup diagnostic', async () => {
    mocks.voiceService.isSupported.mockReturnValue(true);
    const onError = vi.fn();
    const session = await createGlobalDictationSession({ onError });
    const startupMessage = formatVoiceFailure('unknown', 'startup');

    mocks.voiceHandlers.get('voice:error')?.({
      kind: 'unknown',
      message: startupMessage,
    } as never);

    expect(onError).toHaveBeenCalledWith(startupMessage);
    session.cancel();
  });

  it('uses the selected Deepgram streaming session before Web Speech', async () => {
    mocks.composer.provider = 'deepgram';
    mocks.deepgramKey.value = 'dg_key';
    mocks.voiceService.isSupported.mockReturnValue(true);

    const session = await createGlobalDictationSession();

    expect(session.engine).toBe('deepgram');
    expect(mocks.deepgramSession).toHaveBeenCalled();
    expect(mocks.voiceService.startListening).not.toHaveBeenCalled();
    expect(session.getFinalText()).toBe('deepgram text');
    await session.stop();
  });

  it('does not silently downgrade a selected Deepgram model when its key is missing', async () => {
    mocks.composer.provider = 'deepgram';
    mocks.voiceService.isSupported.mockReturnValue(true);

    await expect(createGlobalDictationSession()).rejects.toThrow(/selected Deepgram/i);
    expect(mocks.voiceService.startListening).not.toHaveBeenCalled();
    expect(mocks.composer.transcribeGroq).not.toHaveBeenCalled();
  });

  it('does not silently downgrade a selected local faster-whisper model', async () => {
    mocks.composer.provider = 'faster-whisper';
    mocks.voiceService.isSupported.mockReturnValue(true);

    await expect(createGlobalDictationSession()).rejects.toThrow(/selected local faster-whisper/i);
    expect(mocks.voiceService.startListening).not.toHaveBeenCalled();
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
