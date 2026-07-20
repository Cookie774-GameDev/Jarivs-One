import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const providerBinding = vi.hoisted(() => ({
  activate: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@/lib/ai/providers/kernelSmoke', () => ({
  activateKernelSmokeBinding: providerBinding.activate,
  clearKernelSmokeBinding: providerBinding.clear,
  KERNEL_SMOKE_PROVIDER_ID: 'vibespace-kernel-smoke',
}));

import { KernelSmokeBindingHost } from './KernelSmokeBindingHost';

const validBinding = Object.freeze({
  nativePid: 4242,
  cdpPort: 39817,
  canonicalProfile: 'C:\\contained\\sik-profile',
  nonce: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
});

describe('KernelSmokeBindingHost', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(validBinding);
    providerBinding.activate.mockReset();
    providerBinding.clear.mockReset();
  });

  afterEach(() => cleanup());

  it.each([
    { devBuild: false, explicitFlag: '1' },
    { devBuild: true, explicitFlag: undefined },
    { devBuild: true, explicitFlag: 'true' },
  ])('fails closed before invoking for $devBuild/$explicitFlag', async (config) => {
    render(<KernelSmokeBindingHost {...config} />);

    await act(async () => undefined);
    expect(invoke).not.toHaveBeenCalled();
    expect(document.querySelector('[data-sik-evidence]')).toBeNull();
    expect(providerBinding.activate).not.toHaveBeenCalled();
  });

  it('invokes without caller input and exposes only sanitized binding evidence', async () => {
    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);

    await waitFor(() =>
      expect(document.querySelector('[data-sik-evidence="smoke.binding"]')).not.toBeNull(),
    );
    expect(invoke).toHaveBeenCalledWith('sik_smoke_binding');
    const node = document.querySelector('[data-sik-evidence="smoke.binding"]');
    expect(node).not.toBeNull();
    expect(node?.getAttribute('data-native-pid')).toBe('4242');
    expect(node?.getAttribute('data-cdp-port')).toBe('39817');
    expect(node?.getAttribute('data-profile-sha256')).toMatch(/^[a-f0-9]{64}$/);
    expect(node?.getAttribute('data-nonce')).toBe(validBinding.nonce);
    expect(node?.outerHTML).not.toContain(validBinding.canonicalProfile);
    expect(node?.textContent).not.toContain(validBinding.canonicalProfile);
    expect(providerBinding.activate).toHaveBeenCalledWith({
      nativePid: 4242,
      cdpPort: 39817,
      profileSha256: node?.getAttribute('data-profile-sha256'),
      nonce: validBinding.nonce,
    });
  });

  it.each([
    { ...validBinding, nativePid: 0 },
    { ...validBinding, cdpPort: 65_536 },
    { ...validBinding, canonicalProfile: ' relative ' },
    { ...validBinding, nonce: 'short' },
    { ...validBinding, extra: 'not-allowed' },
  ])('renders and activates nothing for malformed native evidence %#', async (binding) => {
    invoke.mockResolvedValue(binding);
    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);

    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    await act(async () => undefined);
    expect(document.querySelector('[data-sik-evidence]')).toBeNull();
    expect(providerBinding.activate).not.toHaveBeenCalled();
  });

  it('clears trusted availability when the host unmounts', async () => {
    const view = render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);
    await waitFor(() => expect(providerBinding.activate).toHaveBeenCalledOnce());
    providerBinding.clear.mockClear();

    view.unmount();
    expect(providerBinding.clear).toHaveBeenCalledOnce();
  });
});
