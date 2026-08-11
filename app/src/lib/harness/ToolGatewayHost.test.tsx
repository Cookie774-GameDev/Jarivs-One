import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolGatewayResponse } from './toolGatewayProtocol';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listener: null as null | ((event: { payload: unknown }) => void),
  unlisten: vi.fn(),
  listen: vi.fn(async (_event: string, listener: (event: { payload: unknown }) => void) => {
    tauri.listener = listener;
    return tauri.unlisten;
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }));

import { ToolGatewayHost } from './ToolGatewayHost';

function request(requestId: string, sessionId = 'session-a') {
  return {
    protocolVersion: 1,
    requestId,
    sessionId,
    messageId: 'message-a',
    tool: 'app.getState',
    args: {},
    directory: 'C:\\work\\project',
  };
}

async function mounted(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function emit(payload: unknown): Promise<void> {
  await act(async () => {
    tauri.listener?.({ payload });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ToolGatewayHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauri.listener = null;
    tauri.invoke.mockResolvedValue(undefined);
  });

  it('installs one listener and returns exactly one bounded native response', async () => {
    const response: ToolGatewayResponse = {
      requestId: 'request-a',
      ok: true,
      code: 'ok',
      message: 'done',
      data: { route: 'chat' },
    };
    const execute = vi.fn(async () => response);
    render(<ToolGatewayHost runtime={{ execute }} />);
    await mounted();
    await emit(request('request-a'));

    expect(tauri.listen).toHaveBeenCalledOnce();
    expect(tauri.listen).toHaveBeenCalledWith(
      'vibespace://tool-gateway/request',
      expect.any(Function),
    );
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tool: 'app.getState' }));
    expect(tauri.invoke).toHaveBeenCalledOnce();
    expect(tauri.invoke).toHaveBeenCalledWith('tool_gateway_respond', { response });
  });

  it('fails malformed requests closed and only recovers a safe own request ID', async () => {
    const execute = vi.fn();
    render(<ToolGatewayHost runtime={{ execute }} />);
    await mounted();
    await emit({ ...request('request-b'), surprise: 'must-not-cross' });
    await emit({ ...request('../unsafe'), surprise: 'must-not-cross' });

    expect(execute).not.toHaveBeenCalled();
    expect(tauri.invoke).toHaveBeenCalledOnce();
    expect(tauri.invoke).toHaveBeenCalledWith('tool_gateway_respond', {
      response: {
        requestId: 'request-b',
        ok: false,
        code: 'invalid_request',
        message: 'The semantic tool request is invalid.',
      },
    });
    expect(JSON.stringify(tauri.invoke.mock.calls)).not.toContain('must-not-cross');
  });

  it('serializes one session while allowing independent sessions to run concurrently', async () => {
    const releases = new Map<string, () => void>();
    const execute = vi.fn(
      ({ requestId }: { requestId: string }): Promise<ToolGatewayResponse> =>
        new Promise((resolve) => {
          releases.set(requestId, () =>
            resolve({ requestId, ok: true, code: 'ok', message: 'done' }),
          );
        }),
    );
    render(<ToolGatewayHost runtime={{ execute }} />);
    await mounted();

    await act(async () => {
      tauri.listener?.({ payload: request('same-1', 'session-a') });
      tauri.listener?.({ payload: request('same-2', 'session-a') });
      tauri.listener?.({ payload: request('other-1', 'session-b') });
      await Promise.resolve();
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([value]) => value.requestId).sort()).toEqual([
      'other-1',
      'same-1',
    ]);

    await act(async () => {
      releases.get('same-1')?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('releases the listener and sends no late response after unmount', async () => {
    let release: ((response: ToolGatewayResponse) => void) | undefined;
    const execute = vi.fn(
      () =>
        new Promise<ToolGatewayResponse>((resolve) => {
          release = resolve;
        }),
    );
    const view = render(<ToolGatewayHost runtime={{ execute }} />);
    await mounted();
    await act(async () => {
      tauri.listener?.({ payload: request('late') });
      await Promise.resolve();
    });
    view.unmount();
    expect(tauri.unlisten).toHaveBeenCalledOnce();

    await act(async () => {
      release?.({ requestId: 'late', ok: true, code: 'ok', message: 'done' });
      await Promise.resolve();
    });
    expect(tauri.invoke).not.toHaveBeenCalled();
  });
});
