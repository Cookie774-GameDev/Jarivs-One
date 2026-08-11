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
      'context.update': { contextId: 'context-1', content: 'updated' },
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
