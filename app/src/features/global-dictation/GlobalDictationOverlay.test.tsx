import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  windowApi: {
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    setFocus: vi.fn(async () => undefined),
  },
  tauriListeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

const sessionMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauriMocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    tauriMocks.tauriListeners.set(event, handler);
    return () => tauriMocks.tauriListeners.delete(event);
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriMocks.windowApi,
}));
vi.mock('./dictationSession', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createGlobalDictationSession: sessionMocks.createSession,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));
vi.mock('@/features/voice/VoiceActivityWaveform', () => ({
  VoiceActivityWaveform: () => null,
}));

import { GlobalDictationOverlay } from './GlobalDictationOverlay';

type SessionCallbacks = {
  onOpen?: () => void;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

function fakeSession(finalText: string, engineLabel = 'Built-in speech recognition') {
  return {
    engine: 'web-speech' as const,
    engineLabel,
    streaming: true,
    stop: vi.fn(async () => undefined),
    cancel: vi.fn(),
    getFinalText: () => finalText,
  };
}

async function openOverlay() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('jarvis:global-dictation-toggle'));
    await Promise.resolve();
  });
}

describe('GlobalDictationOverlay (VibeSpace shared STT pipeline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.tauriListeners.clear();
    tauriMocks.invoke.mockResolvedValue(undefined);
  });

  it('Ctrl+Space toggle starts a shared-pipeline session and shows the engine, never Win+H', async () => {
    let callbacks: SessionCallbacks | null = null;
    sessionMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return fakeSession('');
    });

    render(<GlobalDictationOverlay />);
    expect(screen.getByText('VibeSpace Dictation')).toBeTruthy();
    expect(screen.getByText(/Ctrl\+Space · VibeSpace STT/)).toBeTruthy();

    await openOverlay();

    expect(sessionMocks.createSession).toHaveBeenCalledTimes(1);
    act(() => {
      callbacks!.onOpen?.();
      callbacks!.onPartial?.('hello wor');
    });
    expect(screen.getByText('hello wor')).toBeTruthy();
    expect(screen.getByText('Built-in speech recognition')).toBeTruthy();
    // The OS dictation command is NEVER part of the overlay path.
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith('trigger_os_dictation');
  });

  it('shows a visible error state with Retry and a settings fix path when no engine exists', async () => {
    sessionMocks.createSession.mockRejectedValue(
      new Error('No speech-to-text engine is available. Download a local faster-whisper model or add a Deepgram/Groq key in Settings → Speech to Text.'),
    );

    render(<GlobalDictationOverlay />);
    await openOverlay();

    expect(screen.getByText(/No speech-to-text engine is available/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry dictation/i })).toBeTruthy();
    // Fix path appears both in the error message and the footer hint.
    expect(screen.getAllByText(/Settings → Speech to Text/).length).toBeGreaterThanOrEqual(1);
  });

  it('Retry restarts the session after an error', async () => {
    sessionMocks.createSession
      .mockRejectedValueOnce(new Error('Microphone permission denied.'))
      .mockImplementation(async (cb: SessionCallbacks) => {
        cb.onOpen?.();
        return fakeSession('');
      });

    render(<GlobalDictationOverlay />);
    await openOverlay();
    expect(screen.getByText(/Microphone permission denied/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry dictation/i }));
      await Promise.resolve();
    });

    expect(sessionMocks.createSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Listening/)).toBeTruthy();
  });

  it('Enter finalizes through the session and pastes via dictation_paste_text', async () => {
    vi.useFakeTimers();
    let callbacks: SessionCallbacks | null = null;
    const session = fakeSession('ship the release notes');
    sessionMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return session;
    });

    render(<GlobalDictationOverlay />);
    await openOverlay();
    act(() => {
      callbacks!.onOpen?.();
      callbacks!.onFinal?.('ship the release notes');
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(session.stop).toHaveBeenCalled();
    expect(tauriMocks.windowApi.hide).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith('dictation_paste_text', {
      text: 'ship the release notes',
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith('trigger_os_dictation');
    vi.useRealTimers();
  });

  it('paste failure re-shows the overlay with a visible error and fix path', async () => {
    vi.useFakeTimers();
    tauriMocks.invoke.mockRejectedValue(new Error('xdotool is required for dictation paste on Linux'));
    let callbacks: SessionCallbacks | null = null;
    sessionMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return fakeSession('lost words');
    });

    render(<GlobalDictationOverlay />);
    await openOverlay();
    act(() => {
      callbacks!.onOpen?.();
      callbacks!.onFinal?.('lost words');
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Paste failed: xdotool/)).toBeTruthy();
    expect(tauriMocks.windowApi.show).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('Escape cancels without pasting', async () => {
    let callbacks: SessionCallbacks | null = null;
    const session = fakeSession('do not paste this');
    sessionMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return session;
    });

    render(<GlobalDictationOverlay />);
    await openOverlay();
    act(() => callbacks!.onOpen?.());

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(session.cancel).toHaveBeenCalled();
    expect(tauriMocks.windowApi.hide).toHaveBeenCalled();
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith('dictation_paste_text', expect.anything());
  });

  it('Clear wipes the transcript while a streaming session keeps running', async () => {
    let callbacks: SessionCallbacks | null = null;
    const session = fakeSession('');
    sessionMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return session;
    });

    render(<GlobalDictationOverlay />);
    await openOverlay();
    act(() => {
      callbacks!.onOpen?.();
      callbacks!.onPartial?.('some words');
    });
    expect(screen.getByText('some words')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Clear transcript/i }));

    expect(screen.queryByText('some words')).toBeNull();
    expect(session.cancel).not.toHaveBeenCalled();
    expect(screen.getByText(/Listening/)).toBeTruthy();
  });
});
