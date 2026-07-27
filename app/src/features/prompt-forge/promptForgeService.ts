import type { LLMStreamChunk } from '@/lib/ai/types';
import {
  transitionPromptForgeJob,
  type PromptForgeJob,
  type PromptForgeJobScope,
  type PromptForgeResolvedModelSnapshot,
  type PromptForgeSourceMetadata,
  type PromptForgeStatus,
  type PromptForgeUsageSnapshot,
} from './contracts';
import type { PromptForgeExecutionInput, PromptForgeExecutionResult } from './promptForgeExecutor';
import type { ResolvedPromptForgeModel } from './modelSelection';
import type { PromptPreservationContract } from './preservation';
import type { PromptForgeSourcePack } from './sourcePack';

const PREPARATION_STAGES = new Set<PromptForgeStatus>([
  'searching_project',
  'searching_public_sources',
  'building_source_pack',
]);
const INTERRUPTED_STAGES = new Set<PromptForgeStatus>([
  'collecting_context',
  'searching_project',
  'searching_public_sources',
  'building_source_pack',
  'generating',
  'validating',
]);

export interface PromptForgeJobRepository {
  create(job: PromptForgeJob): Promise<PromptForgeJob>;
  save(job: PromptForgeJob, expectedRevision: number): Promise<PromptForgeJob>;
  get(accountId: string, jobId: string): Promise<PromptForgeJob | null>;
  listRecoverable(scope: PromptForgeJobScope, limit?: number): Promise<readonly PromptForgeJob[]>;
  remove(accountId: string, jobId: string): Promise<boolean>;
}

export type PromptForgePreparation = Readonly<{
  resolvedModel: ResolvedPromptForgeModel;
  sourcePack: PromptForgeSourcePack;
  preservation: PromptPreservationContract;
  sourcesConsidered: number;
}>;

export type PromptForgeActivity = Readonly<{
  jobId: string;
  chatId: string;
  status: PromptForgeStatus;
  modelLabel: string;
  sourcesConsidered: number;
  sourcesUsed: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}>;

export type PromptForgeServiceErrorCode =
  | 'already_running'
  | 'job_not_found'
  | 'privacy_violation'
  | 'public_research_not_authorized'
  | 'invalid_preparation';

export class PromptForgeServiceError extends Error {
  constructor(readonly code: PromptForgeServiceErrorCode) {
    super(code);
    this.name = 'PromptForgeServiceError';
  }
}

export type PromptForgeRunOptions = Readonly<{
  signal?: AbortSignal;
  workingDirectory?: string;
  onChunk?: (chunk: LLMStreamChunk) => void;
}>;

export type PromptForgePreparer = (
  input: Readonly<{
    job: PromptForgeJob;
    signal: AbortSignal;
    stage: (
      status: Extract<
        PromptForgeStatus,
        'searching_project' | 'searching_public_sources' | 'building_source_pack'
      >,
    ) => Promise<void>;
  }>,
) => Promise<PromptForgePreparation>;

export type PromptForgeExecutorPort = Readonly<{
  execute(input: PromptForgeExecutionInput): Promise<PromptForgeExecutionResult>;
}>;

type ActiveRun = Readonly<{ controller: AbortController }>;

function runKey(accountId: string, jobId: string): string {
  return `${accountId}\u0000${jobId}`;
}

const activeRuns = new Map<string, ActiveRun>();

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  );
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Prompt Forge was cancelled.', 'AbortError');
}

function sourceMetadata(sourcePack: PromptForgeSourcePack): readonly PromptForgeSourceMetadata[] {
  return Object.freeze(
    sourcePack.sources.map((source) =>
      Object.freeze({
        id: source.id,
        kind: source.kind,
        label: source.label,
        reference: source.reference,
        observedAt: source.observedAt,
        whySelected: source.whySelected,
      }),
    ),
  );
}

function resolvedModelSnapshot(model: ResolvedPromptForgeModel): PromptForgeResolvedModelSnapshot {
  return Object.freeze({
    providerId: model.providerId,
    modelId: model.modelId,
    label: model.label,
    connectionId: model.connectionId,
    connectionMode: model.connectionMode,
    local: model.local,
    billingClass: model.billingClass,
  });
}

function usageSnapshot(result: PromptForgeExecutionResult): PromptForgeUsageSnapshot {
  return Object.freeze({
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    costUsd: result.usage.cost_usd,
    finishReason: result.finishReason,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  });
}

function safeFailureCode(error: unknown, phase: 'preparation' | 'execution'): string {
  if (error instanceof PromptForgeServiceError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (
      typeof code === 'string' &&
      [
        'current_chat_not_single',
        'model_unavailable',
        'connection_ambiguous',
        'offline_cloud_blocked',
        'empty_output',
        'model_mismatch',
        'sensitive_input',
      ].includes(code)
    ) {
      return code;
    }
  }
  return phase === 'preparation' ? 'preparation_failed' : 'provider_failed';
}

export function createPromptForgeService(
  dependencies: Readonly<{
    repository: PromptForgeJobRepository;
    prepare: PromptForgePreparer;
    executor: PromptForgeExecutorPort;
    now?: () => number;
    onActivity?: (activity: PromptForgeActivity) => void;
  }>,
) {
  const { repository, prepare, executor } = dependencies;
  const now = dependencies.now ?? Date.now;
  function emitActivity(
    job: PromptForgeJob,
    state: Readonly<{
      modelLabel: string;
      sourcesConsidered: number;
      sourcesUsed: number;
      startedAt: number;
      error?: string;
    }>,
  ): void {
    if (!dependencies.onActivity) return;
    const terminal = ['ready', 'cancelled', 'failed'].includes(job.status);
    try {
      dependencies.onActivity(
        Object.freeze({
          jobId: job.id,
          chatId: job.chatId,
          status: job.status,
          modelLabel: state.modelLabel,
          sourcesConsidered: state.sourcesConsidered,
          sourcesUsed: state.sourcesUsed,
          startedAt: state.startedAt,
          ...(terminal && job.completedAt !== null ? { completedAt: job.completedAt } : {}),
          ...(state.error === undefined ? {} : { error: state.error }),
        }),
      );
    } catch {
      // Diagnostics must never break or alter the upgrade.
    }
  }

  async function saveTransition(
    job: PromptForgeJob,
    update: Parameters<typeof transitionPromptForgeJob>[1],
  ): Promise<PromptForgeJob> {
    const next = transitionPromptForgeJob(job, update);
    return repository.save(next, job.revision);
  }

  async function runExisting(
    initial: PromptForgeJob,
    controller: AbortController,
    options: PromptForgeRunOptions,
  ): Promise<PromptForgeJob> {
    let job = initial;
    let phase: 'preparation' | 'execution' = 'preparation';
    const startedAt = now();
    let modelLabel = job.resolvedModel?.label ?? 'Resolving model';
    let sourcesConsidered = 0;
    let sourcesUsed = 0;

    const relayAbort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener('abort', relayAbort, { once: true });

    try {
      if (INTERRUPTED_STAGES.has(job.status)) {
        job = await saveTransition(job, {
          expectedRevision: job.revision,
          status: 'failed',
          errorCode: 'interrupted',
          now: now(),
        });
      }
      abortIfRequested(controller.signal);
      job = await saveTransition(job, {
        expectedRevision: job.revision,
        status: 'collecting_context',
        selectedSourceIds: [],
        retrievedSources: [],
        resolvedModel: null,
        usage: null,
        generatedDraft: null,
        validation: null,
        errorCode: null,
        now: now(),
      });
      emitActivity(job, {
        modelLabel,
        sourcesConsidered,
        sourcesUsed,
        startedAt,
      });

      const stage = async (
        status: Extract<
          PromptForgeStatus,
          'searching_project' | 'searching_public_sources' | 'building_source_pack'
        >,
      ): Promise<void> => {
        abortIfRequested(controller.signal);
        if (!PREPARATION_STAGES.has(status) || job.status === status) return;
        job = await saveTransition(job, {
          expectedRevision: job.revision,
          status,
          now: now(),
        });
        emitActivity(job, {
          modelLabel,
          sourcesConsidered,
          sourcesUsed,
          startedAt,
        });
      };

      const prepared = await prepare({ job, signal: controller.signal, stage });
      abortIfRequested(controller.signal);
      if (
        !Number.isSafeInteger(prepared.sourcesConsidered) ||
        prepared.sourcesConsidered < prepared.sourcePack.sources.length ||
        prepared.sourcesConsidered > 10_000
      ) {
        throw new PromptForgeServiceError('invalid_preparation');
      }
      if (job.privacyMode === 'local_only' && !prepared.resolvedModel.local) {
        throw new PromptForgeServiceError('privacy_violation');
      }
      if (
        !job.allowPublicResearch &&
        prepared.sourcePack.sources.some((source) => source.kind === 'public_web')
      ) {
        throw new PromptForgeServiceError('public_research_not_authorized');
      }
      modelLabel = prepared.resolvedModel.label;
      sourcesConsidered = prepared.sourcesConsidered;
      sourcesUsed = prepared.sourcePack.sources.length;
      if (job.status !== 'building_source_pack') await stage('building_source_pack');
      const retrievedSources = sourceMetadata(prepared.sourcePack);
      job = await saveTransition(job, {
        expectedRevision: job.revision,
        status: 'generating',
        selectedSourceIds: retrievedSources.map((source) => source.id),
        retrievedSources,
        resolvedModel: resolvedModelSnapshot(prepared.resolvedModel),
        now: now(),
      });
      emitActivity(job, {
        modelLabel,
        sourcesConsidered,
        sourcesUsed,
        startedAt,
      });

      phase = 'execution';
      const result = await executor.execute({
        job,
        model: prepared.resolvedModel,
        sourcePack: prepared.sourcePack,
        preservation: prepared.preservation,
        signal: controller.signal,
        ...(options.workingDirectory === undefined
          ? {}
          : { workingDirectory: options.workingDirectory }),
        ...(options.onChunk === undefined ? {} : { onChunk: options.onChunk }),
      });
      abortIfRequested(controller.signal);
      job = await saveTransition(job, {
        expectedRevision: job.revision,
        status: 'validating',
        generatedDraft: result.upgradedPrompt,
        usage: usageSnapshot(result),
        now: now(),
      });
      emitActivity(job, {
        modelLabel,
        sourcesConsidered,
        sourcesUsed,
        startedAt,
      });

      abortIfRequested(controller.signal);
      job = await saveTransition(job, {
        expectedRevision: job.revision,
        status: 'ready',
        validation: {
          passed: result.validation.passed,
          missingCount: result.validation.missing.length,
          checkedAt: now(),
        },
        now: now(),
      });
      emitActivity(job, {
        modelLabel,
        sourcesConsidered,
        sourcesUsed,
        startedAt,
      });
      return job;
    } catch (error) {
      const cancelled = isAbortError(error) || controller.signal.aborted;
      const errorCode = cancelled ? undefined : safeFailureCode(error, phase);
      if (!['ready', 'cancelled', 'failed'].includes(job.status)) {
        job = await saveTransition(job, {
          expectedRevision: job.revision,
          status: cancelled ? 'cancelled' : 'failed',
          ...(errorCode === undefined ? {} : { errorCode }),
          now: now(),
        });
        emitActivity(job, {
          modelLabel,
          sourcesConsidered,
          sourcesUsed,
          startedAt,
          ...(errorCode === undefined ? {} : { error: errorCode }),
        });
        return job;
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', relayAbort);
    }
  }

  function launch(
    accountId: string,
    jobId: string,
    load: () => Promise<PromptForgeJob>,
    options: PromptForgeRunOptions,
  ): Promise<PromptForgeJob> {
    const key = runKey(accountId, jobId);
    if (activeRuns.has(key)) {
      return Promise.reject(new PromptForgeServiceError('already_running'));
    }
    const controller = new AbortController();
    activeRuns.set(key, Object.freeze({ controller }));
    return load()
      .then((job) => runExisting(job, controller, options))
      .finally(() => {
        activeRuns.delete(key);
      });
  }

  return Object.freeze({
    start(job: PromptForgeJob, options: PromptForgeRunOptions = {}): Promise<PromptForgeJob> {
      return launch(job.accountId, job.id, async () => repository.create(job), options);
    },

    resume(
      accountId: string,
      jobId: string,
      options: PromptForgeRunOptions = {},
    ): Promise<PromptForgeJob> {
      return launch(
        accountId,
        jobId,
        async () => {
          const job = await repository.get(accountId, jobId);
          if (!job) throw new PromptForgeServiceError('job_not_found');
          return job;
        },
        options,
      );
    },

    async cancel(accountId: string, jobId: string): Promise<boolean> {
      const active = activeRuns.get(runKey(accountId, jobId));
      if (active) {
        active.controller.abort();
        return true;
      }
      const job = await repository.get(accountId, jobId);
      if (!job || job.status === 'cancelled' || job.status === 'failed') return false;
      const cancelled = await saveTransition(job, {
        expectedRevision: job.revision,
        status: 'cancelled',
        now: now(),
      });
      emitActivity(cancelled, {
        modelLabel: cancelled.resolvedModel?.label ?? 'Not selected',
        sourcesConsidered: cancelled.retrievedSources.length,
        sourcesUsed: cancelled.retrievedSources.length,
        startedAt: cancelled.createdAt,
      });
      return true;
    },

    async recoverInterrupted(scope: PromptForgeJobScope): Promise<readonly PromptForgeJob[]> {
      const jobs = await repository.listRecoverable(scope);
      const recovered: PromptForgeJob[] = [];
      for (const current of jobs) {
        if (
          INTERRUPTED_STAGES.has(current.status) &&
          !activeRuns.has(runKey(current.accountId, current.id))
        ) {
          const interrupted = await saveTransition(current, {
            expectedRevision: current.revision,
            status: 'failed',
            errorCode: 'interrupted',
            now: now(),
          });
          emitActivity(interrupted, {
            modelLabel: interrupted.resolvedModel?.label ?? 'Not selected',
            sourcesConsidered: interrupted.retrievedSources.length,
            sourcesUsed: interrupted.retrievedSources.length,
            startedAt: interrupted.createdAt,
            error: 'interrupted',
          });
          recovered.push(interrupted);
        } else {
          recovered.push(current);
        }
      }
      return Object.freeze(recovered);
    },

    discard(accountId: string, jobId: string): Promise<boolean> {
      if (activeRuns.has(runKey(accountId, jobId))) {
        return Promise.reject(new PromptForgeServiceError('already_running'));
      }
      return repository.remove(accountId, jobId);
    },
  });
}
