import { beforeEach, describe, expect, it } from 'vitest';
import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import { useUIStore } from '@/stores/ui';
import {
  clearToolGatewayMutationGrants,
  createProductionToolGatewayDependencies,
  grantNextToolGatewayMutation,
} from './toolGatewayProduction';
import { parseToolGatewayRequest } from './toolGatewayProtocol';

function mutation() {
  return parseToolGatewayRequest({
    protocolVersion: 1,
    requestId: 'request-1',
    sessionId: 'session-1',
    messageId: 'message-1',
    tool: 'app.navigate',
    args: { route: '/terminal' },
    directory: 'C:\\work\\project',
  });
}

describe('production tool gateway dependencies', () => {
  beforeEach(() => {
    clearToolGatewayMutationGrants();
  });

  it('consumes an exact short-lived session grant once', async () => {
    const deps = createProductionToolGatewayDependencies();
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(false);
    grantNextToolGatewayMutation('different-session');
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(false);
    grantNextToolGatewayMutation('session-1');
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(true);
    await expect(Promise.resolve(deps.authorizeMutation(mutation()))).resolves.toBe(false);
  });

  it('reads bounded visible terminal and app state without mutation authority', async () => {
    useTerminalTranscriptStore.setState({ sessions: {} });
    useTerminalTranscriptStore.getState().registerSession('tty-1', {
      paneId: 'pane-1',
      projectId: null,
      command: 'pwsh',
    });
    useTerminalTranscriptStore.getState().appendOutput('tty-1', 'ready');
    useUIStore.getState().setRoute('chat');
    const deps = createProductionToolGatewayDependencies();

    await expect(Promise.resolve(deps.terminal.list({}, {} as never))).resolves.toEqual([
      expect.objectContaining({ sessionId: 'tty-1', outputChars: 5 }),
    ]);
    await expect(Promise.resolve(deps.app.getState({}, {} as never))).resolves.toEqual(
      expect.objectContaining({ route: 'chat', terminalCount: 1 }),
    );
  });
});
