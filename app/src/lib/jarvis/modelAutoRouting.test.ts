import { describe, expect, it } from 'vitest';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import type { LLMMessage } from '@/lib/ai/types';
import type { JarvisModelSwitchCandidate } from './modelSwitchDecision';
import {
  estimateAutomaticRoutingContextTokens,
  routeJarvisModelAutomatically,
} from './modelAutoRouting';

type SingleSelection = Extract<ChatModelSelection, { mode: 'single' }>;

function selection(providerId: SingleSelection['providerId'], modelId: string): SingleSelection {
  return { mode: 'single', providerId, modelId };
}

function candidate(
  providerId: SingleSelection['providerId'],
  modelId: string,
  overrides: Partial<JarvisModelSwitchCandidate> = {},
): JarvisModelSwitchCandidate {
  return {
    selection: selection(providerId, modelId),
    connected: true,
    available: true,
    supportsImages: true,
    supportsTools: true,
    speedRank: 50,
    codingRank: 50,
    contextWindowTokens: 128_000,
    toolReliabilityRank: 50,
    costClass: 'standard',
    maximumCostPerMillionUsd: 10,
    costMetadataSource: 'exact_rate_table',
    ...overrides,
  };
}

describe('routeJarvisModelAutomatically', () => {
  it('honors the persisted user policy and explicit Hive choice', () => {
    const candidates = [candidate('google', 'catalog-model')];
    expect(
      routeJarvisModelAutomatically({
        enabled: false,
        current: selection('openai', 'current'),
        candidates,
        offlineMode: false,
        requirements: {},
      }),
    ).toEqual({ status: 'disabled' });
    expect(
      routeJarvisModelAutomatically({
        enabled: true,
        current: { mode: 'hive', hiveId: 'balanced' },
        candidates,
        offlineMode: false,
        requirements: {},
      }),
    ).toEqual({ status: 'unchanged', reason: 'user_selection' });
  });

  it('selects an eligible vision model and emits the exact required visible reason', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('groq', 'text-only'),
      candidates: [
        candidate('groq', 'text-only', { supportsImages: false }),
        candidate('google', 'active-vision-model', {
          supportsImages: true,
          costClass: 'low',
        }),
        candidate('xai', 'unavailable-vision-model', {
          speedRank: 100,
          available: false,
        }),
      ],
      offlineMode: false,
      requirements: { images: true },
    });

    expect(result).toMatchObject({
      status: 'selected',
      reason: 'images',
      target: { providerId: 'google', modelId: 'active-vision-model' },
      message: 'Auto-selected active-vision-model because this request includes images.',
    });
  });

  it('uses tool reliability when tool use is required', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'current-tools'),
      candidates: [
        candidate('openai', 'current-tools', { toolReliabilityRank: 40 }),
        candidate('anthropic', 'reliable-tools', {
          toolReliabilityRank: 95,
          costClass: 'low',
        }),
        candidate('google', 'no-tools', { supportsTools: false, speedRank: 100 }),
      ],
      offlineMode: false,
      requirements: { tools: true },
    });

    expect(result).toMatchObject({
      status: 'selected',
      reason: 'tools',
      target: { modelId: 'reliable-tools' },
    });
  });

  it('uses known context windows and rejects candidates too small for the request', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'short-context'),
      candidates: [
        candidate('openai', 'short-context', { contextWindowTokens: 16_000 }),
        candidate('google', 'long-context', {
          contextWindowTokens: 256_000,
          costClass: 'low',
        }),
        candidate('xai', 'fast-but-too-short', {
          contextWindowTokens: 32_000,
          speedRank: 100,
        }),
      ],
      offlineMode: false,
      requirements: { estimatedContextTokens: 80_000 },
    });

    expect(result).toMatchObject({
      status: 'selected',
      reason: 'context',
      target: { modelId: 'long-context' },
    });
  });

  it('hard-filters to an active local model while offline', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('google', 'cloud-current'),
      candidates: [
        candidate('google', 'cloud-current', { speedRank: 100 }),
        candidate('ollama', 'installed-local', {
          speedRank: 20,
          costClass: 'free',
          maximumCostPerMillionUsd: 0,
          costMetadataSource: 'local',
        }),
      ],
      offlineMode: true,
      requirements: {},
    });

    expect(result).toMatchObject({
      status: 'selected',
      reason: 'offline',
      target: { providerId: 'ollama', modelId: 'installed-local' },
    });
  });

  it('never crosses local-to-cloud privacy or the current known cost ceiling', () => {
    const local = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('ollama', 'private-local'),
      candidates: [
        candidate('ollama', 'private-local', {
          costClass: 'free',
          maximumCostPerMillionUsd: 0,
          costMetadataSource: 'local',
          speedRank: 20,
        }),
        candidate('google', 'cloud-faster', {
          costClass: 'free',
          maximumCostPerMillionUsd: 0,
          speedRank: 100,
        }),
      ],
      offlineMode: false,
      requirements: {},
    });
    expect(local).toEqual({ status: 'unchanged', reason: 'already_optimal' });

    const cost = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'standard-current'),
      candidates: [
        candidate('openai', 'standard-current', {
          costClass: 'standard',
          maximumCostPerMillionUsd: 10,
          speedRank: 30,
        }),
        candidate('groq', 'low-cost', {
          costClass: 'low',
          maximumCostPerMillionUsd: 1,
          speedRank: 40,
        }),
        candidate('anthropic', 'premium-fast', {
          costClass: 'premium',
          maximumCostPerMillionUsd: 25,
          speedRank: 100,
        }),
      ],
      offlineMode: false,
      requirements: {},
    });
    expect(cost).toMatchObject({
      status: 'selected',
      reason: 'cost',
      target: { modelId: 'low-cost' },
    });
  });

  it('uses speed among equally safe candidates with stable active-catalog output', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'catalog-slow'),
      candidates: [
        candidate('openai', 'catalog-slow', { speedRank: 20 }),
        candidate('groq', 'catalog-fast', { speedRank: 90 }),
        candidate('google', 'not-connected', { speedRank: 100, connected: false }),
      ],
      offlineMode: false,
      requirements: {},
    });

    expect(result).toMatchObject({
      status: 'selected',
      reason: 'speed',
      target: { modelId: 'catalog-fast' },
    });
    expect(JSON.stringify(result)).not.toContain('not-connected');
  });

  it('never raises the exact known maximum price even inside the same cost class', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('deepseek', 'current-low'),
      candidates: [
        candidate('deepseek', 'current-low', {
          costClass: 'low',
          maximumCostPerMillionUsd: 0.28,
          speedRank: 20,
        }),
        candidate('openai', 'higher-low', {
          costClass: 'low',
          maximumCostPerMillionUsd: 0.6,
          speedRank: 100,
        }),
        candidate('google', 'cheaper-low', {
          costClass: 'low',
          maximumCostPerMillionUsd: 0.15,
          speedRank: 60,
        }),
      ],
      offlineMode: false,
      requirements: {},
    });

    expect(result).toMatchObject({
      status: 'selected',
      reason: 'cost',
      target: { modelId: 'cheaper-low' },
    });
  });

  it('rejects an unknown-cost automatic target when the current price is known', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('deepseek', 'known-current'),
      candidates: [
        candidate('deepseek', 'known-current', {
          costClass: 'low',
          maximumCostPerMillionUsd: 0.28,
          speedRank: 20,
        }),
        candidate('openai', 'unknown-fast', {
          costClass: 'unknown',
          maximumCostPerMillionUsd: undefined,
          costMetadataSource: undefined,
          speedRank: 100,
        }),
      ],
      offlineMode: false,
      requirements: {},
    });

    expect(result).toEqual({ status: 'unchanged', reason: 'already_optimal' });
  });

  it('rejects control-bearing and unbounded catalog identifiers before ranking', () => {
    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'current-safe'),
      candidates: [
        candidate('openai', 'current-safe', { speedRank: 20 }),
        candidate('google', 'unsafe\nmodel', { speedRank: 100 }),
        candidate('google', `g${'x'.repeat(256)}`, { speedRank: 99 }),
        candidate('google', 'safe-target', { speedRank: 80 }),
      ],
      offlineMode: false,
      requirements: {},
    });

    expect(result).toMatchObject({
      status: 'selected',
      target: { providerId: 'google', modelId: 'safe-target' },
    });
  });

  it('bounds candidate ranking work and ignores entries beyond the active-catalog cap', () => {
    const candidates = [
      candidate('openai', 'current-bounded', { speedRank: 20 }),
      ...Array.from({ length: 511 }, (_, index) =>
        candidate('google', `bounded-${String(index).padStart(3, '0')}`, { speedRank: 40 }),
      ),
      candidate('google', 'overflow-winner', { speedRank: 100 }),
    ];

    const result = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'current-bounded'),
      candidates,
      offlineMode: false,
      requirements: {},
    });

    expect(result).toMatchObject({ status: 'selected' });
    expect(result).not.toMatchObject({ target: { modelId: 'overflow-winner' } });
  });
});

describe('estimateAutomaticRoutingContextTokens', () => {
  it('includes the resolved system prompt and every provider-bound message', () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: '1234' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'abcd' },
          { type: 'image', data: 'ignored-base64', mimeType: 'image/png', name: 'shot.png' },
        ],
      },
    ];

    expect(estimateAutomaticRoutingContextTokens('system!!', messages)).toBe(18);
  });
});
