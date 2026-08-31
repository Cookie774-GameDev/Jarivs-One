import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchPage } from './WorkbenchPage';
import { useWorkbenchStore } from './store';
import { usePluginStore } from '@/features/plugins';
import { useAuthStore } from '@/stores/auth';
import type { ProjectId } from '@/types/common';

const PROJECT_A = 'project-a' as ProjectId;
const PROJECT_B = 'project-b' as ProjectId;
const PROJECT_C = 'project-c' as ProjectId;

vi.mock('@/features/terminals/TerminalView', () => ({
  TerminalView: ({ onReady }: { onReady?: (id: string) => void }) => {
    React.useEffect(() => onReady?.('pty-test-session'), [onReady]);
    return <div data-testid="live-terminal">Live PTY terminal</div>;
  },
}));

vi.mock('@/lib/tauri', () => ({
  openExternal: vi.fn(async () => undefined),
}));

vi.mock('@/features/chat', () => ({
  ChatThread: () => <div data-testid="workbench-chat-thread">Chat thread</div>,
  Composer: () => <div data-testid="workbench-chat-composer">Composer</div>,
  EmptyChat: () => <div>Empty</div>,
  ensureActiveChat: vi.fn(async () => 'chat-test'),
}));

describe('WorkbenchPage', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    window.localStorage.clear();
    useWorkbenchStore.getState().resetWorkbench();
    useAuthStore.setState({ cloudSession: null, localUserId: 'local-account', projectId: null });
    usePluginStore.setState({
      connectionsByAccount: {},
      installedPluginIdsByAccount: {},
      pinnedPluginIdsByAccount: {},
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('exposes name editing, save layout, exit hold, and no Classic/Spawn buttons', () => {
    render(<WorkbenchPage />);

    expect(screen.getByRole('main', { name: 'VibeSpace Workbench' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Spawn Workbench' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Classic VibeSpace/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Workbench' })).toBeTruthy();
    expect(screen.getByLabelText('Workbench name')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hold to arm Workbench exit/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wallpapers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Terminal' })).toBeTruthy();
    expect(screen.getAllByTestId('live-terminal').length).toBeGreaterThanOrEqual(1);
  });

  it('persists an edited Workbench name through the store', () => {
    render(<WorkbenchPage />);
    const input = screen.getByLabelText('Workbench name');
    fireEvent.change(input, { target: { value: 'Launch desk' } });
    fireEvent.blur(input);
    expect(useWorkbenchStore.getState().name).toBe('Launch desk');
  });

  it('opens the template sheet for named layout saves', () => {
    render(<WorkbenchPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Workbench' }));
    expect(screen.getByRole('dialog', { name: /Layouts/i })).toBeTruthy();
    const nameField = screen.getByLabelText('Save this Workbench');
    fireEvent.change(nameField, { target: { value: 'Night coding desk' } });
    fireEvent.submit(nameField.closest('form')!);
    expect(
      useWorkbenchStore.getState().customTemplates.some((t) => t.name === 'Night coding desk'),
    ).toBe(true);
  });

  it('adds and removes a real terminal panel without auto-running a command', () => {
    render(<WorkbenchPage />);
    const before = screen.getAllByTestId('live-terminal').length;
    fireEvent.click(screen.getByRole('button', { name: 'Add Terminal' }));
    expect(screen.getAllByTestId('live-terminal')).toHaveLength(before + 1);
    expect(useWorkbenchStore.getState().panels.at(-1)?.settings.command).toBeUndefined();
    fireEvent.click(screen.getAllByRole('button', { name: /Close Terminal/i }).at(-1)!);
    expect(screen.getAllByTestId('live-terminal')).toHaveLength(before);
  });

  it('supports keyboard zoom and undo on the spatial canvas', () => {
    render(<WorkbenchPage />);
    const canvas = screen.getByTestId('workbench-canvas');
    const startZoom = useWorkbenchStore.getState().view.zoom;
    fireEvent.keyDown(canvas, { key: '+' });
    expect(useWorkbenchStore.getState().view.zoom).toBeGreaterThan(startZoom);
    fireEvent.click(screen.getByRole('button', { name: 'Add Notes' }));
    expect(useWorkbenchStore.getState().panels.some((panel) => panel.kind === 'notes')).toBe(true);
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    expect(useWorkbenchStore.getState().panels.some((panel) => panel.kind === 'notes')).toBe(false);
  });

  it('exposes pinned plugins only within their active project scope and reacts to project changes', () => {
    useAuthStore.setState({ projectId: PROJECT_B });
    usePluginStore.setState({
      connectionsByAccount: {
        'local-account': {
          github: {
            accountId: 'local-account',
            pluginId: 'github',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['project-a'],
            configuredFields: [],
            updatedAt: 1,
          },
        },
      },
      installedPluginIdsByAccount: { 'local-account': ['github'] },
      pinnedPluginIdsByAccount: { 'local-account': ['github'] },
    });

    render(<WorkbenchPage />);
    expect(screen.queryByRole('button', { name: 'Add GitHub' })).toBeNull();

    act(() => useAuthStore.setState({ projectId: PROJECT_A }));
    expect(screen.getByRole('button', { name: 'Add GitHub' })).toBeTruthy();

    act(() => useAuthStore.setState({ projectId: PROJECT_C }));
    expect(screen.queryByRole('button', { name: 'Add GitHub' })).toBeNull();

    act(() => {
      usePluginStore.setState((state) => ({
        connectionsByAccount: {
          ...state.connectionsByAccount,
          'local-account': {
            ...state.connectionsByAccount['local-account'],
            github: {
              ...state.connectionsByAccount['local-account']!.github!,
              enabledProjectIds: ['*'],
            },
          },
        },
      }));
    });
    expect(screen.getByRole('button', { name: 'Add GitHub' })).toBeTruthy();
  });
});
