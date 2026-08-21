import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { VoiceModelSelector } from './VoiceModelSelector';

const setChatModelSelection = vi.fn();

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      chatModelSelection: {
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5',
        connectionId: 'openai-api',
      } as ChatModelSelection,
      setChatModelSelection,
    }),
}));

vi.mock('@/lib/ai/useAccessibleChatModels', () => ({
  useAccessibleChatModels: () => {
    const apiRoute = {
      id: 'openai-api:gpt-5',
      provider: 'openai',
      modelId: 'gpt-5',
      label: 'GPT-5',
      available: true,
      connection: {
        id: 'openai-api',
        providerId: 'openai',
        mode: 'native-api',
        authSource: 'api-key',
        capabilities: {},
      },
    };
    const unavailableApiRoute = {
      id: 'openai-api:gpt-4',
      provider: 'openai',
      modelId: 'gpt-4',
      label: 'GPT-4',
      available: false,
    };
    const baseOpenCodeRoute = {
      id: 'opencode-cli:openai/gpt-5.6-sol',
      provider: 'opencode',
      modelId: 'openai/gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      available: true,
      connection: OPENCODE_CLI_CONNECTION,
      connectionId: OPENCODE_CLI_CONNECTION.id,
      modeLabel: 'Subscription bridge · External agent',
      authLabel: 'Ready',
      catalogSource: 'opencode-live',
    };
    const fastOpenCodeRoute = {
      ...baseOpenCodeRoute,
      id: 'opencode-cli:openai/gpt-5.6-sol-fast',
      modelId: 'openai/gpt-5.6-sol-fast',
      label: 'GPT-5.6 Sol Fast',
    };

    return {
      groups: [
        {
          id: 'connection:openai-api',
          provider: 'openai',
          label: 'OpenAI API',
          options: [apiRoute, unavailableApiRoute],
        },
        {
          id: 'opencode:openai-subscription',
          provider: 'opencode',
          label: 'OpenAI Subscription',
          options: [
            {
              ...baseOpenCodeRoute,
              alternativeRoutes: [baseOpenCodeRoute, fastOpenCodeRoute],
            },
          ],
        },
      ],
      flatOptions: [apiRoute, unavailableApiRoute, baseOpenCodeRoute, fastOpenCodeRoute],
      hasAny: true,
    };
  },
}));

describe('VoiceModelSelector', () => {
  it('shows connected models, disables unavailable routes, and persists selection', () => {
    render(<VoiceModelSelector />);

    const selector = screen.getByRole('combobox', {
      name: 'Jarvis voice model',
    }) as HTMLSelectElement;
    expect(selector.value).toBe('openai-api:gpt-5');
    expect((screen.getByRole('option', { name: /GPT-4/ }) as HTMLOptionElement).disabled).toBe(
      true,
    );

    fireEvent.change(selector, { target: { value: 'openai-api:gpt-5' } });
    expect(setChatModelSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5',
        connectionId: 'openai-api',
      }),
    );
  });

  it('expands grouped exact routes and persists the selected alternate identity untouched', () => {
    setChatModelSelection.mockClear();
    render(<VoiceModelSelector />);

    const selector = screen.getByRole('combobox', {
      name: 'Jarvis voice model',
    }) as HTMLSelectElement;
    expect((screen.getByRole('option', { name: 'GPT-5.6 Sol' }) as HTMLOptionElement).value).toBe(
      'opencode-cli:openai/gpt-5.6-sol',
    );
    expect(
      (screen.getByRole('option', { name: 'GPT-5.6 Sol Fast' }) as HTMLOptionElement).value,
    ).toBe('opencode-cli:openai/gpt-5.6-sol-fast');

    fireEvent.change(selector, {
      target: { value: 'opencode-cli:openai/gpt-5.6-sol-fast' },
    });
    expect(setChatModelSelection).toHaveBeenCalledWith({
      mode: 'single',
      providerId: 'opencode',
      modelId: 'openai/gpt-5.6-sol-fast',
      connectionId: OPENCODE_CLI_CONNECTION.id,
      connectionMode: OPENCODE_CLI_CONNECTION.mode,
      authSource: OPENCODE_CLI_CONNECTION.authSource,
      capabilities: OPENCODE_CLI_CONNECTION.capabilities,
    });
  });
});
