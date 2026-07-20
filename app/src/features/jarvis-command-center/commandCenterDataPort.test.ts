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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

    expect(runs.listByAccount).toHaveBeenLastCalledWith('account-1', { limit: expected });
    expect(events.listByRun).toHaveBeenLastCalledWith('account-1', 'run-1', { limit: expected });
    expect(artifacts.listByRun).toHaveBeenLastCalledWith('account-1', 'run-1', expected);
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

  it('combines journal and current-run live subscriptions, replaces the live subscription, and disposes both', async () => {
    const { port, runs, liveSubscribe, journalDispose, emitJournal } = setup();
    const firstLiveDispose = vi.fn();
    const secondLiveDispose = vi.fn();
    liveSubscribe.mockReturnValueOnce(firstLiveDispose).mockReturnValueOnce(secondLiveDispose);
    const listener = vi.fn();

    const dispose = port.subscribe('account-1', 'chat-1', listener);
    await vi.waitFor(() => expect(liveSubscribe).toHaveBeenCalledWith('run-1', listener));

    runs.listByAccount.mockResolvedValue([run('run-3')]);
    emitJournal();
    await vi.waitFor(() => expect(liveSubscribe).toHaveBeenCalledWith('run-3', listener));
    expect(firstLiveDispose).toHaveBeenCalledTimes(1);

    dispose();
    expect(journalDispose).toHaveBeenCalledTimes(1);
    expect(secondLiveDispose).toHaveBeenCalledTimes(1);
  });

  it('does not let an older subscription lookup replace the newest exact-run subscription', async () => {
    const { port, runs, liveSubscribe, emitJournal } = setup();
    const older = deferred<JarvisRun[]>();
    runs.listByAccount
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce([run('run-new')]);

    const dispose = port.subscribe('account-1', 'chat-1', vi.fn());
    emitJournal();
    await vi.waitFor(() =>
      expect(liveSubscribe).toHaveBeenCalledWith('run-new', expect.any(Function)),
    );

    older.resolve([run('run-old')]);
    await older.promise;
    await Promise.resolve();

    expect(liveSubscribe).not.toHaveBeenCalledWith('run-old', expect.any(Function));
    dispose();
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
