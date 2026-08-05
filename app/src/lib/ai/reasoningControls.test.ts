import { describe, expect, it } from 'vitest';
import {
  getReasoningCapabilities,
  normalizeReasoningPreference,
  resolveReasoningPolicy,
  sanitizeReasoningProviderOptions,
  type ReasoningSelection,
} from './reasoningControls';

function selection(providerId: string, modelId: string, connectionId?: string): ReasoningSelection {
  return { providerId, modelId, ...(connectionId ? { connectionId } : {}) };
}

describe('reasoning controls', () => {
  it.each([
    [
      selection('openai', 'gpt-5.6-sol', 'openai-codex'),
      ['low', 'medium', 'high', 'ultra'],
      'xhigh',
    ],
    [selection('openai', 'gpt-5.5'), ['minimal', 'low', 'medium', 'high', 'ultra'], 'xhigh'],
    [selection('anthropic', 'claude-opus-4-8'), ['low', 'medium', 'high', 'ultra'], 'max'],
    [selection('google', 'gemini-3.5-flash'), ['minimal', 'low', 'medium', 'high'], 'high'],
    [selection('groq', 'openai/gpt-oss-20b'), ['low', 'medium', 'high'], 'high'],
    [selection('xai', 'grok-4.20-multi-agent'), ['low', 'medium', 'high', 'ultra'], 'xhigh'],
  ] as const)(
    'exposes only verified effort levels for %o',
    (selected, expectedEfforts, expectedUltraWire) => {
      const capabilities = getReasoningCapabilities(selected);
      expect(capabilities.supportedEfforts).toEqual(expectedEfforts);
      const resolved = resolveReasoningPolicy({
        selection: selected,
        preference: { mode: 'normal', effortOverride: 'ultra' },
      });
      expect(Object.values(resolved.providerOptions)).toContain(expectedUltraWire);
    },
  );

  it.each([
    selection('openai', 'gpt-4o'),
    selection('qwen', 'qwen3.6-27b'),
    selection('groq', 'qwen/qwen3.6-27b'),
    selection('ollama', 'qwen3.5:4b'),
    selection('ollama', 'gpt-oss:20b'),
    selection('deepseek', 'deepseek-chat'),
  ])('does not fabricate adjustable effort for %o', (selected) => {
    expect(getReasoningCapabilities(selected).supportedEfforts).toEqual([]);
    expect(
      resolveReasoningPolicy({
        selection: selected,
        preference: { mode: 'token-final-boss', effortOverride: null },
      }),
    ).toMatchObject({ resolvedEffort: null, providerOptions: {} });
  });

  it('snaps unsupported values to the nearest supported level without changing the model', () => {
    const selected = selection('google', 'gemini-2.5-pro');
    expect(
      resolveReasoningPolicy({
        selection: selected,
        preference: { mode: 'normal', effortOverride: 'minimal' },
      }),
    ).toEqual({
      mode: 'normal',
      selection: selected,
      requestedEffort: 'minimal',
      resolvedEffort: 'low',
      providerOptions: { thinking_level: 'low' },
      maxOutputTokens: undefined,
    });
  });

  it('maps modes to lowest, provider-default, and highest effort while preserving the model', () => {
    const selected = selection('openai', 'gpt-5.6-sol', 'openai-codex');
    expect(
      resolveReasoningPolicy({
        selection: selected,
        preference: { mode: 'token-saver', effortOverride: null },
      }),
    ).toMatchObject({
      selection: selected,
      resolvedEffort: 'low',
      providerOptions: { reasoning_effort: 'low' },
      maxOutputTokens: 2048,
    });
    expect(
      resolveReasoningPolicy({
        selection: selected,
        preference: { mode: 'normal', effortOverride: null },
      }),
    ).toMatchObject({
      selection: selected,
      resolvedEffort: null,
      providerOptions: {},
      maxOutputTokens: undefined,
    });
    expect(
      resolveReasoningPolicy({
        selection: selected,
        preference: { mode: 'token-final-boss', effortOverride: null },
      }),
    ).toMatchObject({
      selection: selected,
      resolvedEffort: 'ultra',
      providerOptions: { reasoning_effort: 'xhigh' },
      maxOutputTokens: undefined,
    });
  });

  it('normalizes malformed persisted preferences to Normal without an override', () => {
    expect(normalizeReasoningPreference({ mode: 'wild', effortOverride: 'infinite' })).toEqual({
      mode: 'normal',
      effortOverride: null,
    });
  });

  it('allows only the exact option and wire values verified for the selected model', () => {
    const selected = selection('openai', 'gpt-5.6-sol', 'openai-codex');
    expect(sanitizeReasoningProviderOptions(selected, { reasoning_effort: 'xhigh' })).toEqual({
      reasoning_effort: 'xhigh',
    });
    expect(
      sanitizeReasoningProviderOptions(selected, {
        reasoning_effort: 'arbitrary',
        unsafe_extra: 'ignored',
      }),
    ).toEqual({});
    expect(
      sanitizeReasoningProviderOptions(selection('qwen', 'qwen3.6-27b'), {
        reasoning_effort: 'high',
      }),
    ).toEqual({});
  });
});
