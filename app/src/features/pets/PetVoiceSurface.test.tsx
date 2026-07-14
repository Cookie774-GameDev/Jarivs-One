/**
 * Jarvis Mini Voice surface wires to real VoiceService + useVoiceStore exports.
 * Mocks are only at the VoiceService boundary (not a reimplementation of the surface).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startListening = vi.fn(() => true);
const stopListening = vi.fn();
const stopAllVoiceOutput = vi.fn();
const voiceHandlers = new Map<string, Set<(payload?: unknown) => void>>();

vi.mock('@/features/voice/VoiceService', () => ({
  VoiceService: {
    isSupported: () => true,
    isListening: () => false,
    wantsListening: () => false,
    setInactivityTimeoutMs: vi.fn(),
    startListening: () => startListening(),
    stopListening: () => stopListening(),
    on: (event: string, handler: (payload?: unknown) => void) => {
      let handlers = voiceHandlers.get(event);
      if (!handlers) {
        handlers = new Set();
        voiceHandlers.set(event, handlers);
      }
      handlers.add(handler);
      return () => handlers!.delete(handler);
    },
  },
}));

vi.mock('@/features/voice/voiceRouter', () => ({
  stopAllVoiceOutput: () => stopAllVoiceOutput(),
  stopCurrentVoiceResponse: vi.fn(),
  handleVoiceModuleClosed: vi.fn(),
}));

import { PetVoiceSurface } from './PetVoiceSurface';
import { useVoiceStore } from '@/features/voice/store';
import { usePetPresentationStore } from './petPresentationStore';
import { usePetSettingsStore } from './petSettingsStore';

describe('PetVoiceSurface real voice wiring', () => {
  beforeEach(() => {
    startListening.mockReset().mockReturnValue(true);
    stopListening.mockReset();
    stopAllVoiceOutput.mockReset();
    voiceHandlers.clear();
    useVoiceStore.getState().reset();
    usePetSettingsStore.setState({ petVoiceAutoSend: false });
  });

  it('starts listening via VoiceService (not a mock mic demo)', () => {
    render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^listen$/i }));
    expect(startListening).toHaveBeenCalledTimes(1);
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
    const { unmount } = render(<PetVoiceSurface />);
    fireEvent.click(screen.getByRole('button', { name: /^listen$/i }));
    unmount();
    expect(stopListening).toHaveBeenCalled();
  });

  it('does not auto-start listening on mount', () => {
    render(<PetVoiceSurface />);
    expect(startListening).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().state).toBe('idle');
  });

  it('keeps AI auto-send off by default and exposes an accessible opt-in', () => {
    render(<PetVoiceSurface />);
    const toggle = screen.getByRole('checkbox', { name: /send voice turns automatically/i });
    expect((toggle as HTMLInputElement).checked).toBe(false);

    fireEvent.click(toggle);

    expect(usePetSettingsStore.getState().petVoiceAutoSend).toBe(true);
    expect((toggle as HTMLInputElement).checked).toBe(true);
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
    act(() => useVoiceStore.getState().setState('listening'));
    await waitFor(() => {
      expect(
        usePetPresentationStore.getState().activity.some((a) => a.summary === 'Jarvis is listening'),
      ).toBe(true);
    });
    expect(
      usePetPresentationStore.getState().activity.every((a) => !/secret|sk-|password/i.test(a.summary)),
    ).toBe(true);
  });
});
