/**
 * Jarvis Mini Voice surface wires to real VoiceService + useVoiceStore exports.
 * Mocks are only at the VoiceService boundary (not a reimplementation of the surface).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startListening = vi.fn(() => true);
const stopListening = vi.fn();
const stopAllVoiceOutput = vi.fn();

vi.mock('@/features/voice/VoiceService', () => ({
  VoiceService: {
    startListening: () => startListening(),
    stopListening: () => stopListening(),
  },
}));

vi.mock('@/features/voice/voiceRouter', () => ({
  stopAllVoiceOutput: () => stopAllVoiceOutput(),
}));

import { PetVoiceSurface } from './PetVoiceSurface';
import { useVoiceStore } from '@/features/voice/store';

describe('PetVoiceSurface real voice wiring', () => {
  beforeEach(() => {
    startListening.mockReset().mockReturnValue(true);
    stopListening.mockReset();
    stopAllVoiceOutput.mockReset();
    useVoiceStore.getState().reset();
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
});
