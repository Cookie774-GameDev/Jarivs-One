import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeSystemLogWindow } from './OpenCodeSystemLogWindow';
import { revealExistingOpenCodeSystemLogWindow } from './OpenCodeSystemLogHost';
import {
  OPENCODE_SYSTEM_LOG_STORAGE_KEY,
  OPENCODE_SYSTEM_LOG_UPDATE_EVENT,
  type OpenCodeSystemLogPayload,
} from './opencodeSystemLog';

describe('OpenCodeSystemLogWindow', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders a live payload delivered by the app instead of polling a raw file origin', () => {
    render(<OpenCodeSystemLogWindow />);
    const payload: OpenCodeSystemLogPayload = {
      version: 1,
      updatedAt: 100,
      steps: [
        {
          id: 1,
          ts: 100,
          kind: 'siyuan',
          title: 'SiYuan added the Context Map',
          summary: '42 files are ready in the local project vault.',
          status: 'success',
        },
      ],
    };
    act(() => {
      window.dispatchEvent(new CustomEvent(OPENCODE_SYSTEM_LOG_UPDATE_EVENT, { detail: payload }));
    });
    expect(screen.getByText('SiYuan added the Context Map')).toBeTruthy();
    expect(screen.getByText(/42 files are ready/)).toBeTruthy();
  });

  it('clears only the human view', () => {
    window.localStorage.setItem(
      OPENCODE_SYSTEM_LOG_STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: 100, steps: [] }),
    );
    render(<OpenCodeSystemLogWindow />);
    fireEvent.click(screen.getByRole('button', { name: /clear this view/i }));
    expect(window.localStorage.getItem(OPENCODE_SYSTEM_LOG_STORAGE_KEY)).toBeNull();
  });
});

describe('OpenCode System Log native window recovery', () => {
  it('registers the dedicated least-privilege capability in the production allowlist', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { app?: { security?: { capabilities?: string[] } } };
    const capability = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src-tauri/capabilities/opencode-system-log.json'),
        'utf8',
      ),
    ) as { windows?: string[]; permissions?: string[] };
    const mainCapability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { windows?: string[]; permissions?: string[] };

    expect(config.app?.security?.capabilities).toContain('opencode-system-log');
    expect(capability.windows).toEqual(['opencode-system-log']);
    expect(capability.permissions).toEqual([
      'core:window:default',
      'core:webview:default',
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:event:allow-emit-to',
    ]);
    expect(mainCapability.windows).toContain('main');
    expect(mainCapability.permissions).toContain('core:window:allow-destroy');
  });

  it('mounts the safe human timeline bridge independently of the developer console', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(appSource).toContain('<OpenCodeSystemLogHost />');
    expect(appSource).not.toContain('plan.devConsoleEnabled ? <OpenCodeSystemLogHost /> : null');
    expect(appSource).toContain('plan.devConsoleEnabled ? <DevConsoleHost /> : null');
  });

  it('reuses a healthy native window', async () => {
    const existing = {
      show: vi.fn().mockResolvedValue(undefined),
      unminimize: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    await expect(revealExistingOpenCodeSystemLogWindow(existing)).resolves.toBe(true);
    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.setFocus).toHaveBeenCalledOnce();
    expect(existing.destroy).not.toHaveBeenCalled();
  });

  it('removes a stale label so the caller can create a fresh live window', async () => {
    const existing = {
      show: vi.fn().mockRejectedValue(new Error('window not found')),
      unminimize: vi.fn(),
      setFocus: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    await expect(revealExistingOpenCodeSystemLogWindow(existing)).resolves.toBe(false);
    expect(existing.destroy).toHaveBeenCalledOnce();
    expect(existing.show).toHaveBeenCalledOnce();
  });
});
