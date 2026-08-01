import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchPanel } from './WorkbenchPanel';
import type { WorkbenchPanel as WorkbenchPanelModel } from './types';

vi.mock('./BrowserPanel', () => ({
  BrowserPanel: () => <div>Browser panel</div>,
}));

vi.mock('./ReferencePanel', () => ({
  ReferencePanel: () => <div>Reference panel</div>,
}));

vi.mock('./TerminalPanel', () => ({
  TerminalPanel: () => <div>Terminal panel</div>,
}));

const panel: WorkbenchPanelModel = {
  id: 'panel-1',
  kind: 'terminal',
  title: 'Console',
  x: 20,
  y: 30,
  width: 300,
  height: 200,
  z: 1,
  minimized: false,
  status: 'ready',
  settings: {},
};

function renderPanel(onUpdate = vi.fn()) {
  render(
    <WorkbenchPanel
      panel={panel}
      selected={false}
      zoom={0.8}
      onSelect={vi.fn()}
      onBringToFront={vi.fn()}
      onUpdate={onUpdate}
      onRuntimeUpdate={vi.fn()}
      onDuplicate={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  return { onUpdate };
}

afterEach(() => {
  cleanup();
});

describe('WorkbenchPanel accessibility', () => {
  it('exposes the visual panel status through valid status semantics and text', () => {
    renderPanel();

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Status: ready');
    expect(status.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps resize as one named button with the existing pointer resize contract', () => {
    const { onUpdate } = renderPanel();
    const resize = screen.getByRole('button', { name: 'Resize Console' });

    expect(resize.querySelector('button, input, select, textarea')).toBeNull();

    fireEvent.pointerDown(resize, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 124, clientY: 116 });
    fireEvent.pointerUp(window, { clientX: 124, clientY: 116 });

    expect(onUpdate).toHaveBeenLastCalledWith({ width: 330, height: 220 });
  });
});
