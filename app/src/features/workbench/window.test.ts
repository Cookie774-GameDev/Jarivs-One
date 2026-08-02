import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkbenchWindowUrl,
  isWorkbenchDetachedSearch,
  isWorkbenchKernelClientSurface,
  openOrFocusWorkbenchWindow,
  WORKBENCH_APP_PATH,
  WORKBENCH_BROWSER_WINDOW_FEATURES,
  WORKBENCH_KERNEL_AUTHORITY,
  WORKBENCH_QUERY,
  WORKBENCH_WINDOW_LABEL,
} from './window';

describe('Workbench window helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('detects detached Workbench search and builds absolute browser URLs', () => {
    expect(isWorkbenchDetachedSearch('?workbench=1')).toBe(true);
    expect(isWorkbenchDetachedSearch('?workbench=0')).toBe(false);
    expect(WORKBENCH_QUERY).toBe('workbench=1');
    expect(WORKBENCH_APP_PATH).toBe('/?workbench=1');
    const url = buildWorkbenchWindowUrl('http://localhost:5173/');
    expect(url).toBe('http://localhost:5173/?workbench=1');
  });

  it('uses a window label that matches the Tauri workbench-* capability', () => {
    expect(WORKBENCH_WINDOW_LABEL.startsWith('workbench-')).toBe(true);
    expect(WORKBENCH_KERNEL_AUTHORITY).toBe('client-only');
    expect(isWorkbenchKernelClientSurface('?workbench=1')).toBe(true);
    expect(isWorkbenchKernelClientSurface('?workbench=0')).toBe(false);
  });

  it('uses a features string without noopener/noreferrer', () => {
    expect(WORKBENCH_BROWSER_WINDOW_FEATURES.toLowerCase()).not.toContain('noopener');
    expect(WORKBENCH_BROWSER_WINDOW_FEATURES.toLowerCase()).not.toContain('noreferrer');
  });

  it('opens a named browser window with an absolute URL', async () => {
    const focus = vi.fn();
    const open = vi.fn(() => ({ focus }));
    vi.stubGlobal('open', open);
    const win = window as Window & { __TAURI_INTERNALS__?: unknown };
    delete win.__TAURI_INTERNALS__;

    const result = await openOrFocusWorkbenchWindow({ name: 'Desk A' });
    expect(result.ok).toBe(true);
    const call = open.mock.calls[0] as unknown as [string, string, string?];
    const [urlArg, nameArg, featuresArg] = call;
    expect(urlArg).toContain('workbench=1');
    expect(urlArg.startsWith('http://') || urlArg.startsWith('https://')).toBe(true);
    expect(nameArg).toBe(WORKBENCH_WINDOW_LABEL);
    if (featuresArg) {
      expect(featuresArg.toLowerCase()).not.toContain('noopener');
    }
    expect(focus).toHaveBeenCalled();
  });

  it('retries plain open then reports blocked honestly', async () => {
    const open = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(null);
    vi.stubGlobal('open', open);
    const win = window as Window & { __TAURI_INTERNALS__?: unknown };
    delete win.__TAURI_INTERNALS__;
    const result = await openOrFocusWorkbenchWindow();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/blocked/i);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
