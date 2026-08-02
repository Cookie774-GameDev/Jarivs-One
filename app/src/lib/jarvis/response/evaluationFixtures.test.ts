import { describe, expect, it } from 'vitest';
import { buildAnthropicRequestBody } from '@/lib/ai/providers/anthropic';
import { buildGoogleRequestBody } from '@/lib/ai/providers/google';
import { buildOllamaRequestBody } from '@/lib/ai/providers/ollama';
import { buildOpenAIRequestBody } from '@/lib/ai/providers/openai';
import type { LLMRequest } from '@/lib/ai/types';
import { getBuiltinAgentDefinition } from '@/lib/jarvis/builtinAgents';
import type {
  JarvisExecutionState,
  JarvisRequestEnvelope,
  JarvisResponseMode,
} from '@/lib/jarvis/contracts';
import type { Agent, ProviderId } from '@/types';
import {
  JARVIS_EVALUATION_FIXTURE_IDS,
  JARVIS_EVALUATION_PROVIDER_FAMILIES,
  JARVIS_RESPONSE_EVALUATION_FIXTURES,
  scoreJarvisResponseEvaluation,
  type JarvisEvaluationProviderFamily,
  type JarvisResponseEvaluationFixture,
  type JarvisResponseEvaluationObservation,
} from './evaluationFixtures';
import { lintJarvisProse } from './linter';
import type { JarvisVerifiedFacts } from './modeClassifier';
import { processJarvisResponse, type RawProviderResponse } from './pipeline';

const EXPECTED_FIXTURE_IDS = [
  'greeting',
  'direct_answer',
  'technical_warning',
  'approval_required',
  'action_running',
  'action_completed',
  'action_failed',
  'action_partial',
  'plugin_unavailable',
  'mcp_unavailable',
  'terminal_stalled',
  'model_switch',
  'model_unavailable',
  'delegation',
  'schedule_output',
  'sensitive_topic',
  'long_form_artifact',
  'dry_humor_allowed',
  'dry_humor_forbidden',
] as const;

const EXACT_SYSTEM_CONTRACT = 'EXACT PROTECTED JARVIS SYSTEM CONTRACT';
const MUTABLE_AGENT_PROMPT = 'MUTABLE AGENT PROMPT MUST NOT BE SENT';

const PROVIDERS: Readonly<
  Record<
    JarvisEvaluationProviderFamily,
    Readonly<{
      providerId: ProviderId;
      modelId: string;
      connectionMode: 'native-api' | 'local';
    }>
  >
> = Object.freeze({
  'openai-compatible': Object.freeze({
    providerId: 'openai',
    modelId: 'gpt-evaluation',
    connectionMode: 'native-api',
  }),
  'anthropic-style': Object.freeze({
    providerId: 'anthropic',
    modelId: 'claude-evaluation',
    connectionMode: 'native-api',
  }),
  'gemini-style': Object.freeze({
    providerId: 'google',
    modelId: 'gemini-evaluation',
    connectionMode: 'native-api',
  }),
  'ollama-local': Object.freeze({
    providerId: 'ollama',
    modelId: 'llama-evaluation',
    connectionMode: 'local',
  }),
});

function llmRequestFor(
  fixture: JarvisResponseEvaluationFixture,
  providerFamily: JarvisEvaluationProviderFamily,
): LLMRequest {
  const provider = PROVIDERS[providerFamily];
  const agent: Agent = {
    ...getBuiltinAgentDefinition('jarvis'),
    id: 'agent-evaluation' as Agent['id'],
    name: 'JARVIS',
    description: 'Evaluation fixture agent.',
    system_prompt: MUTABLE_AGENT_PROMPT,
    model: { provider: provider.providerId, model: provider.modelId },
    created_at: 1,
    updated_at: 1,
  };
  return {
    agent,
    systemPrompt: EXACT_SYSTEM_CONTRACT,
    messages: [{ role: 'user', content: fixture.userText }],
  };
}

function constructProviderRequest(
  fixture: JarvisResponseEvaluationFixture,
  providerFamily: JarvisEvaluationProviderFamily,
): Readonly<{ systemContract: string; serialized: string; temperature: number }> {
  const request = llmRequestFor(fixture, providerFamily);
  switch (providerFamily) {
    case 'openai-compatible': {
      const body = buildOpenAIRequestBody(request);
      const system = body.messages.find((message) => message.role === 'system');
      return {
        systemContract: String(system?.content ?? ''),
        serialized: JSON.stringify(body),
        temperature: body.temperature,
      };
    }
    case 'anthropic-style': {
      const body = buildAnthropicRequestBody(request);
      return {
        systemContract: body.system,
        serialized: JSON.stringify(body),
        temperature: body.temperature,
      };
    }
    case 'gemini-style': {
      const body = buildGoogleRequestBody(request);
      return {
        systemContract: body.systemInstruction.parts[0]?.text ?? '',
        serialized: JSON.stringify(body),
        temperature: body.generationConfig.temperature,
      };
    }
    case 'ollama-local': {
      const body = buildOllamaRequestBody(request);
      const system = body.messages.find((message) => message.role === 'system');
      return {
        systemContract: String(system?.content ?? ''),
        serialized: JSON.stringify(body),
        temperature: body.options.temperature,
      };
    }
  }
}

function factsFor(fixture: JarvisResponseEvaluationFixture): JarvisVerifiedFacts {
  const executionState: JarvisExecutionState | undefined = fixture.executionStatus
    ? {
        status: fixture.executionStatus,
        verifiedBy: 'journal',
        lastEventSeq: 7,
      }
    : undefined;
  return {
    ...(executionState ? { executionState } : {}),
    modelState: fixture.modelState ?? 'authenticated',
    plugins: fixture.plugins ?? [],
    mcps: fixture.mcps ?? [],
    ...(fixture.terminalState ? { terminalState: fixture.terminalState } : {}),
    ...(fixture.humorHistory ? { humorHistory: fixture.humorHistory } : {}),
  };
}

function requestFor(
  fixture: JarvisResponseEvaluationFixture,
  providerFamily: JarvisEvaluationProviderFamily,
): Readonly<JarvisRequestEnvelope> {
  const provider = PROVIDERS[providerFamily];
  return {
    schemaVersion: 1,
    requestId: `jreq_eval_${fixture.id}_${providerFamily.replaceAll('-', '_')}`,
    runId: `jrun_eval_${fixture.id}_${providerFamily.replaceAll('-', '_')}`,
    accountId: 'account-evaluation',
    agent: { id: 'agent-jarvis', slug: 'jarvis', builtin: true },
    surface: 'typed_chat',
    interactionMode: 'agent',
    userText: fixture.userText,
    messageHistory: [],
    identity: {
      identityVersion: 1,
      coreHash: 'a'.repeat(64),
      responseContractHash: 'b'.repeat(64),
    },
    profile: {
      profileId: 'profile-evaluation',
      revisionId: 'revision-evaluation',
      customInstructions: '',
      memoryScope: 'none',
    },
    capabilities: {
      capturedAt: 1,
      tools: [],
      plugins: [...(fixture.plugins ?? [])],
      mcps: [...(fixture.mcps ?? [])],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable', capabilities: [] },
    },
    model: {
      ...provider,
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
    ...(fixture.responseModeHint ? { responseModeHint: fixture.responseModeHint } : {}),
    createdAt: 1,
  };
}

function rawFor(
  fixture: JarvisResponseEvaluationFixture,
  providerFamily: JarvisEvaluationProviderFamily,
): RawProviderResponse {
  const provider = PROVIDERS[providerFamily];
  const shared = {
    provider: {
      ...provider,
      capabilities: {},
      capturedAt: 1,
    },
    verifiedFacts: factsFor(fixture),
    completedAt: 10,
  };
  switch (providerFamily) {
    case 'openai-compatible': {
      const response = { choices: [{ message: { content: fixture.providerText } }] };
      return { ...shared, text: response.choices[0]!.message.content };
    }
    case 'anthropic-style': {
      const response = { content: [{ type: 'text' as const, text: fixture.providerText }] };
      return { ...shared, text: response.content.map((block) => block.text).join('') };
    }
    case 'gemini-style': {
      const response = {
        candidates: [{ content: { parts: [{ text: fixture.providerText }] } }],
      };
      return {
        ...shared,
        text: response.candidates[0]!.content.parts.map((part) => part.text).join(''),
      };
    }
    case 'ollama-local': {
      const response = { message: { role: 'assistant' as const, content: fixture.providerText } };
      return { ...shared, text: response.message.content };
    }
  }
}

function hasUnsupportedActionClaim(
  text: string,
  mode: JarvisResponseMode,
  facts: Readonly<JarvisVerifiedFacts>,
): boolean {
  const unsupportedCodes = new Set([
    'unsupported_action_macro',
    'verified_state_contradiction',
    'provider_only_terminal_claim',
    'verified_capability_contradiction',
    'verified_model_contradiction',
  ]);
  return lintJarvisProse(text, mode, facts).some((item) => unsupportedCodes.has(item.code));
}

function toolStateAccurate(
  fixture: JarvisResponseEvaluationFixture,
  displayText: string,
): boolean | null {
  const expected = fixture.toolStateExpectation;
  if (!expected) return null;
  const escapedId = expected.capabilityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactState = new RegExp(`\\b${escapedId}\\b[^.!?\\n]{0,80}\\b${expected.state}\\b`, 'i');
  const strongerState = new RegExp(
    `\\b${escapedId}\\b[^.!?\\n]{0,80}\\b(?:connected|authenticated)\\b`,
    'i',
  );
  return exactState.test(displayText) && !strongerState.test(displayText);
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

describe('JARVIS response evaluation fixtures', () => {
  it('defines one deeply frozen representative fixture for every required response case', () => {
    expect(JARVIS_EVALUATION_FIXTURE_IDS).toEqual(EXPECTED_FIXTURE_IDS);
    expect(new Set(JARVIS_EVALUATION_FIXTURE_IDS).size).toBe(EXPECTED_FIXTURE_IDS.length);
    expect(Object.keys(JARVIS_RESPONSE_EVALUATION_FIXTURES)).toEqual(EXPECTED_FIXTURE_IDS);

    for (const id of EXPECTED_FIXTURE_IDS) {
      const fixture = JARVIS_RESPONSE_EVALUATION_FIXTURES[id];
      expect(fixture.id).toBe(id);
      expect(fixture.userText.trim()).not.toBe('');
      expect(fixture.providerText.trim()).not.toBe('');
    }
    expectDeeplyFrozen(JARVIS_EVALUATION_FIXTURE_IDS);
    expectDeeplyFrozen(JARVIS_RESPONSE_EVALUATION_FIXTURES);
  });

  it('uses the tuned protected JARVIS temperature in every provider request builder', () => {
    const fixture = JARVIS_RESPONSE_EVALUATION_FIXTURES.direct_answer;

    for (const providerFamily of JARVIS_EVALUATION_PROVIDER_FAMILIES) {
      expect(constructProviderRequest(fixture, providerFamily).temperature).toBe(0.3);
    }
  });

  it('runs the identical fixture set through all four required mock provider families', async () => {
    expect(JARVIS_EVALUATION_PROVIDER_FAMILIES).toEqual([
      'openai-compatible',
      'anthropic-style',
      'gemini-style',
      'ollama-local',
    ]);
    const observedIds = new Map<JarvisEvaluationProviderFamily, string[]>();
    const observations: JarvisResponseEvaluationObservation[] = [];

    for (const providerFamily of JARVIS_EVALUATION_PROVIDER_FAMILIES) {
      const ids: string[] = [];
      for (const fixture of Object.values(
        JARVIS_RESPONSE_EVALUATION_FIXTURES,
      ) as readonly JarvisResponseEvaluationFixture[]) {
        const constructedRequest = constructProviderRequest(fixture, providerFamily);
        expect(constructedRequest.systemContract).toBe(EXACT_SYSTEM_CONTRACT);
        expect(constructedRequest.serialized).toContain(fixture.userText);
        expect(constructedRequest.serialized).not.toContain(MUTABLE_AGENT_PROMPT);

        const facts = factsFor(fixture);
        const result = await processJarvisResponse(
          rawFor(fixture, providerFamily),
          requestFor(fixture, providerFamily),
          {
            repair: async () =>
              'The response needs correction, sir. Review the verified state and safety context before continuing.',
          },
        );
        ids.push(fixture.id);
        expect(
          result.mode,
          JSON.stringify({
            fixtureId: fixture.id,
            providerFamily,
            displayText: result.displayText,
          }),
        ).toBe(fixture.expectedMode);
        expect(result.displayText).not.toMatch(
          /\b(?:as an ai(?: language model)?|i am just a computer program)\b/i,
        );

        const structuredOutputPreserved = fixture.expectedStructuredBytes
          ? result.displayText.includes(fixture.expectedStructuredBytes)
          : null;
        const accurateToolState = toolStateAccurate(fixture, result.displayText);
        if (structuredOutputPreserved !== null) expect(structuredOutputPreserved).toBe(true);
        if (accurateToolState !== null) expect(accurateToolState).toBe(true);
        const violationCodes = lintJarvisProse(result.displayText, result.mode, facts).map(
          (item) => item.code,
        );

        observations.push({
          fixtureId: fixture.id,
          providerFamily,
          displayText: result.displayText,
          violationCodes,
          structuredOutputPreserved,
          toolStateAccurate: accurateToolState,
        });
        expect(
          hasUnsupportedActionClaim(result.displayText, result.mode, facts),
          JSON.stringify({
            fixtureId: fixture.id,
            providerFamily,
            displayText: result.displayText,
            violationCodes,
          }),
        ).toBe(false);
      }
      observedIds.set(providerFamily, ids);
    }

    for (const providerFamily of JARVIS_EVALUATION_PROVIDER_FAMILIES) {
      expect(observedIds.get(providerFamily)).toEqual(EXPECTED_FIXTURE_IDS);
    }
    expect(observations).toHaveLength(
      EXPECTED_FIXTURE_IDS.length * JARVIS_EVALUATION_PROVIDER_FAMILIES.length,
    );

    const score = scoreJarvisResponseEvaluation(observations);
    expect(score.totalObservations).toBe(76);
    expect(score.forbiddenOpeningRate).toBe(0);
    expect(score.unsupportedActionClaimRate).toBe(0);
    expect(score.sirOveruseRate).toBe(0);
    expect(score.structuredOutputPreservationRate).toBe(1);
    expect(score.toolStateAccuracyRate).toBe(1);
    expect(score.genericAiDisclaimerRate).toBe(0);
    expect(score.averageSentenceCount).toBeGreaterThan(0);
  });

  it('scores exact rates and excludes non-applicable structured/tool observations', () => {
    const observations: readonly JarvisResponseEvaluationObservation[] = [
      {
        fixtureId: 'direct_answer',
        providerFamily: 'openai-compatible',
        displayText:
          'Sure! As an AI language model, I completed the action, sir. Sir, the result is ready. Proceed.',
        violationCodes: ['verified_state_contradiction'],
        structuredOutputPreserved: false,
        toolStateAccurate: false,
      },
      {
        fixtureId: 'long_form_artifact',
        providerFamily: 'anthropic-style',
        displayText: 'The artifact is ready.',
        violationCodes: [],
        structuredOutputPreserved: true,
        toolStateAccurate: true,
      },
      {
        fixtureId: 'greeting',
        providerFamily: 'ollama-local',
        displayText: 'Ready.',
        violationCodes: [],
        structuredOutputPreserved: null,
        toolStateAccurate: null,
      },
    ];

    expect(scoreJarvisResponseEvaluation(observations)).toEqual({
      totalObservations: 3,
      forbiddenOpeningRate: 1 / 3,
      averageSentenceCount: 2,
      unsupportedActionClaimRate: 1 / 3,
      sirOveruseRate: 1 / 3,
      structuredOutputPreservationRate: 0.5,
      toolStateAccuracyRate: 0.5,
      genericAiDisclaimerRate: 1 / 3,
    });
  });
});
