import { describe, expect, it } from 'vitest';
import type { PromptForgeModelOption } from './modelSelection';
import {
  buildPromptForgeModelPickerGroups,
  PromptForgeModelSelectionError,
  pickFastPromptUpgradeFallback,
  promptForgePickerSelectedId,
  resolvePromptForgeModelSelection,
} from './modelSelection';

const options: readonly PromptForgeModelOption[] = Object.freeze([
  {
    id: 'ollama-local:qwen3:8b',
    providerId: 'ollama',
    modelId: 'qwen3:8b',
    label: 'Qwen 3 8B',
    connectionId: 'ollama-local',
    connectionMode: 'local',
    localOnly: true,
    available: true,
  },
  {
    id: 'openai-codex:gpt-5.6-sol',
    providerId: 'openai',
    modelId: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    connectionId: 'openai-codex',
    connectionMode: 'external-cli',
    variants: ['high', 'max'],
    localOnly: false,
    available: true,
  },
  {
    id: 'openai-api:gpt-4o-mini',
    providerId: 'openai',
    modelId: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    connectionId: 'openai-api',
    connectionMode: 'native-api',
    localOnly: false,
    available: true,
  },
]);

const context = {
  currentChatSelection: {
    mode: 'single' as const,
    providerId: 'openai' as const,
    modelId: 'gpt-5.6-sol',
    connectionId: 'openai-codex',
    effort: 'max' as const,
  },
  options,
  offlineMode: false,
  defaultLocalModel: 'qwen3:8b',
};

describe('Prompt Forge model selection', () => {
  it('builds provider-grouped shared-picker options without losing exact route identity', () => {
    const connection = {
      id: 'openai-codex',
      providerId: 'openai',
      displayName: 'OpenCode Go',
      mode: 'external-cli',
    } as never;
    const grouped = buildPromptForgeModelPickerGroups([
      { ...options[1]!, connection, variants: ['high'] },
      options[2]!,
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ id: 'prompt-forge:openai', provider: 'openai' });
    expect(grouped[0]?.options[0]).toMatchObject({
      id: 'openai-codex:gpt-5.6-sol',
      provider: 'openai',
      modelId: 'gpt-5.6-sol',
      connection,
      connectionId: 'openai-codex',
      variants: ['high'],
    });
    expect(
      promptForgePickerSelectedId(
        {
          mode: 'single',
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          connectionId: 'openai-codex',
          effort: 'high',
        },
        grouped,
      ),
    ).toBe('openai-codex:gpt-5.6-sol');
  });

  it('resolves the current chat connection without changing that chat selection', () => {
    const original = structuredClone(context.currentChatSelection);
    const resolved = resolvePromptForgeModelSelection({ mode: 'current_chat_model' }, context);
    expect(resolved).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      connectionId: 'openai-codex',
      connectionMode: 'external-cli',
      effort: 'max',
      local: false,
    });
    expect(context.currentChatSelection).toEqual(original);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('prefers the configured available local Ollama model', () => {
    expect(resolvePromptForgeModelSelection({ mode: 'prefer_local' }, context)).toMatchObject({
      providerId: 'ollama',
      modelId: 'qwen3:8b',
      connectionId: 'ollama-local',
      local: true,
    });
  });

  it('resolves an exact subscription connection and rejects ambiguity', () => {
    expect(
      resolvePromptForgeModelSelection(
        {
          mode: 'single',
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          connectionId: 'openai-codex',
          effort: 'high',
        },
        context,
      ),
    ).toMatchObject({ connectionId: 'openai-codex', effort: 'high' });
    expect(() =>
      resolvePromptForgeModelSelection(
        {
          mode: 'single',
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          connectionId: 'openai-codex',
          effort: 'ultra',
        },
        context,
      ),
    ).toThrow(/effort.*unavailable/i);
    expect(() =>
      resolvePromptForgeModelSelection(
        { mode: 'single', providerId: 'openai', modelId: 'same-model' },
        {
          ...context,
          options: [
            { ...options[1]!, modelId: 'same-model' },
            { ...options[2]!, modelId: 'same-model' },
          ],
        },
      ),
    ).toThrow(/connection/i);
  });

  it('fails closed for offline cloud, unavailable, and Hive current-chat selections', () => {
    expect(() =>
      resolvePromptForgeModelSelection(
        {
          mode: 'single',
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          connectionId: 'openai-codex',
        },
        { ...context, offlineMode: true },
      ),
    ).toThrow(/offline/i);
    expect(() =>
      resolvePromptForgeModelSelection(
        { mode: 'single', providerId: 'openai', modelId: 'missing' },
        context,
      ),
    ).toThrow(PromptForgeModelSelectionError);
    expect(() =>
      resolvePromptForgeModelSelection(
        { mode: 'current_chat_model' },
        {
          ...context,
          currentChatSelection: { mode: 'hive', hiveId: 'balanced' },
        },
      ),
    ).toThrow(/single.*model/i);
  });

  it.each([
    {
      label: 'an explicit single route',
      selection: {
        mode: 'single' as const,
        providerId: 'openai' as const,
        modelId: 'missing-exact-model',
        connectionId: 'missing-exact-connection',
      },
      currentChatSelection: context.currentChatSelection,
    },
    {
      label: 'the exact current chat route',
      selection: { mode: 'current_chat_model' as const },
      currentChatSelection: {
        ...context.currentChatSelection,
        modelId: 'missing-exact-model',
        connectionId: 'missing-exact-connection',
      },
    },
  ])(
    'does not replace $label with an available fast fallback',
    ({ selection, currentChatSelection }) => {
      const sparkFallback: PromptForgeModelOption = {
        id: 'openai-codex:gpt-5.3-codex-spark',
        providerId: 'openai',
        modelId: 'gpt-5.3-codex-spark',
        label: 'GPT-5.3 Codex Spark',
        connectionId: 'openai-codex',
        connectionMode: 'external-cli',
        variants: ['max'],
        localOnly: false,
        available: true,
      };

      expect(() =>
        resolvePromptForgeModelSelection(selection, {
          ...context,
          currentChatSelection,
          options: [sparkFallback],
          defaultLocalModel: '',
        }),
      ).toThrow(expect.objectContaining({ code: 'model_unavailable' }));
    },
  );

  it('falls back to GPT-5.3 Spark when no local model is downloaded', () => {
    const spark: PromptForgeModelOption = {
      id: 'openai-codex:gpt-5.3-codex-spark',
      providerId: 'openai',
      modelId: 'gpt-5.3-codex-spark',
      label: 'GPT-5.3 Codex Spark',
      connectionId: 'openai-codex',
      connectionMode: 'external-cli',
      localOnly: false,
      available: true,
    };
    const claude: PromptForgeModelOption = {
      id: 'anthropic-claude:claude-opus',
      providerId: 'anthropic',
      modelId: 'claude-opus-4-6',
      label: 'Claude Opus',
      connectionId: 'anthropic-claude',
      connectionMode: 'external-cli',
      localOnly: false,
      available: true,
    };
    const cloudOnly = [spark, claude, options[1]!, options[2]!];
    expect(pickFastPromptUpgradeFallback(cloudOnly)?.modelId).toBe('gpt-5.3-codex-spark');
    expect(
      resolvePromptForgeModelSelection(
        { mode: 'prefer_local' },
        { ...context, options: cloudOnly, defaultLocalModel: '' },
      ),
    ).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-5.3-codex-spark',
      local: false,
    });
  });
});
