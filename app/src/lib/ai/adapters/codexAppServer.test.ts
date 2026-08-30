import { describe, expect, it } from 'vitest';

import { normalizeCodexAppServerMessage } from './codexAppServer';

describe('Codex app-server structured event normalization', () => {
  it('projects thread binding, streaming text, and public reasoning summaries', () => {
    expect(
      normalizeCodexAppServerMessage({
        method: 'thread/started',
        params: { thread: { id: 'thr_123' } },
      }),
    ).toEqual({
      recognized: true,
      events: [{ type: 'session', sessionId: 'thr_123' }],
      controls: [],
    });

    expect(
      normalizeCodexAppServerMessage({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thr_123',
          turnId: 'turn_1',
          itemId: 'item_1',
          delta: '\u001b[31mHello\u001b[0m',
        },
      }),
    ).toEqual({
      recognized: true,
      events: [{ type: 'text', delta: 'Hello', streamPartId: 'item_1' }],
      controls: [],
    });

    expect(
      normalizeCodexAppServerMessage({
        method: 'item/reasoning/summaryTextDelta',
        params: { itemId: 'reason_1', delta: 'Inspecting the project safely.' },
      }),
    ).toEqual({
      recognized: true,
      events: [{ type: 'reasoning', delta: 'Inspecting the project safely.' }],
      controls: [],
    });
  });

  it('never projects private reasoning text', () => {
    expect(
      normalizeCodexAppServerMessage({
        method: 'item/reasoning/textDelta',
        params: { itemId: 'reason_1', delta: 'private chain of thought' },
      }),
    ).toEqual({ recognized: true, events: [], controls: [] });
  });

  it('projects command activity with only safe bounded results and a leaf filename', () => {
    const projection = normalizeCodexAppServerMessage({
      method: 'item/completed',
      params: {
        item: {
          type: 'commandExecution',
          id: 'call_1',
          command: 'Get-Content C:\\private\\game.ts',
          cwd: 'C:\\private',
          status: 'completed',
          commandActions: [{ type: 'read', name: 'Read game.ts', path: 'C:\\private\\game.ts' }],
          aggregatedOutput: '\u001b[32mok\u001b[0m',
          exitCode: 0,
          durationMs: 12,
        },
      },
    });

    expect(projection).toEqual({
      recognized: true,
      events: [
        {
          type: 'tool',
          name: 'read',
          status: 'completed',
          callId: 'call_1',
          fileLabel: 'game.ts',
          result: { output: 'ok', exitCode: 0, durationMs: 12 },
        },
      ],
      controls: [],
    });
    expect(JSON.stringify(projection)).not.toContain('C:\\private');
    expect(JSON.stringify(projection)).not.toContain('Get-Content');
  });

  it('projects file edits without exposing absolute paths or raw diffs', () => {
    expect(
      normalizeCodexAppServerMessage({
        method: 'item/started',
        params: {
          item: {
            type: 'fileChange',
            id: 'edit_1',
            status: 'inProgress',
            changes: [
              {
                path: 'C:\\private\\src\\game.ts',
                kind: 'update',
                diff: '+const apiKey = "secret";',
              },
            ],
          },
        },
      }),
    ).toEqual({
      recognized: true,
      events: [
        {
          type: 'tool',
          name: 'edit',
          status: 'started',
          callId: 'edit_1',
          fileLabel: 'game.ts',
          result: { changeCount: 1, diffAvailable: true },
        },
      ],
      controls: [],
    });
  });

  it('projects questions and keeps approval requests on a typed control channel', () => {
    expect(
      normalizeCodexAppServerMessage({
        id: 7,
        method: 'item/tool/requestUserInput',
        params: {
          threadId: 'thr_123',
          turnId: 'turn_1',
          itemId: 'question_1',
          isBlocking: true,
          questions: [
            {
              id: 'q1',
              header: 'Choice',
              question: 'Which safe option?',
              isOther: true,
              isSecret: false,
              options: [{ label: 'A', description: 'Use A' }],
            },
          ],
        },
      }),
    ).toEqual({
      recognized: true,
      events: [
        {
          type: 'question',
          request: {
            id: '7',
            sessionId: 'thr_123',
            questions: [
              {
                header: 'Choice',
                prompt: 'Which safe option?',
                options: [{ label: 'A', description: 'Use A' }],
                multiple: false,
                allowCustomAnswer: true,
              },
            ],
            tool: { messageId: 'turn_1', callId: 'question_1' },
          },
        },
      ],
      controls: [],
    });

    expect(
      normalizeCodexAppServerMessage({
        id: 'approval_1',
        method: 'item/commandExecution/requestApproval',
        params: { threadId: 'thr_123', turnId: 'turn_1', itemId: 'call_1' },
      }),
    ).toEqual({
      recognized: true,
      events: [],
      controls: [
        {
          type: 'approval',
          kind: 'command',
          requestId: 'approval_1',
          threadId: 'thr_123',
          turnId: 'turn_1',
          itemId: 'call_1',
        },
      ],
    });
  });

  it('refuses secret questions instead of putting them in durable Chat state', () => {
    expect(
      normalizeCodexAppServerMessage({
        id: 8,
        method: 'item/tool/requestUserInput',
        params: {
          threadId: 'thr_123',
          turnId: 'turn_1',
          itemId: 'question_2',
          isBlocking: true,
          questions: [
            {
              id: 'q2',
              header: 'Secret',
              question: 'Enter a key',
              isOther: false,
              isSecret: true,
              options: null,
            },
          ],
        },
      }),
    ).toEqual({
      recognized: true,
      events: [
        {
          type: 'warning',
          message: 'Codex requested secret input. Use the secure credential setup action.',
        },
      ],
      controls: [],
    });
  });

  it('projects provider-reported usage and truthful terminal states', () => {
    expect(
      normalizeCodexAppServerMessage(
        {
          method: 'thread/tokenUsage/updated',
          params: {
            tokenUsage: {
              last: {
                inputTokens: 10,
                cachedInputTokens: 2,
                cacheWriteInputTokens: 1,
                outputTokens: 5,
                reasoningOutputTokens: 3,
                totalTokens: 15,
              },
            },
          },
        },
        { capturedAt: 500 },
      ),
    ).toEqual({
      recognized: true,
      events: [
        {
          type: 'usage',
          usage: {
            capturedAt: 500,
            inputTokens: { value: 10, provenance: 'provider-reported' },
            cacheReadTokens: { value: 2, provenance: 'provider-reported' },
            cacheWriteTokens: { value: 1, provenance: 'provider-reported' },
            outputTokens: { value: 5, provenance: 'provider-reported' },
            reasoningTokens: { value: 3, provenance: 'provider-reported' },
            totalTokens: { value: 15, provenance: 'provider-reported' },
          },
        },
      ],
      controls: [],
    });

    expect(
      normalizeCodexAppServerMessage({
        method: 'turn/completed',
        params: { turn: { id: 'turn_1', status: 'completed', error: null } },
      }),
    ).toEqual({
      recognized: true,
      events: [{ type: 'done', finishReason: 'completed' }],
      controls: [],
    });

    expect(
      normalizeCodexAppServerMessage({
        method: 'turn/completed',
        params: { turn: { id: 'turn_1', status: 'failed', error: { message: 'Provider failed' } } },
      }),
    ).toEqual({
      recognized: true,
      events: [{ type: 'error', message: 'Provider failed' }],
      controls: [],
    });
  });

  it('leaves unknown records unrecognized', () => {
    expect(normalizeCodexAppServerMessage({ method: 'future/event', params: {} })).toEqual({
      recognized: false,
      events: [],
      controls: [],
    });
  });
});
