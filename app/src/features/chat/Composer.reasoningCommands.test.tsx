import { describe, expect, it } from 'vitest';
import {
  reasoningSelectionFromChatModel,
  tokenBossContextFromChatModel,
  tokenBossProviderForMode,
} from './Composer';

describe('Composer reasoning command selection', () => {
  it('captures the exact single model and connection without changing it', () => {
    expect(
      reasoningSelectionFromChatModel({
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        connectionId: 'openai-codex',
      }),
    ).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      connectionId: 'openai-codex',
    });
  });

  it('does not pretend a Hive or empty selection has one adjustable model', () => {
    expect(reasoningSelectionFromChatModel({ mode: 'none' })).toBeNull();
    expect(reasoningSelectionFromChatModel({ mode: 'hive', hiveId: 'balanced' })).toBeNull();
  });

  it('captures the current model context used by Token Boss without creating another model store', () => {
    expect(
      tokenBossContextFromChatModel({
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        connectionId: 'openai-codex',
      }),
    ).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      connectionId: 'openai-codex',
    });
    expect(tokenBossContextFromChatModel({ mode: 'none' })).toBeNull();
  });

  it('activates Token Boss only for Final Boss mode using the selected model provider', () => {
    const selection = {
      mode: 'single',
      providerId: 'google',
      modelId: 'gemini-2.5-pro',
      connectionId: 'gemini-cloud',
    };

    expect(tokenBossProviderForMode('normal', selection)).toBeNull();
    expect(tokenBossProviderForMode('token-saver', selection)).toBeNull();
    expect(tokenBossProviderForMode('token-final-boss', selection)?.id).toBe('gemini');
    expect(tokenBossProviderForMode('token-final-boss', { mode: 'hive' })).toBeNull();
  });
});
