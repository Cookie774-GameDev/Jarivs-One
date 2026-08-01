import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./WorkbenchPanel', () => ({
  WorkbenchPanel: () => null,
}));

import { WorkbenchCanvas } from './WorkbenchCanvas';
import { useWorkbenchStore } from './store';

describe('WorkbenchCanvas raster determinism', () => {
  let previousTheme: string | undefined;

  beforeEach(() => {
    previousTheme = document.documentElement.dataset.theme;
    useWorkbenchStore.setState({
      panels: [],
      selectedIds: [],
      view: { x: 24, y: 24, zoom: 0.78 },
    });
  });

  afterEach(() => {
    cleanup();
    if (previousTheme == null) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = previousTheme;
    }
  });

  it('renders the same camera through a 2D stage without MonoChrome pre-promotion', () => {
    document.documentElement.dataset.theme = 'monochrome';
    const { container } = render(<WorkbenchCanvas />);
    const stage = container.querySelector<HTMLElement>('.workbench-stage');

    expect(stage).not.toBeNull();
    expect(stage!.style.transform).toBe('translate(24px, 24px) scale(0.78)');
    expect(stage!.className).toContain('[html[data-theme=monochrome]_&]:will-change-auto');
  });

  it('preserves the existing 3D camera path for ordinary themes', () => {
    document.documentElement.dataset.theme = 'dark';
    const { container } = render(<WorkbenchCanvas />);
    const stage = container.querySelector<HTMLElement>('.workbench-stage');

    expect(stage).not.toBeNull();
    expect(stage!.style.transform).toBe('translate3d(24px, 24px, 0) scale(0.78)');
  });
});
