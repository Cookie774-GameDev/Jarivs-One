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
  const clearLimitMessage = usePetPresentationStore((s) => s.clearLimitMessage);
  const petTerminalCount = usePetPresentationStore((s) => s.petTerminalCount);
  const pushActivity = usePetPresentationStore((s) => s.pushActivity);

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

  const mainTerms = Object.values(terminals).filter((t) => t.owner === 'main');

  const claimToPet = (terminalId: string) => {
    clearLimitMessage();
    const result = moveTerminal(terminalId, 'pet-mini-panel');
    if (!result.ok) {
      // limit message set in store
      return;
    }
    setPanelActiveTerminalId(terminalId);
    pushActivity(
      {
        id: `act_term_move_${terminalId}_${Date.now()}`,
        kind: 'terminal',
        summary: `Terminal presentation moved to Pet panel`,
        target: { type: 'terminal', id: terminalId },
        createdAt: Date.now(),
      },
      true,
    );
  };

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

      {mainTerms.length > 0 && (
        <div className="shrink-0 max-h-28 overflow-auto border-t border-border pt-2">
          <div className="text-metadata text-muted-foreground mb-1">Main terminals — move here (no restart)</div>
          <ul className="space-y-1">
            {mainTerms.slice(0, 12).map((t) => (
              <li key={t.terminalId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono text-muted-foreground">
                  {t.title || t.terminalId.slice(0, 10)} · {t.status}
                </span>
                <Button size="sm" variant="outline" onClick={() => claimToPet(t.terminalId)}>
                  Move to Pet Panel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
