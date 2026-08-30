import * as React from 'react';
import { Bot, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

function messageText(message: Message): string {
  return message.parts
    .filter(
      (part): part is Extract<Message['parts'][number], { kind: 'text' }> => part.kind === 'text',
    )
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export function JarvisVoiceTranscript({
  messages,
  partial,
  hasBoundChat,
  expandedIds,
  onToggleExpanded,
}: {
  messages: readonly Message[];
  partial: string;
  hasBoundChat: boolean;
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (messageId: string) => void;
}) {
  const transcriptRef = React.useRef<HTMLDivElement>(null);
  const stickyRef = React.useRef(true);
  const transcript = messages
    .filter(
      (message) =>
        message.role === 'user' || message.role === 'assistant' || message.role === 'agent',
    )
    .map((message) => ({ ...message, displayText: messageText(message) }))
    .filter((message) => message.displayText)
    .slice(-8);

  React.useEffect(() => {
    const node = transcriptRef.current;
    if (node && stickyRef.current) node.scrollTop = node.scrollHeight;
  }, [messages, partial]);

  return (
    <div
      ref={transcriptRef}
      role="log"
      tabIndex={0}
      aria-label="Voice session transcript"
      aria-live="off"
      data-no-panel-drag="true"
      onScroll={() => {
        const node = transcriptRef.current;
        if (!node) return;
        stickyRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
      }}
      className="jarvis-voice-transcript max-h-[28vh] space-y-2 overflow-y-auto"
    >
      {transcript.length === 0 && !partial ? (
        <div className="jarvis-transcript-empty flex min-h-10 items-center justify-center text-center text-muted-foreground">
          {hasBoundChat ? 'Listening...' : 'Open a chat first.'}
        </div>
      ) : null}
      {transcript.map((message) => {
        const user = message.role === 'user';
        const expandable =
          message.displayText.length > 96 || message.displayText.split(/\r?\n/u).length > 2;
        const expanded = expandedIds.has(message.id);
        return (
          <article
            key={message.id}
            className={cn('jarvis-transcript-card', user ? 'is-user' : 'is-jarvis')}
          >
            <header className="jarvis-transcript-meta">
              <span className="jarvis-transcript-avatar" aria-hidden="true">
                {user ? <UserRound /> : <Bot />}
              </span>
              <span className="jarvis-transcript-role text-foreground">
                {user ? 'You' : 'Jarvis'}
              </span>
              <time
                className="jarvis-transcript-time text-muted-foreground"
                dateTime={new Date(message.created_at).toISOString()}
              >
                {new Date(message.created_at).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </header>
            <div className="jarvis-transcript-body">
              <span
                className={cn(
                  'jarvis-transcript-copy block whitespace-pre-wrap break-words text-foreground',
                  expandable && !expanded && 'line-clamp-2',
                )}
              >
                {message.displayText}
              </span>
              {expandable ? (
                <button
                  type="button"
                  className="jarvis-transcript-toggle mt-1 inline-flex min-h-7 items-center rounded text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={expanded}
                  onClick={() => onToggleExpanded(message.id)}
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
      {partial ? (
        <div className="jarvis-transcript-card is-user is-interim">
          <header className="jarvis-transcript-meta">
            <span className="jarvis-transcript-avatar" aria-hidden="true">
              <UserRound />
            </span>
            <span className="jarvis-transcript-role text-foreground">You</span>
            <span className="jarvis-transcript-live">Listening…</span>
          </header>
          <span
            className="jarvis-transcript-copy min-w-0 whitespace-pre-wrap break-words text-foreground/75"
            data-live-announcement="off"
          >
            {partial}
          </span>
        </div>
      ) : null}
    </div>
  );
}
