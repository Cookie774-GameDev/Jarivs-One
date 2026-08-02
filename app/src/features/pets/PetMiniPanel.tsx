/**
 * Pet mini-panel — polished floating panel: chats / terminals / activity.
 * Resizable + movable. Minimize/close hide the panel and restore the pet sprite.
 */
import * as React from 'react';
import {
  MessageSquare,
  Terminal,
  Activity,
  Minus,
  X,
  GripVertical,
  Cat,
  Mic,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
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
import { PetVoiceSurface } from './PetVoiceSurface';
import { usePetPresentationStore } from './petPresentationStore';
import { hidePetPanel, minimizePetPanel } from './petTauriBridge';
import {
  loadPetPanelHeaderCollapsed,
  petPanelDensityForSize,
  savePetPanelHeaderCollapsed,
  type PetPanelDensity,
} from './petPanelPreferences';
import './petMiniPanel.css';

export type PetMiniPanelTab = 'chats' | 'terminals' | 'activity' | 'voice';

export interface PetMiniPanelProps {
  open: boolean;
  onClose: () => void;
  /** Called when user hits minimize — should restore floating pet. */
  onMinimize?: () => void;
  animLabel?: string;
  className?: string;
  windowMode?: boolean;
  resizable?: boolean;
  onLifecycleChange?: (state: PetPanelLifecycleState) => void;
}

const MIN_W = 320;
const MIN_H = 320;
const MAX_W = 1200;
const MAX_H = 1000;

export function PetMiniPanel({
  open,
  onClose,
  onMinimize,
  animLabel,
  className,
  windowMode = false,
  resizable = false,
  onLifecycleChange,
}: PetMiniPanelProps) {
  const [tab, setTab] = React.useState<PetMiniPanelTab>('chats');
  const [headerCollapsed, setHeaderCollapsed] = React.useState(loadPetPanelHeaderCollapsed);
  const [expandedErrors, setExpandedErrors] = React.useState<Set<string>>(() => new Set());
  const [density, setDensity] = React.useState<PetPanelDensity>('comfortable');
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 460, h: 600 });
  const [panelPos, setPanelPos] = React.useState({ right: 28, bottom: 28 });
  const [lifecycle, setLifecycle] = React.useState<PetPanelLifecycleState>(
    open || windowMode ? 'open' : createInitialPanelLifecycle(),
  );
  const activity = usePetPresentationStore((s) => s.activity);
  const unread = usePetPresentationStore((s) => s.unreadActivity);
  const clearUnread = usePetPresentationStore((s) => s.clearUnread);
  const setPanelLifecycle = usePetPresentationStore((s) => s.setPanelLifecycle);
  const chats = usePetPresentationStore((s) => s.chats);
  const terminals = usePetPresentationStore((s) => s.terminals);
  const transitionTimerRef = React.useRef(0);

  const transitionDuration = React.useCallback(() => {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    }
    return 140;
  }, []);

  React.useEffect(
    () => () => {
      window.clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  React.useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const next = petPanelDensityForSize(rect.width, rect.height);
        setDensity((current) => (current === next ? current : next));
      });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const toggleHeaderCollapsed = React.useCallback(() => {
    setHeaderCollapsed((current) => {
      const next = !current;
      savePetPanelHeaderCollapsed(next);
      return next;
    });
  }, []);

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
      window.clearTimeout(transitionTimerRef.current);
      updateLifecycle({ type: 'request_open' });
      transitionTimerRef.current = window.setTimeout(
        () => updateLifecycle({ type: 'opened' }),
        transitionDuration(),
      );
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
    window.clearTimeout(transitionTimerRef.current);
    updateLifecycle({ type: 'request_minimize' });
    transitionTimerRef.current = window.setTimeout(() => {
      updateLifecycle({ type: 'minimized' });
      try {
        localStorage.removeItem('vibespace-pet-panel-open');
      } catch {
        /* ignore */
      }
      void minimizePetPanel().catch(() => undefined);
      onMinimize?.();
      onClose(); // restores pet sprite via host panelOpen=false
    }, transitionDuration());
  };

  const handleCloseRequest = () => updateLifecycle({ type: 'request_close' });

  const handleConfirmClose = () => {
    window.clearTimeout(transitionTimerRef.current);
    updateLifecycle({ type: 'confirm_close' });
    transitionTimerRef.current = window.setTimeout(() => {
      updateLifecycle({ type: 'closed' });
      try {
        localStorage.removeItem('vibespace-pet-panel-open');
      } catch {
        /* ignore */
      }
      void hidePetPanel().catch(() => undefined);
      onClose();
    }, transitionDuration());
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

  const startResize =
    (edge: 'se' | 'e' | 's' | 'sw' | 'ne' | 'n' | 'w') => (e: React.PointerEvent) => {
      if (!resizable || windowMode) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.w;
      const startH = size.h;
      const startRight = panelPos.right;
      const startBottom = panelPos.bottom;
      const move = (ev: PointerEvent) => {
        let w = startW;
        let h = startH;
        let right = startRight;
        let bottom = startBottom;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        // Panel anchored bottom-right: drag left edge grows width + right offset
        if (edge.includes('e') || edge === 'se' || edge === 'ne') {
          w = startW + dx;
        }
        if (edge.includes('w') || edge === 'sw') {
          w = startW - dx;
          right = startRight - dx;
        }
        if (edge.includes('s') || edge === 'se' || edge === 'sw') {
          h = startH + dy;
        }
        if (edge.includes('n') || edge === 'ne') {
          h = startH - dy;
          bottom = startBottom - dy;
        }
        setSize({
          w: Math.max(MIN_W, Math.min(MAX_W, w)),
          h: Math.max(MIN_H, Math.min(MAX_H, h)),
        });
        setPanelPos({
          right: Math.max(8, right),
          bottom: Math.max(8, bottom),
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

  const onHeaderDrag = (e: React.PointerEvent) => {
    if (windowMode || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRight = panelPos.right;
    const startBottom = panelPos.bottom;
    const move = (ev: PointerEvent) => {
      setPanelPos({
        right: Math.max(8, startRight - (ev.clientX - startX)),
        bottom: Math.max(8, startBottom - (ev.clientY - startY)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // PetHost mounts outside AppShell, and the dedicated Tauri pet-mini-panel
  // window has no shell either — chat/voice children use Tooltip/Hint and
  // crash without a provider ("Tooltip must be used within TooltipProvider").
  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={panelRef}
        className={cn(
          'pet-mini-panel-shell',
          windowMode
            ? 'fixed inset-0 z-50 flex flex-col bg-background'
            : cn(
                'fixed z-[81] flex flex-col overflow-hidden',
                'rounded-2xl border border-accent-copper/25',
                'bg-gradient-to-b from-panel via-panel to-background',
                'shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset]',
                'ring-1 ring-white/5',
              ),
          className,
        )}
        style={
          windowMode
            ? undefined
            : {
                right: panelPos.right,
                bottom: panelPos.bottom,
                width: size.w,
                height: size.h,
                maxWidth: '96vw',
                maxHeight: '92vh',
              }
        }
        role="dialog"
        aria-modal="true"
        aria-label="Pet mini panel"
        data-pet-mini-panel="true"
        data-pet-panel-lifecycle={lifecycle}
        data-pet-panel-density={density}
        data-pet-preserves-sessions={panelPreservesSessions(lifecycle) ? 'true' : 'false'}
      >
        {/* Accent top edge */}
        {!windowMode && (
          <div
            className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent-copper to-transparent opacity-80 [html[data-theme=monochrome]_&]:hidden"
            aria-hidden
          />
        )}

        <div
          className="pet-panel-top border-b border-border/80 bg-elevated/40 backdrop-blur-sm [html[data-theme=monochrome]_&]:backdrop-blur-none"
          data-testid="pet-panel-header"
          data-collapsed={headerCollapsed ? 'true' : 'false'}
        >
          <header
            className={cn(
              'pet-panel-header-row relative flex items-center gap-2 px-3 py-2.5',
              !windowMode && 'cursor-move',
            )}
            onPointerDown={onHeaderDrag}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {!windowMode && (
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
              <div className="pet-panel-identity-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-copper/30 bg-accent-copper/10">
                <Cat className="h-4.5 w-4.5 text-accent-copper" aria-hidden />
              </div>
              <div className={cn('min-w-0', headerCollapsed && 'hidden')}>
                <div className="pet-panel-expanded-title truncate text-ui-strong text-foreground tracking-tight">
                  Pet panel
                </div>
                <div className="pet-panel-subtitle truncate text-metadata text-muted-foreground">
                  {animLabel ? `${animLabel}` : 'Axolotl'} · {petChatCount} chats · {petTermCount}{' '}
                  terminals
                </div>
              </div>
            </div>
            {headerCollapsed && (
              <div className="pet-panel-active-label min-w-0 text-sm font-medium text-foreground">
                {tab === 'chats'
                  ? 'Chats'
                  : tab === 'terminals'
                    ? 'Terminals'
                    : tab === 'voice'
                      ? 'Voice'
                      : 'Activity'}
                {unread > 0 ? ` · ${unread} unread` : ''}
              </div>
            )}
            <div className="pet-panel-drag-region" data-tauri-drag-region aria-hidden />
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleHeaderCollapsed}
                aria-label={headerCollapsed ? 'Expand panel header' : 'Collapse panel header'}
                aria-expanded={!headerCollapsed}
                title={headerCollapsed ? 'Expand panel header' : 'Collapse panel header'}
                className="text-muted-foreground hover:text-foreground"
              >
                {headerCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleMinimize}
                aria-label="Minimize pet panel"
                data-testid="pet-panel-minimize"
                className="text-muted-foreground hover:text-foreground"
                title="Minimize — pet comes back"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleCloseRequest}
                aria-label="Close pet panel"
                data-testid="pet-panel-close"
                className="text-muted-foreground hover:text-destructive"
                title="Close — pet comes back"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {!headerCollapsed && (
            <nav
              className="pet-panel-nav flex gap-1 border-t border-border/50 bg-background/30 px-2 py-1.5"
              aria-label="Panel sections"
            >
              {(
                [
                  ['chats', MessageSquare, 'Chats'],
                  ['terminals', Terminal, 'Terminals'],
                  ['voice', Mic, 'Voice'],
                  ['activity', Activity, 'Activity'],
                ] as const
              ).map(([id, Icon, label]) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    data-testid={`pet-tab-${id}`}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    title={label}
                    className={cn(
                      'pet-panel-nav-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-accent-copper/15 text-accent-copper shadow-sm ring-1 ring-accent-copper/25'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="pet-panel-nav-label">{label}</span>
                    {id === 'activity' && unread > 0 ? (
                      <span className="rounded-full bg-accent-copper/90 px-1.5 text-[10px] font-semibold text-white">
                        {unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <div className="pet-panel-workspace relative flex-1 overflow-hidden p-2.5 min-h-0 bg-background/20">
          <div className="pet-panel-surface-frame h-full min-h-0 rounded-xl border border-border/50 bg-background/70 shadow-inner overflow-hidden">
            {tab === 'chats' && <PetChatSurface className="h-full p-2" />}
            {tab === 'terminals' && <PetTerminalSurface className="h-full p-2" />}
            {tab === 'voice' && (
              <PetVoiceSurface className="h-full" onOpenChats={() => setTab('chats')} />
            )}
            {tab === 'activity' && (
              <div className="h-full overflow-auto p-3" data-testid="pet-activity">
                <p className="mb-3 text-secondary text-muted-foreground text-sm">
                  Safe activity · no secrets · click a chat or terminal tab to work.
                </p>
                <ul className="space-y-2">
                  {[...activity].reverse().map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-xl border border-border/70 bg-elevated/50 p-3 text-sm"
                      data-activity-id={ev.id}
                    >
                      <div className="text-metadata text-muted-foreground">
                        {ev.kind} · {new Date(ev.createdAt).toLocaleTimeString()}
                      </div>
                      <div className="mt-0.5 text-foreground">{ev.summary}</div>
                      {ev.kind === 'error' && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            aria-expanded={expandedErrors.has(ev.id)}
                            aria-label={
                              expandedErrors.has(ev.id)
                                ? 'Collapse error details'
                                : 'Expand error details'
                            }
                            onClick={() =>
                              setExpandedErrors((current) => {
                                const next = new Set(current);
                                if (next.has(ev.id)) next.delete(ev.id);
                                else next.add(ev.id);
                                return next;
                              })
                            }
                          >
                            {expandedErrors.has(ev.id) ? 'Hide details' : 'Show details'}
                          </Button>
                          {expandedErrors.has(ev.id) && (
                            <div className="pet-panel-error-details mt-2 rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-metadata text-muted-foreground">
                              <div>Target: {ev.target.type}</div>
                              <div className="break-all">Reference: {ev.target.id}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                  {activity.length === 0 && (
                    <li className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-secondary text-muted-foreground text-sm">
                      No activity yet — send a chat or terminal here to get started.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Resize handles */}
        {resizable && !windowMode && (
          <>
            <div
              className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
              onPointerDown={startResize('se')}
              aria-label="Resize"
            />
            <div
              className="absolute bottom-0 left-0 right-4 h-1.5 cursor-s-resize"
              onPointerDown={startResize('s')}
            />
            <div
              className="absolute bottom-4 left-0 top-10 w-1.5 cursor-w-resize"
              onPointerDown={startResize('w')}
            />
            <div
              className="absolute bottom-4 right-0 top-10 w-1.5 cursor-e-resize"
              onPointerDown={startResize('e')}
            />
            <div
              className="absolute left-4 right-4 top-0 h-1 cursor-n-resize"
              onPointerDown={startResize('n')}
            />
            <div className="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 rounded-sm border-b-2 border-r-2 border-accent-copper/50" />
          </>
        )}

        {lifecycle === 'confirmingClose' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm [html[data-theme=monochrome]_&]:backdrop-blur-none"
            data-testid="pet-close-confirm"
            role="alertdialog"
            aria-label="Confirm close mini panel"
          >
            <div className="max-w-sm rounded-2xl border border-border bg-panel p-5 shadow-2xl flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-foreground">
                {PET_PANEL_CLOSE_CONFIRM_MESSAGE}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={handleCancelClose}>
                  {PET_PANEL_CLOSE_CONFIRM_BUTTONS.cancel}
                </Button>
                <Button
                  variant="default"
                  onClick={handleConfirmClose}
                  data-testid="pet-close-confirm-btn"
                  className="bg-accent-copper hover:bg-accent-copper/90"
                >
                  {PET_PANEL_CLOSE_CONFIRM_BUTTONS.confirm}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
