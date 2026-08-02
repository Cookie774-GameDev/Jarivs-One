import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Voice } from './Voice';

const mocks = vi.hoisted(() => ({
  authState: {
    personaPreset: 'jarvis',
    setPersona: vi.fn(),
    voicePreset: 'jarvis-prime',
    setVoicePreset: vi.fn(),
    voiceEngine: 'kokoro' as 'deepgram' | 'kokoro' | 'local' | 'system',
    setVoiceEngine: vi.fn(),
    speakReplies: false,
    setSpeakReplies: vi.fn(),
    voiceAutoListenOnOpen: true,
    setVoiceAutoListenOnOpen: vi.fn(),
    voiceSilenceDelayMs: 1_500,
    setVoiceSilenceDelayMs: vi.fn(),
    voiceListenTimeoutMs: 30_000,
    setVoiceListenTimeoutMs: vi.fn(),
    voiceEndTrigger: 'phrase',
    setVoiceEndTrigger: vi.fn(),
    voiceCommitPhrase: 'send it',
    setVoiceCommitPhrase: vi.fn(),
    voiceCancelPhrase: 'cancel',
    setVoiceCancelPhrase: vi.fn(),
    jarvisAutoApprove: false,
    setJarvisAutoApprove: vi.fn(),
    voiceAutoApproveActions: true,
    setVoiceAutoApproveActions: vi.fn(),
    plan: 'free',
  },
  cancelVoicePreview: vi.fn(),
  getInstalledSpeechVoices: vi.fn(),
  isSpeechSynthesisSupported: vi.fn(),
  openSystemSpeechSettings: vi.fn(),
  previewVoiceWithSettings: vi.fn(),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  warmVoiceEngine: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) => selector(mocks.authState),
}));

vi.mock('@/features/voice/speechSynthesis', () => ({
  getInstalledSpeechVoices: mocks.getInstalledSpeechVoices,
  isSpeechSynthesisSupported: mocks.isSpeechSynthesisSupported,
}));

vi.mock('@/features/voice/voiceRouter', () => ({
  cancelVoicePreview: mocks.cancelVoicePreview,
  previewVoiceWithSettings: mocks.previewVoiceWithSettings,
  warmVoiceEngine: mocks.warmVoiceEngine,
}));

vi.mock('@/lib/admin', () => ({
  useAppAdmin: () => ({ isAdmin: false }),
}));

vi.mock('@/lib/entitlements', () => ({
  effectivePlan: (plan: string) => plan,
  planAllowsVoiceWithAdmin: () => true,
}));

vi.mock('@/features/billing/planLimits', () => ({
  getCombinedUsage: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock('@/lib/security/voiceKeys', () => ({
  getDeepgramVoiceKey: vi.fn(() => new Promise(() => undefined)),
  getOpenAIVoiceKey: vi.fn(() => new Promise(() => undefined)),
  setVoiceApiKey: vi.fn(async () => undefined),
}));

vi.mock('@/features/voice/providers/deepgramSpeak', () => ({
  testDeepgramVoiceKey: vi.fn(async () => true),
}));

vi.mock('@/features/voice/modelManager', () => ({
  ModelManager: {
    ensureKokoroReady: vi.fn(async () => false),
    status: vi.fn(async () => ({ ready: false })),
  },
}));

vi.mock('@/lib/tauri', () => ({
  openSystemSpeechSettings: mocks.openSystemSpeechSettings,
}));

vi.mock('@/features/voice/wakeWord', () => ({
  readWakeWordEnabled: () => false,
  setWakeWordEnabled: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: mocks.toast,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: () => null,
}));

const EXPECTED = {
  localInspection:
    'The action failed, sir. Action: Installed voice inspection. Cause: Installed voices could not be inspected. Check Windows speech voice packages, then try the check again.',
  localUnsupported:
    'The action failed, sir. Action: Local voice availability. Cause: This runtime does not provide system speech synthesis. Select Kokoro or another available voice engine in Settings → Voice.',
  microphoneAccess:
    'The action failed, sir. Action: Microphone permission test. Cause: Microphone access was not granted. Check the operating-system and VibeSpace microphone permissions, confirm an input device is available, then try again.',
  microphoneCapture:
    'The action failed, sir. Action: Microphone capture. Cause: The selected microphone could not be opened. Close other apps using the device, check the input settings, then try again.',
  microphoneDevice:
    'The action failed, sir. Action: Microphone device check. Cause: No usable microphone input was found. Connect or enable an input device, confirm it is selected in the operating-system settings, then try again.',
  microphoneUnknown:
    'The action failed, sir. Action: Microphone test. Cause: Microphone access could not be verified. Check permissions and the selected input device, then try again.',
  microphoneUnsupported:
    'The action failed, sir. Action: Microphone availability. Cause: This runtime does not provide microphone access. Open VibeSpace in the desktop app or a browser with microphone support, then try again.',
  preview: {
    deepgram:
      'The action failed, sir. Action: Deepgram voice preview. Cause: The selected voice could not play. Check the Deepgram engine in Settings → Voice, then try the preview again.',
    kokoro:
      'The action failed, sir. Action: Kokoro voice preview. Cause: The selected voice could not play. Check the Kokoro engine in Settings → Voice, then try the preview again.',
    local:
      'The action failed, sir. Action: Local voice preview. Cause: The selected voice could not play. Check the Local engine in Settings → Voice, then try the preview again.',
    system:
      'The action failed, sir. Action: System voice preview. Cause: The selected voice could not play. Check the System engine in Settings → Voice, then try the preview again.',
  },
  kokoro:
    'The action failed, sir. Action: Kokoro voice test. Cause: The local neural voice could not synthesize the test phrase. Jarvis will use the Windows Natural voice; check the local model in Settings → Voice, then try again.',
  settings:
    'The action failed, sir. Action: Windows speech settings. Cause: Windows Speech settings could not be opened automatically. Open Settings → Time & language → Speech manually, install a voice package, then check local voices again.',
} as const;

function renderVoice() {
  return render(<Voice active={false} />);
}

function toastPayload(): string {
  return JSON.stringify(Object.values(mocks.toast).flatMap((toastMock) => toastMock.mock.calls));
}

describe('Voice settings failure narration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.voiceEngine = 'kokoro';
    mocks.isSpeechSynthesisSupported.mockReturnValue(true);
    mocks.getInstalledSpeechVoices.mockResolvedValue([]);
    mocks.previewVoiceWithSettings.mockResolvedValue(undefined);
    mocks.openSystemSpeechSettings.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });
  });

  it('gives an actionable closed diagnostic when microphone access is unsupported', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));

    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Microphone unavailable',
      EXPECTED.microphoneUnsupported,
    );
    expect(toastPayload()).not.toContain('mediaDevices API');
  });

  it('does not expose a microphone permission exception', async () => {
    const rawDetail = 'RAW_MIC_DEVICE_ID_AND_PERMISSION_SENTINEL';
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () =>
          Promise.reject(new DOMException(rawDetail, 'NotAllowedError')),
        ),
      },
    });
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));

    await vi.waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        'Mic test failed',
        EXPECTED.microphoneAccess,
      ),
    );
    expect(toastPayload()).not.toContain(rawDetail);
  });

  it.each([
    ['NotFoundError', EXPECTED.microphoneDevice],
    ['NotReadableError', EXPECTED.microphoneCapture],
  ] as const)(
    'truthfully classifies %s without exposing its microphone exception',
    async (name, expectedMessage) => {
      const rawDetail = `RAW_${name}_MICROPHONE_SENTINEL`;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: vi.fn(async () => Promise.reject(new DOMException(rawDetail, name))),
        },
      });
      renderVoice();

      fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));

      await vi.waitFor(() =>
        expect(mocks.toast.warning).toHaveBeenCalledWith('Mic test failed', expectedMessage),
      );
      expect(toastPayload()).not.toContain(rawDetail);
    },
  );

  it('uses a truthful closed fallback for an unrecognized microphone exception', async () => {
    const rawDetail = 'RAW_UNKNOWN_MICROPHONE_SENTINEL';
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => Promise.reject(new Error(rawDetail))),
      },
    });
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));

    await vi.waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        'Mic test failed',
        EXPECTED.microphoneUnknown,
      ),
    );
    expect(toastPayload()).not.toContain(rawDetail);
  });

  it.each(['deepgram', 'kokoro', 'local', 'system'] as const)(
    'does not expose a %s preview exception and identifies the selected engine',
    async (engine) => {
      const rawDetail = `RAW_${engine.toUpperCase()}_PROVIDER_PREVIEW_SENTINEL`;
      mocks.authState.voiceEngine = engine;
      mocks.previewVoiceWithSettings.mockRejectedValueOnce(new Error(rawDetail));
      renderVoice();

      fireEvent.click(screen.getByRole('button', { name: 'Preview JARVIS voice' }));

      await vi.waitFor(() =>
        expect(mocks.toast.error).toHaveBeenCalledWith(
          'Voice preview failed',
          EXPECTED.preview[engine],
        ),
      );
      expect(toastPayload()).not.toContain(rawDetail);
    },
  );

  it('directs unsupported local speech to another available engine', () => {
    mocks.authState.voiceEngine = 'local';
    mocks.isSpeechSynthesisSupported.mockReturnValue(false);
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Check local voices' }));

    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Local voice unavailable',
      EXPECTED.localUnsupported,
    );
  });

  it('does not expose an installed-voice enumeration exception', async () => {
    const rawDetail = 'RAW_INSTALLED_VOICE_ENUMERATION_SENTINEL';
    mocks.authState.voiceEngine = 'local';
    mocks.getInstalledSpeechVoices.mockRejectedValueOnce(new Error(rawDetail));
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Check local voices' }));

    await vi.waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'Local voice check failed',
        EXPECTED.localInspection,
      ),
    );
    expect(toastPayload()).not.toContain(rawDetail);
  });

  it('uses the same safe Kokoro fallback diagnostic in the toast and inline status', async () => {
    const rawDetail = 'RAW_KOKORO_SYNTHESIS_SENTINEL';
    mocks.previewVoiceWithSettings.mockRejectedValueOnce(new Error(rawDetail));
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Test Kokoro voice' }));

    expect(await screen.findByText(EXPECTED.kokoro)).toBeTruthy();
    expect(mocks.toast.error).toHaveBeenCalledWith('Kokoro test failed', EXPECTED.kokoro);
    expect(screen.queryByText(rawDetail)).toBeNull();
    expect(toastPayload()).not.toContain(rawDetail);
  });

  it('retains the manual Windows path without exposing launcher details', async () => {
    const rawDetail = 'RAW_TAURI_SETTINGS_LAUNCH_SENTINEL';
    mocks.authState.voiceEngine = 'local';
    mocks.openSystemSpeechSettings.mockRejectedValueOnce(new Error(rawDetail));
    renderVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Install voice pack' }));

    await vi.waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        'Open speech settings manually',
        EXPECTED.settings,
      ),
    );
    expect(toastPayload()).not.toContain(rawDetail);
  });
});
