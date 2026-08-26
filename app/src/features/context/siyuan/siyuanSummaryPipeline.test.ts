import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const routerMocks = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock('@/lib/ai/router', () => ({ runAgent: routerMocks.runAgent }));
import {
  checkpointSiyuanIndexJob,
  createSiyuanIndexJob,
  readSiyuanIndexEntries,
  readSiyuanIndexJob,
  readSiyuanSummaryUsage,
  replaceSiyuanIndexJob,
  updateSiyuanIndexJobStatus,
} from './siyuanIndexJobStore';
import {
  approvedCloudSiyuanSummaryIdentity,
  computeSiyuanCloudSummaryScope,
  generateSiyuanSummaryWithApprovedCloudModel,
  resolveSiyuanSummaryIdentityForJob,
  runSiyuanSummaryPipeline,
} from './siyuanSummaryPipeline';
import { createSiyuanIndexJobControl, type SiyuanSafeIndexEntry } from './siyuanSafeIndex';
import { resetSiyuanSummaryBatchStoreForTests } from './siyuanSummaryBatchStore';

const identity = {
  providerId: 'ollama',
  connectionId: 'ollama-local',
  modelId: 'qwen2.5:1.5b-instruct',
} as const;

function entries(): SiyuanSafeIndexEntry[] {
  return [
    {
      nodeId: 'path:src',
      parentNodeId: null,
      title: 'src',
      kind: 'area',
      relativePath: 'src',
      sourcePointer: 'C:/repo/src',
      summary: null,
      sizeBytes: null,
      modifiedAt: null,
    },
    {
      nodeId: 'path:src/index.ts',
      parentNodeId: 'path:src',
      title: 'index.ts',
      kind: 'file',
      relativePath: 'src/index.ts',
      sourcePointer: 'C:/repo/src/index.ts',
      summary: null,
      sizeBytes: 20,
      modifiedAt: 1,
    },
  ];
}

async function job() {
  const record = {
    ...createSiyuanIndexJob({
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: 'C:/repo',
      policyFingerprint: 'policy-1',
      now: 100,
    }),
    phase: 'creating_nodes' as const,
    indexed: 2,
    createdNodes: 2,
  };
  await replaceSiyuanIndexJob(record, {
    path: 'C:/repo',
    relativePath: '',
    parentNodeId: null,
  });
  await checkpointSiyuanIndexJob({ job: record, appendedEntries: entries() });
  return record;
}

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vibespace-siyuan-index-jobs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database_delete_blocked'));
  });
}

describe('durable SiYuan summary pipeline', () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetSiyuanSummaryBatchStoreForTests();
  });
  beforeEach(() => routerMocks.runAgent.mockReset());

  it('routes an approved cloud summary through the exact connection and rejects substitution', async () => {
    routerMocks.runAgent.mockResolvedValueOnce({
      text: 'Approved summary.',
      provider: 'opencode',
      model: 'opencode-go/deepseek-v4-flash-vision-exp',
      usage: { input_tokens: 10, output_tokens: 3, cost_usd: 0 },
    });
    const generated = await generateSiyuanSummaryWithApprovedCloudModel({
      entry: entries()[1]!,
      content: 'source',
      scope: {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        workingDirectory: 'C:/repo',
      },
      identity: {
        providerId: 'opencode',
        connectionId: 'opencode-cli',
        modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
        effort: 'high',
      },
    });
    expect(routerMocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'opencode-cli',
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        workingDirectory: 'C:/repo',
        provider_options: { reasoning_effort: 'high' },
        runtimeSettings: {
          effort: 'high',
          fastMode: 'auto',
          performance: 'quality',
          rlmEnabled: false,
        },
        tools: {},
        explicitReadSynthesis: true,
        interactionMode: 'ask',
        accessLevel: 'read-only',
      }),
    );
    expect(routerMocks.runAgent.mock.calls[0]?.[0]).not.toHaveProperty('chatId');
    expect(generated).toMatchObject({
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
      effort: 'high',
      effortProvenance: 'requested',
      tokenProvenance: 'estimated',
    });

    routerMocks.runAgent.mockResolvedValueOnce({
      text: 'Substituted.',
      provider: 'opencode',
      model: 'different-model',
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
    });
    await expect(
      generateSiyuanSummaryWithApprovedCloudModel({
        entry: entries()[1]!,
        content: 'source',
        scope: {
          accountId: 'account-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          workingDirectory: 'C:/repo',
        },
        identity: {
          providerId: 'opencode',
          connectionId: 'opencode-cli',
          modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
        },
      }),
    ).rejects.toThrow('siyuan_summary_model_identity_mismatch');
  });

  it('fails closed before dispatch when exact OpenCode summary scope is absent', async () => {
    await expect(
      generateSiyuanSummaryWithApprovedCloudModel({
        entry: entries()[1]!,
        content: 'source',
        identity: {
          providerId: 'opencode',
          connectionId: 'opencode-cli',
          modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
          effort: 'high',
        },
      }),
    ).rejects.toThrow('siyuan_summary_request_scope_missing');
    expect(routerMocks.runAgent).not.toHaveBeenCalled();
  });

  it('rejects cloud summary authority drift before reading or generating', async () => {
    const record = { ...(await job()), accountId: 'account-1' };
    const generator = vi.fn();
    const read = vi.fn();
    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: entries(),
        job: record,
        identity: {
          providerId: 'opencode',
          connectionId: 'opencode-cli',
          modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
          effort: 'high',
        },
        requestScope: {
          accountId: 'different-account',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          workingDirectory: 'C:/repo',
        },
        generator,
        read,
      }),
    ).rejects.toThrow('siyuan_summary_request_scope_mismatch');
    expect(read).not.toHaveBeenCalled();
    expect(generator).not.toHaveBeenCalled();
  });

  it('recomputes exact cloud disclosure scope and rejects drift before model selection', async () => {
    const record = await job();
    const policy = { mode: 'all' as const, selectedExtensions: [], selectedPaths: [] };
    expect(computeSiyuanCloudSummaryScope(entries(), 'C:/repo', policy)).toEqual({
      eligibleFileCount: 1,
      eligibleSourceBytes: 20,
      estimatedMaxSentBytes: 256 * 1024,
    });
    const approval = {
      providerId: 'opencode-go',
      connectionId: 'opencode-go-primary',
      modelId: 'deepseek-v4-flash-vision-exp',
      sourceRoot: 'C:/repo',
      summaryPolicyFingerprint: record.policyFingerprint,
      eligibleFileCount: 1,
      eligibleSourceBytes: 20,
      estimatedMaxSentBytes: 256 * 1024,
      privacyAcknowledged: true as const,
      approvedAt: 200,
    };
    expect(
      approvedCloudSiyuanSummaryIdentity({
        approval,
        job: record,
        entries: entries(),
        root: 'C:/repo',
        policy,
      }),
    ).toEqual({
      providerId: approval.providerId,
      connectionId: approval.connectionId,
      modelId: approval.modelId,
      effort: 'auto',
    });
    for (const drifted of [
      { ...approval, sourceRoot: 'C:/other' },
      { ...approval, summaryPolicyFingerprint: 'stale-policy' },
      { ...approval, eligibleFileCount: 0 },
      { ...approval, eligibleSourceBytes: 19 },
      { ...approval, estimatedMaxSentBytes: 1 },
    ]) {
      expect(() =>
        approvedCloudSiyuanSummaryIdentity({
          approval: drifted,
          job: record,
          entries: entries(),
          root: 'C:/repo',
          policy,
        }),
      ).toThrow('siyuan_cloud_summary_approval_scope_drift');
    }
  });

  it('keeps binary and image files metadata-only even when their folder or all content is selected', () => {
    const candidates: SiyuanSafeIndexEntry[] = [
      entries()[1]!,
      {
        ...entries()[1]!,
        nodeId: 'path:assets/hero.webp',
        title: 'hero.webp',
        relativePath: 'assets/hero.webp',
        sourcePointer: 'C:/repo/assets/hero.webp',
        sizeBytes: 512,
      },
      {
        ...entries()[1]!,
        nodeId: 'path:assets/archive.zip',
        title: 'archive.zip',
        relativePath: 'assets/archive.zip',
        sourcePointer: 'C:/repo/assets/archive.zip',
        sizeBytes: 1024,
      },
    ];

    for (const policy of [
      { mode: 'all' as const, selectedExtensions: [], selectedPaths: [] },
      { mode: 'selected' as const, selectedExtensions: [], selectedPaths: ['.'] },
    ]) {
      expect(computeSiyuanCloudSummaryScope(candidates, 'C:/repo', policy)).toEqual({
        eligibleFileCount: 1,
        eligibleSourceBytes: 20,
        estimatedMaxSentBytes: 256 * 1024,
      });
    }
    expect(
      computeSiyuanCloudSummaryScope(candidates, 'C:/repo', {
        mode: 'selected',
        selectedExtensions: [],
        selectedPaths: ['assets'],
      }),
    ).toEqual({
      eligibleFileCount: 0,
      eligibleSourceBytes: 0,
      estimatedMaxSentBytes: 0,
    });
  });

  it('honors explicitly selected custom text extensions but never explicit binary formats', () => {
    const customText = {
      ...entries()[1]!,
      nodeId: 'path:schema/service.proto',
      title: 'service.proto',
      relativePath: 'schema/service.proto',
      sourcePointer: 'C:/repo/schema/service.proto',
      sizeBytes: 40,
    };
    const image = {
      ...entries()[1]!,
      nodeId: 'path:assets/hero.webp',
      title: 'hero.webp',
      relativePath: 'assets/hero.webp',
      sourcePointer: 'C:/repo/assets/hero.webp',
      sizeBytes: 500,
    };
    expect(
      computeSiyuanCloudSummaryScope([customText, image], 'C:/repo', {
        mode: 'selected',
        selectedExtensions: ['proto', 'webp'],
        selectedPaths: [],
      }),
    ).toEqual({
      eligibleFileCount: 1,
      eligibleSourceBytes: 40,
      estimatedMaxSentBytes: 256 * 1024,
    });
  });

  it('keeps live coordination and VibeSpace runtime files metadata-only', () => {
    const runtimeEntries = [
      {
        ...entries()[1]!,
        nodeId: 'path:.agent-coordination.lock/active.txt',
        title: 'active.txt',
        relativePath: '.agent-coordination.lock/active.txt',
        sourcePointer: 'C:/repo/.agent-coordination.lock/active.txt',
      },
      {
        ...entries()[1]!,
        nodeId: 'path:.vibespace/runtime.log',
        title: 'runtime.log',
        relativePath: './.vibespace/runtime.log',
        sourcePointer: 'C:/repo/.vibespace/runtime.log',
      },
    ];
    expect(
      computeSiyuanCloudSummaryScope(runtimeEntries, 'C:/repo', {
        mode: 'selected',
        selectedExtensions: ['txt', 'log'],
        selectedPaths: ['.'],
      }),
    ).toEqual({
      eligibleFileCount: 0,
      eligibleSourceBytes: 0,
      estimatedMaxSentBytes: 0,
    });
  });

  it('skips a binary payload disguised with a text extension without invoking the model', async () => {
    const record = await job();
    const generator = vi.fn();
    const result = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: entries(),
      job: record,
      identity,
      read: vi.fn(async () => ({ ok: true as const, content: 'PK\u0000\ufffdarchive' })),
      generator,
    });

    expect(generator).not.toHaveBeenCalled();
    expect(result.entries[1]).toMatchObject({ summary: null, summaryState: 'skipped' });
    expect(result.job.skipped).toBe(1);
  });

  it('accepts an approved exact same cloud route after durable historical summary work', async () => {
    const pendingEntries = entries();
    const completedEntry: SiyuanSafeIndexEntry = {
      nodeId: 'path:README.md',
      parentNodeId: null,
      title: 'README.md',
      kind: 'file',
      relativePath: 'README.md',
      sourcePointer: 'C:/repo/README.md',
      summary: 'Previously summarized without replay.',
      summaryState: 'completed',
      sizeBytes: 40,
      modifiedAt: 1,
    };
    const record = {
      ...(await job()),
      summarized: 1,
      totalTokens: 321,
      summaryProviderId: 'opencode-go',
      summaryConnectionId: 'opencode-go-primary',
      summaryModelId: 'deepseek-v4-flash-vision-exp',
      summaryEffort: 'high' as const,
    };
    const approval = {
      providerId: record.summaryProviderId,
      connectionId: record.summaryConnectionId,
      modelId: record.summaryModelId,
      effort: record.summaryEffort,
      sourceRoot: 'C:/repo',
      summaryPolicyFingerprint: record.policyFingerprint,
      eligibleFileCount: 1,
      eligibleSourceBytes: 20,
      estimatedMaxSentBytes: 256 * 1024,
      privacyAcknowledged: true as const,
      approvedAt: 200,
    };

    expect(
      approvedCloudSiyuanSummaryIdentity({
        approval,
        job: record,
        entries: [...pendingEntries, completedEntry],
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      }),
    ).toEqual({
      providerId: 'opencode-go',
      connectionId: 'opencode-go-primary',
      modelId: 'deepseek-v4-flash-vision-exp',
      effort: 'high',
    });
  });

  it('never switches a partially summarized local job to cloud without an archived restart', async () => {
    const record = { ...(await job()), summarized: 1, totalTokens: 10 };
    expect(() =>
      approvedCloudSiyuanSummaryIdentity({
        approval: {
          providerId: 'opencode-go',
          connectionId: 'primary',
          modelId: 'deepseek-v4-flash-vision-exp',
          sourceRoot: 'C:/repo',
          summaryPolicyFingerprint: record.policyFingerprint,
          eligibleFileCount: 1,
          eligibleSourceBytes: 20,
          estimatedMaxSentBytes: 48 * 1024,
          privacyAcknowledged: true,
          approvedAt: 200,
        },
        job: record,
        entries: entries(),
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      }),
    ).toThrow('siyuan_cloud_summary_restart_required');
  });

  it('requires an explicit restart even when a zero-work job was already pinned locally', async () => {
    const record = {
      ...(await job()),
      summaryProviderId: identity.providerId,
      summaryConnectionId: identity.connectionId,
      summaryModelId: identity.modelId,
    };
    expect(() =>
      approvedCloudSiyuanSummaryIdentity({
        approval: {
          providerId: 'deepseek',
          connectionId: 'deepseek-api',
          modelId: 'deepseek-chat',
          sourceRoot: 'C:/repo',
          summaryPolicyFingerprint: record.policyFingerprint,
          eligibleFileCount: 1,
          eligibleSourceBytes: 20,
          estimatedMaxSentBytes: 48 * 1024,
          privacyAcknowledged: true,
          approvedAt: 200,
        },
        job: record,
        entries: entries(),
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      }),
    ).toThrow('siyuan_cloud_summary_restart_required');
  });

  it('summarizes only eligible files and persists exact model and token provenance', async () => {
    const generator = vi.fn(async () => ({
      summary: 'Exports the application entry point.',
      ...identity,
      inputTokens: 12,
      outputTokens: 7,
      tokenProvenance: 'reported' as const,
    }));
    const result = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'selected', selectedExtensions: ['ts'], selectedPaths: [] },
      entries: entries(),
      job: await job(),
      identity,
      generator,
      read: vi.fn(async () => ({ ok: true as const, content: 'export const app = true;' })),
    });

    expect(generator).toHaveBeenCalledOnce();
    expect(result.job).toMatchObject({
      phase: 'reconciling',
      summarized: 1,
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
      tokenProvenance: 'reported',
      summaryProviderId: 'ollama',
      summaryConnectionId: 'ollama-local',
      summaryModelId: 'qwen2.5:1.5b-instruct',
    });
    expect(
      (await readSiyuanIndexEntries('project-1', 'map-1')).find(
        (entry) => entry.nodeId === 'path:src/index.ts',
      ),
    ).toMatchObject({ summary: 'Exports the application entry point.', summaryState: 'completed' });
    expect(await readSiyuanSummaryUsage('project-1', 'map-1')).toEqual([
      expect.objectContaining({
        nodeId: 'path:src/index.ts',
        inputTokens: 12,
        outputTokens: 7,
        totalTokens: 19,
        provenance: 'reported',
        ...identity,
      }),
    ]);
  });

  it('propagates a native AbortError without converting the durable job to failed', async () => {
    const record = await job();

    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: entries(),
        job: record,
        identity,
        generator: vi.fn(async () => {
          throw new DOMException('The request was aborted.', 'AbortError');
        }),
        read: vi.fn(async () => ({ ok: true as const, content: 'source' })),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(await readSiyuanIndexJob('project-1', 'map-1')).toMatchObject({
      status: 'running',
      summarized: 0,
      failed: 0,
    });
  });

  it('halts an in-flight summary at a durable pause boundary without committing it', async () => {
    let releaseGeneration!: () => void;
    let markGenerationStarted!: () => void;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });
    const generationReleased = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const control = createSiyuanIndexJobControl();
    const onCompleted = vi.fn(async () => undefined);
    const running = runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: entries(),
      job: await job(),
      identity,
      control,
      generator: async () => {
        markGenerationStarted();
        await generationReleased;
        return {
          summary: 'Must not commit after pause.',
          ...identity,
          inputTokens: 2,
          outputTokens: 1,
          tokenProvenance: 'reported',
        };
      },
      read: async () => ({ ok: true, content: 'source' }),
      onCompleted,
    });

    await generationStarted;
    await updateSiyuanIndexJobStatus('project-1', 'map-1', 'paused');
    releaseGeneration();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onCompleted).not.toHaveBeenCalled();
    expect(await readSiyuanSummaryUsage('project-1', 'map-1')).toEqual([]);
    expect(await readSiyuanIndexJob('project-1', 'map-1')).toMatchObject({
      status: 'paused',
      summarized: 0,
    });

    await updateSiyuanIndexJobStatus('project-1', 'map-1', 'cancelled');
    await expect(running).rejects.toThrow('siyuan_index_cancelled');
  });

  it('resumes a durable high-effort job without losing or rejecting its exact effort', async () => {
    const highIdentity = {
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
      effort: 'high' as const,
    };
    const resumedJob = {
      ...(await job()),
      accountId: 'account-1',
      summaryProviderId: highIdentity.providerId,
      summaryConnectionId: highIdentity.connectionId,
      summaryModelId: highIdentity.modelId,
      summaryEffort: highIdentity.effort,
    };
    const result = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: entries(),
      job: resumedJob,
      identity: highIdentity,
      requestScope: {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        workingDirectory: 'C:/repo',
      },
      generator: async () => ({
        summary: 'Exact high-effort summary.',
        ...highIdentity,
        effortProvenance: 'requested',
        inputTokens: 2,
        outputTokens: 1,
        tokenProvenance: 'reported',
      }),
      read: async () => ({ ok: true, content: 'source' }),
    });
    expect(result.job).toMatchObject({
      status: 'running',
      phase: 'reconciling',
      summaryProviderId: highIdentity.providerId,
      summaryConnectionId: highIdentity.connectionId,
      summaryModelId: highIdentity.modelId,
      summaryEffort: 'high',
    });
    expect(await readSiyuanSummaryUsage('project-1', 'map-1')).toEqual([
      expect.objectContaining({ effort: 'high', effortProvenance: 'requested' }),
    ]);
  });

  it('rejects a silent provider or model substitution', async () => {
    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: entries(),
        job: await job(),
        identity,
        generator: async () => ({
          summary: 'Wrong route.',
          providerId: 'openai',
          connectionId: 'cloud',
          modelId: 'gpt-substitute',
          inputTokens: 1,
          outputTokens: 1,
          tokenProvenance: 'reported',
        }),
        read: async () => ({ ok: true, content: 'source' }),
      }),
    ).rejects.toThrow('siyuan_summary_model_identity_mismatch');
  });

  it('does not mix reported and estimated token totals in one job', async () => {
    const current = { ...(await job()), tokenProvenance: 'reported' as const, totalTokens: 10 };
    await checkpointSiyuanIndexJob({ job: current });
    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: entries(),
        job: current,
        identity,
        generator: async () => ({
          summary: 'Estimated.',
          ...identity,
          inputTokens: 2,
          outputTokens: 1,
          tokenProvenance: 'estimated',
        }),
        read: async () => ({ ok: true, content: 'source' }),
      }),
    ).rejects.toThrow('siyuan_summary_token_provenance_mismatch');
  });

  it('skips completed entries when a durable summary job resumes', async () => {
    const completedEntries = entries();
    completedEntries[1] = {
      ...completedEntries[1]!,
      summary: 'Already complete.',
      summaryState: 'completed',
    };
    const generator = vi.fn();
    const result = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: completedEntries,
      job: await job(),
      identity,
      generator,
      read: vi.fn(),
    });

    expect(generator).not.toHaveBeenCalled();
    expect(result.job.phase).toBe('reconciling');
  });

  it('pins a resumed job to its persisted exact identity and rejects model drift', async () => {
    const pinnedJob = {
      ...(await job()),
      summarized: 1,
      summaryEligible: 2,
      summaryProviderId: identity.providerId,
      summaryConnectionId: identity.connectionId,
      summaryModelId: identity.modelId,
    };
    expect(resolveSiyuanSummaryIdentityForJob(pinnedJob)).toEqual({
      ...identity,
      effort: 'minimal',
    });
    const generator = vi.fn();
    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: entries(),
        job: pinnedJob,
        identity: { ...identity, modelId: 'different-default' },
        generator,
        read: async () => ({ ok: true, content: 'source' }),
      }),
    ).rejects.toThrow('siyuan_summary_model_identity_mismatch');
    expect(generator).not.toHaveBeenCalled();
  });

  it('preserves the original eligibility total after completed summaries resume', async () => {
    const completedEntries = entries();
    completedEntries[1] = {
      ...completedEntries[1]!,
      summary: 'Already complete.',
      summaryState: 'completed',
    };
    const resumedJob = {
      ...(await job()),
      summarized: 1,
      summaryEligible: 2,
      summaryProviderId: identity.providerId,
      summaryConnectionId: identity.connectionId,
      summaryModelId: identity.modelId,
    };
    const result = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: completedEntries,
      job: resumedJob,
      identity,
      generator: vi.fn(),
      read: vi.fn(),
    });
    expect(result.job.summaryEligible).toBe(2);
    expect(result.job.summarized).toBe(1);
  });

  it('adds newly discovered eligible files after prior summaries were skipped', async () => {
    const resumedJob = {
      ...(await job()),
      summarized: 5,
      skipped: 5,
      summaryEligible: 10,
      summaryProviderId: identity.providerId,
      summaryConnectionId: identity.connectionId,
      summaryModelId: identity.modelId,
    };
    const pending = entries();
    const result = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: pending,
      job: resumedJob,
      identity,
      generator: async () => ({
        summary: 'New summary.',
        ...identity,
        inputTokens: 1,
        outputTokens: 1,
        tokenProvenance: 'reported',
      }),
      read: async () => ({ ok: true, content: 'source' }),
    });
    expect(result.job.summaryEligible).toBe(11);
    expect(result.job.summarized).toBe(6);
  });

  it('keeps failed summaries retryable and clears the failed count after exact retry succeeds', async () => {
    const initialJob = await job();
    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: entries(),
        job: initialJob,
        identity,
        generator: async () => {
          throw new Error('temporary_summary_failure');
        },
        read: async () => ({ ok: true, content: 'source' }),
      }),
    ).rejects.toThrow('siyuan_summary_entries_failed');
    const failedJob = (await readSiyuanIndexJob('project-1', 'map-1'))!;
    const failedEntries = await readSiyuanIndexEntries('project-1', 'map-1');
    expect(failedJob).toMatchObject({ phase: 'summarizing', status: 'failed', failed: 1 });
    expect(failedEntries.find((entry) => entry.nodeId === 'path:src/index.ts')).toMatchObject({
      summaryState: 'failed',
    });

    await expect(
      runSiyuanSummaryPipeline({
        projectId: 'project-1',
        mapId: 'map-1',
        root: 'C:/repo',
        policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
        entries: failedEntries,
        job: { ...failedJob, status: 'running' },
        identity,
        generator: async () => {
          throw new Error('temporary_summary_failure_again');
        },
        read: async () => ({ ok: true, content: 'source' }),
      }),
    ).rejects.toThrow('siyuan_summary_entries_failed');
    const twiceFailedJob = (await readSiyuanIndexJob('project-1', 'map-1'))!;
    const twiceFailedEntries = await readSiyuanIndexEntries('project-1', 'map-1');
    expect(twiceFailedJob.failed).toBe(1);

    const retried = await runSiyuanSummaryPipeline({
      projectId: 'project-1',
      mapId: 'map-1',
      root: 'C:/repo',
      policy: { mode: 'all', selectedExtensions: [], selectedPaths: [] },
      entries: twiceFailedEntries,
      job: { ...twiceFailedJob, status: 'running' },
      identity,
      generator: async () => ({
        summary: 'Recovered summary.',
        ...identity,
        inputTokens: 2,
        outputTokens: 1,
        tokenProvenance: 'reported',
      }),
      read: async () => ({ ok: true, content: 'source' }),
    });
    expect(retried.job).toMatchObject({ phase: 'reconciling', failed: 0, summarized: 1 });
    expect(retried.entries.find((entry) => entry.nodeId === 'path:src/index.ts')).toMatchObject({
      summaryState: 'completed',
      summary: 'Recovered summary.',
    });
  });
});
