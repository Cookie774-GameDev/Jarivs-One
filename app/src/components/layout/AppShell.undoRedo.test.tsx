import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFullscreenStore } from '@/features/fullscreen/fullscreenStore';
import { useUIStore } from '@/stores/ui';

vi.mock('./TopBar', () => ({ TopBar: () => <div /> }));
vi.mock('./NavPane', () => ({ NavPane: () => <div /> }));
vi.mock('./Inspector', () => ({ Inspector: () => <div /> }));
vi.mock('./TabStrip', () => ({ TabStrip: () => <div /> }));
vi.mock('./ActivityStrip', () => ({ CouncilActivityStrip: () => <div /> }));
vi.mock('@/features/workbench/window', () => ({ isWorkbenchDetachedSearch: () => false }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/undo-redo', () => ({
  GlobalUndoRedoHost: () => <div data-testid="global-undo-redo" />,
}));

import { AppShell } from './AppShell';

describe('AppShell global undo and redo integration', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({ route: 'chat', theme: 'default' });
    useFullscreenStore.setState({ focusActive: false, activationOrder: [], error: null });
  });

  it('keeps the global history host mounted with ordinary workspace content', () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );
    expect(screen.getByTestId('global-undo-redo')).toBeTruthy();
    expect(screen.getByText('Workspace')).toBeTruthy();
  });
});
