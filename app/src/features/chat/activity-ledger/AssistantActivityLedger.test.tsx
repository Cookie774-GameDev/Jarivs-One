import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import type { ChatActivityEvent } from '../activity/types';
import { AssistantActivityLedger, DETAIL_PAGE_SIZE } from './AssistantActivityLedger';

function assistant(parts: Message['parts'], usage?: Message['usage']): Message {
  return {
    id: 'message-ledger-ui' as Message['id'],
    chat_id: 'chat-ledger-ui' as Message['chat_id'],
    role: 'assistant',
    parts,
    created_at: 100,
    updated_at: 1_100,
    ...(usage ? { usage } : {}),
  };
}

describe('AssistantActivityLedger', () => {
  it('renders one compact disclosure, exact usage, and a privacy-safe command receipt', () => {
    render(
      <AssistantActivityLedger
        message={assistant(
          [
            {
              kind: 'tool_call',
              call_id: 'call-1',
              tool: 'terminal.exec',
              args: { command: 'echo secret-command' },
            },
            {
              kind: 'tool_result',
              call_id: 'call-1',
              result: { stdout: 'secret-output', exitCode: 0 },
            },
          ],
          { input_tokens: 100, output_tokens: 25 },
        )}
      />,
    );

    expect(screen.getAllByRole('button', { name: /activity details/i })).toHaveLength(1);
    const disclosure = screen.getByRole('button', { name: /show activity details/i });
    const describedBy = disclosure.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain('Ran 1 command');
    expect(document.getElementById(describedBy!)?.textContent).toContain('In 100');
    expect(screen.getByText('Ran 1 command')).toBeTruthy();
    expect(screen.getByText('In 100').getAttribute('title')).toBe('Exact response metadata');
    expect(screen.getByText('Out 25').getAttribute('title')).toBe('Exact response metadata');
    expect(document.body.textContent).not.toContain('secret-command');
    expect(document.body.textContent).not.toContain('secret-output');

    fireEvent.click(screen.getByRole('button', { name: /activity details/i }));
    expect(screen.getByText('Ran command')).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret-command');
  });

  it('shows the terminal duration and total actions in the continuous-response summary', () => {
    render(
      <AssistantActivityLedger
        message={assistant([
          {
            kind: 'tool_call',
            call_id: 'read-one',
            tool: 'read_file',
            args: { path: 'private-path.ts' },
          },
          { kind: 'tool_result', call_id: 'read-one', result: { exitCode: 0 } },
        ])}
        correlatedEvents={[
          {
            id: 'search-one',
            chatId: 'chat-ledger-ui',
            kind: 'url',
            status: 'done',
            title: 'Opaque search activity',
            ts: 100,
            startedAt: 100,
            endedAt: 61_100,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Show activity details Worked for 1m 1s · 2 actions',
      }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-path.ts');
  });

  it('keeps an authoritative active turn live during a quiet gap between receipts', () => {
    render(
      <AssistantActivityLedger
        active
        message={assistant([])}
        correlatedEvents={[
          {
            id: 'completed-read',
            chatId: 'chat-ledger-ui',
            kind: 'file',
            status: 'done',
            title: 'Opaque file activity',
            filePath: 'src/a.ts',
            ts: 100,
            startedAt: 100,
            endedAt: 1_100,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Show activity details Working · 1 action' }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('Worked for');
  });

  it('provides keyboard-accessible filters and bounds mounted detail rows', () => {
    const events: ChatActivityEvent[] = Array.from(
      { length: DETAIL_PAGE_SIZE + 12 },
      (_, index) => ({
        id: `read-${index}`,
        chatId: 'chat-ledger-ui',
        kind: 'tool',
        category: 'file',
        status: 'done',
        title: 'Read file',
        filePath: `file-${index}.ts`,
        ts: index,
      }),
    );
    render(<AssistantActivityLedger message={assistant([])} correlatedEvents={events} />);
    fireEvent.click(screen.getByRole('button', { name: /activity details/i }));

    expect(screen.getByRole('button', { name: `Reads ${DETAIL_PAGE_SIZE + 12}` })).toBeTruthy();
    expect(screen.getAllByTestId('activity-ledger-receipt')).toHaveLength(DETAIL_PAGE_SIZE);
    expect(screen.getByRole('button', { name: /show 12 more/i })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Resize activity details' })).toBeTruthy();
  });

  it('shows estimated and unavailable usage without mixing provenance', () => {
    render(
      <AssistantActivityLedger
        message={assistant([
          {
            kind: 'token_optimization_receipt',
            receipt: {
              mode: 'safe' as never,
              providerId: 'opencode',
              modelId: 'm',
              modelChanged: false,
              tokenizerSource: 'conservative_estimate',
              outputTokenLimit: 100,
              estimatedInputTokensBefore: 20,
              estimatedInputTokensAfter: 15,
              estimatedTokensSaved: 5,
              selectedCount: 1,
              excludedCount: 0,
              fitsContext: true,
              overflowTokens: 0,
              inclusions: [],
              exclusions: [],
            },
          },
        ])}
      />,
    );
    expect(screen.getByText('In ≈15').getAttribute('title')).toBe('Estimated locally');
    fireEvent.click(screen.getByRole('button', { name: /activity details/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));
    expect(screen.getByText('Output usage unavailable')).toBeTruthy();
  });
});
