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
    render(
      <JarvisVoiceTranscript
        messages={[message('message-1', 'assistant', 'Stable committed reply')]}
        partial="rapidly changing interim words"
        hasBoundChat
        expandedIds={new Set()}
        onToggleExpanded={vi.fn()}
      />,
    );

    const transcript = screen.getByRole('log', { name: 'Voice session transcript' });
    expect(transcript.getAttribute('aria-live')).toBe('off');
    expect(screen.getByText('Stable committed reply')).toBeTruthy();
    const interim = screen.getByText('rapidly changing interim words');
    expect(interim).toBeTruthy();
    expect(interim.getAttribute('data-live-announcement')).toBe('off');
  });
});
