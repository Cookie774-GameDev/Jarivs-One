/**
 * Real live TerminalView mounts for the Pet mini-panel.
 * Tabs mode: one active terminal. Grid mode: up to 4 simultaneous real xterms.
 * Never spawns a second PTY for a move.
 */
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LayoutGrid, LayoutList } from 'lucide-react';
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

export type PetTerminalViewMode = 'tabs' | 'grid';

const VIEW_MODE_KEY = 'vibespace-pet-terminal-view-mode';

function loadViewMode(): PetTerminalViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    return v === 'grid' ? 'grid' : 'tabs';
  } catch {
    return 'tabs';
  }
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  return 'grid-cols-2 grid-rows-2';
}

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

  const [viewMode, setViewMode] = React.useState<PetTerminalViewMode>(loadViewMode);

  const setMode = (m: PetTerminalViewMode) => {
    setViewMode(m);
    try {
      localStorage.setItem(VIEW_MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

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

  const renderTerminal = (t: (typeof petTerms)[0], focused: boolean) => {
    const isPending = t.terminalId.startsWith('pending_');
    return (
      <div
        key={t.terminalId}
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background',
          focused ? 'border-accent-copper ring-1 ring-accent-copper/40' : 'border-border',
        )}
        data-pet-terminal-tile={t.terminalId}
        data-pet-terminal-focused={focused ? 'true' : 'false'}
        onPointerDown={() => setPanelActiveTerminalId(t.terminalId)}
      >
        <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border px-1.5 py-0.5">
          <div className="min-w-0 truncate text-metadata">
            <span className="text-foreground">{t.title || t.terminalId.slice(0, 8)}</span>
            {t.cwd && (
              <span className="ml-1 text-muted-foreground truncate" title={t.cwd}>
                {t.cwd}
              </span>
            )}
            <span className="ml-1 text-muted-foreground">· {t.status}</span>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                setPanelActiveTerminalId(t.terminalId);
                setMode('tabs');
              }}
            >
              Focus
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                returnToMain(t.terminalId);
              }}
            >
              Main
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <TerminalView
            key={t.ptyId}
            sessionId={isPending ? null : t.ptyId}
            paneId={`pet-pane-${t.terminalId}`}
            hideChrome
            className="h-full w-full"
            projectId={projectId}
            onReady={(sessionId) => {
              const prev = t.terminalId;
              usePetPresentationStore.setState((s) => {
                const next = { ...s.terminals };
                delete next[prev];
                next[sessionId] = {
                  terminalId: sessionId,
                  ptyId: sessionId,
                  owner: 'pet-mini-panel',
                  title: t.title || 'terminal',
                  cwd: t.cwd,
                  shell: t.shell,
                  status: 'running',
                };
                return {
                  terminals: next,
                  panelActiveTerminalId:
                    s.panelActiveTerminalId === prev ? sessionId : s.panelActiveTerminalId,
                };
              });
            }}
            onExit={(code) => {
              setTerminalStatus(t.terminalId, code === 0 || code == null ? 'exited' : 'error');
            }}
          />
        </div>
      </div>
    );
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
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button
            size="sm"
            variant={viewMode === 'tabs' ? 'default' : 'ghost'}
            className="h-7 gap-1 px-2"
            onClick={() => setMode('tabs')}
            data-pet-terminal-view="tabs"
            aria-pressed={viewMode === 'tabs'}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Tabs
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            className="h-7 gap-1 px-2"
            onClick={() => setMode('grid')}
            data-pet-terminal-view="grid"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </Button>
        </div>
        {active && viewMode === 'tabs' && (
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

      {viewMode === 'tabs' && petTerms.length > 0 && (
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
        {petTerms.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-secondary text-muted-foreground text-center">
            No terminals on the Pet panel. Create one or move a live session from main.
          </div>
        ) : viewMode === 'grid' ? (
          <div
            className={cn('grid h-full min-h-0 gap-1 p-1', gridClass(petTerms.length))}
            data-pet-terminal-grid="true"
            data-pet-terminal-count={petTerms.length}
          >
            {petTerms.map((t) => renderTerminal(t, t.terminalId === active?.terminalId))}
          </div>
        ) : active ? (
          renderTerminal(active, true)
        ) : null}
      </div>

      <p className="text-metadata text-muted-foreground shrink-0">
        Tip: right-click a terminal in the main app → Send to Pet panel. Grid shows all live PTYs.
      </p>
    </div>
  );
}
