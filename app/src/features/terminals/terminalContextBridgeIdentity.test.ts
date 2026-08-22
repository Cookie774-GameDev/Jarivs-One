import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeTerminalContextBridgeIdentity,
  bindTerminalContextBridgeIdentity,
  mintTerminalContextBridgeIdentity,
  registerTerminalContextBridgeRequest,
  resetTerminalContextBridgeIdentitiesForTests,
  revokeTerminalContextBridgeIdentity,
} from './terminalContextBridgeIdentity';

describe('terminal Context bridge identity authority', () => {
  beforeEach(resetTerminalContextBridgeIdentitiesForTests);

  it('mints and binds one opaque, expiring account/workspace/project/worktree identity', () => {
    const identity = mintTerminalContextBridgeIdentity(
      {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'C:\\work\\project',
        paneId: 'pane-1',
        access: 'full',
      },
      { now: () => 100, createId: () => 'terminal-run-1' },
    );
    expect(identity).toMatchObject({
      identityId: 'terminal-run-1',
      terminalSessionId: null,
      expiresAt: 3_600_100,
      scopeRevision: 'terminal-run-1:0',
    });
    expect(
      bindTerminalContextBridgeIdentity(
        identity.identityId,
        {
          terminalSessionId: 'tty-1',
          paneId: 'pane-1',
          projectId: 'project-1',
        },
        110,
      ),
    ).toMatchObject({ terminalSessionId: 'tty-1' });
    expect(
      authorizeTerminalContextBridgeIdentity(
        {
          identityId: identity.identityId,
          terminalSessionId: 'tty-1',
          paneId: 'pane-1',
          projectId: 'project-1',
        },
        120,
      ),
    ).toMatchObject({ worktreeId: 'C:\\work\\project', access: 'full' });
  });

  it('rejects cross-pane, cross-project, cross-session, expired, and revoked use', () => {
    const identity = mintTerminalContextBridgeIdentity(
      {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        paneId: 'pane-1',
        access: 'read',
        lifetimeMs: 50,
      },
      { now: () => 100, createId: () => 'terminal-run-1' },
    );
    bindTerminalContextBridgeIdentity(
      identity.identityId,
      {
        terminalSessionId: 'tty-1',
        paneId: 'pane-1',
        projectId: 'project-1',
      },
      110,
    );
    const request = {
      identityId: identity.identityId,
      terminalSessionId: 'tty-1',
      paneId: 'pane-1',
      projectId: 'project-1',
    };
    expect(
      authorizeTerminalContextBridgeIdentity({ ...request, paneId: 'pane-2' }, 120),
    ).toBeNull();
    expect(
      authorizeTerminalContextBridgeIdentity({ ...request, projectId: 'project-2' }, 120),
    ).toBeNull();
    expect(
      authorizeTerminalContextBridgeIdentity({ ...request, terminalSessionId: 'tty-2' }, 120),
    ).toBeNull();
    expect(authorizeTerminalContextBridgeIdentity(request, 151)).toBeNull();

    const replacement = mintTerminalContextBridgeIdentity(
      {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        paneId: 'pane-1',
        access: 'read',
      },
      { now: () => 200, createId: () => 'terminal-run-2' },
    );
    revokeTerminalContextBridgeIdentity(replacement.identityId);
    expect(
      authorizeTerminalContextBridgeIdentity(
        {
          identityId: replacement.identityId,
          terminalSessionId: 'tty-2',
          paneId: 'pane-1',
          projectId: 'project-1',
        },
        210,
      ),
    ).toBeNull();
  });

  it('cancels active Gateway requests when the terminal identity is revoked or expires', () => {
    const identity = mintTerminalContextBridgeIdentity(
      {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        paneId: 'pane-1',
        access: 'read',
        lifetimeMs: 50,
      },
      { now: () => 100, createId: () => 'terminal-run-1' },
    );
    const cancelled = vi.fn();
    const complete = registerTerminalContextBridgeRequest(
      identity.identityId,
      'request-1',
      cancelled,
    );

    revokeTerminalContextBridgeIdentity(identity.identityId);
    expect(cancelled).toHaveBeenCalledTimes(1);
    complete();
    expect(cancelled).toHaveBeenCalledTimes(1);

    const expiring = mintTerminalContextBridgeIdentity(
      {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        paneId: 'pane-1',
        access: 'read',
        lifetimeMs: 50,
      },
      { now: () => 200, createId: () => 'terminal-run-2' },
    );
    const expiredCancel = vi.fn();
    registerTerminalContextBridgeRequest(expiring.identityId, 'request-2', expiredCancel);
    expect(
      authorizeTerminalContextBridgeIdentity(
        {
          identityId: expiring.identityId,
          terminalSessionId: null,
          paneId: 'pane-1',
          projectId: 'project-1',
        },
        251,
      ),
    ).toBeNull();
    expect(expiredCancel).toHaveBeenCalledTimes(1);
  });
});
