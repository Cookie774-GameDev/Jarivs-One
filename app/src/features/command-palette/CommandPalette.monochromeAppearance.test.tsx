import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { CommandPalette } from './CommandPalette';
import { usePaletteStore } from './store';

describe('CommandPalette MonoChrome appearance', () => {
  const initialUiState = useUIStore.getState();
  const initialPaletteState = usePaletteStore.getState();

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    act(() => {
      useUIStore.setState({ paletteOpen: true });
      usePaletteStore.setState({ pageStack: [], search: '' });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    act(() => {
      useUIStore.setState(initialUiState, true);
      usePaletteStore.setState(initialPaletteState, true);
    });
  });

  it('removes overlay blur and motion only beneath the MonoChrome theme gate', () => {
    render(<CommandPalette />);

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    const overlay = document.querySelector<HTMLElement>(
      '[data-monochrome-overlay="command-palette"]',
    );

    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('backdrop-blur-sm');
    expect(overlay?.className).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
    expect(overlay?.className).toContain(
      '[html[data-theme=monochrome]_&]:data-[state=open]:!animate-none',
    );
  });
});
