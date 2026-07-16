import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkbenchContextMenu } from './WorkbenchContextMenu';
import { useWorkbenchStore } from './store';

describe('WorkbenchContextMenu', () => {
  beforeEach(() => {
    useWorkbenchStore.getState().resetWorkbench();
    useWorkbenchStore.setState({
      panels: [
        {
          id: 'panel-1',
          kind: 'notes',
          title: 'Notes',
          x: 40,
          y: 40,
          width: 320,
          height: 240,
          z: 1,
          minimized: false,
          status: 'idle',
          settings: {},
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows Rename and Duplicate for a panel right-click', () => {
    render(
      <main className="workbench-shell" data-jarvis-suppress-context-menu>
        <div className="workbench-canvas">
          <section className="workbench-panel" data-panel-id="panel-1">
            Panel body
          </section>
        </div>
        <WorkbenchContextMenu />
      </main>,
    );

    const panel = document.querySelector('.workbench-panel')!;
    fireEvent.contextMenu(panel, { clientX: 120, clientY: 140, bubbles: true });

    expect(screen.getByTestId('workbench-context-menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Bring to front' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Minimize' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Close' })).toBeTruthy();
  });

  it('renames a panel from the context menu with multi-character input', () => {
    render(
      <main className="workbench-shell">
        <div className="workbench-canvas">
          <section className="workbench-panel" data-panel-id="panel-1">
            Panel
          </section>
        </div>
        <WorkbenchContextMenu />
      </main>,
    );

    fireEvent.contextMenu(document.querySelector('.workbench-panel')!, {
      clientX: 80,
      clientY: 90,
      bubbles: true,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename') as HTMLInputElement;
    // Simulate sequential typing — previously each keystroke re-selected and left only one char.
    fireEvent.change(input, { target: { value: 'L' } });
    fireEvent.change(input, { target: { value: 'La' } });
    fireEvent.change(input, { target: { value: 'Launch notes' } });
    expect(input.value).toBe('Launch notes');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useWorkbenchStore.getState().panels[0]?.title).toBe('Launch notes');
  });

  it('duplicates a panel from the context menu', () => {
    render(
      <main className="workbench-shell">
        <div className="workbench-canvas">
          <section className="workbench-panel" data-panel-id="panel-1">
            Panel
          </section>
        </div>
        <WorkbenchContextMenu />
      </main>,
    );

    fireEvent.contextMenu(document.querySelector('.workbench-panel')!, {
      clientX: 80,
      clientY: 90,
      bubbles: true,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(useWorkbenchStore.getState().panels.length).toBe(2);
  });
});
