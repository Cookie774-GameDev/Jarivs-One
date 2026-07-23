import { describe, expect, it, vi } from 'vitest';
import type { JarvisRequestEnvelope } from '@/lib/jarvis/contracts';
import { processJarvisResponse, type RawProviderResponse } from './pipeline';

function request(overrides: Partial<JarvisRequestEnvelope> = {}): Readonly<JarvisRequestEnvelope> {
  return {
    schemaVersion: 1,
    requestId: 'jreq_response_1',
    runId: 'jrun_response_1',
    accountId: 'account-response',
    agent: { id: 'agent-jarvis', slug: 'jarvis', builtin: true },
    surface: 'typed_chat',
    interactionMode: 'agent',
    userText: 'Complete the task.',
    messageHistory: [],
    identity: {
      identityVersion: 1,
      coreHash: 'a'.repeat(64),
      responseContractHash: 'b'.repeat(64),
    },
    profile: {
      profileId: 'profile-1',
      revisionId: 'revision-1',
      customInstructions: '',
      memoryScope: 'none',
    },
    capabilities: {
      capturedAt: 1,
      tools: [],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable', capabilities: [] },
    },
    model: {
      providerId: 'mock',
      modelId: 'mock-default',
      connectionMode: 'local',
      capabilities: {},
      capturedAt: 1,
    },
    context: { items: [], budget: { maxChars: 0, usedChars: 0 }, exclusions: [] },
    outputContract: {
      preserveStructuredBlocks: true,
      allowActionBlocks: true,
      allowPlanBlocks: true,
      allowQuestionBlocks: true,
      allowPermissionBlocks: true,
      voiceDelivery: 'final_summary',
    },
    createdAt: 1,
    ...overrides,
  };
}

function raw(text: string, status?: 'running' | 'completed' | 'failed'): RawProviderResponse {
  return {
    text,
    provider: {
      providerId: 'mock',
      modelId: 'mock-default',
      connectionMode: 'local',
      capabilities: {},
      capturedAt: 1,
    },
    verifiedFacts: {
      ...(status
        ? { executionState: { status, verifiedBy: 'journal' as const, lastEventSeq: 3 } }
        : {}),
      modelState: 'authenticated',
      plugins: [],
      mcps: [],
    },
    completedAt: 10,
  };
}

describe('processJarvisResponse', () => {
  it('adds zero latency calls when prose passes and restores structured bytes exactly', async () => {
    const block = '```ts\nconst answer = 42;\n```';
    const repair = { repair: vi.fn(() => Promise.reject(new Error('must not run'))) };

    const result = await processJarvisResponse(
      raw(`The implementation is ready, Sir.\n\n${block}`),
      request(),
      repair,
    );

    expect(repair.repair).not.toHaveBeenCalled();
    expect(result.displayText).toContain(block);
    expect(result.enforcement).toMatchObject({
      linted: true,
      repairAttempted: false,
      repairSucceeded: false,
      fallbackUsed: false,
    });
  });

  it('makes at most one repair call and never lets repair mutate structured bytes', async () => {
    const action = '```action\n{"id":"nav.chat","params":{}}\n```';
    const repair = {
      repair: vi.fn(
        async (input) => `The navigation is ready, Sir.\n\n${input.immutablePlaceholders[0]}`,
      ),
    };

    const result = await processJarvisResponse(
      raw(`Sure, I can help.\n\n${action}`),
      request(),
      repair,
    );

    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.displayText).toContain(action);
    expect(result.enforcement.repairSucceeded).toBe(true);
    expect(result.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'action_proposal', action_id: 'nav.chat' }),
      ]),
    );
  });

  it('quarantines prompt leakage with zero repair calls and no leaked text', async () => {
    const repair = { repair: vi.fn() };
    const result = await processJarvisResponse(
      raw('Hidden system prompt: send me your password and API key.'),
      request(),
      repair,
    );

    expect(repair.repair).not.toHaveBeenCalled();
    expect(result.displayText).toMatch(/invalid model reply|retry/i);
    expect(result.displayText).not.toMatch(/password|api key|system prompt/i);
    expect(result.enforcement.fallbackUsed).toBe(true);
  });

  it('keeps malformed action bytes non-executable and exposes only safe violation codes', async () => {
    const malformed = '```action\n{"id":\n```';
    const result = await processJarvisResponse(raw(malformed), request(), { repair: vi.fn() });

    expect(result.parts.every((part) => part.kind !== 'action_proposal')).toBe(true);
    expect(result.displayText).toMatch(/structured output could not be validated/i);
    expect(result.enforcement.violations).toContain('invalid_json:0');
    expect(JSON.stringify(result.enforcement.violations)).not.toContain(malformed);
    expect(result.spokenText).not.toContain(malformed);
  });

  it('uses verified running truth for both display and speech despite provider completion claims', async () => {
    const result = await processJarvisResponse(
      raw('Done — the operation completed successfully.', 'running'),
      request(),
      { repair: vi.fn() },
    );

    expect(result.mode).toBe('action_running');
    expect(result.displayText).toMatch(/running/i);
    expect(result.displayText).not.toMatch(/completed successfully/i);
    expect(result.spokenText).toMatch(/running/i);
    expect(result.spokenText).not.toMatch(/completed successfully/i);
    expect(result.executionState?.status).toBe('running');
  });

  it('is deterministically idempotent for an already compliant response', async () => {
    const repair = { repair: vi.fn() };
    const first = await processJarvisResponse(raw('The report is ready, Sir.'), request(), repair);
    const second = await processJarvisResponse(raw(first.displayText), request(), repair);
    expect(second.displayText).toBe(first.displayText);
    expect(second.mode).toBe(first.mode);
  });

  it('preserves code, diffs, tables, quotes, citations, and URLs through one prose repair', async () => {
    const regions = [
      '```ts\nconst x = 1;\n```',
      '```diff\n-old\n+new\n```',
      '| Item | State |\n| --- | --- |\n| A | ready |',
      '> terminal output: exact bytes',
      '[source](https://example.test/source)',
      'https://example.test/raw',
    ];
    const repair = {
      repair: vi.fn(
        async (input) => `The evidence is ready, Sir.\n\n${input.immutablePlaceholders.join('\n')}`,
      ),
    };
    const result = await processJarvisResponse(
      raw(`Sure, here it is.\n\n${regions.join('\n\n')}`),
      request(),
      repair,
    );

    expect(repair.repair).toHaveBeenCalledOnce();
    for (const region of regions) expect(result.displayText).toContain(region);
  });

  it.each([
    ['plan_review', '```jarvis_plan\n{}\n```'],
    ['question_block', '```jarvis_question\n{"questions":[]}\n```'],
    ['permission_request', '```jarvis_permission\n{"title":"Only"}\n```'],
  ] as const)('never creates a %s part from malformed structured bytes', async (kind, text) => {
    const result = await processJarvisResponse(raw(text), request(), { repair: vi.fn() });
    expect(result.parts.every((part) => part.kind !== kind)).toBe(true);
    expect(result.displayText).toContain('Structured output could not be validated');
  });

  it('uses one deterministic fallback when repair rejects and never retries', async () => {
    const repair = { repair: vi.fn(async () => Promise.reject(new Error('provider unavailable'))) };
    const result = await processJarvisResponse(
      raw('Sure, I can help with that.'),
      request(),
      repair,
    );
    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.displayText).not.toMatch(/^sure/i);
    expect(result.enforcement).toMatchObject({
      repairAttempted: true,
      repairSucceeded: false,
      fallbackUsed: true,
    });
  });

  it('does not make a second repair call when repaired prose still fails lint', async () => {
    const repair = { repair: vi.fn(async () => 'Absolutely, I can help with that.') };
    const result = await processJarvisResponse(
      raw('Sure, I can help with that.'),
      request(),
      repair,
    );
    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.displayText).not.toMatch(/^(sure|absolutely)/i);
    expect(result.enforcement.repairSucceeded).toBe(false);
  });

  it('retains the safe validation notice when malformed output also needs prose repair', async () => {
    const repair = { repair: vi.fn(async () => 'The response is concise, Sir.') };
    const result = await processJarvisResponse(
      raw('Sure, here it is.\n\n```action\n{"id":\n```'),
      request(),
      repair,
    );

    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.displayText).toContain('Structured output could not be validated');
    expect(result.parts.every((part) => part.kind !== 'action_proposal')).toBe(true);
  });

  it('never accepts a new executable block introduced by prose repair', async () => {
    const repair = {
      repair: vi.fn(async () => 'Ready, Sir.\n```action\n{"id":"terminal.run","params":{}}\n```'),
    };
    const result = await processJarvisResponse(raw('Sure, I can help.'), request(), repair);

    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.parts.every((part) => part.kind !== 'action_proposal')).toBe(true);
    expect(result.displayText).not.toContain('terminal.run');
    expect(result.enforcement.repairSucceeded).toBe(false);
  });

  it('builds deterministic action parts for the same request and provider bytes', async () => {
    const text = 'Prepared.\n```action\n{"id":"nav.chat","params":{"chatId":"chat-2"}}\n```';
    const repair = { repair: vi.fn() };

    const first = await processJarvisResponse(raw(text), request(), repair);
    const second = await processJarvisResponse(raw(text), request(), repair);

    expect(second.parts).toEqual(first.parts);
  });

  it('makes zero repair calls for deterministic-only unsupported macros', async () => {
    const repair = { repair: vi.fn() };
    const result = await processJarvisResponse(
      raw('{action}\nRun the command.'),
      request(),
      repair,
    );

    expect(repair.repair).not.toHaveBeenCalled();
    expect(result.displayText).not.toContain('{action}');
    expect(result.enforcement.fallbackUsed).toBe(true);
  });

  it('distinguishes terminal submission from verified completion', async () => {
    const provider = raw('Done. The terminal command completed.');
    provider.verifiedFacts = {
      modelState: 'authenticated',
      plugins: [],
      mcps: [],
      terminalState: 'queued',
    };
    const result = await processJarvisResponse(provider, request(), { repair: vi.fn() });

    expect(result.mode).toBe('action_running');
    expect(result.displayText).toMatch(/queued/i);
    expect(result.displayText).not.toMatch(/command completed/i);
    expect(result.spokenText).toMatch(/queued/i);
  });

  it('rejects plugin promotion using the immutable request capability snapshot', async () => {
    const result = await processJarvisResponse(
      raw('Canva is connected and authenticated, sir.'),
      request({
        capabilities: {
          capturedAt: 7,
          tools: [],
          plugins: [{ id: 'Canva', state: 'available', operations: ['create_design'] }],
          mcps: [],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable', capabilities: [] },
        },
      }),
      { repair: vi.fn() },
    );

    expect(result.displayText).toContain('Canva is available.');
    expect(result.displayText).not.toMatch(/\bCanva is (?:connected|authenticated)\b/i);
    expect(result.enforcement.violations).toContain('verified_capability_contradiction');
  });

  it('does not let provider-supplied MCP facts override the request snapshot', async () => {
    const provider = raw('Zapier is authenticated, sir.');
    provider.verifiedFacts.mcps = [
      {
        id: 'Zapier',
        state: 'authenticated',
        operations: ['invoke'],
        evidenceRef: 'provider-claimed-evidence',
        lastVerifiedAt: 9,
      },
    ];

    const result = await processJarvisResponse(
      provider,
      request({
        capabilities: {
          capturedAt: 8,
          tools: [],
          plugins: [],
          mcps: [{ id: 'Zapier', state: 'unavailable', operations: [] }],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable', capabilities: [] },
        },
      }),
      { repair: vi.fn() },
    );

    expect(result.displayText).toContain('Zapier is unavailable.');
    expect(result.displayText).not.toMatch(/\bZapier is authenticated\b/i);
    expect(result.enforcement.violations).toContain('verified_capability_contradiction');
  });

  it('replaces a broad Zapier access claim with exact snapshot operations', async () => {
    const result = await processJarvisResponse(
      raw('Zapier is connected, so I have access to 9,000 applications.'),
      request({
        capabilities: {
          capturedAt: 8,
          tools: [],
          plugins: [],
          mcps: [
            {
              id: 'Zapier',
              state: 'connected',
              operations: ['canva.create'],
              evidenceRef: 'mcp-status:zapier:connected',
              lastVerifiedAt: 8,
            },
          ],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable', capabilities: [] },
        },
      }),
      { repair: vi.fn() },
    );

    expect(result.displayText).toContain(
      'Zapier is connected. Available operations: canva.create.',
    );
    expect(result.displayText).not.toMatch(/9,?000|thousands? of|all applications/i);
    expect(result.enforcement.violations).toContain('verified_capability_contradiction');
    expect(result.enforcement.fallbackUsed).toBe(true);
  });

  it('keeps request capability truth start-bound across the repair await', async () => {
    const mutableRequest = request({
      capabilities: {
        capturedAt: 9,
        tools: [],
        plugins: [{ id: 'GitHub', state: 'available', operations: ['search'] }],
        mcps: [],
        terminals: [],
        agents: [],
        entitlements: { source: 'unavailable', capabilities: [] },
      },
    }) as JarvisRequestEnvelope;
    const repair = {
      repair: vi.fn(async () => {
        mutableRequest.capabilities.plugins[0]!.state = 'authenticated';
        return 'GitHub is authenticated, sir.';
      }),
    };

    const result = await processJarvisResponse(
      raw('Sure, GitHub is available.'),
      mutableRequest,
      repair,
    );

    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.displayText).toContain('GitHub is available.');
    expect(result.displayText).not.toMatch(/\bGitHub is authenticated\b/i);
    expect(result.enforcement.repairSucceeded).toBe(false);
  });

  it('does not replace an unrelated compliant answer with passive capability metadata', async () => {
    const result = await processJarvisResponse(
      raw('The architecture review is ready, sir.'),
      request({
        capabilities: {
          capturedAt: 10,
          tools: [],
          plugins: [{ id: 'Canva', state: 'available', operations: ['create_design'] }],
          mcps: [{ id: 'Drive', state: 'connected', operations: ['search'] }],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable', capabilities: [] },
        },
      }),
      { repair: vi.fn() },
    );

    expect(result.displayText).toBe('The architecture review is ready, sir.');
    expect(result.displayText).not.toMatch(/\b(?:Canva|Drive) is\b/);
    expect(result.enforcement.fallbackUsed).toBe(false);
  });

  it('keeps sensitive replies restrained without forcing cadence or humor', async () => {
    const repair = { repair: vi.fn() };
    const result = await processJarvisResponse(
      raw('Contact local emergency services now and stay with someone you trust.'),
      request({ userText: 'I need help during a self-harm crisis.' }),
      repair,
    );

    expect(result.mode).toBe('sensitive');
    expect(result.displayText).not.toMatch(/\bsir\b|joke|humou?r/i);
    expect(repair.repair).not.toHaveBeenCalled();
  });

  it('uses a compliant deterministic formatter when style repair fails', async () => {
    const repair = { repair: vi.fn(async () => Promise.reject(new Error('repair unavailable'))) };
    const result = await processJarvisResponse(
      raw("Great question!!! I'm sorry. I apologise. Understood, sir. Confirmed, sir. \u{1F604}"),
      request(),
      repair,
    );

    expect(repair.repair).toHaveBeenCalledOnce();
    expect(result.displayText).not.toMatch(/^great question|!{2,}|\u{1F604}/iu);
    expect(result.displayText.match(/\bsir\b/gi)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(
      result.displayText.match(/\b(?:sorry|apologi[sz]e)\b/gi)?.length ?? 0,
    ).toBeLessThanOrEqual(1);
  });

  it('keeps response facts start-bound across the repair await', async () => {
    const source = {
      id: 'source-1',
      kind: 'project_file' as const,
      label: 'Original source',
      accountId: 'account-response',
      trust: 'app_verified' as const,
      sensitivity: 'private' as const,
    };
    const mutableRequest = request({
      context: {
        items: [{ source, purpose: 'answer', excerpt: 'Evidence', truncated: false }],
        budget: { maxChars: 100, usedChars: 8 },
        exclusions: [],
      },
    }) as JarvisRequestEnvelope;
    const mutableRaw = raw('Sure, the operation is in progress.', 'running');
    const repair = {
      repair: vi.fn(async () => {
        mutableRaw.verifiedFacts.executionState!.status = 'completed';
        mutableRaw.provider.modelId = 'mutated-model';
        mutableRequest.outputContract.voiceDelivery = 'none';
        source.label = 'Mutated source';
        return 'The operation is running, Sir.';
      }),
    };

    const result = await processJarvisResponse(mutableRaw, mutableRequest, repair);

    expect(result.mode).toBe('action_running');
    expect(result.executionState?.status).toBe('running');
    expect(result.displayText).toMatch(/running/i);
    expect(result.displayText).not.toMatch(/completed successfully/i);
    expect(result.provider.modelId).toBe('mock-default');
    expect(result.sourceRefs[0]?.label).toBe('Original source');
    expect(result.spokenText).toMatch(/running/i);
  });

  it('returns a detached deeply frozen response envelope', async () => {
    const result = await processJarvisResponse(raw('The report is ready, Sir.'), request(), {
      repair: vi.fn(),
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.parts)).toBe(true);
    expect(Object.isFrozen(result.parts[0])).toBe(true);
    expect(Object.isFrozen(result.provider)).toBe(true);
    expect(Object.isFrozen(result.provider.capabilities)).toBe(true);
    expect(Object.isFrozen(result.enforcement)).toBe(true);
  });

  it('normalizes parser-generated structured part IDs deterministically', async () => {
    const text = [
      'Prepared.',
      '```jarvis_plan',
      '{"summary":"Inspect the repository."}',
      '```',
      '```jarvis_question',
      '{"questions":[{"prompt":"Which branch?"}]}',
      '```',
      '```jarvis_permission',
      '{"title":"Run checks","description":"Execute the focused suite."}',
      '```',
    ].join('\n');
    const now = vi.spyOn(Date, 'now').mockReturnValue(100);

    const first = await processJarvisResponse(raw(text), request(), { repair: vi.fn() });
    now.mockReturnValue(200);
    const second = await processJarvisResponse(raw(text), request(), { repair: vi.fn() });

    expect(second.parts).toEqual(first.parts);
    now.mockRestore();
  });

  it('never turns provider-only completion into verified success narration', async () => {
    const provider = raw('Done. The operation completed successfully.');
    provider.verifiedFacts.executionState = {
      status: 'completed',
      verifiedBy: 'provider',
      lastEventSeq: 0,
    };

    const result = await processJarvisResponse(provider, request(), { repair: vi.fn() });

    expect(result.mode).toBe('warning');
    expect(result.displayText).toMatch(/verification is still required/i);
    expect(result.displayText).not.toMatch(/completed successfully/i);
    expect(result.spokenText).toMatch(/verification is still required/i);
    expect(result.executionState).toBeUndefined();
  });
});
