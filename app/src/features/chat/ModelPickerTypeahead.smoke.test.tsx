import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderConnection } from '@/lib/ai/adapters/types';
import { ModelPickerTypeahead } from './ModelPickerTypeahead';

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
