import { describe, expect, it, vi } from 'vitest';
import type {
  CompiledJarvisPrompt,
  JarvisRequestEnvelope,
  JarvisRun,
  TransitionJarvisRunInput,
} from '@/lib/jarvis/contracts';
import type { JarvisRequestInput } from '@/lib/jarvis/requestEnvelope';
import {
  compileJarvisShadowTurn,
  mirrorJarvisShadowLegacyOutcome,
  type JarvisRunCreateInput,
  type JarvisShadowCompilationDeps,
  type JarvisShadowTurnInput,
} from './shadowCompilation';

function model() {
  return {
    providerId: 'mock',
    modelId: 'mock-default',
    connectionMode: 'local' as const,
    capabilities: {},
    capturedAt: 10,
  };
}

function runInput(): JarvisRunCreateInput {
  return {
    id: 'jrun_shadow_1',
    accountId: 'account-shadow',
    chatId: 'chat-shadow',
    source: 'typed_chat',
    agentId: 'agent-jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-revision-1',
    model: model(),
  };
}

function persistedRun(
  input: JarvisRunCreateInput,
  status: JarvisRun['status'] = 'queued',
): JarvisRun {
  return {
    ...input,
    id: input.id ?? 'jrun_shadow_1',
    status,
    createdAt: 10,
    updatedAt: 10,
  };
}

function requestInput(): Omit<JarvisRequestInput, 'attempt'> {
  return {
    accountId: 'account-shadow',
    chatId: 'chat-shadow',
    agent: { id: 'agent-jarvis', slug: 'jarvis', builtin: true },
    surface: 'typed_chat',
    interactionMode: 'agent',
    identity: {
      identityVersion: 1,
      coreHash: 'a'.repeat(64),
      responseContractHash: 'b'.repeat(64),
    },
    profile: {
      profileId: 'profile-1',
      revisionId: 'profile-revision-1',
      customInstructions: '',
      memoryScope: 'none',
    },
    model: model(),
    capabilities: {
      capturedAt: 10,
      tools: [],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable', capabilities: [] },
    },
    context: { items: [], budget: { maxChars: 0, usedChars: 0 }, exclusions: [] },
    outputContract: {
      preserveStructuredBlocks: true,
      allowActionBlocks: true,
      allowPlanBlocks: true,
      allowQuestionBlocks: true,
      allowPermissionBlocks: true,
      voiceDelivery: 'none',
    },
    userText: 'private user text must never enter diagnostics',
    messageHistory: [],
    createdAt: 10,
  };
}

function turn(): JarvisShadowTurnInput {
  return {
    run: runInput(),
    attempt: {
      kind: 'initial',
      requestId: 'jreq_shadow_1',
      runId: 'jrun_shadow_1',
      attemptNumber: 1,
    },
    request: requestInput(),
  };
}

function envelope(input: JarvisRequestInput): Readonly<JarvisRequestEnvelope> {
  return Object.freeze({
    schemaVersion: 1,
    ...input,
    requestId: input.attempt.requestId,
    runId: input.attempt.runId,
  }) as unknown as Readonly<JarvisRequestEnvelope>;
}

function compiled(): Readonly<CompiledJarvisPrompt> {
  return Object.freeze({
    schemaVersion: 1,
    layers: Object.freeze([
      Object.freeze({
        id: 'immutable-security',
        authority: 'immutable_security' as const,
        sourceRefs: [],
        content: 'never record this protected prompt text',
        contentHash: 'c'.repeat(64),
        charCount: 39,
        truncated: false,
      }),
    ]),
    systemText: 'never dispatch this shadow system prompt',
    promptHash: 'd'.repeat(64),
    identityVersion: 1,
    profileRevisionId: 'profile-revision-1',
    diagnostics: { totalChars: 39, omittedSourceRefs: [], warnings: [] },
  });
}

function harness(overrides: Partial<JarvisShadowCompilationDeps> = {}) {
  const order: string[] = [];
  const diagnostics: unknown[] = [];
  let now = 10;
  const deps: JarvisShadowCompilationDeps = {
    createPersistedRun: vi.fn(async (input) => {
      order.push('persist');
      return persistedRun(input);
    }),
    buildEnvelope: vi.fn(async (input) => {
      order.push('envelope');
      return envelope(input);
    }),
    compilePrompt: vi.fn((input) => {
      order.push(`compile:${input.runId}`);
      return compiled();
    }),
    transitionRun: vi.fn(async (input: TransitionJarvisRunInput) => {
      order.push(`transition:${input.expectedStatus}->${input.nextStatus}`);
      return persistedRun(runInput(), input.nextStatus);
    }),
    recordDiagnostic: vi.fn((diagnostic) => diagnostics.push(diagnostic)),
    now: vi.fn(() => now++),
    ...overrides,
  };
  return { deps, diagnostics, order };
}

describe('compileJarvisShadowTurn', () => {
  it('persists first, compiles once, starts the run atomically, and records only allowlisted data', async () => {
    const { deps, diagnostics, order } = harness();

    const result = await compileJarvisShadowTurn(turn(), deps);

    expect(result.ok).toBe(true);
    expect(order).toEqual([
      'persist',
      'envelope',
      'compile:jrun_shadow_1',
      'transition:queued->running',
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      mode: 'shadow',
      requestId: 'jreq_shadow_1',
      runId: 'jrun_shadow_1',
      promptHash: 'd'.repeat(64),
      layers: [
        {
          id: 'immutable-security',
          authority: 'immutable_security',
          charCount: 39,
          truncated: false,
          contentHash: 'c'.repeat(64),
        },
      ],
      durationMs: 1,
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('private user text');
    expect(serialized).not.toContain('protected prompt text');
    expect(serialized).not.toContain('shadow system prompt');
  });

  it('fails the persisted run with a safe category when compilation rejects', async () => {
    const { deps, diagnostics, order } = harness({
      compilePrompt: vi.fn(() => {
        throw new Error('secret=/users/viper/private.txt prompt contents');
      }),
    });

    const result = await compileJarvisShadowTurn(turn(), deps);

    expect(result).toEqual({
      ok: false,
      requestId: 'jreq_shadow_1',
      runId: 'jrun_shadow_1',
      errorCategory: 'shadow_compile_failed',
    });
    expect(order).toEqual(['persist', 'envelope', 'transition:queued->failed']);
    expect(diagnostics).toEqual([
      {
        mode: 'shadow',
        requestId: 'jreq_shadow_1',
        runId: 'jrun_shadow_1',
        layers: [],
        errorCategory: 'shadow_compile_failed',
        durationMs: 1,
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('viper');
  });

  it('rejects unsafe compiler diagnostic metadata instead of recording it', async () => {
    const unsafeCompiled = {
      ...compiled(),
      layers: [
        {
          ...compiled().layers[0]!,
          id: 'private user text /users/viper/secret.txt',
        },
      ],
    };
    const { deps, diagnostics } = harness({
      compilePrompt: vi.fn(() => unsafeCompiled),
    });

    await expect(compileJarvisShadowTurn(turn(), deps)).resolves.toEqual(
      expect.objectContaining({ ok: false, errorCategory: 'shadow_compile_failed' }),
    );
    expect(JSON.stringify(diagnostics)).not.toContain('viper');
    expect(JSON.stringify(diagnostics)).not.toContain('private user text');
  });

  it('mirrors verified terminal outcomes and leaves signal-only cancellation nonterminal', async () => {
    const { deps } = harness();
    const shadow = await compileJarvisShadowTurn(turn(), deps);
    if (!shadow.ok) throw new Error('Expected successful shadow compilation.');
    vi.mocked(deps.transitionRun).mockClear();

    await mirrorJarvisShadowLegacyOutcome(
      { shadow, outcome: { status: 'cancelled', verifiedTerminal: false } },
      deps,
    );
    expect(deps.transitionRun).not.toHaveBeenCalled();

    await mirrorJarvisShadowLegacyOutcome(
      { shadow, outcome: { status: 'completed', verifiedTerminal: true } },
      deps,
    );
    expect(deps.transitionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-shadow',
        runId: 'jrun_shadow_1',
        expectedStatus: 'running',
        nextStatus: 'completed',
      }),
    );
  });
});
