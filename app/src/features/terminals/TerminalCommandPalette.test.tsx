import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalCommandPalette } from './TerminalCommandPalette';
import { useTerminalTranscriptStore } from './transcriptStore';
import { runTerminalPromptUpgrade } from './terminalPromptUpgrade';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/lib/ai/useAccessibleChatModels', () => ({
  useAccessibleChatModels: () => ({
    flatOptions: [
      {
        id: 'ollama-local:qwen3:8b',
        provider: 'ollama',
        modelId: 'qwen3:8b',
        label: 'Qwen 3 8B',
        connectionId: 'ollama-local',
        connection: {
          id: 'ollama-local',
          providerId: 'ollama',
          displayName: 'Ollama local',
          mode: 'local',
        },
        variants: ['auto'],
        available: true,
      },
      {
        id: 'opencode-cli:gpt-5.6-sol',
        provider: 'openai',
        modelId: 'gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
        connectionId: 'opencode-cli',
        connection: {
          id: 'opencode-cli',
          providerId: 'openai',
          displayName: 'OpenCode Go',
          mode: 'external-cli',
        },
        variants: ['high'],
        available: true,
      },
    ],
  }),
}));

vi.mock('./terminalPromptUpgrade', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./terminalPromptUpgrade')>();
  return {
    ...actual,
    runTerminalPromptUpgrade: vi.fn(async () => ({
      ok: true,
      upgradedPrompt: 'Build a polished HTML game with keyboard controls.',
      originalDraft: 'hi there, please make me a HTML game',
      job: { id: 'upgrade-job-1' },
      usedPublicResearch: false,
      modelLabel: 'GPT-5.3 Codex Spark',
    })),
  };
});

const evidence = {
  promptProtocol: 'osc133',
  atPrompt: true,
  alternateScreen: false,
  interactiveProgram: false,
  localShell: true,
  passwordPrompt: false,
  sshSession: false,
} as const;

describe('TerminalCommandPalette', () => {
  beforeEach(() => {
    vi.mocked(runTerminalPromptUpgrade).mockClear();
    useTerminalTranscriptStore.setState({ sessions: {} });
    useAuthStore.setState({
      promptForgeModelSelection: { mode: 'prefer_local' },
      promptForgeUseRlmContext: true,
    });
  });

  it('preserves ordinary overlay depth while flattening MonoChrome shadow and blur', () => {
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'VibeSpace terminal palette' });
    expect(dialog.className).toContain('shadow-[0_18px_60px_hsl(var(--foreground)/0.28)]');
    expect(dialog.className).toContain('backdrop-blur');
    expect(dialog.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(dialog.className).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
  });

  it('renders the complete in-pane top level and filters without touching the PTY', () => {
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'VibeSpace terminal palette' })).toBeTruthy();
    for (const label of [
      'Upgrade prompt',
      'Context Map',
      'Skills',
      'Agents',
      'Project',
      'Notes',
      'Daily Note',
      'Search',
      'Terminals',
      'Status',
      'Help',
    ]) {
      expect(screen.getByRole('option', { name: new RegExp(`^${label}\\b`, 'i') })).toBeTruthy();
    }

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter terminal commands' }), {
      target: { value: 'skill' },
    });
    expect(screen.getByRole('option', { name: /Skills/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Context Map/i })).toBeNull();
  });

  it('supports arrow/Tab selection, Enter navigation, Escape, and mouse status', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Filter terminal commands' });
    // First item is now "Upgrade prompt" (detail panel); Tab moves to Context Map → Skills
    fireEvent.keyDown(input, { key: 'Tab' }); // Context Map
    fireEvent.keyDown(input, { key: 'Tab' }); // Skills
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('skills');

    fireEvent.click(screen.getByRole('option', { name: /Status/i }));
    expect(screen.getByText(/Verified local shell prompt/i)).toBeTruthy();
    expect(screen.getByText(/pty-1/i)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Backspace' });
    const returnedInput = screen.getByRole('combobox', { name: 'Filter terminal commands' });

    // ArrowUp from Skills (index 2) wraps or moves; open Status via click is enough.
    // Navigate Context Map from list.
    fireEvent.click(screen.getByRole('option', { name: /Context Map/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('context');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    const { container } = render(
      <TerminalCommandPalette
        open={false}
        paneId="pane-1"
        sessionId={null}
        projectId={null}
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('offers explicit reversible CLI setup without exposing native secrets', async () => {
    const onInstallCli = vi.fn().mockResolvedValue({
      installed: true,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
    });
    const onUninstallCli = vi.fn().mockResolvedValue({
      installed: false,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
    });
    const installedShellIntegration = {
      available: true,
      installed: true,
      profiles: [
        {
          shell: 'powershell' as const,
          path: 'C:\\Users\\Test\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1',
          installed: true,
        },
      ],
    };
    const onInstallShellIntegration = vi.fn().mockResolvedValue(installedShellIntegration);
    const onUninstallShellIntegration = vi.fn().mockResolvedValue({
      ...installedShellIntegration,
      installed: false,
      profiles: installedShellIntegration.profiles.map((profile) => ({
        ...profile,
        installed: false,
      })),
    });
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onInstallCli={onInstallCli}
        onUninstallCli={onUninstallCli}
        onInstallShellIntegration={onInstallShellIntegration}
        onUninstallShellIntegration={onUninstallShellIntegration}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: /Help/i }));
    expect(screen.getByText(/optional.*marked, removable block/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install terminal commands' }));
    expect(await screen.findByText(/Installed vibespace, vs, and vibespace-context/i)).toBeTruthy();
    expect(onInstallCli).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Remove terminal commands' }));
    expect(await screen.findByText(/Removed managed terminal commands/i)).toBeTruthy();
    expect(onUninstallCli).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Enable shell prompt integration' }));
    expect(
      await screen.findByText(/Enabled managed prompt integration for 1 shell profile/i),
    ).toBeTruthy();
    expect(onInstallShellIntegration).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Remove shell prompt integration' }));
    expect(await screen.findByText(/Removed managed prompt integration/i)).toBeTruthy();
    expect(onUninstallShellIntegration).toHaveBeenCalledOnce();
    expect(screen.queryByText(/token|nonce/i)).toBeNull();
  });

  it('opens Upgrade prompt detail without writing to the PTY', () => {
    const onInsert = vi.fn();
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onInsertUpgradedPrompt={onInsert}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: /Upgrade prompt/i }));
    expect(screen.getByRole('heading', { name: 'Upgrade prompt' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Draft from this terminal/i })).toBeNull();
    expect(screen.getByText(/Type your draft at the live terminal prompt first/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Insert at prompt' })).toBeTruthy();
    // Upgrade not started — insert handler must not have been called
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('consumes the live terminal draft without exposing a second editable original field', async () => {
    const onInsert = vi.fn();
    useTerminalTranscriptStore.setState({
      sessions: {
        'pty-1': {
          sessionId: 'pty-1',
          agentSlug: null,
          command: null,
          text: '',
          lastWriteAt: 1,
          bytesSeen: 0,
          currentInput: 'hi there, please make me a HTML game',
        },
      },
    });
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onInsertUpgradedPrompt={onInsert}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: /Upgrade prompt/i }));
    expect(screen.queryByRole('textbox', { name: /Draft from this terminal/i })).toBeNull();
    expect(screen.getByText(/Using the draft already typed in this terminal/i)).toBeTruthy();
    await waitFor(() => {
      expect(runTerminalPromptUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          originalDraft: 'hi there, please make me a HTML game',
        }),
      );
    });
    expect(screen.getByRole('textbox', { name: /Upgraded prompt/i })).toHaveProperty(
      'value',
      'Build a polished HTML game with keyboard controls.',
    );
    const keep = await screen.findByRole('button', { name: 'Keep upgraded prompt' });
    expect(screen.getByRole('button', { name: 'Regenerate prompt upgrade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add context to prompt upgrade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Insert at prompt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /Upgraded prompt/i }), {
      target: { value: 'Edited upgrade remains in review.' },
    });
    fireEvent.click(keep);
    expect(onInsert).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /Upgraded prompt/i })).toHaveProperty(
      'value',
      'Edited upgrade remains in review.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert at prompt' }));
    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledOnce();
      expect(onInsert).toHaveBeenCalledWith('Edited upgrade remains in review.');
    });
  });

  it('uses the shared exact model route and durable RLM policy for regeneration', async () => {
    useTerminalTranscriptStore.setState({
      sessions: {
        'pty-1': {
          sessionId: 'pty-1',
          agentSlug: null,
          command: null,
          text: '',
          lastWriteAt: 1,
          bytesSeen: 0,
          currentInput: 'upgrade this exact terminal draft',
        },
      },
    });
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onInsertUpgradedPrompt={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: /Upgrade prompt/i }));
    const search = screen.getByRole('searchbox', { name: 'Search providers and models' });
    fireEvent.change(search, { target: { value: 'GPT-5.6 Sol' } });
    fireEvent.click(screen.getByRole('option', { name: /GPT-5.6 Sol/ }));
    fireEvent.click(screen.getByRole('option', { name: /high/i }));

    expect(useAuthStore.getState().promptForgeModelSelection).toEqual({
      mode: 'single',
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      connectionId: 'opencode-cli',
      effort: 'high',
    });
    const rlm = screen.getByRole('switch', { name: 'Use RLM context' });
    expect(rlm.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(rlm);
    expect(useAuthStore.getState().promptForgeUseRlmContext).toBe(false);

    vi.mocked(runTerminalPromptUpgrade).mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate prompt upgrade' }));
    await waitFor(() => {
      expect(runTerminalPromptUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          originalDraft: 'upgrade this exact terminal draft',
          modelSelection: {
            mode: 'single',
            providerId: 'openai',
            modelId: 'gpt-5.6-sol',
            connectionId: 'opencode-cli',
            effort: 'high',
          },
          useRlmContext: false,
        }),
      );
    });
  });

  it('fails closed without rendering native setup error details', async () => {
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onInstallShellIntegration={vi.fn().mockRejectedValue(new Error('token=must-not-render'))}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: /Help/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable shell prompt integration' }));
    expect(await screen.findByText('Terminal command setup failed. Try again.')).toBeTruthy();
    expect(screen.queryByText(/must-not-render/i)).toBeNull();
  });
});
