import type {
  AllocateJarvisRunInput,
  CompiledJarvisPrompt,
  JarvisRequestEnvelope,
  JarvisRun,
  PromptAuthority,
  TransitionJarvisRunInput,
} from '@/lib/jarvis/contracts';
import type { JarvisRequestAttempt, JarvisRequestInput } from '@/lib/jarvis/requestEnvelope';

export type JarvisRunCreateInput = AllocateJarvisRunInput;

export interface JarvisShadowLayerDiagnostic {
  id: string;
  authority: PromptAuthority;
  charCount: number;
  truncated: boolean;
  contentHash: string;
}

export interface JarvisShadowDiagnostic {
  mode: 'shadow';
  requestId: string;
  runId: string;
  promptHash?: string;
  layers: readonly JarvisShadowLayerDiagnostic[];
  errorCategory?: string;
  durationMs: number;
}

export interface JarvisShadowCompilationDeps {
  createPersistedRun(input: JarvisRunCreateInput): Promise<JarvisRun>;
  buildEnvelope(input: JarvisRequestInput): Promise<Readonly<JarvisRequestEnvelope>>;
  compilePrompt(envelope: Readonly<JarvisRequestEnvelope>): Readonly<CompiledJarvisPrompt>;
  transitionRun(input: TransitionJarvisRunInput): Promise<JarvisRun>;
  recordDiagnostic(diagnostic: JarvisShadowDiagnostic): void;
  now(): number;
}

export interface JarvisShadowTurnInput {
  run: JarvisRunCreateInput;
  attempt: Extract<JarvisRequestAttempt, { kind: 'initial' }>;
  request: Omit<JarvisRequestInput, 'attempt'>;
}

export type JarvisShadowCompilationResult =
  | {
      ok: true;
      envelope: Readonly<JarvisRequestEnvelope>;
      compiled: Readonly<CompiledJarvisPrompt>;
    }
  | {
      ok: false;
      requestId: string;
      runId: string;
      errorCategory: string;
    };

export type JarvisShadowLegacyOutcome = Readonly<{
  status: 'completed' | 'failed' | 'cancelled';
  verifiedTerminal: boolean;
}>;

function safeNow(deps: JarvisShadowCompilationDeps, fallback = 0): number {
  try {
    const value = deps.now();
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function safeDuration(startedAt: number, finishedAt: number): number {
  const duration = finishedAt - startedAt;
  return Number.isFinite(duration) && duration >= 0
    ? Math.min(Math.floor(duration), 86_400_000)
    : 0;
}

function publishDiagnostic(
  deps: JarvisShadowCompilationDeps,
  diagnostic: JarvisShadowDiagnostic,
): void {
  try {
    deps.recordDiagnostic(Object.freeze(diagnostic));
  } catch {
    // Shadow telemetry is observational and cannot alter legacy dispatch.
  }
}

function event(
  runId: string,
  status: 'running' | 'completed' | 'failed' | 'cancelled',
  createdAt: number,
) {
  return {
    idempotencyKey: `shadow:${runId}:${status}`,
    title: `Shadow ${status}`,
    safeSummary: `Observational shadow run ${status}.`,
    sourceRefs: [],
    artifactIds: [],
    createdAt,
  };
}

function layerDiagnostics(
  compiled: Readonly<CompiledJarvisPrompt>,
): readonly JarvisShadowLayerDiagnostic[] {
  return Object.freeze(
    compiled.layers.map((layer) =>
      Object.freeze({
        id: layer.id,
        authority: layer.authority,
        charCount: layer.charCount,
        truncated: layer.truncated,
        contentHash: layer.contentHash,
      }),
    ),
  );
}

function assertCompiledShape(compiled: Readonly<CompiledJarvisPrompt>): void {
  const safeId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const sha256 = /^[a-f0-9]{64}$/i;
  const authorities = new Set<PromptAuthority>([
    'immutable_security',
    'immutable_identity',
    'capability_policy',
    'user_approved_preference',
    'turn_policy',
    'untrusted_context',
    'output_contract',
  ]);
  if (
    !compiled ||
    compiled.schemaVersion !== 1 ||
    !Array.isArray(compiled.layers) ||
    !sha256.test(compiled.promptHash) ||
    typeof compiled.systemText !== 'string'
  ) {
    throw new Error('invalid_compiled_shadow_prompt');
  }
  for (const layer of compiled.layers) {
    if (
      !safeId.test(layer.id) ||
      !authorities.has(layer.authority) ||
      !sha256.test(layer.contentHash) ||
      !Number.isSafeInteger(layer.charCount) ||
      layer.charCount < 0 ||
      typeof layer.truncated !== 'boolean'
    ) {
      throw new Error('invalid_compiled_shadow_layer');
    }
  }
}

async function failPersistedShadowRun(input: {
  deps: JarvisShadowCompilationDeps;
  turn: JarvisShadowTurnInput;
  category: string;
  startedAt: number;
  finishedAt: number;
}): Promise<Extract<JarvisShadowCompilationResult, { ok: false }>> {
  const { deps, turn, category, startedAt, finishedAt } = input;
  try {
    await deps.transitionRun({
      accountId: turn.run.accountId,
      runId: turn.attempt.runId,
      expectedStatus: 'queued',
      nextStatus: 'failed',
      completedAt: finishedAt,
      event: event(turn.attempt.runId, 'failed', finishedAt),
    });
  } catch {
    // A repository transition conflict is already durable evidence; diagnostics
    // remain safe and the independent legacy dispatch is still allowed to run.
  }
  publishDiagnostic(deps, {
    mode: 'shadow',
    requestId: turn.attempt.requestId,
    runId: turn.attempt.runId,
    layers: Object.freeze([]),
    errorCategory: category,
    durationMs: safeDuration(startedAt, finishedAt),
  });
  return {
    ok: false,
    requestId: turn.attempt.requestId,
    runId: turn.attempt.runId,
    errorCategory: category,
  };
}

export async function compileJarvisShadowTurn(
  input: JarvisShadowTurnInput,
  deps: JarvisShadowCompilationDeps,
): Promise<JarvisShadowCompilationResult> {
  const startedAt = safeNow(deps);
  let persisted: JarvisRun;
  try {
    persisted = await deps.createPersistedRun(input.run);
  } catch {
    const finishedAt = safeNow(deps, startedAt);
    const errorCategory = 'shadow_run_persistence_failed';
    publishDiagnostic(deps, {
      mode: 'shadow',
      requestId: input.attempt.requestId,
      runId: input.attempt.runId,
      layers: Object.freeze([]),
      errorCategory,
      durationMs: safeDuration(startedAt, finishedAt),
    });
    return {
      ok: false,
      requestId: input.attempt.requestId,
      runId: input.attempt.runId,
      errorCategory,
    };
  }

  if (
    persisted.id !== input.attempt.runId ||
    persisted.accountId !== input.run.accountId ||
    persisted.status !== 'queued'
  ) {
    const finishedAt = safeNow(deps, startedAt);
    return failPersistedShadowRun({
      deps,
      turn: input,
      category: 'shadow_run_binding_failed',
      startedAt,
      finishedAt,
    });
  }

  let envelope: Readonly<JarvisRequestEnvelope>;
  try {
    envelope = await deps.buildEnvelope({ ...input.request, attempt: input.attempt });
    if (
      envelope.requestId !== input.attempt.requestId ||
      envelope.runId !== input.attempt.runId ||
      envelope.accountId !== input.run.accountId
    ) {
      throw new Error('shadow_envelope_binding_failed');
    }
  } catch {
    const finishedAt = safeNow(deps, startedAt);
    return failPersistedShadowRun({
      deps,
      turn: input,
      category: 'shadow_envelope_failed',
      startedAt,
      finishedAt,
    });
  }

  let compiled: Readonly<CompiledJarvisPrompt>;
  try {
    compiled = deps.compilePrompt(envelope);
    assertCompiledShape(compiled);
  } catch {
    const finishedAt = safeNow(deps, startedAt);
    return failPersistedShadowRun({
      deps,
      turn: input,
      category: 'shadow_compile_failed',
      startedAt,
      finishedAt,
    });
  }

  const finishedAt = safeNow(deps, startedAt);
  try {
    await deps.transitionRun({
      accountId: input.run.accountId,
      runId: input.attempt.runId,
      expectedStatus: 'queued',
      nextStatus: 'running',
      event: event(input.attempt.runId, 'running', finishedAt),
    });
  } catch {
    return failPersistedShadowRun({
      deps,
      turn: input,
      category: 'shadow_transition_failed',
      startedAt,
      finishedAt,
    });
  }

  publishDiagnostic(deps, {
    mode: 'shadow',
    requestId: input.attempt.requestId,
    runId: input.attempt.runId,
    promptHash: compiled.promptHash,
    layers: layerDiagnostics(compiled),
    durationMs: safeDuration(startedAt, finishedAt),
  });
  return { ok: true, envelope, compiled };
}

export async function mirrorJarvisShadowLegacyOutcome(
  input: {
    shadow: Extract<JarvisShadowCompilationResult, { ok: true }>;
    outcome: JarvisShadowLegacyOutcome;
  },
  deps: JarvisShadowCompilationDeps,
): Promise<void> {
  if (!input.outcome.verifiedTerminal) return;
  const completedAt = safeNow(deps);
  await deps.transitionRun({
    accountId: input.shadow.envelope.accountId,
    runId: input.shadow.envelope.runId,
    expectedStatus: 'running',
    nextStatus: input.outcome.status,
    completedAt,
    event: event(input.shadow.envelope.runId, input.outcome.status, completedAt),
  });
}
