import { privateAccountDirectory } from '@/features/jarvis-memory/accountStorage';

import {
  sanitizeLegacyJarvisTaskRun,
  type JarvisTaskRun,
  type JarvisTaskRunStatus,
  type JarvisTaskStepStatus,
} from './taskRunStore';

const LEGACY_KEY = 'jarvis-task-runs-v1';
const KEY_PREFIX = 'jarvis-task-runs-v2:';
const MAX_LEGACY_RUNS = 100;
const RUN_STATUSES = new Set<JarvisTaskRunStatus>([
  'planning',
  'waiting-for-approval',
  'running',
  'waiting-for-input',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);
const STEP_STATUSES = new Set<JarvisTaskStepStatus>([
  'pending',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
]);

function readOnlyLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isLegacyTaskRun(value: unknown): value is JarvisTaskRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<JarvisTaskRun>;
  return Boolean(
    typeof run.id === 'string' &&
    run.id.trim() &&
    typeof run.goal === 'string' &&
    typeof run.status === 'string' &&
    RUN_STATUSES.has(run.status as JarvisTaskRunStatus) &&
    typeof run.startedAt === 'string' &&
    typeof run.updatedAt === 'string' &&
    typeof run.userVisibleSummary === 'string' &&
    typeof run.progress === 'number' &&
    Array.isArray(run.activeAgents) &&
    Array.isArray(run.activeTerminals) &&
    Array.isArray(run.steps) &&
    run.steps.every(
      (step) =>
        Boolean(step) &&
        typeof step.id === 'string' &&
        typeof step.action === 'string' &&
        typeof step.label === 'string' &&
        typeof step.status === 'string' &&
        STEP_STATUSES.has(step.status as JarvisTaskStepStatus) &&
        typeof step.recoverable === 'boolean',
    ),
  );
}

function parseLegacyRuns(raw: string | null): JarvisTaskRun[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { runs?: unknown; state?: { runs?: unknown } };
    const candidate = parsed.runs ?? parsed.state?.runs;
    const rows = Array.isArray(candidate)
      ? candidate
      : candidate && typeof candidate === 'object'
        ? Object.values(candidate as Record<string, unknown>)
        : [];
    return rows.filter(isLegacyTaskRun).slice(0, MAX_LEGACY_RUNS).map(sanitizeLegacyJarvisTaskRun);
  } catch {
    return [];
  }
}

export async function readLegacyJarvisTaskRunsOnce(input: {
  accountId: string;
}): Promise<readonly JarvisTaskRun[]> {
  const accountId = input.accountId.trim();
  if (!accountId) throw new TypeError('Canonical account id is required.');
  const scope = await privateAccountDirectory(accountId);
  const current = parseLegacyRuns(readOnlyLocalStorage(`${KEY_PREFIX}${scope}`));
  if (current.length > 0) return current;
  return parseLegacyRuns(readOnlyLocalStorage(LEGACY_KEY));
}
