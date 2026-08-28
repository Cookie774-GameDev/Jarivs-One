import { describe, expect, it } from 'vitest';
import { OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import { describeJarvisScheduleModelIdentity } from './jarvisScheduleModelIdentity';

describe('describeJarvisScheduleModelIdentity', () => {
  it('projects the exact saved provider, connection, model, Fast route, and effort boundary', () => {
    expect(
      describeJarvisScheduleModelIdentity({
        mode: 'single',
        providerId: OPENCODE_CLI_CONNECTION.providerId as never,
        modelId: 'openai/gpt-5.6-sol-fast',
        connectionId: OPENCODE_CLI_CONNECTION.id,
        connectionMode: OPENCODE_CLI_CONNECTION.mode,
        authSource: OPENCODE_CLI_CONNECTION.authSource,
        capabilities: OPENCODE_CLI_CONNECTION.capabilities,
      }),
    ).toEqual({
      provider: 'OpenCode',
      connection: OPENCODE_CLI_CONNECTION.id,
      model: 'openai/gpt-5.6-sol-fast',
      fast: 'Exact route',
      effort: 'Provider default',
      summary:
        'Provider: OpenCode · Connection: opencode-cli · Model: openai/gpt-5.6-sol-fast · Fast: exact route · Effort: provider default',
    });
  });

  it('does not invent a connection or Fast state for a legacy provider route', () => {
    expect(
      describeJarvisScheduleModelIdentity({
        mode: 'single',
        providerId: 'google',
        modelId: 'gemini-fast-thinking-v2',
      }),
    ).toEqual({
      provider: 'Gemini',
      connection: 'Not recorded',
      model: 'gemini-fast-thinking-v2',
      fast: 'Provider default',
      effort: 'Provider default',
      summary:
        'Provider: Gemini · Connection: not recorded · Model: gemini-fast-thinking-v2 · Fast: provider default · Effort: provider default',
    });
  });

  it('returns no receipt for a non-single selection', () => {
    expect(describeJarvisScheduleModelIdentity({ mode: 'none' })).toBeNull();
  });
});
