/**
 * Confirm-then-hide panel open: never leave user with neither sprite nor panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function invoked(cmd: string): boolean {
  return invokeMock.mock.calls.some((c) => c[0] === cmd);
}

describe('openPetPanelSafely', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it('hides overlay only when panel is confirmed visible', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'pet_open_or_focus_panel') return undefined;
      if (cmd === 'pet_is_panel_visible') return true;
      if (cmd === 'pet_hide_overlay') return undefined;
      if (cmd === 'pet_show_overlay') return undefined;
      return null;
    });

    const { openPetPanelSafely } = await import('./petTauriBridge');
    const result = await openPetPanelSafely(10, 20);

    expect(result.panelVisible).toBe(true);
    expect(invoked('pet_open_or_focus_panel')).toBe(true);
    expect(invoked('pet_is_panel_visible')).toBe(true);
    expect(invoked('pet_hide_overlay')).toBe(true);
    expect(invoked('pet_show_overlay')).toBe(false);
  });

  it('restores overlay when panel is not visible (no disappear)', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'pet_open_or_focus_panel') return undefined;
      if (cmd === 'pet_is_panel_visible') return false;
      if (cmd === 'pet_hide_overlay') return undefined;
      if (cmd === 'pet_show_overlay') return undefined;
      return null;
    });

    const { openPetPanelSafely } = await import('./petTauriBridge');
    const result = await openPetPanelSafely();

    expect(result.panelVisible).toBe(false);
    expect(invoked('pet_show_overlay')).toBe(true);
    expect(invoked('pet_hide_overlay')).toBe(false);
  });
});
