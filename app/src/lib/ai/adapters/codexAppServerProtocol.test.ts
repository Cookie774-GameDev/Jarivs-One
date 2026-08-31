import { describe, expect, it } from 'vitest';

import {
  buildCodexThreadResumeRequest,
  buildCodexThreadStartRequest,
  buildCodexTurnStartRequest,
  validateCodexThreadStartResponse,
  type CodexBackendIdentity,
} from './codexAppServerProtocol';

const IDENTITY: CodexBackendIdentity = {
  modelProvider: 'opencodex-vibespace',
  model: 'gpt-5.6-sol',
  effort: 'high',
  serviceTier: 'fast',
  cwd: 'C:\\workspace\\game',
};

describe('Codex app-server request protocol', () => {
  it('starts an Ask thread with exact backend identity and no prompt or credential override', () => {
    const request = buildCodexThreadStartRequest({
      requestId: 'start_1',
      identity: IDENTITY,
      mode: { kind: 'ask' },
    });

    expect(request).toEqual({
      id: 'start_1',
      method: 'thread/start',
      params: {
        model: 'gpt-5.6-sol',
        modelProvider: 'opencodex-vibespace',
        serviceTier: 'fast',
        cwd: 'C:\\workspace\\game',
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        sandbox: 'read-only',
        config: { model_reasoning_effort: 'high' },
        ephemeral: false,
        threadSource: 'vibespace',
      },
    });
    const persisted = JSON.stringify(request);
    for (const forbidden of [
      'baseInstructions',
      'developerInstructions',
      'personality',
      'apiKey',
      'credential',
    ]) {
      expect(persisted).not.toContain(forbidden);
    }
  });

  it('starts an Agent turn with only the explicitly authorized approval and sandbox profile', () => {
    expect(
      buildCodexTurnStartRequest({
        requestId: 'turn_request_1',
        threadId: 'thread_1',
        clientUserMessageId: 'message_1',
        text: 'Build the requested game.',
        identity: IDENTITY,
        mode: {
          kind: 'agent',
          approvalPolicy: 'on-request',
          sandbox: {
            kind: 'workspace-write',
            writableRoots: ['C:\\workspace\\game'],
            networkAccess: false,
          },
        },
      }),
    ).toEqual({
      id: 'turn_request_1',
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: 'message_1',
        input: [{ type: 'text', text: 'Build the requested game.', text_elements: [] }],
        turnTrigger: 'user',
        cwd: 'C:\\workspace\\game',
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: ['C:\\workspace\\game'],
          networkAccess: false,
          excludeTmpdirEnvVar: true,
          excludeSlashTmp: true,
        },
        model: 'gpt-5.6-sol',
        serviceTierForTurn: 'fast',
        effort: 'high',
        summary: 'concise',
      },
    });
  });

  it.each(['ask', 'plan'] as const)(
    'keeps %s turns read-only without an approval escape',
    (kind) => {
      const request = buildCodexTurnStartRequest({
        requestId: `turn_${kind}`,
        threadId: 'thread_1',
        clientUserMessageId: `message_${kind}`,
        text: `Run in ${kind} mode.`,
        identity: IDENTITY,
        mode: { kind },
      });
      expect(request.params.approvalPolicy).toBe('never');
      expect(request.params.sandboxPolicy).toEqual({ type: 'readOnly', networkAccess: false });
    },
  );

  it('resumes only by immutable thread id while reasserting the exact identity', () => {
    expect(
      buildCodexThreadResumeRequest({
        requestId: 'resume_1',
        threadId: 'thread_1',
        identity: IDENTITY,
        mode: { kind: 'plan' },
      }),
    ).toEqual({
      id: 'resume_1',
      method: 'thread/resume',
      params: {
        threadId: 'thread_1',
        model: 'gpt-5.6-sol',
        modelProvider: 'opencodex-vibespace',
        serviceTier: 'fast',
        cwd: 'C:\\workspace\\game',
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        sandbox: 'read-only',
        config: { model_reasoning_effort: 'high' },
        excludeTurns: true,
      },
    });
  });

  it('accepts only an exact observed thread identity and reports mismatches without values', () => {
    const response = {
      id: 'start_1',
      result: {
        thread: { id: 'thread_1' },
        model: 'gpt-5.6-sol',
        modelProvider: 'opencodex-vibespace',
        serviceTier: 'fast',
        cwd: 'C:\\workspace\\game',
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        sandbox: { type: 'readOnly', networkAccess: false },
        reasoningEffort: 'high',
      },
    };
    expect(
      validateCodexThreadStartResponse(response, 'start_1', IDENTITY, { kind: 'ask' }),
    ).toEqual({ ok: true, threadId: 'thread_1' });

    const mismatch = validateCodexThreadStartResponse(
      { ...response, result: { ...response.result, model: 'wrong-secret-model' } },
      'start_1',
      IDENTITY,
      { kind: 'ask' },
    );
    expect(mismatch).toEqual({ ok: false, reason: 'identity_mismatch', field: 'model' });
    expect(JSON.stringify(mismatch)).not.toContain('wrong-secret-model');

    expect(
      validateCodexThreadStartResponse(
        {
          ...response,
          result: { ...response.result, sandbox: { type: 'readOnly', networkAccess: true } },
        },
        'start_1',
        IDENTITY,
        { kind: 'ask' },
      ),
    ).toEqual({ ok: false, reason: 'identity_mismatch', field: 'sandbox' });
  });

  it('rejects relative paths, unsafe identifiers, empty prompts, and duplicate write roots', () => {
    expect(() =>
      buildCodexThreadStartRequest({
        requestId: 'start_1',
        identity: { ...IDENTITY, cwd: 'relative\\path' },
        mode: { kind: 'ask' },
      }),
    ).toThrow(/absolute/iu);
    expect(() =>
      buildCodexTurnStartRequest({
        requestId: 'turn_1\n',
        threadId: 'thread_1',
        clientUserMessageId: 'message_1',
        text: 'hello',
        identity: IDENTITY,
        mode: { kind: 'ask' },
      }),
    ).toThrow(/identifier/iu);
    expect(() =>
      buildCodexTurnStartRequest({
        requestId: 'turn_1',
        threadId: 'thread_1',
        clientUserMessageId: 'message_1',
        text: '',
        identity: IDENTITY,
        mode: { kind: 'ask' },
      }),
    ).toThrow(/text/iu);
    expect(() =>
      buildCodexTurnStartRequest({
        requestId: 'turn_1',
        threadId: 'thread_1',
        clientUserMessageId: 'message_1',
        text: 'hello',
        identity: IDENTITY,
        mode: {
          kind: 'agent',
          approvalPolicy: 'never',
          sandbox: {
            kind: 'workspace-write',
            writableRoots: ['C:\\workspace\\game', 'C:\\workspace\\game'],
            networkAccess: false,
          },
        },
      }),
    ).toThrow(/writable root/iu);
  });
});
