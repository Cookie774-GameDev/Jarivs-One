/**
 * Functional Pet mini-panel with real ChatThread/Composer + TerminalView.
 * Used as Tauri window (view=pet-mini-panel) or browser fallback.
 * Minimize/close never kill PTYs, streams, or chat threads.
 */
import * as React from 'react';
import { MessageSquare, Terminal, Activity, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PET_PANEL_CLOSE_CONFIRM_BUTTONS,
  PET_PANEL_CLOSE_CONFIRM_MESSAGE,
  createInitialPanelLifecycle,
  panelPreservesSessions,
  reducePanelLifecycle,
  type PetPanelLifecycleState,
} from './petPanelLifecycle';
import { PetChatSurface } from './PetChatSurface';
import { PetTerminalSurface } from './PetTerminalSurface';
import { usePetPresentationStore } from './petPresentationStore';
import { hidePetPanel, minimizePetPanel } from './petTauriBridge';

export type PetMiniPanelTab = 'chats' | 'terminals' | 'activity';

export interface PetMiniPanelProps {
  open: boolean;
  onClose: () => void;
  animLabel?: string;
  className?: string;
  windowMode?: boolean;
  onLifecycleChange?: (state: PetPanelLifecycleState) => void;
}

export function PetMiniPanel({
  open,
  onClose,
  animLabel,
  className,
  windowMode = false,
  onLifecycleChange,
}: PetMiniPanelProps) {
  const [tab, setTab] = React.useState<PetMiniPanelTab>('chats');
  const [lifecycle, setLifecycle] = React.useState<PetPanelLifecycleState>(
    open || windowMode ? 'open' : createInitialPanelLifecycle(),
  );
  const activity = usePetPresentationStore((s) => s.activity);
  const unread = usePetPresentationStore((s) => s.unreadActivity);
  const clearUnread = usePetPresentationStore((s) => s.clearUnread);
  const setPanelLifecycle = usePetPresentationStore((s) => s.setPanelLifecycle);
  const chats = usePetPresentationStore((s) => s.chats);
  const terminals = usePetPresentationStore((s) => s.terminals);

  const updateLifecycle = React.useCallback(
    (event: Parameters<typeof reducePanelLifecycle>[1]) => {
      setLifecycle((prev) => {
        const next = reducePanelLifecycle(prev, event);
        onLifecycleChange?.(next);
        setPanelLifecycle(next);
        return next;
      });
    },
    [onLifecycleChange, setPanelLifecycle],
  );

  React.useEffect(() => {
    if (open || windowMode) {
      updateLifecycle({ type: 'request_open' });
      updateLifecycle({ type: 'opened' });
      clearUnread();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, windowMode]);

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
  };

  const handleCloseRequest = () => updateLifecycle({ type: 'request_close' });

  const handleConfirmClose = () => {
    updateLifecycle({ type: 'confirm_close' });
    updateLifecycle({ type: 'closed' });
    void hidePetPanel();
    onClose();
  };

  const handleCancelClose = () => updateLifecycle({ type: 'cancel_close' });

  const visible =
    windowMode ||
    open ||
    lifecycle === 'open' ||
    lifecycle === 'confirmingClose' ||
    lifecycle === 'opening' ||
    lifecycle === 'restoring';

  if (!visible && lifecycle !== 'minimized') return null;
  if (lifecycle === 'minimized' && !windowMode) return null;

  const petChatCount = Object.values(chats).filter((c) => c.owner === 'pet-mini-panel').length;
  const petTermCount = Object.values(terminals).filter((t) => t.owner === 'pet-mini-panel').length;

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
            {animLabel ? `Pet: ${animLabel}` : 'Axolotl companion'} · {petChatCount} chats ·{' '}
            {petTermCount} terminals · sessions keep running
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
            {id === 'activity' && unread > 0 ? ` (${unread})` : ''}
          </Button>
        ))}
      </nav>

      <div className="flex-1 overflow-hidden p-2 min-h-0">
        {tab === 'chats' && <PetChatSurface className="h-full" />}
        {tab === 'terminals' && <PetTerminalSurface className="h-full" />}
        {tab === 'activity' && (
          <div className="h-full overflow-auto" data-testid="pet-activity">
            <p className="text-secondary text-muted-foreground mb-2">
              Safe activity summaries · stable-id dedupe · no secrets.
            </p>
            <ul className="space-y-2">
              {[...activity].reverse().map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-border p-2 text-sm"
                  data-activity-id={ev.id}
                >
                  <div className="text-metadata text-muted-foreground">
                    {ev.kind} · {new Date(ev.createdAt).toLocaleTimeString()}
                  </div>
                  <div className="text-foreground">{ev.summary}</div>
                  <div className="text-metadata font-mono text-muted-foreground">
                    → {ev.target.type}:{ev.target.id.slice(0, 16)}
                  </div>
                </li>
              ))}
              {activity.length === 0 && (
                <li className="text-secondary text-muted-foreground">No activity yet.</li>
              )}
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
              <Button
                variant="default"
                onClick={handleConfirmClose}
                data-testid="pet-close-confirm-btn"
              >
                {PET_PANEL_CLOSE_CONFIRM_BUTTONS.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
