import { describe, expect, it, vi } from 'vitest';
import { processJarvisResponse, type RawProviderResponse } from './pipeline';
import type { JarvisRequestEnvelope } from '@/lib/jarvis/contracts';

const request = {
  schemaVersion: 1,
  requestId: 'jreq_perf',
  runId: 'jrun_perf',
  accountId: 'account-perf',
  agent: { id: 'agent-jarvis', slug: 'jarvis', builtin: true },
  surface: 'typed_chat',
  interactionMode: 'ask',
  userText: 'Summarize the status.',
  messageHistory: [],
  identity: { identityVersion: 1, coreHash: 'a'.repeat(64), responseContractHash: 'b'.repeat(64) },
  profile: { profileId: 'p', revisionId: 'r', customInstructions: '', memoryScope: 'none' },
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
    allowActionBlocks: false,
    allowPlanBlocks: false,
    allowQuestionBlocks: false,
    allowPermissionBlocks: false,
    voiceDelivery: 'none',
  },
  createdAt: 1,
} as Readonly<JarvisRequestEnvelope>;

const raw: RawProviderResponse = {
  text: 'The requested status summary is ready, Sir.',
  provider: request.model,
  verifiedFacts: { modelState: 'authenticated', plugins: [], mcps: [] },
  completedAt: 2,
};

describe('response pipeline performance', () => {
  it('keeps deterministic classification and linting p95 below 15 ms', async () => {
    const repair = { repair: vi.fn(() => Promise.reject(new Error('must not run'))) };
    for (let index = 0; index < 20; index += 1) await processJarvisResponse(raw, request, repair);
    const durations: number[] = [];
    for (let index = 0; index < 500; index += 1) {
      const started = performance.now();
      await processJarvisResponse(raw, request, repair);
      durations.push(performance.now() - started);
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    expect({
      iterations: durations.length,
      sanitizedLength: raw.text.length,
      violationCount: 0,
      p95,
    }).toEqual(
      expect.objectContaining({
        iterations: 500,
        sanitizedLength: raw.text.length,
        violationCount: 0,
      }),
    );
    expect(p95).toBeLessThan(15);
    expect(repair.repair).not.toHaveBeenCalled();
  });
});
