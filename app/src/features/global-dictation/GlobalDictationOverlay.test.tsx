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

const dictationMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
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
vi.mock('./deepgramDictation', () => ({
  createDeepgramDictationSession: dictationMocks.createSession,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: toastMocks,
  Toaster: () => null,
}));
vi.mock('@/features/voice/VoiceActivityWaveform', () => ({
  VoiceActivityWaveform: () => null,
}));

import { GlobalDictationOverlay } from './GlobalDictationOverlay';

type SessionCallbacks = {
  onOpen: () => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
};

function fakeSession(finalText: string) {
  return {
    stop: vi.fn(),
    getFinalText: () => finalText,
  };
}

describe('GlobalDictationOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.tauriListeners.clear();
    tauriMocks.invoke.mockResolvedValue(undefined);
  });

  it('starts a dictation session and shows the listening state on toggle', async () => {
    let callbacks: SessionCallbacks | null = null;
    dictationMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return fakeSession('');
    });

    render(<GlobalDictationOverlay />);
    expect(screen.getByText('VibeSpace Dictation')).toBeTruthy();
    expect(screen.getByText('Ctrl+Space')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('jarvis:global-dictation-toggle'));
      await Promise.resolve();
    });

    expect(dictationMocks.createSession).toHaveBeenCalledTimes(1);
    act(() => {
      callbacks!.onOpen();
      callbacks!.onPartial('hello wor');
    });
    expect(screen.getByRole('button', { name: /Stop dictation/i })).toBeTruthy();
    expect(screen.getByText('hello wor')).toBeTruthy();
  });

  it('shows a clear error when the STT provider is unavailable (missing key/permission)', async () => {
    dictationMocks.createSession.mockRejectedValue(
      new Error('Add a Deepgram API key in Settings → Providers to use dictation.'),
    );

    render(<GlobalDictationOverlay />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('jarvis:global-dictation-toggle'));
      await Promise.resolve();
    });

    expect(toastMocks.error).toHaveBeenCalledWith(
      'Dictation unavailable',
      expect.stringContaining('Deepgram API key'),
    );
    expect(screen.getByRole('button', { name: /Start dictation/i })).toBeTruthy();
  });

  it('pastes the transcript through the native command on Enter', async () => {
    vi.useFakeTimers();
    let callbacks: SessionCallbacks | null = null;
    dictationMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return fakeSession('ship the release notes');
    });

    render(<GlobalDictationOverlay />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('jarvis:global-dictation-toggle'));
      await Promise.resolve();
    });
    act(() => {
      callbacks!.onOpen();
      callbacks!.onFinal('ship the release notes');
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(tauriMocks.windowApi.hide).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(tauriMocks.invoke).toHaveBeenCalledWith('dictation_paste_text', {
      text: 'ship the release notes',
    });
    vi.useRealTimers();
  });

  it('surfaces paste failures instead of dropping the transcript silently', async () => {
    vi.useFakeTimers();
    tauriMocks.invoke.mockRejectedValue(new Error('xdotool is required for dictation paste on Linux'));
    let callbacks: SessionCallbacks | null = null;
    dictationMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return fakeSession('lost words');
    });

    render(<GlobalDictationOverlay />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('jarvis:global-dictation-toggle'));
      await Promise.resolve();
    });
    act(() => {
      callbacks!.onOpen();
      callbacks!.onFinal('lost words');
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastMocks.error).toHaveBeenCalledWith(
      'Dictation paste failed',
      expect.stringContaining('xdotool'),
    );
    vi.useRealTimers();
  });

  it('cancels without pasting on Escape', async () => {
    let callbacks: SessionCallbacks | null = null;
    dictationMocks.createSession.mockImplementation(async (cb: SessionCallbacks) => {
      callbacks = cb;
      return fakeSession('do not paste this');
    });

    render(<GlobalDictationOverlay />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('jarvis:global-dictation-toggle'));
      await Promise.resolve();
    });
    act(() => {
      callbacks!.onOpen();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(tauriMocks.windowApi.hide).toHaveBeenCalled();
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith('dictation_paste_text', expect.anything());
  });
});
