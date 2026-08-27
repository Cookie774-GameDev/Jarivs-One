import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import type { ChatActivityEvent } from '../activity/types';
import { MAX_LEDGER_RECEIPTS, projectAssistantActivityLedger } from './ledgerProjection';

function assistant(parts: Message['parts'], usage?: Message['usage']): Message {
  return {
    id: 'message-ledger' as Message['id'],
    chat_id: 'chat-ledger' as Message['chat_id'],
    role: 'assistant',
    parts,
    created_at: 100,
    updated_at: 200,
    ...(usage ? { usage } : {}),
  };
}

function event(
  input: Partial<ChatActivityEvent> & Pick<ChatActivityEvent, 'id'>,
): ChatActivityEvent {
  return {
    chatId: 'chat-ledger',
    kind: 'tool',
    status: 'done',
    title: 'Activity',
    ts: 100,
    ...input,
  };
}

describe('projectAssistantActivityLedger', () => {
  it('projects a command once and never retains its body, args, output, or secrets', () => {
    const ledger = projectAssistantActivityLedger(
      assistant([
        {
          kind: 'tool_call',
          call_id: 'call-1',
          tool: 'terminal.exec',
          args: { command: 'curl https://private.test --data "opaque-sensitive-payload"' },
        },
        {
          kind: 'tool_result',
          call_id: 'call-1',
          result: { stdout: 'super-secret-output', exitCode: 0, durationMs: 42 },
        },
      ]),
    );

    expect(ledger.commandsTotal).toBe(1);
    expect(ledger.actionsTotal).toBe(1);
    expect(ledger.receipts).toHaveLength(1);
    expect(ledger.receipts[0]).toMatchObject({
      kind: 'command',
      label: 'Ran command',
      status: 'done',
    });
    expect(JSON.stringify(ledger)).not.toContain('opaque-sensitive-payload');
    expect(JSON.stringify(ledger)).not.toContain('super-secret-output');
    expect(JSON.stringify(ledger)).not.toContain('private.test');
  });

  it('deduplicates replayed message tool calls by stable call id and uses the latest result status', () => {
    const ledger = projectAssistantActivityLedger(
      assistant([
        {
          kind: 'tool_call',
          call_id: 'replayed',
          tool: 'terminal.exec',
          args: { command: 'first' },
        },
        { kind: 'tool_result', call_id: 'replayed', result: { exitCode: 0 } },
        {
          kind: 'tool_call',
          call_id: 'replayed',
          tool: 'terminal.exec',
          args: { command: 'second' },
        },
        { kind: 'tool_result', call_id: 'replayed', result: { exitCode: -7 } },
      ]),
    );
    expect(ledger.actionsTotal).toBe(1);
    expect(ledger.commandsTotal).toBe(1);
    expect(ledger.receipts).toHaveLength(1);
    expect(ledger.receipts[0]).toMatchObject({ status: 'error', label: 'Command failed' });
    expect(JSON.stringify(ledger)).not.toContain('first');
    expect(JSON.stringify(ledger)).not.toContain('second');
  });

  it('deduplicates replayed correlated events and maps only explicit successful evidence', () => {
    const events = [
      event({
        id: 'read-1',
        kind: 'tool',
        category: 'file',
        status: 'running',
        title: 'Opaque file activity',
        filePath: 'README.md',
        ts: 100,
      }),
      event({
        id: 'read-1',
        kind: 'tool',
        category: 'file',
        title: 'Different replay prose',
        filePath: 'README.md',
        status: 'done',
        ts: 101,
      }),
      event({ id: 'search-1', kind: 'url', category: 'context', title: 'Opaque retrieval' }),
      event({
        id: 'edit-1',
        kind: 'diff',
        category: 'writing',
        title: 'Edited source file',
        filePath: 'src/a.ts',
      }),
      event({ id: 'generic-check-title', title: 'Verified focused tests' }),
      event({
        id: 'generic-subagent',
        kind: 'subagent',
        category: 'coordination',
        title: 'Coordinating worker',
        agentSlug: 'worker-a',
      }),
    ];

    const ledger = projectAssistantActivityLedger(
      assistant([
        { kind: 'tool_call', call_id: 'check-ok', tool: 'verify.test', args: {} },
        { kind: 'tool_result', call_id: 'check-ok', result: { exitCode: 0 } },
        { kind: 'tool_call', call_id: 'check-failed', tool: 'verify.test', args: {} },
        { kind: 'tool_result', call_id: 'check-failed', result: { exitCode: -1 } },
        { kind: 'tool_call', call_id: 'sub-1', tool: 'agents.spawn_agent', args: {} },
        { kind: 'tool_result', call_id: 'sub-1', result: { exitCode: 0 } },
      ]),
      events,
    );
    expect(ledger).toMatchObject({
      actionsTotal: 7,
      readsTotal: 1,
      searchesTotal: 1,
      editedFilesTotal: 1,
      verifiedChecksTotal: 1,
      failedChecksTotal: 1,
      subagentsTotal: 2,
    });
    expect(ledger.receipts.find((receipt) => receipt.id === 'activity:read-1')?.status).toBe(
      'done',
    );
  });

  it('honors explicit file and subagent event kinds without requiring optional categories', () => {
    const ledger = projectAssistantActivityLedger(assistant([]), [
      event({
        id: 'explicit-file',
        kind: 'file',
        title: 'Opaque file activity',
        filePath: 'src/feature.ts',
      }),
      event({
        id: 'explicit-subagent',
        kind: 'subagent',
        title: 'Opaque delegated activity',
        agentSlug: 'worker-one',
      }),
    ]);

    expect(ledger).toMatchObject({
      actionsTotal: 2,
      readsTotal: 1,
      subagentsTotal: 1,
    });
    expect(ledger.receipts.map((receipt) => receipt.kind)).toEqual(['read', 'subagent']);
  });

  it('projects only privacy-safe leaf file labels while retaining preview authority', () => {
    const windowsPath = 'C:\\private\\planning\\AlphaPlan.ts';
    const posixPath = '/private/build/BetaBuild.ts';
    const ledger = projectAssistantActivityLedger(assistant([]), [
      event({ id: 'windows-file', kind: 'file', filePath: windowsPath }),
      event({ id: 'posix-file', kind: 'file', filePath: posixPath }),
    ]);

    expect(ledger.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: windowsPath, fileLabel: 'AlphaPlan.ts' }),
        expect.objectContaining({ filePath: posixPath, fileLabel: 'BetaBuild.ts' }),
      ]),
    );
    expect(ledger.receipts.map((receipt) => receipt.fileLabel).join(' ')).not.toContain('private');
  });

  it('counts unique completed files and distinct started subagent executions', () => {
    const ledger = projectAssistantActivityLedger(assistant([]), [
      event({ id: 'read-a', kind: 'file', filePath: 'src/a.ts', status: 'done' }),
      event({ id: 'read-b', kind: 'file', filePath: 'src/a.ts', status: 'done' }),
      event({ id: 'read-running', kind: 'file', filePath: 'src/b.ts', status: 'running' }),
      event({ id: 'read-failed', kind: 'file', filePath: 'src/c.ts', status: 'error' }),
      event({
        id: 'sub-running',
        kind: 'subagent',
        agentSlug: 'worker',
        status: 'running',
      }),
      event({ id: 'sub-done', kind: 'subagent', agentSlug: 'worker', status: 'done' }),
      event({ id: 'sub-failed', kind: 'subagent', agentSlug: 'other', status: 'error' }),
    ]);

    expect(ledger.readsTotal).toBe(1);
    expect(ledger.subagentsTotal).toBe(2);
  });

  it('uses the latest authoritative terminal end when exact usage and correlated evidence coexist', () => {
    const ledger = projectAssistantActivityLedger(
      assistant([], { input_tokens: 10, output_tokens: 2 }),
      [
        event({
          id: 'later-search',
          kind: 'url',
          startedAt: 100,
          endedAt: 61_100,
          status: 'done',
        }),
      ],
    );

    expect(ledger.endedAt).toBe(61_100);
    expect(ledger.durationMs).toBe(61_000);
  });

  it('keeps provider usage exact, optimizer-only input estimated, and missing output unavailable', () => {
    const exact = projectAssistantActivityLedger(
      assistant([], {
        input_tokens: 12,
        output_tokens: 7,
        provider: 'opencode' as never,
        model: 'm',
      }),
    );
    expect(exact.usage).toEqual({
      input: { value: 12, provenance: 'exact', source: 'response-metadata' },
      output: { value: 7, provenance: 'exact', source: 'response-metadata' },
    });

    const estimated = projectAssistantActivityLedger(
      assistant([
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
      ]),
    );
    expect(estimated.usage).toEqual({
      input: { value: 15, provenance: 'estimated', source: 'local-estimate' },
      output: { value: null, provenance: 'unavailable', source: 'unavailable' },
    });
  });

  it('bounds retained detail while preserving truthful aggregate totals', () => {
    const events = Array.from({ length: MAX_LEDGER_RECEIPTS + 25 }, (_, index) =>
      event({
        id: `read-${index}`,
        kind: 'tool',
        category: 'file',
        title: 'Opaque file activity',
        filePath: `f-${index}.ts`,
        ts: index,
      }),
    );
    const ledger = projectAssistantActivityLedger(assistant([]), events);
    expect(ledger.actionsTotal).toBe(MAX_LEDGER_RECEIPTS + 25);
    expect(ledger.readsTotal).toBe(MAX_LEDGER_RECEIPTS + 25);
    expect(ledger.receipts).toHaveLength(MAX_LEDGER_RECEIPTS);
    expect(ledger.omittedReceipts).toBe(25);
  });

  it('keeps an unknown persisted message tool as a safe generic action without exposing payloads', () => {
    const ledger = projectAssistantActivityLedger(
      assistant([
        {
          kind: 'tool_call',
          call_id: 'unknown-1',
          tool: 'custom.private_tool',
          args: { secret: 'never-render-this' },
        },
        { kind: 'tool_result', call_id: 'unknown-1', result: { value: 'private-result' } },
      ]),
    );
    expect(ledger.actionsTotal).toBe(1);
    expect(ledger.receipts[0]).toMatchObject({
      kind: 'other',
      label: 'Completed activity',
      countsAsAction: true,
    });
    expect(JSON.stringify(ledger)).not.toContain('never-render-this');
    expect(JSON.stringify(ledger)).not.toContain('private-result');
  });
});
