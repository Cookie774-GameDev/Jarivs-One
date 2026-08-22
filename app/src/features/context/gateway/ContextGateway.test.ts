import { describe, expect, it, vi } from 'vitest';
import { ContextGateway, ContextRequiredUnavailableError } from './ContextGateway';
import type { ContextGatewayBackend, ContextGatewayRequest } from './contextGatewayContracts';

const identity = Object.freeze({
  transportConnectionId: 'connection-1',
  transportAdapterId: 'opencode-persistent',
  upstreamProviderId: 'openai',
  upstreamModelId: 'gpt-5.6-luna',
  providerQualifiedModelId: 'openai/gpt-5.6-luna',
  authBillingRoute: 'subscription',
  effort: 'max',
  fastVariant: 'fast',
  catalogRevision: 'catalog-v4',
  observedProviderIdentity: 'openai',
});

const baseRequest: ContextGatewayRequest = Object.freeze({
  requestId: 'turn-1',
  question: 'What changed across the project history?',
  scope: {
    accountId: 'account-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    worktreeId: 'worktree-1',
    revision: 'scope-v1',
  },
  executionIdentity: identity,
  taskKind: 'answer',
  access: 'read',
  workingSet: 'incomplete',
  userIntent: { context: true },
  performance: 'quality',
  optionalEnrichmentEnabled: true,
});

function backend(): ContextGatewayBackend {
  return {
    available: () => true,
    ask: vi.fn(async () => ({
      promptBlock: 'bounded evidence',
      sourceRevisions: [{ sourceId: 'source-1', revision: 'source-v1' }],
      evidence: [
        {
          handle: 'evidence-1',
          sourceId: 'source-1',
          sourceRevision: 'source-v1',
          contentHash: `sha256:${'a'.repeat(64)}`,
          byteStart: '0',
          byteEnd: '24',
          text: 'the bounded source text',
        },
      ],
      stageTimingsMs: { search: 12, validation: 3 },
    })),
  };
}

describe('ContextGateway', () => {
  it('keeps direct turns fast and never calls retrieval', async () => {
    const port = backend();
    const gateway = new ContextGateway(port, { now: () => 100, createId: () => 'receipt-1' });
    const result = await gateway.prepareTurn({
      ...baseRequest,
      question: 'Rename this variable.',
      workingSet: 'complete',
      userIntent: undefined,
    });
    expect(result.receipt).toMatchObject({ route: 'direct', decision: 'optional-direct' });
    expect(result.promptBlock).toBe('');
    expect(port.ask).not.toHaveBeenCalled();
  });

  it('preserves exact execution identity and omits raw source content from receipts', async () => {
    const gateway = new ContextGateway(backend(), { now: () => 100, createId: () => 'receipt-1' });
    const result = await gateway.ask(baseRequest);
    expect(result.receipt.executionIdentity).toEqual(identity);
    expect(result.receipt.evidenceHandles).toEqual(['evidence-1']);
    expect(JSON.stringify(result.receipt)).not.toContain(baseRequest.question);
    expect(JSON.stringify(result.receipt)).not.toContain('the bounded source text');
    await expect(
      gateway.openEvidence({
        receiptId: result.receipt.receiptId,
        handle: 'evidence-1',
        scope: baseRequest.scope,
      }),
    ).resolves.toMatchObject({ text: 'the bounded source text' });
  });

  it('rejects evidence handles across worktree scope revisions', async () => {
    const gateway = new ContextGateway(backend(), { now: () => 100, createId: () => 'receipt-1' });
    const result = await gateway.ask(baseRequest);
    await expect(
      gateway.openEvidence({
        receiptId: result.receipt.receiptId,
        handle: 'evidence-1',
        scope: { ...baseRequest.scope, worktreeId: 'worktree-2' },
      }),
    ).rejects.toThrow('scope');
  });

  it('verifies a required receipt only for its exact request, scope, route strength, and generation', async () => {
    const gateway = new ContextGateway(backend(), { now: () => 100, createId: () => 'receipt-1' });
    const result = await gateway.ask(baseRequest);
    expect(
      gateway.verifyRequiredReceipt({
        receiptId: result.receipt.receiptId,
        requestId: baseRequest.requestId,
        scope: baseRequest.scope,
        minimumRoute: 'focused',
      }),
    ).toBe(result.receipt);
    expect(
      gateway.verifyRequiredReceipt({
        receiptId: result.receipt.receiptId,
        requestId: 'other-turn',
        scope: baseRequest.scope,
        minimumRoute: 'focused',
      }),
    ).toBeNull();
    expect(
      gateway.verifyRequiredReceipt({
        receiptId: result.receipt.receiptId,
        requestId: baseRequest.requestId,
        scope: baseRequest.scope,
        minimumRoute: 'deep',
      }),
    ).toBeNull();
    gateway.cancel(baseRequest.requestId);
    expect(
      gateway.verifyRequiredReceipt({
        receiptId: result.receipt.receiptId,
        requestId: baseRequest.requestId,
        scope: baseRequest.scope,
        minimumRoute: 'focused',
      }),
    ).toBeNull();
    await expect(
      gateway.openEvidence({
        receiptId: result.receipt.receiptId,
        handle: 'evidence-1',
        scope: baseRequest.scope,
      }),
    ).rejects.toThrow('revoked');
  });

  it('expires required receipts and evidence handles after the bounded receipt lifetime', async () => {
    let now = 100;
    const gateway = new ContextGateway(backend(), {
      now: () => now,
      createId: () => 'receipt-expiring',
      receiptTtlMs: 10,
    });
    const result = await gateway.ask(baseRequest);
    now = 110;

    expect(
      gateway.verifyRequiredReceipt({
        receiptId: result.receipt.receiptId,
        requestId: baseRequest.requestId,
        scope: baseRequest.scope,
        minimumRoute: 'focused',
      }),
    ).toBeNull();
    await expect(
      gateway.openEvidence({
        receiptId: result.receipt.receiptId,
        handle: 'evidence-1',
        scope: baseRequest.scope,
      }),
    ).rejects.toThrow('missing or expired');
  });

  it('single-flights identical in-progress requests and reports the shared result', async () => {
    let release!: () => void;
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promptBlock: 'shared', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    let id = 0;
    const gateway = new ContextGateway(port, { now: () => 100, createId: () => `receipt-${++id}` });
    const first = gateway.ask(baseRequest);
    const second = gateway.ask({ ...baseRequest, requestId: 'turn-2' });
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(1));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect([a.receipt.cacheStatus, b.receipt.cacheStatus].sort()).toEqual(['miss', 'shared']);
  });

  it('rejects a duplicate active request ID without overwriting cancellation ownership', async () => {
    let release!: () => void;
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promptBlock: 'first', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    const gateway = new ContextGateway(port, {
      now: () => 100,
      createId: () => 'receipt-1',
    });
    const first = gateway.ask(baseRequest);
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(1));

    await expect(
      gateway.ask({ ...baseRequest, question: 'A conflicting request.' }),
    ).rejects.toMatchObject({ name: 'ContextGatewayRequestConflictError' });
    expect(port.ask).toHaveBeenCalledTimes(1);

    gateway.cancel(baseRequest.requestId);
    release();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails closed on a receipt ID collision without replacing prior evidence authority', async () => {
    const gateway = new ContextGateway(backend(), {
      now: () => 100,
      createId: () => 'receipt-collision',
    });
    const first = await gateway.ask(baseRequest);

    await expect(
      gateway.ask({ ...baseRequest, requestId: 'turn-2', question: 'A distinct lookup.' }),
    ).rejects.toMatchObject({
      name: 'ContextRequiredUnavailableError',
      receipt: { safeFailure: 'retrieval-failed' },
    });
    await expect(
      gateway.openEvidence({
        receiptId: first.receipt.receiptId,
        handle: 'evidence-1',
        scope: baseRequest.scope,
      }),
    ).resolves.toMatchObject({ text: 'the bounded source text' });
  });

  it('bounds distinct same-scope retrievals and records cancellation-safe queue telemetry', async () => {
    const releases: Array<() => void> = [];
    let now = 100;
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return { promptBlock: 'bounded', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    let id = 0;
    const gateway = new ContextGateway(port, {
      now: () => now,
      createId: () => `receipt-${++id}`,
      maxConcurrentPerScope: 2,
    });

    const first = gateway.ask({ ...baseRequest, requestId: 'turn-1', question: 'question one' });
    const second = gateway.ask({ ...baseRequest, requestId: 'turn-2', question: 'question two' });
    const third = gateway.ask({ ...baseRequest, requestId: 'turn-3', question: 'question three' });
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(2));

    now = 125;
    releases.shift()?.();
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => release());

    const results = await Promise.all([first, second, third]);
    expect(results[0].receipt.queueDepthAtStart).toBe(0);
    expect(results[1].receipt.queueDepthAtStart).toBe(0);
    expect(results[2].receipt).toMatchObject({
      queueDepthAtStart: 1,
      stageTimingsMs: { queueWait: 25 },
    });
  });

  it('removes a cancelled queued retrieval before backend dispatch', async () => {
    let release!: () => void;
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promptBlock: 'bounded', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    let id = 0;
    const gateway = new ContextGateway(port, {
      now: () => 100,
      createId: () => `receipt-${++id}`,
      maxConcurrentPerScope: 1,
    });
    const first = gateway.ask({ ...baseRequest, requestId: 'turn-1', question: 'question one' });
    const queued = gateway.ask({ ...baseRequest, requestId: 'turn-2', question: 'question two' });
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(1));

    gateway.cancel('turn-2');
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    release();
    await expect(first).resolves.toMatchObject({ receipt: { queueDepthAtStart: 0 } });
    expect(port.ask).toHaveBeenCalledTimes(1);
  });

  it('does not share concurrency limits across project scopes', async () => {
    const releases: Array<() => void> = [];
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return { promptBlock: 'bounded', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    let id = 0;
    const gateway = new ContextGateway(port, {
      now: () => 100,
      createId: () => `receipt-${++id}`,
      maxConcurrentPerScope: 1,
    });

    const first = gateway.ask({ ...baseRequest, requestId: 'turn-1', question: 'question one' });
    const otherProject = gateway.ask({
      ...baseRequest,
      requestId: 'turn-2',
      question: 'question two',
      scope: { ...baseRequest.scope, projectId: 'project-2' },
    });
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(2));
    releases.splice(0).forEach((release) => release());

    await expect(Promise.all([first, otherProject])).resolves.toEqual([
      expect.objectContaining({ receipt: expect.objectContaining({ queueDepthAtStart: 0 }) }),
      expect.objectContaining({ receipt: expect.objectContaining({ queueDepthAtStart: 0 }) }),
    ]);
  });

  it('invalidates a cancelled generation and rejects late backend evidence', async () => {
    let release!: () => void;
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promptBlock: 'late', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    const gateway = new ContextGateway(port, { now: () => 100, createId: () => 'receipt-1' });
    const pending = gateway.ask(baseRequest);
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(1));
    gateway.cancel(baseRequest.requestId);
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates an external abort to the backend when its last consumer leaves', async () => {
    let release!: () => void;
    let backendSignal!: AbortSignal;
    const port = backend();
    vi.mocked(port.ask).mockImplementation(async (input) => {
      backendSignal = input.signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promptBlock: 'late', sourceRevisions: [], evidence: [], stageTimingsMs: {} };
    });
    const external = new AbortController();
    const gateway = new ContextGateway(port, {
      now: () => 100,
      createId: () => 'receipt-1',
    });
    const pending = gateway.ask({ ...baseRequest, signal: external.signal });
    await vi.waitFor(() => expect(port.ask).toHaveBeenCalledTimes(1));

    external.abort();
    const backendWasAborted = backendSignal.aborted;
    release();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(backendWasAborted).toBe(true);
  });

  it('fails closed when required context is unavailable even when RLM is off', async () => {
    const port = backend();
    port.available = () => false;
    const gateway = new ContextGateway(port, { now: () => 100, createId: () => 'receipt-1' });
    await expect(
      gateway.prepareTurn({
        ...baseRequest,
        taskKind: 'write',
        access: 'write',
        riskDomains: ['credentials'],
        optionalEnrichmentEnabled: false,
      }),
    ).rejects.toBeInstanceOf(ContextRequiredUnavailableError);
    expect(port.ask).not.toHaveBeenCalled();
  });
});
