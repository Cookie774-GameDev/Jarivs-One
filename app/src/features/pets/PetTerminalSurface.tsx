/**
 * Real live TerminalView mounts for the Pet mini-panel.
 * Attaches to existing PTY session IDs — never spawns a second process for a move.
 */
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TerminalView } from '@/features/terminals/TerminalView';
import { terminalSessionRepo } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import {
  PET_PANEL_MAX_TERMINALS,
  PET_PANEL_TERMINAL_LIMIT_MESSAGE,
} from './petPanelLifecycle';
import { usePetPresentationStore } from './petPresentationStore';
import { cn } from '@/lib/utils';

export function PetTerminalSurface({ className }: { className?: string }) {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const projectId = useAuthStore((s) => s.projectId);
  const terminals = usePetPresentationStore((s) => s.terminals);
  const registerTerminal = usePetPresentationStore((s) => s.registerTerminal);
  const moveTerminal = usePetPresentationStore((s) => s.moveTerminal);
  const setTerminalStatus = usePetPresentationStore((s) => s.setTerminalStatus);
  const panelActiveTerminalId = usePetPresentationStore((s) => s.panelActiveTerminalId);
  const setPanelActiveTerminalId = usePetPresentationStore((s) => s.setPanelActiveTerminalId);
  const lastLimitMessage = usePetPresentationStore((s) => s.lastLimitMessage);
  const petTerminalCount = usePetPresentationStore((s) => s.petTerminalCount);

  const sessions = useLiveQuery(
    async () => {
      if (!workspaceId) return [];
      return terminalSessionRepo.listByWorkspace(workspaceId as never);
    },
    [workspaceId],
    [],
  );

  const petTerms = React.useMemo(
    () => Object.values(terminals).filter((t) => t.owner === 'pet-mini-panel'),
    [terminals],
  );

  const active =
    petTerms.find((t) => t.terminalId === panelActiveTerminalId) ?? petTerms[0] ?? null;

  React.useEffect(() => {
    if (active && active.terminalId !== panelActiveTerminalId) {
      setPanelActiveTerminalId(active.terminalId);
    }
  }, [active, panelActiveTerminalId, setPanelActiveTerminalId]);

  // Register any DB sessions not yet tracked (default main).
  React.useEffect(() => {
    for (const row of sessions ?? []) {
      if (!terminals[row.id]) {
        registerTerminal({
          terminalId: row.id,
          ptyId: row.id,
          owner: 'main',
          title: row.title || row.shell_command || 'terminal',
          cwd: row.cwd,
          shell: row.shell_command,
          status: row.status === 'exited' ? 'exited' : 'running',
        });
      }
    }
  }, [sessions, terminals, registerTerminal]);

  const returnToMain = (terminalId: string) => {
    moveTerminal(terminalId, 'main');
    if (panelActiveTerminalId === terminalId) setPanelActiveTerminalId(null);
  };

  const spawnOnPet = () => {
    if (petTerminalCount() >= PET_PANEL_MAX_TERMINALS) {
      usePetPresentationStore.setState({ lastLimitMessage: PET_PANEL_TERMINAL_LIMIT_MESSAGE });
      return;
    }
    // Mount a TerminalView without sessionId → real spawn; onReady registers ownership.
    const tempId = `pending_${Date.now()}`;
    setPanelActiveTerminalId(tempId);
    usePetPresentationStore.setState((s) => ({
      terminals: {
        ...s.terminals,
        [tempId]: {
          terminalId: tempId,
          ptyId: tempId,
          owner: 'pet-mini-panel',
          title: 'new',
          status: 'running',
        },
      },
    }));
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', className)} data-pet-terminal-surface="true">
      <div className="flex flex-wrap items-center gap-1 shrink-0">
        <Button size="sm" variant="secondary" onClick={spawnOnPet}>
          New terminal
        </Button>
        <span className="text-metadata text-muted-foreground">
          {petTerminalCount()} / {PET_PANEL_MAX_TERMINALS} on panel
        </span>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => returnToMain(active.terminalId)}>
            Return to main
          </Button>
        )}
      </div>

      {(lastLimitMessage || petTerminalCount() >= PET_PANEL_MAX_TERMINALS) && (
        <div
          role="alert"
          data-testid="pet-terminal-limit"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm"
        >
          {lastLimitMessage ?? PET_PANEL_TERMINAL_LIMIT_MESSAGE}
        </div>
      )}

      {petTerms.length > 0 && (
        <div className="flex flex-wrap gap-1 shrink-0">
          {petTerms.map((t) => (
            <Button
              key={t.terminalId}
              size="sm"
              variant={t.terminalId === active?.terminalId ? 'default' : 'outline'}
              onClick={() => setPanelActiveTerminalId(t.terminalId)}
              data-terminal-id={t.terminalId}
              data-pty-id={t.ptyId}
            >
              {t.title || t.terminalId.slice(0, 8)}
            </Button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden bg-background">
        {active ? (
          <TerminalView
            key={active.ptyId}
            sessionId={active.terminalId.startsWith('pending_') ? null : active.ptyId}
            paneId={`pet-pane-${active.terminalId}`}
            hideChrome={false}
            className="h-full w-full"
            projectId={projectId}
            onReady={(sessionId) => {
              // Replace pending placeholder with real PTY id — same process, no clone.
              const prev = active.terminalId;
              usePetPresentationStore.setState((s) => {
                const next = { ...s.terminals };
                delete next[prev];
                next[sessionId] = {
                  terminalId: sessionId,
                  ptyId: sessionId,
                  owner: 'pet-mini-panel',
                  title: active.title || 'terminal',
                  status: 'running',
                };
                return {
                  terminals: next,
                  panelActiveTerminalId: sessionId,
                };
              });
            }}
            onExit={(code) => {
              setTerminalStatus(active.terminalId, code === 0 || code == null ? 'exited' : 'error');
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-secondary text-muted-foreground text-center">
            No terminals on the Pet panel. Create one or move a live session from main.
          </div>
        )}
      </div>

      <p className="text-metadata text-muted-foreground shrink-0">
        Tip: right-click a terminal in the main app → Send to Pet panel.
      </p>
    </div>
  );
}
