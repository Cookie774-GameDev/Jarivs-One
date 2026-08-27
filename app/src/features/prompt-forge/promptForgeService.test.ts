import { describe, expect, it, vi } from 'vitest';
import type { ChatImageAttachment } from '@/lib/ai/vision';
import { createPromptForgeJob, transitionPromptForgeJob, type PromptForgeJob } from './contracts';
import type { PromptForgeExecutionInput, PromptForgeExecutionResult } from './promptForgeExecutor';
import type { ResolvedPromptForgeModel } from './modelSelection';
import type { PromptPreservationContract } from './preservation';
import type { PromptForgeSourcePack } from './sourcePack';
import {
  createPromptForgeService,
  type PromptForgeActivity,
  type PromptForgeJobRepository,
} from './promptForgeService';

function initialJob(id = 'forge-job-1'): PromptForgeJob {
  return createPromptForgeJob({
    id,
    accountId: 'account-1',
    chatId: 'chat-1',
    projectId: 'project-1',
    originalDraft: 'Keep "the original" unchanged.',
    originalAttachments: [],
    modelSelection: { mode: 'prefer_local' },
    privacyMode: 'local_only',
    allowPublicResearch: false,
    now: 100,
  });
}

const resolvedModel: ResolvedPromptForgeModel = Object.freeze({
  providerId: 'ollama',
  modelId: 'qwen3:8b',
  label: 'Qwen 3 8B',
  connectionId: 'ollama-local',
  connectionMode: 'local',
  effort: 'high',
  local: true,
  billingClass: 'local_free',
});

const sourcePack: PromptForgeSourcePack = Object.freeze({
  markdown: 'PRIVATE SOURCE BODY THAT MUST NOT ENTER ACTIVITY',
  sources: Object.freeze([
    Object.freeze({
      id: 'source-1',
      kind: 'project_file' as const,
      label: 'Composer.tsx',
      reference: 'app/src/features/chat/Composer.tsx',
      explicit: true,
      projectScoped: true,
      trust: 'project' as const,
      observedAt: 120,
      whySelected: 'The active composer implementation.',
      rankScore: 100,
    }),
  ]),
  warnings: Object.freeze([]),
  builtAt: 120,
});

const preservation: PromptPreservationContract = Object.freeze({
  schemaVersion: 1,
  originalLength: 30,
  elements: Object.freeze([Object.freeze({ kind: 'quote' as const, value: '"the original"' })]),
});

function executionResult(): PromptForgeExecutionResult {
  return Object.freeze({
    upgradedPrompt: 'Objective: Keep "the original" unchanged.',
    validation: Object.freeze({
      passed: true,
      missing: Object.freeze([]),
      preservedCount: 1,
      checkedCount: 1,
    }),
    usage: Object.freeze({ input_tokens: 40, output_tokens: 25, cost_usd: 0 }),
    provider: 'ollama',
    model: 'qwen3:8b',
    finishReason: 'stop',
    startedAt: 150,
    completedAt: 175,
  });
}

function memoryRepository(seed: readonly PromptForgeJob[] = []) {
  const rows = new Map(seed.map((job) => [job.id, job]));
  const savedStatuses: PromptForgeJob['status'][] = [];
  const repository: PromptForgeJobRepository = {
    async create(job) {
      if (rows.has(job.id)) throw new Error('id_conflict');
      rows.set(job.id, job);
      return job;
    },
    async save(job, expectedRevision) {
      const current = rows.get(job.id);
      if (!current || current.revision !== expectedRevision) throw new Error('revision_conflict');
      rows.set(job.id, job);
      savedStatuses.push(job.status);
      return job;
    },
    async get(accountId, jobId) {
      const job = rows.get(jobId);
      return job?.accountId === accountId ? job : null;
    },
    async listRecoverable(scope) {
      return [...rows.values()].filter(
        (job) =>
          job.accountId === scope.accountId &&
          job.chatId === scope.chatId &&
          job.projectId === scope.projectId &&
          job.status !== 'cancelled',
      );
    },
    async remove(accountId, jobId) {
      const job = rows.get(jobId);
      return job?.accountId === accountId ? rows.delete(jobId) : false;
    },
  };
  return { repository, rows, savedStatuses };
}

function clock(start = 200): () => number {
  let now = start;
  return () => now++;
}

describe('Prompt Forge orchestration', () => {
  it('persists every truthful stage, exact model/usage, validation, and privacy-safe activity', async () => {
    const memory = memoryRepository();
    const activity: PromptForgeActivity[] = [];
    const execute = vi.fn(async (input: PromptForgeExecutionInput) => {
      expect(input.model).toMatchObject({
        providerId: 'ollama',
        modelId: 'qwen3:8b',
        connectionId: 'ollama-local',
        effort: 'high',
      });
      return executionResult();
    });
    const service = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      onActivity: (event) => activity.push(event),
      prepare: async ({ stage }) => {
        await stage('searching_project');
        return { resolvedModel, sourcePack, preservation, sourcesConsidered: 4 };
      },
      executor: { execute },
    });

    const ready = await service.start(initialJob());

    expect(memory.savedStatuses).toEqual([
      'collecting_context',
      'searching_project',
      'building_source_pack',
      'generating',
      'validating',
      'ready',
    ]);
    expect(ready).toMatchObject({
      status: 'ready',
      originalDraft: 'Keep "the original" unchanged.',
      generatedDraft: 'Objective: Keep "the original" unchanged.',
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3:8b',
        connectionId: 'ollama-local',
        effort: 'high',
        billingClass: 'local_free',
      },
      usage: {
        inputTokens: 40,
        outputTokens: 25,
        costUsd: 0,
        finishReason: 'stop',
      },
      validation: { passed: true, missingCount: 0 },
      selectedSourceIds: ['source-1'],
    });
    expect(activity.at(-1)).toMatchObject({
      status: 'ready',
      modelLabel: 'Qwen 3 8B',
      sourcesConsidered: 4,
      sourcesUsed: 1,
    });
    expect(JSON.stringify(activity)).not.toContain(sourcePack.markdown);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('forwards image bytes ephemerally without saving them in the recoverable job', async () => {
    const memory = memoryRepository();
    const image: ChatImageAttachment = Object.freeze({
      id: 'image-1',
      name: 'diagram.png',
      mimeType: 'image/png',
      data: 'iVBORw0KGgo=',
      sourcePath: 'C:\\private\\diagram.png',
      size: 8,
    });
    let executionInput: PromptForgeExecutionInput | null = null;
    const service = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      prepare: async () => ({ resolvedModel, sourcePack, preservation, sourcesConsidered: 1 }),
      executor: {
        execute: async (input) => {
          executionInput = input;
          return executionResult();
        },
      },
    });

    const ready = await service.start(initialJob('forge-job-image'), {
      imageAttachments: [image],
    });

    expect(executionInput).toMatchObject({ imageAttachments: [image] });
    expect(JSON.stringify(ready)).not.toContain(image.data);
    expect(JSON.stringify(memory.rows.get('forge-job-image'))).not.toContain(image.data);
  });

  it('delivers cancellation to the active executor and never commits a later success', async () => {
    const memory = memoryRepository();
    let executionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      executionStarted = resolve;
    });
    const service = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      prepare: async () => ({
        resolvedModel,
        sourcePack,
        preservation,
        sourcesConsidered: 1,
      }),
      executor: {
        execute: async ({ signal }) => {
          executionStarted();
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('cancelled', 'AbortError')),
              { once: true },
            );
          });
          return executionResult();
        },
      },
    });

    const running = service.start(initialJob('forge-job-cancel'));
    await started;
    await expect(service.cancel('account-1', 'forge-job-cancel')).resolves.toBe(true);
    const cancelled = await running;

    expect(cancelled.status).toBe('cancelled');
    expect(memory.savedStatuses.at(-1)).toBe('cancelled');
    expect(memory.savedStatuses).not.toContain('ready');
  });

  it('stores only a bounded error category when a provider exposes sensitive failure text', async () => {
    const memory = memoryRepository();
    const activity: PromptForgeActivity[] = [];
    const service = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      onActivity: (event) => activity.push(event),
      prepare: async () => ({
        resolvedModel,
        sourcePack,
        preservation,
        sourcesConsidered: 1,
      }),
      executor: {
        execute: async () => {
          throw new Error('provider failed with sk-secret-value');
        },
      },
    });

    const failed = await service.start(initialJob('forge-job-failed'));

    expect(failed).toMatchObject({ status: 'failed', errorCode: 'provider_failed' });
    expect(JSON.stringify(failed)).not.toContain('sk-secret-value');
    expect(JSON.stringify(activity)).not.toContain('sk-secret-value');
  });

  it('fails closed before execution when privacy or public-research authority is violated', async () => {
    const cloudModel: ResolvedPromptForgeModel = Object.freeze({
      ...resolvedModel,
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      connectionId: 'openai-api',
      connectionMode: 'native-api',
      local: false,
      billingClass: 'provider_billed',
    });
    const execute = vi.fn(async () => executionResult());
    const privateMemory = memoryRepository();
    const privateService = createPromptForgeService({
      repository: privateMemory.repository,
      now: clock(),
      prepare: async () => ({
        resolvedModel: cloudModel,
        sourcePack,
        preservation,
        sourcesConsidered: 1,
      }),
      executor: { execute },
    });
    const privacyFailure = await privateService.start(initialJob('forge-job-private'));
    expect(privacyFailure).toMatchObject({
      status: 'failed',
      errorCode: 'privacy_violation',
    });

    const publicPack: PromptForgeSourcePack = Object.freeze({
      ...sourcePack,
      sources: Object.freeze([
        Object.freeze({
          ...sourcePack.sources[0]!,
          id: 'public-source-1',
          kind: 'public_web' as const,
          reference: 'https://example.com/reference',
          trust: 'external' as const,
        }),
      ]),
    });
    const publicMemory = memoryRepository();
    const publicService = createPromptForgeService({
      repository: publicMemory.repository,
      now: clock(),
      prepare: async () => ({
        resolvedModel,
        sourcePack: publicPack,
        preservation,
        sourcesConsidered: 1,
      }),
      executor: { execute },
    });
    const publicFailure = await publicService.start(initialJob('forge-job-public'));
    expect(publicFailure).toMatchObject({
      status: 'failed',
      errorCode: 'public_research_not_authorized',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('marks stale active jobs interrupted, then supports explicit resume and discard', async () => {
    const stale = transitionPromptForgeJob(initialJob('forge-job-recovery'), {
      expectedRevision: 1,
      status: 'collecting_context',
      now: 110,
    });
    const memory = memoryRepository([stale]);
    const service = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      prepare: async () => ({
        resolvedModel,
        sourcePack,
        preservation,
        sourcesConsidered: 1,
      }),
      executor: { execute: async () => executionResult() },
    });

    const recovered = await service.recoverInterrupted({
      accountId: 'account-1',
      chatId: 'chat-1',
      projectId: 'project-1',
    });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ status: 'failed', errorCode: 'interrupted' });

    const resumed = await service.resume('account-1', stale.id);
    expect(resumed.status).toBe('ready');
    await expect(service.discard('account-1', stale.id)).resolves.toBe(true);
    expect(memory.rows.has(stale.id)).toBe(false);
  });

  it('refuses overlapping runs for the same account-scoped job', async () => {
    const memory = memoryRepository();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      prepare: async () => {
        await blocked;
        return { resolvedModel, sourcePack, preservation, sourcesConsidered: 1 };
      },
      executor: { execute: vi.fn(async () => executionResult()) },
    });
    const first = service.start(initialJob('forge-job-overlap'));

    await expect(service.resume('account-1', 'forge-job-overlap')).rejects.toMatchObject({
      code: 'already_running',
    });
    release();
    await first;
  });

  it('does not recover a job that is active in another service instance', async () => {
    const memory = memoryRepository();
    let preparationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      preparationStarted = resolve;
    });
    let releasePreparation!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    const activeService = createPromptForgeService({
      repository: memory.repository,
      now: clock(),
      prepare: async () => {
        preparationStarted();
        await blocked;
        return { resolvedModel, sourcePack, preservation, sourcesConsidered: 1 };
      },
      executor: { execute: async () => executionResult() },
    });
    const recoveryService = createPromptForgeService({
      repository: memory.repository,
      now: clock(300),
      prepare: async () => ({
        resolvedModel,
        sourcePack,
        preservation,
        sourcesConsidered: 1,
      }),
      executor: { execute: async () => executionResult() },
    });
    const running = activeService.start(initialJob('forge-job-cross-service'));
    await started;

    const recovered = await recoveryService.recoverInterrupted({
      accountId: 'account-1',
      chatId: 'chat-1',
      projectId: 'project-1',
    });
    releasePreparation();

    expect(recovered[0]?.status).toBe('collecting_context');
    await expect(running).resolves.toMatchObject({ status: 'ready' });
  });
});
