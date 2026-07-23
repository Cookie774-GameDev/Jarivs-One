/**
 * Jarvis Mini Voice surface wires to real VoiceService + useVoiceStore exports.
 * Mocks are only at the VoiceService boundary (not a reimplementation of the surface).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startListening = vi.fn(() => true);
const stopListening = vi.fn();
const stopAllVoiceOutput = vi.fn();
let voiceErrorHandler: ((payload: { kind: 'permission_denied'; message: string }) => void) | null =
  null;
const onVoiceEvent = vi.fn(
  (event: string, handler: (payload: { kind: 'permission_denied'; message: string }) => void) => {
    if (event === 'voice:error') voiceErrorHandler = handler;
    return () => {
      if (voiceErrorHandler === handler) voiceErrorHandler = null;
    };
  },
);

vi.mock('@/features/voice/VoiceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/voice/VoiceService')>()),
  VoiceService: {
    startListening: () => startListening(),
    stopListening: () => stopListening(),
    on: (
      event: string,
      handler: (payload: { kind: 'permission_denied'; message: string }) => void,
    ) => onVoiceEvent(event, handler),
  },
}));

vi.mock('@/features/voice/voiceRouter', () => ({
  stopAllVoiceOutput: () => stopAllVoiceOutput(),
}));

import { PetVoiceSurface } from './PetVoiceSurface';
import { useVoiceStore } from '@/features/voice/store';
import { usePetPresentationStore } from './petPresentationStore';

describe('PetVoiceSurface real voice wiring', () => {
  beforeEach(() => {
    startListening.mockReset().mockReturnValue(true);
    stopListening.mockReset();
    stopAllVoiceOutput.mockReset();
    onVoiceEvent.mockClear();
    voiceErrorHandler = null;
    useVoiceStore.getState().reset();
  });

  it('starts listening via VoiceService (not a mock mic demo)', () => {
    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^listen$/i }));
    expect(startListening).toHaveBeenCalledTimes(1);
    expect(onVoiceEvent).toHaveBeenCalledWith('voice:error', expect.any(Function));
    expect(voiceErrorHandler).toBeNull();
  });

  it('preserves an exact safe VoiceService diagnostic when startup returns false', () => {
    const safeMessage =
      'The action failed, sir. Action: Microphone permission. ' +
      'Cause: Microphone permission was denied. Allow access in the browser or ' +
      'operating-system settings, then try again.';
    startListening.mockImplementationOnce(() => {
      voiceErrorHandler?.({ kind: 'permission_denied', message: safeMessage });
      return false;
    });

    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^listen$/i }));

    expect(screen.getByText(safeMessage)).toBeTruthy();
    expect(onVoiceEvent).toHaveBeenCalledWith('voice:error', expect.any(Function));
    expect(voiceErrorHandler).toBeNull();
  });

  it('uses the closed startup fallback when false returns without an event', () => {
    startListening.mockReturnValueOnce(false);

    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^listen$/i }));

    expect(
      screen.getByText(
        /Speech recognition startup.*Stop other microphone sessions, then try again/,
      ),
    ).toBeTruthy();
    expect(voiceErrorHandler).toBeNull();
  });

  it('suppresses a thrown startup detail behind the closed startup fallback', () => {
    startListening.mockImplementationOnce(() => {
      throw new Error('synthetic pet microphone implementation detail');
    });

    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^listen$/i }));

    expect(screen.getByText(/Speech recognition startup/)).toBeTruthy();
    expect(screen.queryByText(/synthetic pet microphone implementation detail/)).toBeNull();
    expect(voiceErrorHandler).toBeNull();
  });

  it('stops listening via VoiceService when Stop is pressed', () => {
    useVoiceStore.getState().setState('listening');
    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(stopListening).toHaveBeenCalled();
  });

  it('shows live partial transcript from useVoiceStore', () => {
    useVoiceStore.getState().setPartialTranscript('hello world');
    render(<PetVoiceSurface />);
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('shows finalized user transcripts from store', () => {
    useVoiceStore.getState().pushFinalTranscript('final line');
    render(<PetVoiceSurface />);
    expect(screen.getByText('final line')).toBeTruthy();
  });

  it('stop speaking calls stopAllVoiceOutput', () => {
    useVoiceStore.getState().setState('speaking');
    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /stop speaking/i }));
    expect(stopAllVoiceOutput).toHaveBeenCalled();
  });

  it('mute stops TTS output without starting mic', () => {
    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^mute$/i }));
    expect(stopAllVoiceOutput).toHaveBeenCalled();
    expect(startListening).not.toHaveBeenCalled();
  });

  it('open chats callback fires for corresponding chat navigation', () => {
    const onOpenChats = vi.fn();
    render(<PetVoiceSurface onOpenChats={onOpenChats} />);
    fireEvent.click(screen.getByRole('button', { name: /open chat/i }));
    expect(onOpenChats).toHaveBeenCalledTimes(1);
  });

  it('cleanup on unmount stops listening when still capturing', () => {
    useVoiceStore.getState().setState('listening');
    const { unmount } = render(<PetVoiceSurface />);
    unmount();
    expect(stopListening).toHaveBeenCalled();
  });

  it('does not auto-start listening on mount', () => {
    render(<PetVoiceSurface />);
    expect(startListening).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().state).toBe('idle');
  });

  it('shows provider/model status from auth store (no second backend)', () => {
    render(<PetVoiceSurface />);
    const el = document.querySelector('[data-pet-voice-provider-status]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toMatch(/Model/i);
  });

  it('pushes only safe activity summaries (no transcript text)', async () => {
    usePetPresentationStore.setState({ activity: [], activitySeenIds: [], unreadActivity: 0 });
    render(<PetVoiceSurface />);
    useVoiceStore.getState().setState('listening');
    await waitFor(() => {
      expect(
        usePetPresentationStore
          .getState()
          .activity.some((a) => a.summary === 'Jarvis is listening'),
      ).toBe(true);
    });
    expect(
      usePetPresentationStore
        .getState()
        .activity.every((a) => !/secret|sk-|password/i.test(a.summary)),
    ).toBe(true);
  });
});
