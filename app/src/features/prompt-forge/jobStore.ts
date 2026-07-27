import type { JarvisDexie } from '@/lib/db';
import { parsePromptForgeJob, type PromptForgeJob } from './contracts';

export type PromptForgeJobStoreErrorCode =
  | 'invalid_scope'
  | 'id_conflict'
  | 'revision_conflict'
  | 'stored_record_invalid';

export class PromptForgeJobStoreError extends Error {
  constructor(
    readonly code: PromptForgeJobStoreErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'PromptForgeJobStoreError';
  }
}

const SAFE_SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const MAX_RECOVERY_JOBS = 100;

function assertScopeId(value: string): void {
  if (typeof value !== 'string' || !SAFE_SCOPE_ID.test(value)) {
    throw new PromptForgeJobStoreError('invalid_scope');
  }
}

function parseStored(value: unknown): PromptForgeJob {
  try {
    return parsePromptForgeJob(value);
  } catch (error) {
    throw new PromptForgeJobStoreError(
      'stored_record_invalid',
      error instanceof Error ? error.message : undefined,
    );
  }
}

export function createPromptForgeJobStore(database: JarvisDexie) {
  return Object.freeze({
    async create(rawJob: PromptForgeJob): Promise<PromptForgeJob> {
      const job = parsePromptForgeJob(rawJob);
      return database.transaction('rw', database.prompt_forge_jobs, async () => {
        if (await database.prompt_forge_jobs.get(job.id)) {
          throw new PromptForgeJobStoreError('id_conflict');
        }
        await database.prompt_forge_jobs.add(structuredClone(job));
        return job;
      });
    },

    async save(rawJob: PromptForgeJob, expectedRevision: number): Promise<PromptForgeJob> {
      const job = parsePromptForgeJob(rawJob);
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        job.revision !== expectedRevision + 1
      ) {
        throw new PromptForgeJobStoreError('revision_conflict');
      }
      return database.transaction('rw', database.prompt_forge_jobs, async () => {
        const existingRaw = await database.prompt_forge_jobs.get(job.id);
        if (!existingRaw) throw new PromptForgeJobStoreError('revision_conflict');
        const existing = parseStored(existingRaw);
        if (
          existing.accountId !== job.accountId ||
          existing.chatId !== job.chatId ||
          existing.revision !== expectedRevision
        ) {
          throw new PromptForgeJobStoreError('revision_conflict');
        }
        await database.prompt_forge_jobs.put(structuredClone(job));
        return job;
      });
    },

    async get(accountId: string, jobId: string): Promise<PromptForgeJob | null> {
      assertScopeId(accountId);
      assertScopeId(jobId);
      const raw = await database.prompt_forge_jobs.get(jobId);
      if (!raw) return null;
      const job = parseStored(raw);
      return job.accountId === accountId ? job : null;
    },

    async listRecoverable(accountId: string, limit = 25): Promise<readonly PromptForgeJob[]> {
      assertScopeId(accountId);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECOVERY_JOBS) {
        throw new PromptForgeJobStoreError('invalid_scope');
      }
      const raw = await database.prompt_forge_jobs
        .where('[accountId+updatedAt]')
        .between([accountId, 0], [accountId, Number.MAX_SAFE_INTEGER], true, true)
        .reverse()
        .filter((row) => row.status !== 'cancelled')
        .limit(limit)
        .toArray();
      return Object.freeze(raw.map(parseStored));
    },

    async remove(accountId: string, jobId: string): Promise<boolean> {
      assertScopeId(accountId);
      assertScopeId(jobId);
      return database.transaction('rw', database.prompt_forge_jobs, async () => {
        const raw = await database.prompt_forge_jobs.get(jobId);
        if (!raw) return false;
        const job = parseStored(raw);
        if (job.accountId !== accountId) return false;
        await database.prompt_forge_jobs.delete(jobId);
        return true;
      });
    },
  });
}
