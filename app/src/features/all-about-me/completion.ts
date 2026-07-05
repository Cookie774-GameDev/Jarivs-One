import type { Agent, AgentId } from '@/types';
import type { ProviderId } from '@/types/common';
import { useAuthStore } from '@/stores/auth';
import { runAgent } from '@/lib/ai/router';
import { applyChatModelSelectionToAgent } from '@/lib/ai/modelSelection';
import {
  defaultModelForProvider,
  getAccessibleModelOptions,
  getAccessibleProviders,
} from '@/lib/ai/models';

export interface AllAboutMeModelOption {
  id: string;
  label: string;
  provider: Exclude<ProviderId, 'mock'>;
  model: string;
}

export function getAllAboutMeModelOptions(): AllAboutMeModelOption[] {
  const auth = useAuthStore.getState();
  const providers = getAccessibleProviders(
    auth.apiKeys,
    auth.offlineMode,
    auth.plan,
    auth.defaultLocalModel,
  ).filter((provider): provider is Exclude<ProviderId, 'mock'> => provider !== 'mock');
  return providers.flatMap((provider) =>
    getAccessibleModelOptions(
      provider,
      auth.apiKeys,
      auth.offlineMode,
      auth.defaultLocalModel,
      auth.plan,
    )
      .filter((option) => option.provider !== 'mock')
      .map((option) => ({
        id: `${option.provider}:${option.id}`,
        label: option.label,
        provider: option.provider as Exclude<ProviderId, 'mock'>,
        model: option.id,
      })),
  );
}

function makeProfileAgent(selection?: AllAboutMeModelOption): Agent {
  const auth = useAuthStore.getState();
  const provider = selection?.provider ?? auth.defaultProvider;
  const base: Agent = {
    id: 'agent_all_about_me_generator' as AgentId,
    slug: 'all-about-me-generator',
    name: 'All About Me Generator',
    description: 'Creates and revises the user personality profile for Jarvis.',
    system_prompt: [
      'You create `AllAboutMe.md` for VibeSpace.',
      'Return only markdown.',
      'Keep it detailed, useful, and grounded in the user-provided evidence.',
      'Never include credentials, secrets, or unsupported private facts.',
    ].join('\n'),
    model: {
      provider,
      model: selection?.model || auth.selectedModels[provider] || defaultModelForProvider(provider, auth.defaultLocalModel),
    },
    tools_allowed: [],
    memory_scope: 'agent',
    capabilities: ['writing'],
    temperature: 0.45,
    max_output_tokens: 2200,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  return selection ? base : applyChatModelSelectionToAgent(base, auth.chatModelSelection);
}

export async function completeAllAboutMePrompt(
  prompt: string,
  selection?: AllAboutMeModelOption,
): Promise<string> {
  const response = await runAgent({
    agent: makeProfileAgent(selection),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.45,
    max_output_tokens: 2200,
  });
  return response.text;
}
