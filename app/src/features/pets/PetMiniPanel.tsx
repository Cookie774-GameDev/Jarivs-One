/**
 * Functional Pet mini-panel: chats / terminals / activity with presentation ownership.
 * Used as a Tauri window (view=pet-mini-panel) or browser fallback overlay.
 * Minimize/close never kill PTYs, streams, or chat threads.
 */
import * as React from 'react';
import { MessageSquare, Terminal, Activity, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PET_PANEL_CLOSE_CONFIRM_BUTTONS,
  PET_PANEL_CLOSE_CONFIRM_MESSAGE,
  PET_PANEL_MAX_TERMINALS,
  PET_PANEL_TERMINAL_LIMIT_MESSAGE,
  createInitialPanelLifecycle,
  panelPreservesSessions,
  reducePanelLifecycle,
  type PetPanelLifecycleState,
} from './petPanelLifecycle';
import {
  assertSessionsSurvivePanelClose,
  beginChatRequest,
  clearActivityUnread,
  createEmptyPresentationState,
  endChatRequest,
  moveChatPresentation,
  moveTerminalPresentation,
  petPanelTerminalCount,
  pushActivity,
  registerChat,
  registerTerminal,
  sanitizeActivitySummary,
  type PresentationState,
  type SafeActivityEvent,
} from './petPresentation';
import { hidePetPanel, minimizePetPanel } from './petTauriBridge';

export type PetMiniPanelTab = 'chats' | 'terminals' | 'activity';

export interface PetMiniPanelProps {
  open: boolean;
  onClose: () => void;
  animLabel?: string;
  className?: string;
  /** Full-window mode inside pet-mini-panel Tauri webview. */
  windowMode?: boolean;
  /** Optional seed presentation for tests / host sync. */
  initialPresentation?: PresentationState;
  onPresentationChange?: (state: PresentationState) => void;
  onLifecycleChange?: (state: PetPanelLifecycleState) => void;
}

export function PetMiniPanel({
  open,
  onClose,
  animLabel,
  className,
  windowMode = false,
  initialPresentation,
  onPresentationChange,
  onLifecycleChange,
}: PetMiniPanelProps) {
  const [tab, setTab] = React.useState<PetMiniPanelTab>('chats');
  const [lifecycle, setLifecycle] = React.useState<PetPanelLifecycleState>(
    open ? 'open' : 'closed',
  );
  const [presentation, setPresentation] = React.useState<PresentationState>(
    () => initialPresentation ?? createEmptyPresentationState(),
  );
  const [terminalLimitMsg, setTerminalLimitMsg] = React.useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = React.useState<string | null>(null);

  const updateLifecycle = React.useCallback(
    (event: Parameters<typeof reducePanelLifecycle>[1]) => {
      setLifecycle((prev) => {
        const next = reducePanelLifecycle(prev, event);
        onLifecycleChange?.(next);
        return next;
      });
    },
    [onLifecycleChange],
  );

  const updatePresentation = React.useCallback(
    (next: PresentationState) => {
      setPresentation(next);
      onPresentationChange?.(next);
    },
    [onPresentationChange],
  );

  React.useEffect(() => {
    if (open) {
      updateLifecycle({ type: 'request_open' });
      updateLifecycle({ type: 'opened' });
      updatePresentation(clearActivityUnread(presentation));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to open flag
  }, [open]);

  React.useEffect(() => {
    if (!open && !windowMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lifecycle === 'confirmingClose') updateLifecycle({ type: 'cancel_close' });
        else updateLifecycle({ type: 'request_close' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, windowMode, lifecycle, updateLifecycle]);

  const handleMinimize = () => {
    updateLifecycle({ type: 'request_minimize' });
    updateLifecycle({ type: 'minimized' });
    void minimizePetPanel();
    // Sessions survive
    assertSessionsSurvivePanelClose(presentation);
  };

  const handleCloseRequest = () => {
    updateLifecycle({ type: 'request_close' });
  };

  const handleConfirmClose = () => {
    updateLifecycle({ type: 'confirm_close' });
    const snapshot = assertSessionsSurvivePanelClose(presentation);
    void snapshot;
    updateLifecycle({ type: 'closed' });
    void hidePetPanel();
    onClose();
  };

  const handleCancelClose = () => {
    updateLifecycle({ type: 'cancel_close' });
  };

  /** Demo helpers — real app wires these to Dexie/stores via presentation store. */
  const ensureDemoData = () => {
    let next = presentation;
    if (Object.keys(next.chats).length === 0) {
      next = registerChat(next, {
        chatId: 'chat_demo_1',
        owner: 'pet-mini-panel',
        streaming: false,
        activeRequestId: null,
      });
    }
    if (Object.keys(next.terminals).length === 0) {
      next = registerTerminal(next, {
        terminalId: 'term_demo_1',
        owner: 'pet-mini-panel',
        ptyId: 'pty_demo_1',
        title: 'pwsh',
        cwd: 'C:\\Users\\viper',
        shell: 'pwsh',
        status: 'running',
      });
    }
    if (next !== presentation) updatePresentation(next);
  };

  React.useEffect(() => {
    if (open || windowMode) ensureDemoData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, windowMode]);

  const claimChatToPanel = (chatId: string) => {
    const result = moveChatPresentation(presentation, chatId, 'pet-mini-panel');
    if (result.ok) updatePresentation(result.state);
  };

  const returnChatToMain = (chatId: string) => {
    const result = moveChatPresentation(presentation, chatId, 'main');
    if (result.ok) updatePresentation(result.state);
  };

  const claimTerminalToPanel = (terminalId: string) => {
    const result = moveTerminalPresentation(presentation, terminalId, 'pet-mini-panel');
    if (!result.ok) {
      setTerminalLimitMsg(result.message ?? PET_PANEL_TERMINAL_LIMIT_MESSAGE);
      return;
    }
    setTerminalLimitMsg(null);
    updatePresentation(result.state);
  };

  const returnTerminalToMain = (terminalId: string) => {
    const result = moveTerminalPresentation(presentation, terminalId, 'main');
    if (result.ok) updatePresentation(result.state);
  };

  const sendChatMessage = (chatId: string) => {
    const requestId = `req_${Date.now()}`;
    const started = beginChatRequest(presentation, chatId, requestId);
    if (!started.ok) {
      // Duplicate outbound request blocked
      return;
    }
    updatePresentation(started.state);
    // Simulate stream completion without cloning thread
    window.setTimeout(() => {
      updatePresentation(endChatRequest(started.state, chatId, requestId));
    }, 50);
  };

  const pushDemoActivity = () => {
    const ev: SafeActivityEvent = {
      id: `act_${Date.now()}`,
      kind: 'chat',
      summary: sanitizeActivitySummary('Chat updated — no secrets here'),
      target: { type: 'chat', id: selectedChatId ?? 'chat_demo_1' },
      createdAt: Date.now(),
    };
    updatePresentation(pushActivity(presentation, ev, { panelFocused: true }));
  };

  const visible =
    windowMode ||
    open ||
    lifecycle === 'open' ||
    lifecycle === 'confirmingClose' ||
    lifecycle === 'opening';

  if (!visible && lifecycle !== 'minimized') return null;
  if (lifecycle === 'minimized' && !windowMode) return null;

  const panelChats = Object.values(presentation.chats).filter((c) => c.owner === 'pet-mini-panel');
  const panelTerms = Object.values(presentation.terminals).filter(
    (t) => t.owner === 'pet-mini-panel',
  );
  const mainTerms = Object.values(presentation.terminals).filter((t) => t.owner === 'main');

  return (
    <div
      className={cn(
        windowMode
          ? 'fixed inset-0 z-50 flex flex-col bg-background'
          : 'fixed z-[71] w-[430px] h-[560px] max-h-[90vh] rounded-xl border border-border bg-panel/95 backdrop-blur-md shadow-xl',
        'flex flex-col',
        className,
      )}
      style={windowMode ? undefined : { right: 24, bottom: 24 }}
      role="dialog"
      aria-modal="true"
      aria-label="Pet mini panel"
      data-pet-mini-panel="true"
      data-pet-panel-lifecycle={lifecycle}
      data-pet-preserves-sessions={panelPreservesSessions(lifecycle) ? 'true' : 'false'}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 shrink-0">
        <div>
          <div className="text-ui-strong text-foreground">VibeSpace Pet Panel</div>
          <div className="text-metadata text-muted-foreground">
            {animLabel ? `Pet: ${animLabel}` : 'Axolotl companion'} · sessions keep running
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleMinimize}
            aria-label="Minimize pet panel"
            data-testid="pet-panel-minimize"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCloseRequest}
            aria-label="Close pet panel"
            data-testid="pet-panel-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-border px-2 py-1 shrink-0" aria-label="Panel sections">
        {(
          [
            ['chats', MessageSquare, 'Chats'],
            ['terminals', Terminal, 'Terminals'],
            ['activity', Activity, 'Activity'],
          ] as const
        ).map(([id, Icon, label]) => (
          <Button
            key={id}
            variant={tab === id ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(id)}
            className="gap-1"
            data-testid={`pet-tab-${id}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === 'activity' && presentation.unreadActivity > 0
              ? ` (${presentation.unreadActivity})`
              : ''}
          </Button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-3 min-h-0">
        {tab === 'chats' && (
          <div className="flex flex-col gap-2" data-testid="pet-chats">
            <p className="text-secondary text-muted-foreground">
              Real thread IDs · presentation ownership only · no clone · no duplicate requests.
            </p>
            {panelChats.length === 0 && (
              <p className="text-secondary text-muted-foreground">No chats on this panel yet.</p>
            )}
            {panelChats.map((c) => (
              <div
                key={c.chatId}
                className="rounded-lg border border-border p-2 flex flex-col gap-1"
                data-chat-id={c.chatId}
              >
                <div className="text-ui-strong text-foreground font-mono text-xs">{c.chatId}</div>
                <div className="text-metadata text-muted-foreground">
                  {c.streaming ? 'Streaming…' : 'Idle'}
                  {c.activeRequestId ? ` · req ${c.activeRequestId}` : ''}
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => sendChatMessage(c.chatId)}>
                    Send (deduped)
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => returnChatToMain(c.chatId)}>
                    Return to main
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedChatId(c.chatId)}>
                    Focus
                  </Button>
                </div>
              </div>
            ))}
            {Object.values(presentation.chats)
              .filter((c) => c.owner === 'main')
              .map((c) => (
                <div key={c.chatId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{c.chatId} (main)</span>
                  <Button size="sm" variant="outline" onClick={() => claimChatToPanel(c.chatId)}>
                    Move here
                  </Button>
                </div>
              ))}
          </div>
        )}

        {tab === 'terminals' && (
          <div className="flex flex-col gap-2" data-testid="pet-terminals">
            <p className="text-secondary text-muted-foreground">
              Real PTY sessions · max {PET_PANEL_MAX_TERMINALS} presentations · move never restarts PTY.
            </p>
            {terminalLimitMsg && (
              <div
                className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-foreground"
                data-testid="pet-terminal-limit"
                role="alert"
              >
                {terminalLimitMsg}
              </div>
            )}
            <div className="text-metadata text-muted-foreground">
              On panel: {petPanelTerminalCount(presentation)} / {PET_PANEL_MAX_TERMINALS}
            </div>
            {panelTerms.map((t) => (
              <div
                key={t.terminalId}
                className="rounded-lg border border-border p-2"
                data-terminal-id={t.terminalId}
                data-pty-id={t.ptyId}
              >
                <div className="text-ui-strong text-foreground">{t.title}</div>
                <div className="text-metadata text-muted-foreground font-mono text-xs">
                  {t.shell} · {t.cwd} · pty {t.ptyId} · {t.status}
                </div>
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => returnTerminalToMain(t.terminalId)}>
                  Return to main
                </Button>
              </div>
            ))}
            {mainTerms.map((t) => (
              <div key={t.terminalId} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  {t.terminalId} (main, pty {t.ptyId})
                </span>
                <Button size="sm" variant="outline" onClick={() => claimTerminalToPanel(t.terminalId)}>
                  Move here
                </Button>
              </div>
            ))}
          </div>
        )}

        {tab === 'activity' && (
          <div className="flex flex-col gap-2" data-testid="pet-activity">
            <p className="text-secondary text-muted-foreground">
              Typed activity · stable-id dedupe · safe summaries only.
            </p>
            <Button size="sm" variant="secondary" onClick={pushDemoActivity}>
              Record activity
            </Button>
            <ul className="text-sm space-y-1">
              {presentation.activitySeenIds.slice(-20).reverse().map((id) => (
                <li key={id} className="font-mono text-xs text-muted-foreground">
                  {id}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {lifecycle === 'confirmingClose' && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4"
          data-testid="pet-close-confirm"
          role="alertdialog"
          aria-label="Confirm close mini panel"
        >
          <div className="max-w-sm rounded-xl border border-border bg-panel p-4 shadow-lg flex flex-col gap-3">
            <p className="text-sm text-foreground">{PET_PANEL_CLOSE_CONFIRM_MESSAGE}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleCancelClose}>
                {PET_PANEL_CLOSE_CONFIRM_BUTTONS.cancel}
              </Button>
              <Button variant="default" onClick={handleConfirmClose} data-testid="pet-close-confirm-btn">
                {PET_PANEL_CLOSE_CONFIRM_BUTTONS.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
