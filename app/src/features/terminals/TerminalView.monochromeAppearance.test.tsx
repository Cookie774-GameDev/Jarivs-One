import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}));

vi.mock('xterm', () => ({
  Terminal: class {
    readonly rows = 30;
    readonly cols = 100;
    readonly options: Record<string, unknown> = {
      fontFamily: '"JetBrains Mono"',
      fontSize: 9,
    };

    loadAddon() {}
    open() {}
    onScroll() {
      return { dispose() {} };
    }
    onData() {}
    write(_data: string, callback?: () => void) {
      callback?.();
    }
    dispose() {}
  },
}));

vi.mock('xterm-addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock('xterm-addon-web-links', () => ({
  WebLinksAddon: class {},
}));

vi.mock('xterm-addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss() {}
    dispose() {}
  },
}));

import { TerminalView } from './TerminalView';

describe('TerminalView MonoChrome appearance', () => {
  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
  });

  it('keeps the browser fallback card visible without a MonoChrome shadow', async () => {
    invokeMock.mockRejectedValue(new Error('synthetic terminal unavailable'));

    render(<TerminalView command="powershell" />);

    const fallback = await screen.findByRole('status');
    expect(fallback.className).toContain('shadow-soft');
    expect(fallback.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(screen.getByText('Terminal backend not available')).toBeTruthy();
  });
});
