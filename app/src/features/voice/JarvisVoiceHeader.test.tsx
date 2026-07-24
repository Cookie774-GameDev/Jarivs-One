import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JarvisVoiceHeader } from './JarvisVoiceHeader';

vi.mock('./Orb', () => ({
  Orb: () => <span data-testid="voice-orb" />,
}));

vi.mock('./VoiceActivityWaveform', () => ({
  VoiceActivityWaveform: () => <canvas data-testid="voice-waveform" aria-hidden="true" />,
}));

describe('JarvisVoiceHeader accessibility', () => {
  it('announces the textual voice state through one restrained atomic status', () => {
    render(
      <JarvisVoiceHeader
        state="listening"
        personaName="Jarvis"
        listeningHint='Listening - say "send it" to send'
        voiceAutoListenOnOpen
        voiceCommitPhrase="send it"
        levelRef={{ current: 0.4 }}
        onClose={vi.fn()}
        onToggleListening={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        onPointerCancel={vi.fn()}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent).toContain('Listening - say "send it" to send');
    expect(screen.getByTestId('voice-waveform').getAttribute('aria-hidden')).toBe('true');
  });
});
