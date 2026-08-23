import { describe, expect, it } from 'vitest';
import { selectedModelPreview } from './ChatThread';

describe('selected model session preview', () => {
  it('prefers the newly selected exact model over the previous run model', () => {
    expect(
      selectedModelPreview(
        {
          mode: 'single',
          providerId: 'google',
          modelId: 'google/gemini-2.5-flash',
          connectionId: 'opencode-cli',
          connectionMode: 'external-cli',
          authSource: 'opencode-cli-session',
          capabilities: {
            text: true,
            images: false,
            files: true,
            tools: true,
            modelSelection: true,
            structuredOutput: false,
            streaming: true,
            cancellation: true,
            resumeSession: true,
            systemPrompt: true,
            workingDirectory: true,
            usage: true,
            subscriptionQuota: false,
            localOnly: false,
          },
        },
        'deepseek/deepseek-v3.2',
      ),
    ).toBe('google/gemini-2.5-flash');
  });
});
