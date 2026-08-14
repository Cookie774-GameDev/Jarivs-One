import { describe, expect, it } from 'vitest';
import {
  boundToolGatewayResponse,
  parseToolGatewayRequest,
  TOOL_GATEWAY_CATALOG,
} from './toolGatewayProtocol';

const request = (overrides: Record<string, unknown> = {}) => ({
  protocolVersion: 1,
  requestId: 'request-1',
  sessionId: 'session-1',
  messageId: 'message-1',
  tool: 'terminal.list',
  args: {},
  directory: 'C:\\work\\project',
  worktree: 'C:\\work\\project',
  ...overrides,
});

describe('tool gateway protocol', () => {
  it('does not advertise an unimplemented context mutation', () => {
    expect(TOOL_GATEWAY_CATALOG).not.toContain('context.update');
    expect(() =>
      parseToolGatewayRequest(
        request({
          tool: 'context.update',
          args: { contextId: 'context-1', content: 'updated' },
        }),
      ),
    ).toThrow();
  });

  it('accepts every exact catalog entry with its minimal valid arguments', () => {
    const argumentsByTool: Record<(typeof TOOL_GATEWAY_CATALOG)[number], object> = {
      'terminal.list': {},
      'terminal.open': { terminal: 4 },
      'terminal.focus': { terminal: 'main' },
      'terminal.spawn': {},
      'terminal.write': { terminal: 4, command: 'git status' },
      'terminal.read': { terminal: 4 },
      'terminal.schedule': { terminal: 4, command: 'npm test', runAt: '2026-08-12T10:00:00Z' },
      'command.list': {},
      'command.run': { command: 'open-settings' },
      'profile.allAboutMe.read': {},
      'profile.allAboutMe.update': { content: '# All About Me' },
      'memory.learning.read': {},
      'memory.learning.update': {
        content: 'Prefers concise updates.',
        source: 'conversation',
        confidence: 0.8,
      },
      'context.list': {},
      'context.read': { contextId: 'context-1' },
      'context.attach': { contextId: 'context-1' },
      vibespace_context: { operation: 'describe' },
      'skills.list': {},
      'skills.load': { skillId: 'skill-1' },
      'plugins.list': {},
      'plugins.run': { pluginId: 'plugin-1', operation: 'status' },
      'tasks.create': { title: 'Ship gateway' },
      'tasks.update': { taskId: 'task-1' },
      'schedule.create': { title: 'Tests', schedule: 'daily', action: 'npm test' },
      'app.navigate': { route: '/settings' },
      'app.getState': {},
    };

    for (const tool of TOOL_GATEWAY_CATALOG) {
      expect(parseToolGatewayRequest(request({ tool, args: argumentsByTool[tool] }))).toMatchObject(
        {
          tool,
          args: argumentsByTool[tool],
        },
      );
    }
  });

  it('accepts the namespaced bounded RLM query surface and rejects authority injection', () => {
    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: {
            operation: 'open',
            pointer: {
              id: 'pointer-1',
              recordId: 'record-1',
              byteStart: 0,
              byteEnd: 32,
              sourceVersion: 'sha256:aaaaaaaa',
              contentHash: 'a'.repeat(64),
            },
            maxBytes: 32,
          },
        }),
      ).args,
    ).toMatchObject({ operation: 'open', maxBytes: 32 });

    expect(() =>
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: { operation: 'search', query: 'needle', accountId: 'foreign-account' },
        }),
      ),
    ).toThrow();
  });

  it('normalizes bounded decimal strings emitted by local tool-calling models', () => {
    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: { operation: 'search', query: 'needle', limit: '5' },
        }),
      ).args,
    ).toEqual({ operation: 'search', query: 'needle', limit: 5 });

    for (const limit of ['5.0', '-1', '01', '1e2', '101']) {
      expect(() =>
        parseToolGatewayRequest(
          request({
            tool: 'vibespace_context',
            args: { operation: 'search', query: 'needle', limit },
          }),
        ),
      ).toThrow();
    }
  });

  it.each([
    '999999999',
    '1000000000',
    '1000000001',
    '9999999999',
    '10000000000',
    '10000000001',
    '100000000000',
    '9007199254740991',
    '9007199254740992',
    '9007199254740993',
  ])('preserves exact canonical large address %s as a string', (position) => {
    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: { operation: 'address', corpusId: 'sparse-boundaries', position },
        }),
      ).args,
    ).toEqual({ operation: 'address', corpusId: 'sparse-boundaries', position });
  });

  it.each([10_000_000_001, '01', '1e10', '-1', '+1', '1.0', '', '10000000000000001'])(
    'rejects noncanonical or out-of-range large address %o',
    (position) => {
      expect(() =>
        parseToolGatewayRequest(
          request({
            tool: 'vibespace_context',
            args: { operation: 'address', corpusId: 'sparse-boundaries', position },
          }),
        ),
      ).toThrow();
    },
  );

  it.each(['../foreign', 'safe/path', ' leading', 'trailing ', 'control\u0000id', 'x'.repeat(201)])(
    'rejects unsafe large-address corpus id %o',
    (corpusId) => {
      expect(() =>
        parseToolGatewayRequest(
          request({
            tool: 'vibespace_context',
            args: { operation: 'address', corpusId, position: '1' },
          }),
        ),
      ).toThrow();
    },
  );

  it('drops OpenCode schema placeholders that the selected operation cannot consume', () => {
    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: {
            operation: 'search',
            query: 'needle',
            limit: '5',
            continuation: null,
            pointer: {
              id: null,
              recordId: null,
              sourceVersion: null,
              contentHash: null,
              byteStart: null,
              byteEnd: null,
            },
            maxBytes: null,
            beforeBytes: null,
            afterBytes: null,
            recordId: null,
            required: ['id', 'recordId', 'sourceVersion', 'contentHash'],
          },
        }),
      ).args,
    ).toEqual({ operation: 'search', query: 'needle', limit: 5 });

    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: {
            operation: 'investigate',
            query: 'find the passage',
            pointer: '{"recordId":"null","sourceVersion":"v1.0","contentHash":"not-a-sha256"}',
            required: ['id', 'recordId', 'sourceVersion', 'contentHash'],
          },
        }),
      ).args,
    ).toEqual({ operation: 'investigate', query: 'find the passage' });

    expect(() =>
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: { operation: 'investigate', query: 'find the passage', accountId: 'foreign' },
        }),
      ),
    ).toThrow();
  });

  it('drops null optional fields from an otherwise valid OpenCode context pointer', () => {
    const pointer = {
      id: 'pointer-1',
      recordId: 'record-1',
      byteStart: 10,
      byteEnd: 20,
      sourceVersion: `sha256:${'a'.repeat(64)}`,
      contentHash: 'a'.repeat(64),
      lineStart: null,
      lineEnd: null,
      messageId: null,
      eventId: null,
      toolCallId: null,
    };
    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: { operation: 'open', pointer, maxBytes: null, continuation: null },
        }),
      ).args,
    ).toEqual({
      operation: 'open',
      pointer: {
        id: 'pointer-1',
        recordId: 'record-1',
        byteStart: 10,
        byteEnd: 20,
        sourceVersion: `sha256:${'a'.repeat(64)}`,
        contentHash: 'a'.repeat(64),
      },
    });
  });

  it('decodes a bounded JSON pointer emitted by local tool-calling models', () => {
    const pointer = {
      id: 'pointer-1',
      recordId: 'record-1',
      byteStart: 10,
      byteEnd: 42,
      sourceVersion: `sha256:${'a'.repeat(64)}`,
      contentHash: 'a'.repeat(64),
    };
    expect(
      parseToolGatewayRequest(
        request({
          tool: 'vibespace_context',
          args: { operation: 'open', pointer: JSON.stringify(pointer), maxBytes: '600' },
        }),
      ).args,
    ).toEqual({ operation: 'open', pointer, maxBytes: 600 });

    for (const malformed of [
      '{',
      JSON.stringify({ ...pointer, contentHash: 'not-a-sha256' }),
      JSON.stringify({ ...pointer, accountId: 'foreign' }),
      JSON.stringify(pointer).padEnd(8_193, ' '),
    ]) {
      expect(() =>
        parseToolGatewayRequest(
          request({
            tool: 'vibespace_context',
            args: { operation: 'open', pointer: malformed },
          }),
        ),
      ).toThrow();
    }
  });

  it.each([
    null,
    [],
    Object.assign(Object.create(null), request()),
    { ...request(), extra: true },
    { ...request(), protocolVersion: 2 },
    { ...request(), requestId: '../unsafe' },
    { ...request(), sessionId: 'x'.repeat(201) },
    { ...request(), tool: 'tauri.invoke' },
    { ...request(), args: [] },
    { ...request(), directory: 'relative/path' },
    { ...request(), worktree: '\\not-absolute' },
  ])('rejects malformed envelopes without accepting object tricks: %j', (value) => {
    expect(() => parseToolGatewayRequest(value)).toThrow();
  });

  it('rejects unknown and prototype-polluting tool arguments', () => {
    const polluted = JSON.parse(
      `{"protocolVersion":1,"requestId":"r","sessionId":"s","messageId":"m","tool":"terminal.list","args":{"__proto__":{"polluted":true}},"directory":"C:\\\\work"}`,
    );
    expect(() => parseToolGatewayRequest(polluted)).toThrow(/arguments/i);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(() => parseToolGatewayRequest(request({ args: { limit: 10, surprise: true } }))).toThrow(
      /arguments/i,
    );
  });

  it('enforces tool-specific string, number, pagination, and mutation bounds', () => {
    expect(() => parseToolGatewayRequest(request({ args: { limit: 101 } }))).toThrow();
    expect(() =>
      parseToolGatewayRequest(
        request({ tool: 'terminal.write', args: { terminal: 1, command: 'x'.repeat(32_769) } }),
      ),
    ).toThrow();
    expect(() =>
      parseToolGatewayRequest(
        request({
          tool: 'memory.learning.update',
          args: { content: 'learn', source: 'chat', confidence: 1.01 },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseToolGatewayRequest(
        request({ tool: 'plugins.run', args: { pluginId: 'p', operation: 'x', input: [] } }),
      ),
    ).toThrow();
  });

  it('bounds and sanitizes renderer responses', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(
      boundToolGatewayResponse({
        requestId: 'request-1',
        ok: true,
        code: 'ok',
        message: 'done',
        data: { secretToken: 'never-return', body: 'x'.repeat(140_000), circular },
      }),
    ).toEqual({
      requestId: 'request-1',
      ok: false,
      code: 'response_too_large',
      message: 'The semantic tool result exceeded the safe size limit.',
    });
  });
});
