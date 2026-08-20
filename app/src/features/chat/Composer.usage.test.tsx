import { describe, expect, it } from 'vitest';
import { parseUsageSlashCommand, resolveUsageConnection } from '@/lib/usage/usageService';
import { CODEX_CLI_CONNECTION, OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';

describe('Composer usage interception contract', () => {
  it.each(['/usage', '/usage refresh', '/usage session', '/usage all'])(
    '%s is recognized as a local usage command',
    (command) => expect(parseUsageSlashCommand(command)).toBeDefined(),
  );

  it('does not absorb ordinary model prompts', () => {
    expect(parseUsageSlashCommand('explain /usage in prose')).toBeUndefined();
  });

  it('preserves the persisted connection and exact upstream model route', () => {
    const persistedConnection = {
      ...OPENCODE_CLI_CONNECTION,
      modelId: 'openai/gpt-5.4',
    };

    expect(
      resolveUsageConnection({
        persistedConnection,
        selectedConnectionId: CODEX_CLI_CONNECTION.id,
        selectedModelId: 'gpt-5.4',
        connections: [CODEX_CLI_CONNECTION, OPENCODE_CLI_CONNECTION],
      }),
    ).toBe(persistedConnection);
  });

  it('attaches the selected model to the selected connection descriptor', () => {
    expect(
      resolveUsageConnection({
        selectedConnectionId: OPENCODE_CLI_CONNECTION.id,
        selectedModelId: 'openai/gpt-5.4',
        connections: [CODEX_CLI_CONNECTION, OPENCODE_CLI_CONNECTION],
      }),
    ).toMatchObject({
      id: OPENCODE_CLI_CONNECTION.id,
      modelId: 'openai/gpt-5.4',
    });
  });
});
