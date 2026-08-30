import { describe, expect, it } from 'vitest';
import { projectOpenCodePublicTimeline } from './openCodePublicTimeline';

describe('projectOpenCodePublicTimeline', () => {
  it('separates the last public OpenCode answer from the ordered checkpoint and tool timeline', () => {
    const snapshot = projectOpenCodePublicTimeline([
      {
        info: { id: 'private-user-message', role: 'user' },
        parts: [{ type: 'text', text: 'Make the game.' }],
      },
      {
        info: { id: 'private-assistant-1', role: 'assistant' },
        parts: [
          { type: 'text', text: "I'll inspect the existing files first." },
          {
            id: 'private-tool-part-read',
            type: 'tool',
            tool: 'read',
            callID: 'private-call-read',
            state: {
              status: 'completed',
              input: { filePath: 'C:\\Users\\private\\game.js', content: 'must-not-survive' },
              output: 'must-not-survive',
            },
          },
        ],
      },
      {
        info: { id: 'private-assistant-2', role: 'assistant' },
        parts: [
          { type: 'text', text: "The structure is clear. I'm implementing the scene now." },
          {
            type: 'tool',
            tool: 'edit',
            callID: 'private-call-edit',
            state: {
              status: 'running',
              input: { path: '/private/player.js', patch: 'must-not-survive' },
            },
          },
        ],
      },
      {
        info: { id: 'private-assistant-3', role: 'assistant' },
        parts: [{ type: 'text', text: 'Everything is finished and tested successfully.' }],
      },
    ]);

    expect(snapshot.finalText).toBe('Everything is finished and tested successfully.');
    expect(snapshot.timeline).toEqual([
      { kind: 'text', text: "I'll inspect the existing files first." },
      {
        kind: 'tool_call',
        tool: 'read',
        call_id: 'opencode-tool-1',
        args: { path: 'game.js' },
      },
      {
        kind: 'tool_result',
        call_id: 'opencode-tool-1',
        result: { status: 'completed' },
      },
      { kind: 'text', text: "The structure is clear. I'm implementing the scene now." },
      {
        kind: 'tool_call',
        tool: 'edit',
        call_id: 'opencode-tool-2',
        args: { path: 'player.js' },
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /private-user|private-assistant|private-call|Users|must-not-survive/iu,
    );
  });

  it('ignores reasoning and non-assistant records while retaining failed public tool state', () => {
    const snapshot = projectOpenCodePublicTimeline([
      {
        info: { role: 'assistant' },
        parts: [
          { type: 'reasoning', text: 'private chain of thought' },
          { type: 'step-start', text: 'private phase' },
          { type: 'text', text: 'I am checking the game.' },
          {
            type: 'tool',
            name: 'bash',
            id: 'private-bash-id',
            state: { status: 'failed', input: { command: 'secret command' } },
          },
          { type: 'agent_message', text: 'The test failed safely.' },
        ],
      },
    ]);

    expect(snapshot).toEqual({
      finalText: 'The test failed safely.',
      timeline: [
        { kind: 'text', text: 'I am checking the game.' },
        { kind: 'tool_call', tool: 'bash', call_id: 'opencode-tool-1', args: {} },
        { kind: 'tool_result', call_id: 'opencode-tool-1', error: 'Tool failed' },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /reasoning|private phase|secret command|private-bash/iu,
    );
  });

  it('projects a completed transport with a failed Context envelope as a failed tool', () => {
    const snapshot = projectOpenCodePublicTimeline([
      {
        info: { role: 'assistant' },
        parts: [
          { type: 'text', text: 'I am checking the active project context.' },
          {
            type: 'tool',
            tool: 'vibespace_context',
            callID: 'private-context-call',
            state: {
              status: 'completed',
              input: { operation: 'investigate', query: 'private project question' },
              output: JSON.stringify({
                requestId: 'private-request-id',
                ok: false,
                code: 'tool_failed',
                message: 'The semantic tool could not be completed.',
              }),
            },
          },
          { type: 'text', text: 'Project context was unavailable, so I did not guess.' },
        ],
      },
    ]);

    expect(snapshot).toEqual({
      finalText: 'Project context was unavailable, so I did not guess.',
      timeline: [
        { kind: 'text', text: 'I am checking the active project context.' },
        {
          kind: 'tool_call',
          tool: 'vibespace_context',
          call_id: 'opencode-tool-1',
          args: {},
        },
        { kind: 'tool_result', call_id: 'opencode-tool-1', error: 'Tool failed' },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/private-request|private project question/iu);
  });

  it('produces stable request-local identities when the same persisted snapshot is projected again', () => {
    const messages = [
      {
        info: { role: 'assistant' },
        parts: [
          {
            type: 'tool',
            tool: 'write',
            callID: 'native-call-z',
            state: { status: 'completed', input: { path: 'C:\\private\\index.html' } },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    ];

    expect(projectOpenCodePublicTimeline(messages)).toEqual(
      projectOpenCodePublicTimeline(messages),
    );
  });

  it('collapses repeated persisted updates for one native tool call into one terminal lifecycle', () => {
    const snapshot = projectOpenCodePublicTimeline([
      {
        info: { role: 'assistant' },
        parts: [
          { type: 'text', text: 'I am reading the game file.' },
          {
            type: 'tool',
            tool: 'read',
            callID: 'private-call-read',
            state: { status: 'running', input: { path: 'C:\\private\\game.js' } },
          },
        ],
      },
      {
        info: { role: 'assistant' },
        parts: [
          {
            type: 'tool',
            tool: 'read',
            callID: 'private-call-read',
            state: {
              status: 'completed',
              input: { path: 'C:\\private\\game.js' },
              output: 'must-not-survive',
            },
          },
          { type: 'text', text: 'The game file is ready.' },
        ],
      },
    ]);

    expect(snapshot).toEqual({
      finalText: 'The game file is ready.',
      timeline: [
        { kind: 'text', text: 'I am reading the game file.' },
        {
          kind: 'tool_call',
          tool: 'read',
          call_id: 'opencode-tool-1',
          args: { path: 'game.js' },
        },
        {
          kind: 'tool_result',
          call_id: 'opencode-tool-1',
          result: { status: 'completed' },
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/private-call|must-not-survive|C:\\\\private/iu);
  });

  it('fails closed when no public assistant text exists', () => {
    expect(
      projectOpenCodePublicTimeline([
        {
          info: { role: 'assistant' },
          parts: [{ type: 'reasoning', text: 'private' }],
        },
      ]),
    ).toEqual({ finalText: '', timeline: [] });
  });
});
