import { describe, expect, it } from 'vitest';
import { createJarvisRequestEnvelope } from '@/lib/jarvis/requestEnvelope';
import { compileJarvisPrompt } from '@/lib/jarvis/promptCompiler';
import { assembleJarvisPromptLayers } from '@/lib/jarvis/promptLayers';

async function protectedEnvelope() {
  return createJarvisRequestEnvelope({
    attempt: {
      kind: 'initial',
      requestId: 'request-wrapper',
      runId: 'run-wrapper',
      attemptNumber: 1,
    },
    accountId: 'account-wrapper',
    agent: { id: 'agent-wrapper', slug: 'jarvis', builtin: true },
    surface: 'typed_chat',
    interactionMode: 'ask',
    identity: {
      identityVersion: 1,
      coreHash: 'core-hash-wrapper',
      responseContractHash: 'response-hash-wrapper',
    },
    profile: {
      profileId: 'profile-wrapper',
      revisionId: 'profile-revision-wrapper',
      customInstructions: 'Prefer concise answers.',
      memoryScope: 'none',
    },
    model: {
      providerId: 'provider-wrapper',
      modelId: 'model-wrapper',
      connectionMode: 'local',
      capabilities: { tools: false },
      capturedAt: 100,
    },
    capabilities: {
      capturedAt: 101,
      tools: [],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable', capabilities: [] },
    },
    context: {
      items: [],
      budget: { maxChars: 1_000, usedChars: 0 },
      exclusions: [],
    },
    outputContract: {
      preserveStructuredBlocks: true,
      allowActionBlocks: false,
      allowPlanBlocks: false,
      allowQuestionBlocks: true,
      allowPermissionBlocks: false,
      voiceDelivery: 'none',
    },
    userText: 'Hello.',
    messageHistory: [],
    createdAt: 102,
  });
}

describe('assembleJarvisPromptLayers compatibility wrapper', () => {
  it('returns the canonical compiler layers and text for a complete envelope', async () => {
    const envelope = await protectedEnvelope();
    const canonical = compileJarvisPrompt(envelope);
    const wrapped = assembleJarvisPromptLayers(envelope);

    expect(wrapped.text).toBe(canonical.systemText);
    expect(wrapped.layers).toEqual(canonical.layers);
    expect(wrapped.relevantActionIds).toEqual([]);
  });

  it('does not retain the legacy universal core as a second prompt source', async () => {
    const wrapped = assembleJarvisPromptLayers(await protectedEnvelope());

    expect(wrapped.layers.map((layer) => layer.id)).not.toContain('universal-core');
    expect(wrapped.text.match(/^## immutable-security/gm)).toHaveLength(1);
    expect(wrapped.text.match(/^## immutable-identity/gm)).toHaveLength(1);
  });
});
