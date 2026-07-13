import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import {
  applyChatModelSelectionToAgent,
  CHOOSE_MODEL_LABEL,
  EMPTY_CHAT_MODEL_SELECTION,
  formatChatModelSelectionLabel,
  migrateLegacyModelSelection,
  normalizeChatModelSelection,
  resolveActiveStackPreset,
  selectionFromOption,
  validateChatModelSelection,
  validateSendModelAccess,
} from './modelSelection';
import type { Agent } from '@/types';
import type { ProviderCapabilities } from './adapters/types';

const nativeCapabilities: ProviderCapabilities = {
  text: true,
  images: true,
  files: false,
  tools: true,
  modelSelection: true,
  structuredOutput: true,
  streaming: true,
  cancellation: true,
  resumeSession: false,
  systemPrompt: true,
  workingDirectory: false,
  usage: true,
  subscriptionQuota: false,
  localOnly: false,
};

const jarvis: Agent = {
  id: 'agent_jarvis' as Agent['id'],
  slug: 'jarvis',
  name: 'Jarvis',
  description: 'Jarvis',
  system_prompt: 'You are Jarvis.',
  model: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  tools_allowed: [],
  memory_scope: 'workspace',
  capabilities: [],
  builtin: true,
  created_at: 1,
  updated_at: 1,
};

describe('modelSelection', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom */
    }
    useAuthStore.setState({
      apiKeys: {},
      chatModelSelection: EMPTY_CHAT_MODEL_SELECTION,
      stackPreset: 'off',
      stackCustomSteps: [],
      offlineMode: false,
      defaultLocalModel: 'llama3.2',
      plan: 'free',
    });
  });

  it('shows Choose model when nothing is selected', () => {
    expect(
      formatChatModelSelectionLabel(EMPTY_CHAT_MODEL_SELECTION, {
        apiKeys: {},
        offlineMode: false,
        plan: 'free',
        defaultLocalModel: 'llama3.2',
      }),
    ).toBe(CHOOSE_MODEL_LABEL);
  });

  it('blocks typed send when no model is selected', () => {
    const ctx = { apiKeys: {}, offlineMode: false, plan: 'free' as const, defaultLocalModel: 'llama3.2' };
    const result = validateSendModelAccess('hello', EMPTY_CHAT_MODEL_SELECTION, ctx, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('No model chosen');
    }
  });

  it('blocks voice send when no model is selected', () => {
    const ctx = { apiKeys: {}, offlineMode: false, plan: 'free' as const, defaultLocalModel: 'llama3.2' };
    const result = validateSendModelAccess('hello', EMPTY_CHAT_MODEL_SELECTION, ctx, [], { voice: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('JARVIS voice');
    }
  });

  it('does not treat Hive as default on fresh install', () => {
    expect(migrateLegacyModelSelection({
      stackPreset: 'off',
      defaultProvider: 'google',
      selectedModels: {},
    })).toEqual(EMPTY_CHAT_MODEL_SELECTION);
  });

  it('migrates legacy single-model selection', () => {
    expect(migrateLegacyModelSelection({
      stackPreset: 'off',
      defaultProvider: 'groq',
      selectedModels: { groq: 'llama-3.3-70b-versatile' },
    })).toEqual({
      mode: 'single',
      providerId: 'groq',
      modelId: 'llama-3.3-70b-versatile',
    });
  });

  it('round-trips a single selection with its exact connection identity', () => {
    const selection = {
      mode: 'single' as const,
      providerId: 'openai' as const,
      modelId: 'gpt-5.2',
      connectionId: 'openai-api',
      connectionMode: 'native-api' as const,
      authSource: 'api-key',
      capabilities: nativeCapabilities,
    };

    expect(normalizeChatModelSelection(selection)).toEqual(selection);
  });

  it('keeps legacy persisted selections without inventing a connection', () => {
    expect(normalizeChatModelSelection({
      mode: 'single',
      providerId: 'groq',
      modelId: 'llama-3.3-70b-versatile',
    })).toEqual({
      mode: 'single',
      providerId: 'groq',
      modelId: 'llama-3.3-70b-versatile',
    });
  });

  it('fails closed when persisted connection metadata is incomplete', () => {
    expect(normalizeChatModelSelection({
      mode: 'single',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      connectionId: 'openai-codex',
    })).toEqual(EMPTY_CHAT_MODEL_SELECTION);
  });

  it('migrates legacy Hive selection to Balanced', () => {
    expect(migrateLegacyModelSelection({
      stackPreset: 'quality',
      defaultProvider: 'google',
      selectedModels: {},
    })).toEqual({ mode: 'hive', hiveId: 'balanced' });
  });

  it('only activates Hive when explicitly selected', () => {
    expect(
      resolveActiveStackPreset(EMPTY_CHAT_MODEL_SELECTION, { matched: false, text: 'hi', preset: undefined, taskType: undefined }),
    ).toBe('off');
    expect(
      resolveActiveStackPreset({ mode: 'hive', hiveId: 'balanced' }, { matched: false, text: 'hi', preset: undefined, taskType: undefined }),
    ).toBe('balanced');
  });

  it('applies user single-model selection to Jarvis at runtime', () => {
    const selection = selectionFromOption('groq', 'llama-3.3-70b-versatile');
    const next = applyChatModelSelectionToAgent(jarvis, selection);
    expect(next.model).toEqual({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
  });

  it('allows send when a connected model is selected', () => {
    const ctx = {
      apiKeys: { groq: 'gsk_test' },
      offlineMode: false,
      plan: 'free' as const,
      defaultLocalModel: 'llama3.2',
    };
    const selection = selectionFromOption('groq', 'llama-3.3-70b-versatile');
    const validation = validateChatModelSelection(selection, ctx, []);
    expect(validation.ok).toBe(true);
    const send = validateSendModelAccess('hello', selection, ctx, []);
    expect(send.ok).toBe(true);
  });

  it('allows image attachments for vision-capable models', () => {
    const ctx = {
      apiKeys: { google: 'AIza_test' },
      offlineMode: false,
      plan: 'free' as const,
      defaultLocalModel: 'llama3.2',
    };
    const selection = selectionFromOption('google', 'gemini-2.5-flash');
    const send = validateSendModelAccess('describe this', selection, ctx, [], {
      attachments: { hasImages: true },
    });
    expect(send.ok).toBe(true);
  });

  it('blocks image attachments for text-only models', () => {
    const ctx = {
      apiKeys: { groq: 'gsk_test' },
      offlineMode: false,
      plan: 'free' as const,
      defaultLocalModel: 'llama3.2',
    };
    const selection = selectionFromOption('groq', 'llama-3.3-70b-versatile');
    const send = validateSendModelAccess('describe this', selection, ctx, [], {
      attachments: { hasImages: true },
    });
    expect(send.ok).toBe(false);
    if (!send.ok) expect(send.message).toContain('selected model cannot see images');
  });

  it('blocks local image attachments until local multimodal payloads are implemented', () => {
    const ctx = {
      apiKeys: {},
      offlineMode: true,
      plan: 'free' as const,
      defaultLocalModel: 'llama3.2-vision',
    };
    const selection = selectionFromOption('ollama', 'llama3.2-vision');
    const send = validateSendModelAccess('describe this', selection, ctx, [], {
      attachments: { hasImages: true },
    });
    expect(send.ok).toBe(false);
  });
});
