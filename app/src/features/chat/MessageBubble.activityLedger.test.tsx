import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Message } from '@/types';
import { MessageBubble } from './MessageBubble';

afterEach(cleanup);

function message(role: Message['role'], parts: Message['parts']): Message {
  return {
    id: 'message-ledger-bubble' as Message['id'],
    chat_id: 'chat-ledger-bubble' as Message['chat_id'],
    role,
    parts,
    created_at: 100,
    updated_at: 200,
  };
}

describe('MessageBubble assistant activity ledger', () => {
  it('keeps one assistant identity and replaces raw tool evidence with the safe collapsed ledger', () => {
    render(
      <TooltipProvider>
        <MessageBubble
          message={message('assistant', [
            { kind: 'text', text: 'I checked the project.' },
            {
              kind: 'tool_call',
              call_id: 'call-1',
              tool: 'terminal.exec',
              args: { command: 'echo private-command' },
            },
            {
              kind: 'tool_result',
              call_id: 'call-1',
              result: { stdout: 'private-output', exitCode: 0 },
            },
          ])}
        />
      </TooltipProvider>,
    );

    expect(screen.getAllByText('Assistant')).toHaveLength(1);
    expect(screen.getByText('I checked the project.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /show activity details/i })).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-command');
    expect(document.body.textContent).not.toContain('private-output');
  });

  it('does not mount an assistant ledger in a user turn', () => {
    const rendered = render(
      <TooltipProvider>
        <MessageBubble message={message('user', [{ kind: 'text', text: 'hello' }])} />
      </TooltipProvider>,
    );
    expect(rendered.container.querySelector('[data-assistant-activity-ledger]')).toBeNull();
  });

  it('does not erase an unknown assistant tool when consolidating raw tool cards', () => {
    render(
      <TooltipProvider>
        <MessageBubble
          message={message('assistant', [
            {
              kind: 'tool_call',
              call_id: 'unknown-1',
              tool: 'custom.private_tool',
              args: { payload: 'hidden-payload' },
            },
            { kind: 'tool_result', call_id: 'unknown-1', result: 'hidden-result' },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: /show activity details/i })).toBeTruthy();
    expect(screen.getByText('Worked for <1s · 1 action')).toBeTruthy();
    expect(document.body.textContent).not.toContain('hidden-payload');
    expect(document.body.textContent).not.toContain('hidden-result');
  });
});
