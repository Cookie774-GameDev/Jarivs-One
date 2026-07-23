import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';

const invoke = vi.hoisted(() => vi.fn());
const providerBinding = vi.hoisted(() => ({
  activate: vi.fn(),
  clear: vi.fn(),
  dispatchPath: undefined as 'protected' | 'unprotected' | undefined,
  subscribeDispatchPath: vi.fn(() => () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@/lib/ai/providers/kernelSmoke', () => ({
  activateKernelSmokeBinding: providerBinding.activate,
  clearKernelSmokeBinding: providerBinding.clear,
  getKernelSmokeDispatchPath: () => providerBinding.dispatchPath,
  subscribeKernelSmokeDispatchPath: providerBinding.subscribeDispatchPath,
  KERNEL_SMOKE_PROVIDER_ID: 'vibespace-kernel-smoke',
  KERNEL_SMOKE_RUNTIME_STAGE_EVENT: 'vibespace:kernel-smoke-runtime-stage',
  KERNEL_SMOKE_RUNTIME_STAGES: Object.freeze([
    'accepted',
    'chat',
    'validated',
    'agent',
    'context',
    'execution',
    'hive_turn',
    'hive_plan',
    'hive_workers',
    'hive_final',
  ]),
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
    providerBinding.dispatchPath = undefined;
    providerBinding.subscribeDispatchPath.mockClear();
    useAuthStore.setState({ projectId: null, chatModelSelection: { mode: 'none' } });
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
    expect(localStorage.getItem('jarvis-files-root-v2:__default__')).toBe(
      `${validBinding.canonicalProfile}\\SmokeProject`,
    );
    expect(providerBinding.activate).toHaveBeenCalledWith({
      nativePid: 4242,
      cdpPort: 39817,
      profileSha256: node?.getAttribute('data-profile-sha256'),
      nonce: validBinding.nonce,
    });
    expect(useAuthStore.getState().chatModelSelection).toMatchObject({
      mode: 'single',
      providerId: 'vibespace-kernel-smoke',
      modelId: 'kernel-smoke-v1',
      connectionId: 'vibespace-kernel-smoke-native',
      connectionMode: 'native-api',
    });
  });

  it('exposes only the protected/unprotected provider dispatch classification', async () => {
    providerBinding.dispatchPath = 'protected';

    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);

    await waitFor(() =>
      expect(document.querySelector('[data-sik-evidence="smoke.dispatch-kind"]')).not.toBeNull(),
    );
    const node = document.querySelector('[data-sik-evidence="smoke.dispatch-kind"]');
    expect(node?.getAttribute('data-dispatch-kind')).toBe('protected');
    expect(node?.textContent).toBe('');
  });

  it('exposes only sanitized composer/runtime lifecycle states', async () => {
    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);
    await waitFor(() => expect(providerBinding.activate).toHaveBeenCalledOnce());

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { text: 'PRIVATE', chatId: 'PRIVATE' } }),
    );
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-sik-evidence="smoke.runtime-state"]')
          ?.getAttribute('data-runtime-state'),
      ).toBe('sent'),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: { status: 'error', chatId: 'PRIVATE', ignored: 'PRIVATE' },
      }),
    );
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-sik-evidence="smoke.runtime-state"]')
          ?.getAttribute('data-runtime-state'),
      ).toBe('error'),
    );
    expect(document.body.innerHTML).not.toContain('PRIVATE');
  });

  it('projects only an allowlisted protected-runtime stage', async () => {
    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);
    await waitFor(() => expect(providerBinding.activate).toHaveBeenCalledOnce());

    window.dispatchEvent(
      new CustomEvent('vibespace:kernel-smoke-runtime-stage', {
        detail: { stage: 'hive_workers', privateDetail: 'PRIVATE' },
      }),
    );
    // Runtime listeners may be registered before this host's send observer.
    // A later send observation must not erase a stage emitted by the same dispatch.
    window.dispatchEvent(new CustomEvent('jarvis:send'));
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-sik-evidence="smoke.runtime-state"]')
          ?.getAttribute('data-initialization-phase'),
      ).toBe('hive_workers'),
    );

    window.dispatchEvent(
      new CustomEvent('vibespace:kernel-smoke-runtime-stage', {
        detail: { stage: 'PRIVATE C:\\secret' },
      }),
    );
    await act(async () => undefined);
    expect(
      document
        .querySelector('[data-sik-evidence="smoke.runtime-state"]')
        ?.getAttribute('data-initialization-phase'),
    ).toBe('hive_workers');
    expect(document.body.innerHTML).not.toContain('PRIVATE');
  });

  it('projects only a bounded kernel error code on the gated runtime evidence', async () => {
    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);
    await waitFor(() => expect(providerBinding.activate).toHaveBeenCalledOnce());

    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: {
          status: 'error',
          errorCode: 'kernel_safe_action_result_scope_mismatch',
          privateDetail: 'PRIVATE provider output',
        },
      }),
    );

    await waitFor(() =>
      expect(
        document
          .querySelector('[data-sik-evidence="smoke.runtime-state"]')
          ?.getAttribute('data-error-code'),
      ).toBe('kernel_safe_action_result_scope_mismatch'),
    );
    expect(document.body.innerHTML).not.toContain('PRIVATE');

    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: { status: 'error', errorCode: 'PRIVATE C:\\secret\\token.txt' },
      }),
    );
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-sik-evidence="smoke.runtime-state"]')
          ?.getAttribute('data-error-code'),
      ).toBe('kernel_runtime_failure'),
    );
    expect(document.body.innerHTML).not.toContain('secret');
  });

  it('exposes only an allowlisted native rejection code in the isolated smoke DOM', async () => {
    invoke.mockRejectedValue(new Error('sik_smoke_port_not_bound'));

    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);

    await waitFor(() =>
      expect(document.querySelector('[data-sik-evidence="smoke.binding-error"]')).not.toBeNull(),
    );
    const node = document.querySelector('[data-sik-evidence="smoke.binding-error"]');
    expect(node?.getAttribute('data-error-code')).toBe('sik_smoke_port_not_bound');
    expect(node?.textContent).toBe('');
    expect(providerBinding.activate).not.toHaveBeenCalled();
  });

  it('maps untrusted native rejection text to one fixed generic code', async () => {
    invoke.mockRejectedValue(new Error('PRIVATE native detail must not escape'));

    render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);

    await waitFor(() =>
      expect(document.querySelector('[data-sik-evidence="smoke.binding-error"]')).not.toBeNull(),
    );
    const node = document.querySelector('[data-sik-evidence="smoke.binding-error"]');
    expect(node?.getAttribute('data-error-code')).toBe('sik_smoke_binding_invalid');
    expect(node?.outerHTML).not.toContain('PRIVATE');
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
    expect(document.querySelector('[data-sik-evidence="smoke.binding"]')).toBeNull();
    expect(
      document
        .querySelector('[data-sik-evidence="smoke.binding-error"]')
        ?.getAttribute('data-error-code'),
    ).toBe('sik_smoke_binding_invalid');
    expect(providerBinding.activate).not.toHaveBeenCalled();
  });

  it('clears trusted availability when the host unmounts', async () => {
    localStorage.setItem('jarvis-files-root-v2:__default__', 'C:\\prior-project');
    const view = render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);
    await waitFor(() => expect(providerBinding.activate).toHaveBeenCalledOnce());
    expect(localStorage.getItem('jarvis-files-root-v2:__default__')).toBe(
      `${validBinding.canonicalProfile}\\SmokeProject`,
    );
    providerBinding.clear.mockClear();

    view.unmount();
    expect(providerBinding.clear).toHaveBeenCalledOnce();
    expect(localStorage.getItem('jarvis-files-root-v2:__default__')).toBe('C:\\prior-project');
  });

  it('moves the isolated root when project hydration changes the active project', async () => {
    localStorage.setItem('jarvis-files-root-v2:__default__', 'C:\\prior-default');
    localStorage.setItem('jarvis-files-root-v2:project-hydrated', 'C:\\prior-hydrated');
    const view = render(<KernelSmokeBindingHost devBuild explicitFlag="1" />);
    await waitFor(() => expect(providerBinding.activate).toHaveBeenCalledOnce());

    act(() => useAuthStore.setState({ projectId: 'project-hydrated' as never }));

    await waitFor(() =>
      expect(localStorage.getItem('jarvis-files-root-v2:project-hydrated')).toBe(
        `${validBinding.canonicalProfile}\\SmokeProject`,
      ),
    );
    expect(localStorage.getItem('jarvis-files-root-v2:__default__')).toBe('C:\\prior-default');

    view.unmount();
    expect(localStorage.getItem('jarvis-files-root-v2:project-hydrated')).toBe(
      'C:\\prior-hydrated',
    );
  });
});
