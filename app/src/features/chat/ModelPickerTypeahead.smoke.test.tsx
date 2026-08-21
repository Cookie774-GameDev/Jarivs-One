import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderConnection } from '@/lib/ai/adapters/types';
import { ModelPickerTypeahead, type ModelPickerTypeaheadRef } from './ModelPickerTypeahead';

const capabilities = {
  text: true,
  images: false,
  files: false,
  tools: false,
  modelSelection: true,
  structuredOutput: true,
  streaming: true,
  cancellation: true,
  resumeSession: false,
  systemPrompt: true,
  workingDirectory: false,
  usage: true,
  subscriptionQuota: false,
  localOnly: true,
};

function connection(id: string, mode: ProviderConnection['mode']): ProviderConnection {
  return {
    id,
    adapterId: id,
    providerId: 'vibespace-kernel-smoke',
    displayName: id,
    mode,
    authSource: 'debug-native-attestation',
    capabilities,
    promptTransport: mode === 'external-cli' ? 'prefixed-preamble' : 'native-system',
    enabled: true,
  };
}

describe('ModelPickerTypeahead smoke transports', () => {
  it('shows truthful live free pricing without disabling selection', () => {
    const openCode = connection('opencode-cli', 'external-cli');
    const onSelect = vi.fn();
    const { container } = render(
      <ModelPickerTypeahead
        groups={[
          {
            provider: 'opencode' as never,
            label: 'OpenCode Models',
            options: [
              {
                id: 'opencode-cli:openai/gpt-free',
                provider: 'opencode' as never,
                modelId: 'openai/gpt-free',
                label: 'GPT Free',
                connection: openCode,
                available: true,
                pricingStatus: 'free',
                isFree: true,
              },
            ],
          },
        ]}
        selectedId="opencode-cli:openai/gpt-free"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('OpenCode Models')).not.toBeNull();
    expect(screen.getByText('Free')).not.toBeNull();
    const option = container.querySelector('[data-model-price="free"]');
    expect(option).not.toBeNull();
    fireEvent.click(option!);
    expect(onSelect).toHaveBeenCalledWith('opencode', 'openai/gpt-free', openCode);
  });

  it('exposes and selects each exact real connection through its closed control', () => {
    const native = connection('vibespace-kernel-smoke-native', 'native-api');
    const cli = connection('vibespace-kernel-smoke-cli', 'external-cli');
    const onSelect = vi.fn();
    const { container } = render(
      <ModelPickerTypeahead
        groups={[
          {
            provider: 'vibespace-kernel-smoke' as never,
            label: 'VibeSpace Kernel Smoke',
            options: [
              {
                id: `${native.id}:kernel-smoke-v1`,
                provider: 'vibespace-kernel-smoke' as never,
                modelId: 'kernel-smoke-v1',
                label: 'Kernel Smoke v1',
                connection: native,
              },
              {
                id: `${cli.id}:kernel-smoke-v1`,
                provider: 'vibespace-kernel-smoke' as never,
                modelId: 'kernel-smoke-v1',
                label: 'Kernel Smoke v1',
                connection: cli,
              },
            ],
          },
        ]}
        selectedId={`${native.id}:kernel-smoke-v1`}
        onSelect={onSelect}
      />,
    );

    const nativeControl = container.querySelector('[data-sik-evidence="model.transport-native"]');
    const cliControl = container.querySelector('[data-sik-evidence="model.transport-cli"]');
    const surface = container.querySelector<HTMLElement>('.jarvis-slash-dropdown');
    expect(nativeControl).not.toBeNull();
    expect(cliControl).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(surface?.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(surface?.className).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
    expect(surface?.className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(surface?.className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');
    fireEvent.click(cliControl!);
    expect(onSelect).toHaveBeenCalledWith('vibespace-kernel-smoke', 'kernel-smoke-v1', cli);
  });

  it('renders one logical model row while selecting an exact live alias route', () => {
    const openCode = {
      ...connection('opencode-cli', 'external-cli'),
      adapterId: 'opencode-cli',
      providerId: 'opencode',
      displayName: 'OpenCode Bridge',
    };
    const onSelect = vi.fn();
    render(
      <ModelPickerTypeahead
        groups={[
          {
            provider: 'opencode' as never,
            label: 'OpenCode Models',
            options: [
              {
                id: 'opencode-cli:qwen/qwen3.7-plus',
                provider: 'opencode' as never,
                modelId: 'qwen/qwen3.7-plus',
                label: 'Qwen 3.7 Plus',
                connection: openCode,
                available: true,
                alternativeRoutes: [
                  {
                    id: 'opencode-cli:qwen/qwen3.7-plus',
                    provider: 'opencode' as never,
                    modelId: 'qwen/qwen3.7-plus',
                    label: 'Qwen 3.7 Plus · OpenCode Bridge · Qwen',
                    connection: openCode,
                    available: true,
                  },
                  {
                    id: 'opencode-cli:qwen/qwen3.7-plus-fast',
                    provider: 'opencode' as never,
                    modelId: 'qwen/qwen3.7-plus-fast',
                    label: 'Qwen 3.7 Plus Fast',
                    connection: openCode,
                    available: true,
                  },
                ],
              },
            ],
          },
        ]}
        selectedId="opencode-cli:qwen/qwen3.7-plus"
        onSelect={onSelect}
      />,
    );

    expect(screen.getAllByText('Qwen 3.7 Plus')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Use Qwen 3.7 Plus Fast' }));
    expect(onSelect).toHaveBeenCalledWith('opencode', 'qwen/qwen3.7-plus-fast', openCode);
    expect(screen.getByRole('group', { name: 'Qwen 3.7 Plus routes' })).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Use Qwen 3.7 Plus Fast' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('preserves an exact selected alias when keyboard activation repeats the current row', () => {
    const openCode = {
      ...connection('opencode-cli', 'external-cli'),
      adapterId: 'opencode-cli',
      providerId: 'opencode',
      displayName: 'OpenCode Bridge',
    };
    const ref = createRef<ModelPickerTypeaheadRef>();
    const onSelect = vi.fn();
    render(
      <ModelPickerTypeahead
        ref={ref}
        groups={[
          {
            provider: 'opencode' as never,
            label: 'OpenCode Models',
            options: [
              {
                id: 'opencode-cli:openai/gpt-5.6-sol',
                provider: 'opencode' as never,
                modelId: 'openai/gpt-5.6-sol',
                label: 'GPT-5.6 Sol',
                connection: openCode,
                available: true,
                alternativeRoutes: [
                  {
                    id: 'opencode-cli:openai/gpt-5.6-sol',
                    provider: 'opencode' as never,
                    modelId: 'openai/gpt-5.6-sol',
                    label: 'GPT-5.6 Sol · OpenAI',
                    connection: openCode,
                    available: true,
                  },
                  {
                    id: 'opencode-cli:openrouter/openai/gpt-5.6-sol',
                    provider: 'opencode' as never,
                    modelId: 'openrouter/openai/gpt-5.6-sol',
                    label: 'GPT-5.6 Sol · OpenRouter',
                    connection: openCode,
                    available: true,
                  },
                ],
              },
            ],
          },
        ]}
        selectedId="opencode-cli:openrouter/openai/gpt-5.6-sol"
        onSelect={onSelect}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Use GPT-5.6 Sol · OpenRouter' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    act(() => ref.current?.selectCurrent());
    expect(onSelect).toHaveBeenCalledWith('opencode', 'openrouter/openai/gpt-5.6-sol', openCode);
  });

  it('exposes an accessible user control for disabling automatic routing', () => {
    const onAutomaticRoutingChange = vi.fn();
    render(
      <ModelPickerTypeahead
        groups={[]}
        selectedId=""
        onSelect={vi.fn()}
        automaticRoutingEnabled
        onAutomaticRoutingChange={onAutomaticRoutingChange}
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Automatic routing' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onAutomaticRoutingChange).toHaveBeenCalledWith(false);
  });
});
