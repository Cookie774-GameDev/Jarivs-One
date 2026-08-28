import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { JarvisRun } from '@/lib/jarvis/contracts/execution';
import { createJarvisCommandCenterDataPort } from './commandCenterDataPort';

function run(id = 'run-1', chatId = 'chat-1'): JarvisRun {
  return {
    id,
    accountId: 'account-1',
    chatId,
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-1',
    model: {
      providerId: 'provider-1',
      modelId: 'model-1',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: 90,
    },
    createdAt: 100,
    updatedAt: 100,
  };
}

function setup() {
  const runs = { listByAccount: vi.fn(async () => [run(), run('run-2', 'chat-2')]) };
  const events = { listByRun: vi.fn(async () => []) };
  const artifacts = { listByRun: vi.fn(async () => []) };
  const snapshot = vi.fn(async () => undefined);
  const liveSubscribe = vi.fn(() => vi.fn());
  const journalDispose = vi.fn();
  let journalListener: (() => void) | undefined;
  const subscribeJournal = vi.fn((_accountId: string, _chatId: string, listener: () => void) => {
    journalListener = listener;
    return journalDispose;
  });
  const port = createJarvisCommandCenterDataPort({
    repositories: { runs, events, artifacts } as never,
    liveEvidence: { accountId: 'account-1', snapshot, subscribe: liveSubscribe },
    subscribeJournal,
  });
  return {
    port,
    runs,
    events,
    artifacts,
    snapshot,
    liveSubscribe,
    journalDispose,
    subscribeJournal,
    emitJournal: () => journalListener?.(),
  };
}

describe('createJarvisCommandCenterDataPort', () => {
  it.each([
    [0, 1],
    [1, 1],
    [500, 500],
    [501, 500],
    [1_000_000, 500],
  ])('bounds repository reads for caller limit %s', async (requested, expected) => {
    const { port, runs, events, artifacts } = setup();

    await port.getRunsForChat({ accountId: 'account-1', chatId: 'chat-1', limit: requested });
    await port.getEventsForRun({ accountId: 'account-1', runId: 'run-1', limit: requested });
    await port.getArtifactsForRun({ accountId: 'account-1', runId: 'run-1', limit: requested });

    expect(runs.listByAccount).toHaveBeenLastCalledWith('account-1', { limit: 500 });
    expect(events.listByRun).toHaveBeenLastCalledWith('account-1', 'run-1', { limit: expected });
    expect(artifacts.listByRun).toHaveBeenLastCalledWith('account-1', 'run-1', expected);
  });

  it('applies the requested run limit after filtering to the exact chat', async () => {
    const { port, runs } = setup();
    runs.listByAccount.mockResolvedValue([
      run('newer-other-chat', 'chat-2'),
      run('current-chat-run', 'chat-1'),
      run('older-chat-run', 'chat-1'),
    ]);

    await expect(
      port.getRunsForChat({ accountId: 'account-1', chatId: 'chat-1', limit: 1 }),
    ).resolves.toEqual([expect.objectContaining({ id: 'current-chat-run' })]);
    expect(runs.listByAccount).toHaveBeenLastCalledWith('account-1', { limit: 500 });
  });

  it('filters repository responses to the exact requested chat and run', async () => {
    const { port, events, artifacts } = setup();
    events.listByRun.mockResolvedValue([
      { runId: 'run-2', seq: 1 },
      { runId: 'run-1', seq: 2 },
    ] as never);
    artifacts.listByRun.mockResolvedValue([
      { schemaVersion: 1, runId: 'run-2' },
      { schemaVersion: 1, runId: 'run-1' },
    ] as never);

    await expect(
      port.getRunsForChat({ accountId: 'account-1', chatId: 'chat-1', limit: 100 }),
    ).resolves.toEqual([expect.objectContaining({ id: 'run-1' })]);
    await expect(
      port.getEventsForRun({ accountId: 'account-1', runId: 'run-1', limit: 500 }),
    ).resolves.toEqual([{ runId: 'run-1', seq: 2 }]);
    await expect(
      port.getArtifactsForRun({ accountId: 'account-1', runId: 'run-1', limit: 500 }),
    ).resolves.toEqual([{ schemaVersion: 1, runId: 'run-1' }]);
  });

  it('forwards bounded event pagination and rejects invalid cursors before repository access', async () => {
    const { port, events } = setup();

    await port.getEventsForRun({
      accountId: 'account-1',
      runId: 'run-1',
      afterSeq: 23,
      limit: 17,
    });
    expect(events.listByRun).toHaveBeenLastCalledWith('account-1', 'run-1', {
      afterSeq: 23,
      limit: 17,
    });

    events.listByRun.mockClear();
    for (const afterSeq of [-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        port.getEventsForRun({
          accountId: 'account-1',
          runId: 'run-1',
          afterSeq,
          limit: 17,
        }),
      ).rejects.toThrow('jarvis_command_center_invalid_event_cursor');
    }
    expect(events.listByRun).not.toHaveBeenCalled();
  });

  it('rejects cross-account event pagination before repository access', async () => {
    const { port, events } = setup();

    await expect(
      port.getEventsForRun({
        accountId: 'account-2',
        runId: 'run-1',
        afterSeq: 0,
        limit: 500,
      }),
    ).rejects.toThrow('jarvis_command_center_account_mismatch');
    expect(events.listByRun).not.toHaveBeenCalled();
  });

  it('delegates exactly to the bound async live read port and rejects account mismatch before a read', async () => {
    const { port, snapshot } = setup();

    await port.getLiveEvidenceSnapshot({ accountId: 'account-1', runId: 'run-1' });
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledWith('run-1');

    await expect(
      port.getLiveEvidenceSnapshot({ accountId: 'account-2', runId: 'run-1' }),
    ).rejects.toThrow('jarvis_command_center_account_mismatch');
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('keeps journal and exact-run live subscriptions separate with no subscription-time run scan', () => {
    const { port, runs, liveSubscribe, journalDispose, subscribeJournal, emitJournal } = setup();
    const liveDispose = vi.fn();
    liveSubscribe.mockReturnValue(liveDispose);
    const journalListener = vi.fn();
    const liveListener = vi.fn();

    const disposeJournal = port.subscribe('account-1', 'chat-1', journalListener);
    expect(subscribeJournal).toHaveBeenCalledWith('account-1', 'chat-1', expect.any(Function));
    expect(runs.listByAccount).not.toHaveBeenCalled();
    expect(liveSubscribe).not.toHaveBeenCalled();

    emitJournal();
    expect(journalListener).toHaveBeenCalledTimes(1);
    expect(runs.listByAccount).not.toHaveBeenCalled();

    const disposeLive = port.subscribeLiveEvidence?.(
      { accountId: 'account-1', runId: 'run-1' },
      liveListener,
    );
    expect(liveSubscribe).toHaveBeenCalledWith('run-1', liveListener);

    disposeJournal();
    disposeLive?.();
    expect(journalDispose).toHaveBeenCalledTimes(1);
    expect(liveDispose).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-account live subscription before reaching the read port', () => {
    const { port, liveSubscribe } = setup();

    expect(() =>
      port.subscribeLiveEvidence?.({ accountId: 'account-2', runId: 'run-1' }, vi.fn()),
    ).toThrow('jarvis_command_center_account_mismatch');
    expect(liveSubscribe).not.toHaveBeenCalled();
  });

  it('imports only repositories and exact immutable Task 18 contract types', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/jarvis-command-center/commandCenterDataPort.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /liveEvidenceAuthority|liveEvidenceRegistry|kernelRuntime|producer|verifier|writer/i,
    );
    expect(source).toContain("from '@/lib/jarvis/contracts/execution'");
  });
});
