import { describe, expect, it } from 'vitest';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import type { JarvisModelSwitchCandidate } from './modelSwitchDecision';
import { routeJarvisModelAutomatically } from './modelAutoRouting';

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
        candidate('ollama', 'private-local', { costClass: 'free', speedRank: 20 }),
        candidate('google', 'cloud-faster', { costClass: 'free', speedRank: 100 }),
      ],
      offlineMode: false,
      requirements: {},
    });
    expect(local).toEqual({ status: 'unchanged', reason: 'already_optimal' });

    const cost = routeJarvisModelAutomatically({
      enabled: true,
      current: selection('openai', 'standard-current'),
      candidates: [
        candidate('openai', 'standard-current', { costClass: 'standard', speedRank: 30 }),
        candidate('groq', 'low-cost', { costClass: 'low', speedRank: 40 }),
        candidate('anthropic', 'premium-fast', { costClass: 'premium', speedRank: 100 }),
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
});
