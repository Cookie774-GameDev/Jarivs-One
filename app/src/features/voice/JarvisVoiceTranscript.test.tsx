import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';
import { JarvisVoiceTranscript } from './JarvisVoiceTranscript';

function message(id: string, role: 'user' | 'assistant', text: string): Message {
  return {
    id: id as Message['id'],
    chat_id: 'chat-voice' as Message['chat_id'],
    role,
    parts: [{ kind: 'text', text }],
    created_at: 1,
    updated_at: 1,
  };
}

describe('JarvisVoiceTranscript accessibility', () => {
  it('keeps committed and interim text readable without live-announcing every mutation', () => {
    const longUserMessage =
      'A deliberately long voice request that must remain readable when text is scaled and must expose an accessible expansion control without relying on accent color.';
    render(
      <JarvisVoiceTranscript
        messages={[
          message('message-1', 'assistant', 'Stable committed reply'),
          message('message-2', 'user', longUserMessage),
        ]}
        partial="rapidly changing interim words"
        hasBoundChat
        expandedIds={new Set()}
        onToggleExpanded={vi.fn()}
      />,
    );

    const transcript = screen.getByRole('log', { name: 'Voice session transcript' });
    expect(transcript.getAttribute('aria-live')).toBe('off');
    expect(transcript.getAttribute('tabindex')).toBe('0');
    expect(transcript.classList.contains('jarvis-voice-transcript')).toBe(true);
    expect(screen.getByText('Stable committed reply')).toBeTruthy();
    const interim = screen.getByText('rapidly changing interim words');
    expect(interim).toBeTruthy();
    expect(interim.getAttribute('data-live-announcement')).toBe('off');

    expect(screen.getByText('Jarvis').classList.contains('text-foreground')).toBe(true);
    expect(
      screen.getAllByText('You').every((label) => label.classList.contains('text-foreground')),
    ).toBe(true);
    expect(
      screen
        .getByText('Stable committed reply')
        .closest('article')
        ?.classList.contains('jarvis-transcript-card'),
    ).toBe(true);
    expect(
      screen.getByText('Stable committed reply').classList.contains('jarvis-transcript-copy'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Show more' }).classList.contains('text-foreground'),
    ).toBe(true);
  });
});
