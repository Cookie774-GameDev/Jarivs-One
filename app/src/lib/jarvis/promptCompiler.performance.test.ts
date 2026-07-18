import { describe, expect, it } from 'vitest';
import type { JarvisContextItem } from '@/lib/jarvis/contracts';
import { createJarvisRequestEnvelope, type JarvisRequestInput } from '@/lib/jarvis/requestEnvelope';
import { compileJarvisPrompt } from '@/lib/jarvis/promptCompiler';

function representativeInput(): JarvisRequestInput {
  const items: JarvisContextItem[] = Array.from({ length: 24 }, (_, index) => ({
    source: {
      id: `source-${String(index).padStart(2, '0')}`,
      kind: 'project_file',
      label: `source-${index}.txt`,
      accountId: 'account-performance',
      trust: 'app_verified',
      sensitivity: 'private',
      observedAt: 1_000 - index,
      contentHash: `content-hash-${index}`,
    },
    purpose: 'answer',
    excerpt: `Sanitized project context item ${index}. ${'ordinary text '.repeat(12)}`,
    score: 1 - index / 100,
    truncated: false,
  }));
  return {
    attempt: {
      kind: 'initial',
      requestId: 'request-performance',
      runId: 'run-performance',
      attemptNumber: 1,
    },
    accountId: 'account-performance',
    workspaceId: 'workspace-performance',
    projectId: 'project-performance',
    chatId: 'chat-performance',
    agent: { id: 'agent-performance', slug: 'jarvis', builtin: true },
    surface: 'typed_chat',
    interactionMode: 'ask',
    responseModeHint: 'direct_answer',
    identity: {
      identityVersion: 1,
      coreHash: 'core-hash-performance',
      responseContractHash: 'response-hash-performance',
    },
    profile: {
      profileId: 'profile-performance',
      revisionId: 'profile-revision-performance',
      customInstructions: 'Prefer concise evidence-backed answers.',
      memoryScope: 'profile',
    },
    model: {
      connectionId: 'connection-performance',
      providerId: 'provider-performance',
      modelId: 'model-performance',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: true },
      capturedAt: 1_001,
    },
    capabilities: {
      capturedAt: 1_002,
      tools: [
        {
          id: 'file.read',
          state: 'authenticated',
          operations: ['read', 'list'],
          evidenceRef: 'evidence:file.read',
          lastVerifiedAt: 1_000,
        },
      ],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: {
        source: 'server',
        planId: 'performance-plan',
        capabilities: ['kernel.read'],
        verifiedAt: 1_000,
        expiresAt: 2_000,
      },
    },
    context: {
      items,
      budget: {
        maxChars: 32_000,
        usedChars: items.reduce((total, item) => total + item.excerpt.length, 0),
      },
      exclusions: [],
    },
    outputContract: {
      preserveStructuredBlocks: true,
      allowActionBlocks: true,
      allowPlanBlocks: true,
      allowQuestionBlocks: true,
      allowPermissionBlocks: true,
      voiceDelivery: 'validated_stream',
    },
    userText: 'Summarize the current project state.',
    messageHistory: Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `Sanitized conversation message ${index}.`,
    })),
    createdAt: 1_003,
  };
}

describe('protected prompt compilation performance', () => {
  it('keeps ordinary envelope validation and compilation p95 below 25ms', async () => {
    const input = representativeInput();
    for (let index = 0; index < 20; index += 1) {
      compileJarvisPrompt(await createJarvisRequestEnvelope(input));
    }

    const iterations = 200;
    const durations: number[] = [];
    let systemChars = 0;
    for (let index = 0; index < iterations; index += 1) {
      const startedAt = performance.now();
      const compiled = compileJarvisPrompt(await createJarvisRequestEnvelope(input));
      durations.push(performance.now() - startedAt);
      systemChars = compiled.systemText.length;
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(iterations * 0.95) - 1]!;
    const contextChars = input.context.budget.usedChars;

    console.info(
      JSON.stringify({
        iterations,
        contextChars,
        systemChars,
        p95Ms: Number(p95.toFixed(3)),
      }),
    );
    expect(p95).toBeLessThan(25);
  }, 20_000);
});
