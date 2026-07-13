import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    project_id?: string;
    title: string;
    shell_command: string;
    cwd?: string;
    status: 'running' | 'detached' | 'exited';
  }>,
  terminalProps: [] as Array<Record<string, unknown>>,
  requestMainTerminalFocus: vi.fn(async () => true),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.rows,
}));

vi.mock('@/features/terminals/TerminalView', () => ({
  TerminalView: (props: Record<string, unknown>) => {
    mocks.terminalProps.push(props);
    return (
      <div
        data-testid="real-terminal-view"
        data-session-id={String(props.sessionId)}
        data-pane-id={String(props.paneId)}
        data-project-id={String(props.projectId)}
      />
    );
  },
}));

vi.mock('@/features/terminals/terminalRefs', () => ({
  requestMainTerminalFocus: mocks.requestMainTerminalFocus,
}));

vi.mock('@/lib/db', () => ({
  terminalSessionRepo: {
    listByWorkspace: vi.fn(),
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (
    selector: (state: { workspaceId: string; projectId: string }) => unknown,
  ) => selector({ workspaceId: 'workspace-1', projectId: 'project-current' }),
}));

import { PET_PANEL_TERMINAL_LIMIT_MESSAGE } from './petPanelLifecycle';
import { usePetPresentationStore, type OwnedTerminal } from './petPresentationStore';
import { PetTerminalSurface } from './PetTerminalSurface';

const liveTerminal: OwnedTerminal = {
  terminalId: 'presentation-slot-1',
  ptyId: 'pty-live-exact-7',
  owner: 'pet-mini-panel',
  title: 'Live PowerShell',
  cwd: 'C:\\work',
  shell: 'pwsh',
  paneId: 'pane-main-exact-3',
  projectId: 'project-original',
  status: 'running',
};

function setTerminals(terminals: Record<string, OwnedTerminal>): void {
  usePetPresentationStore.setState({
    chats: {},
    terminals,
    panelActiveChatId: null,
    panelActiveTerminalId: Object.keys(terminals)[0] ?? null,
    activity: [],
    activitySeenIds: [],
    unreadActivity: 0,
    panelLifecycle: 'open',
    lastLimitMessage: null,
  });
}

describe('PetTerminalSurface shared PTY presentation', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.rows.splice(0);
    mocks.terminalProps.splice(0);
    mocks.requestMainTerminalFocus.mockReset().mockResolvedValue(true);
    setTerminals({ [liveTerminal.terminalId]: liveTerminal });
  });

  it('renders the exact existing PTY and never requests a replacement spawn', () => {
    render(<PetTerminalSurface />);

    const terminal = screen.getByTestId('real-terminal-view');
    expect(terminal.getAttribute('data-session-id')).toBe('pty-live-exact-7');
    expect(terminal.getAttribute('data-session-id')).not.toBe('presentation-slot-1');
    expect(terminal.getAttribute('data-project-id')).toBe('project-original');
    expect(mocks.terminalProps.at(-1)?.sessionId).toBe('pty-live-exact-7');
    expect(mocks.terminalProps.at(-1)?.sessionId).not.toBeNull();
  });

  it('hydrates an existing PTY by PTY identity without cloning its presentation record', async () => {
    setTerminals({
      [liveTerminal.terminalId]: { ...liveTerminal, projectId: null },
    });
    mocks.rows.push({
      id: 'pty-live-exact-7',
      project_id: 'project-from-session',
      title: 'Live PowerShell',
      shell_command: 'pwsh',
      cwd: 'C:\\work',
      status: 'running',
    });

    render(<PetTerminalSurface />);

    await waitFor(() => {
      expect(Object.keys(usePetPresentationStore.getState().terminals)).toEqual([
        'presentation-slot-1',
      ]);
      expect(
        usePetPresentationStore.getState().terminals['presentation-slot-1'].projectId,
      ).toBe('project-from-session');
    });
  });

  it('returns an ordinary Pet slot to main and focuses its exact live session without killing it', async () => {
    const { container } = render(<PetTerminalSurface />);

    const close = container.querySelector(
      '[data-pet-terminal-close="presentation-slot-1"]',
    );
    expect(close?.getAttribute('aria-label')).toBe('Return terminal to main app');
    fireEvent.click(close!);

    await waitFor(() => {
      expect(usePetPresentationStore.getState().terminals['presentation-slot-1']).toEqual({
        ...liveTerminal,
        owner: 'main',
      });
      expect(mocks.requestMainTerminalFocus).toHaveBeenCalledWith({
        sessionId: 'pty-live-exact-7',
        paneId: 'pane-main-exact-3',
        projectId: 'project-original',
      });
    });
    expect(mocks.terminalProps).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sessionId: null })]),
    );
  });

  it('rejects a fifth Pet terminal with the exact message and no state mutation', () => {
    const full = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => {
        const terminal: OwnedTerminal = {
          terminalId: `slot-${index}`,
          ptyId: `pty-${index}`,
          owner: 'pet-mini-panel',
          title: `Terminal ${index}`,
          status: 'running',
        };
        return [terminal.terminalId, terminal];
      }),
    );
    setTerminals(full);
    const before = usePetPresentationStore.getState().terminals;

    render(<PetTerminalSurface />);
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));

    expect(screen.getByRole('alert').textContent).toBe(PET_PANEL_TERMINAL_LIMIT_MESSAGE);
    expect(usePetPresentationStore.getState().terminals).toEqual(before);
    expect(Object.keys(usePetPresentationStore.getState().terminals)).toHaveLength(4);
    expect(mocks.terminalProps).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sessionId: null })]),
    );
  });
});
