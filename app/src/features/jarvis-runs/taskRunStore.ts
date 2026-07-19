import { create } from 'zustand';

export type JarvisTaskRunStatus =
  | 'planning'
  | 'waiting-for-approval'
  | 'running'
  | 'waiting-for-input'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JarvisTaskStepStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface JarvisTaskStep {
  id: string;
  action: string;
  label: string;
  input: Record<string, unknown>;
  recoverable: boolean;
  status: JarvisTaskStepStatus;
  summary?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JarvisTaskRun {
  id: string;
  chatId?: string;
  goal: string;
  status: JarvisTaskRunStatus;
  steps: JarvisTaskStep[];
  progress: number;
  activeAgents: string[];
  activeTerminals: string[];
  userVisibleSummary: string;
  /** ISO timestamp for when the run was first accepted by the executor. */
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export function presentLegacyJarvisTaskRun(run: Readonly<JarvisTaskRun>) {
  return Object.freeze({
    kind: 'legacy_non_executable' as const,
    runId: run.id,
    status: run.status,
    message:
      'This historical task card is view-only. Review current state and retry manually if needed.',
  });
}

const REDACTED = '[redacted]';
const SENSITIVE_INPUT_KEY_RE =
  /(?:authorization|cookie|token|jwt|api[_-]?key|apikey|password|secret|credential|private[_-]?key|signing[_-]?key|service[_-]?role)/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bwhsec_[A-Za-z0-9_]{8,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|token|password|client[-_ ]?secret|private[-_ ]?key|secret)\s*(?:[:=]|\bis\b)\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
];

function redactTaskString(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.stringify(sanitizeTaskValue(JSON.parse(trimmed), 0));
    } catch {
      // Non-JSON strings are still scanned by the credential patterns below.
    }
  }
  return SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, REDACTED),
    value,
  );
}

function sanitizeTaskValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactTaskString(value);
  if (depth >= 8) return '[truncated]';
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitizeTaskValue(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, child]) => [
        key,
        SENSITIVE_INPUT_KEY_RE.test(key) ? REDACTED : sanitizeTaskValue(child, depth + 1),
      ]),
  );
}

function sanitizeTaskInput(input: Record<string, unknown> | undefined): Record<string, unknown> {
  return sanitizeTaskValue(input ?? {}, 0) as Record<string, unknown>;
}

function sanitizeRun(run: JarvisTaskRun): JarvisTaskRun {
  return {
    ...run,
    goal: redactTaskString(run.goal),
    userVisibleSummary: redactTaskString(run.userVisibleSummary),
    steps: run.steps.map((step) => ({
      ...step,
      label: redactTaskString(step.label),
      input: sanitizeTaskInput(step.input),
      summary: step.summary === undefined ? undefined : redactTaskString(step.summary),
      error: step.error === undefined ? undefined : redactTaskString(step.error),
    })),
  };
}

interface NewJarvisTaskRun {
  id?: string;
  chatId?: string;
  goal: string;
  status?: JarvisTaskRunStatus;
  steps: Array<
    Pick<JarvisTaskStep, 'id' | 'action' | 'label' | 'recoverable'> & Partial<JarvisTaskStep>
  >;
}

interface JarvisTaskRunStore {
  /** Cryptographic, non-identifying account storage scope. */
  accountScope: string;
  runs: Record<string, JarvisTaskRun>;
  setAccountScope: (scope: string) => void;
  replaceForAccount: (scope: string, runs: JarvisTaskRun[]) => void;
  addRun: (run: JarvisTaskRun) => void;
  patchRun: (runId: string, patch: Partial<Omit<JarvisTaskRun, 'id' | 'steps'>>) => void;
  updateStep: (runId: string, stepId: string, patch: Partial<Omit<JarvisTaskStep, 'id'>>) => void;
  removeRun: (runId: string) => void;
  recoverInterruptedRuns: () => void;
  /** @deprecated View compatibility only; canonical cancellation is injected by Task 16B. */
  cancelRun: (runId: string) => void;
  clearForTests: () => void;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `jarvis-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarize(steps: JarvisTaskStep[]): { progress: number; summary: string } {
  if (steps.length === 0) return { progress: 0, summary: 'Preparing task' };
  const completed = steps.filter((step) => step.status === 'completed').length;
  return {
    progress: Math.round((completed / steps.length) * 100),
    summary: `${completed}/${steps.length} steps completed`,
  };
}

function normalizeRun(run: JarvisTaskRun): JarvisTaskRun {
  const sanitized = sanitizeRun(run);
  const { progress, summary } = summarize(sanitized.steps);
  return {
    ...sanitized,
    progress,
    userVisibleSummary: summary,
    updatedAt: new Date().toISOString(),
  };
}

export function createJarvisTaskRun(input: NewJarvisTaskRun): JarvisTaskRun {
  const now = new Date().toISOString();
  const steps = input.steps.map((step) => ({
    ...step,
    input: sanitizeTaskInput(step.input),
    status: step.status ?? 'pending',
  }));
  const { progress, summary } = summarize(steps);
  return {
    id: input.id ?? makeId(),
    chatId: input.chatId,
    goal: redactTaskString(input.goal.trim()),
    status: input.status ?? 'planning',
    steps,
    progress,
    activeAgents: [],
    activeTerminals: [],
    userVisibleSummary: summary,
    startedAt: now,
    updatedAt: now,
  };
}

export function recoverJarvisTaskRuns(runs: JarvisTaskRun[]): JarvisTaskRun[] {
  return runs.map((run) => {
    const normalizedRun = sanitizeRun(run);
    if (!['planning', 'waiting-for-approval', 'running'].includes(run.status)) return normalizedRun;

    const unfinished = normalizedRun.steps.filter(
      (step) => !['completed', 'cancelled'].includes(step.status),
    );
    const canRecover = unfinished.length > 0 && unfinished.every((step) => step.recoverable);
    if (canRecover) {
      return {
        ...normalizedRun,
        status: 'running',
        activeAgents: [],
        activeTerminals: [],
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...normalizedRun,
      status: 'waiting-for-input',
      activeAgents: [],
      activeTerminals: [],
      userVisibleSummary: 'Ready to resume with your confirmation.',
      updatedAt: new Date().toISOString(),
    };
  });
}

export const useJarvisTaskRunStore = create<JarvisTaskRunStore>()((set, get) => ({
  accountScope: '',
  runs: {},
  setAccountScope: (scope) => {
    if (scope === get().accountScope) return;
    set({ accountScope: scope, runs: {} });
  },
  replaceForAccount: (scope, runs) => {
    if (!scope || scope !== get().accountScope) return;
    const recovered = recoverJarvisTaskRuns(runs.map(sanitizeRun));
    set({
      runs: Object.fromEntries(recovered.map((run) => [run.id, run])),
    });
  },
  addRun: (run) => set((state) => ({ runs: { ...state.runs, [run.id]: sanitizeRun(run) } })),
  patchRun: (runId, patch) =>
    set((state) => {
      const current = state.runs[runId];
      if (!current) return state;
      const now = new Date().toISOString();
      const nextStatus = patch.status ?? current.status;
      const terminal = ['completed', 'failed', 'cancelled'].includes(nextStatus);
      const next = sanitizeRun({
        ...current,
        ...patch,
        completedAt: terminal ? (current.completedAt ?? now) : undefined,
        updatedAt: now,
      });
      return {
        runs: {
          ...state.runs,
          [runId]: next,
        },
      };
    }),
  updateStep: (runId, stepId, patch) =>
    set((state) => {
      const current = state.runs[runId];
      if (!current) return state;
      const safePatch =
        patch.input === undefined ? patch : { ...patch, input: sanitizeTaskInput(patch.input) };
      const steps = current.steps.map((step) =>
        step.id === stepId ? { ...step, ...safePatch } : step,
      );
      return {
        runs: { ...state.runs, [runId]: normalizeRun({ ...current, steps }) },
      };
    }),
  removeRun: (runId) =>
    set((state) => {
      const runs = { ...state.runs };
      delete runs[runId];
      return { runs };
    }),
  recoverInterruptedRuns: () =>
    set((state) => ({
      runs: Object.fromEntries(
        recoverJarvisTaskRuns(Object.values(state.runs)).map((run) => [run.id, run]),
      ),
    })),
  cancelRun: (_runId) => undefined,
  clearForTests: () => set({ accountScope: '', runs: {} }),
}));
