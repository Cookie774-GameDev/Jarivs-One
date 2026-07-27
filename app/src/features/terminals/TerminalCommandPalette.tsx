import * as React from 'react';
import {
  Bot,
  CircleHelp,
  FileText,
  FolderKanban,
  ListChecks,
  Map,
  NotebookPen,
  Search,
  Sparkles,
  TerminalSquare,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Route } from '@/stores/ui';
import type { TerminalPromptEvidence } from './terminalCommandFoundation';

type PaletteItem = Readonly<{
  id: string;
  label: string;
  description: string;
  destination?: Route;
  detail?: 'status' | 'help';
  icon: LucideIcon;
}>;

export const TERMINAL_PALETTE_ITEMS: readonly PaletteItem[] = Object.freeze([
  {
    id: 'context',
    label: 'Context Map',
    description: 'Open maps, sources, notes, and retrieval activity',
    destination: 'context',
    icon: Map,
  },
  {
    id: 'skills',
    label: 'Skills',
    description: 'Browse and manage available skills',
    destination: 'skills',
    icon: Sparkles,
  },
  {
    id: 'agents',
    label: 'Agents',
    description: 'Open the agent workspace',
    destination: 'agents',
    icon: Bot,
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Open the current project workspace',
    destination: 'project-detail',
    icon: FolderKanban,
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Open Context notes',
    destination: 'context',
    icon: FileText,
  },
  {
    id: 'daily',
    label: 'Daily Note',
    description: "Open today's Context note",
    destination: 'context',
    icon: NotebookPen,
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Search the current Context workspace',
    destination: 'context',
    icon: Search,
  },
  {
    id: 'terminals',
    label: 'Terminals',
    description: 'Return to the terminal workspace',
    destination: 'terminal',
    icon: TerminalSquare,
  },
  {
    id: 'status',
    label: 'Status',
    description: 'Show this pane’s verified safety state',
    detail: 'status',
    icon: ListChecks,
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Show terminal palette and CLI help',
    detail: 'help',
    icon: CircleHelp,
  },
]);

export interface TerminalCommandPaletteProps {
  open: boolean;
  paneId?: string;
  sessionId: string | null;
  projectId: string | null;
  evidence: TerminalPromptEvidence;
  onClose: () => void;
  onNavigate: (route: Route) => void;
}

export function TerminalCommandPalette({
  open,
  paneId,
  sessionId,
  projectId,
  evidence,
  onClose,
  onNavigate,
}: TerminalCommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [detail, setDetail] = React.useState<'status' | 'help' | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return TERMINAL_PALETTE_ITEMS;
    return TERMINAL_PALETTE_ITEMS.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    setDetail(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  React.useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, selectedIndex]);

  if (!open) return null;

  const select = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.detail) {
      setDetail(item.detail);
      return;
    }
    if (item.destination) {
      onNavigate(item.destination);
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (detail) {
      if (event.key === 'Backspace') {
        event.preventDefault();
        setDetail(null);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return;
    }
    if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      setSelectedIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0));
      return;
    }
    if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
      event.preventDefault();
      setSelectedIndex((index) =>
        filtered.length ? (index - 1 + filtered.length) % filtered.length : 0,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      select(filtered[selectedIndex]);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="VibeSpace terminal palette"
      onKeyDown={handleKeyDown}
      className="absolute inset-2 z-40 flex min-h-0 flex-col overflow-hidden rounded-xl border border-accent-copper/50 bg-background/95 shadow-[0_18px_60px_hsl(var(--foreground)/0.28)] backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b border-border bg-paper-soft px-3 py-2">
        <Sparkles className="h-4 w-4 text-accent-copper" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-display text-ui-strong text-foreground">VibeSpace</div>
          <div className="truncate text-metadata text-muted-foreground">
            Pane {paneId ?? 'unbound'} · Ctrl/⌘+Shift+P
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close VibeSpace terminal palette"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {detail === 'status' ? (
        <div className="min-h-0 flex-1 overflow-auto p-4 text-secondary text-foreground">
          <h3 className="font-display text-ui-strong">Terminal status</h3>
          <p className="mt-2">
            {evidence.atPrompt
              ? 'Verified local shell prompt'
              : 'Slash interception is closed; use the toolbar or Ctrl/⌘+Shift+P.'}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-metadata">
            <dt>Session</dt>
            <dd>{sessionId ?? 'not attached'}</dd>
            <dt>Project</dt>
            <dd>{projectId ?? 'none'}</dd>
            <dt>Protocol</dt>
            <dd>{evidence.promptProtocol}</dd>
            <dt>Alternate screen</dt>
            <dd>{evidence.alternateScreen ? 'yes' : 'no'}</dd>
          </dl>
          <button type="button" onClick={() => setDetail(null)} className="mt-4 text-accent-copper">
            Back
          </button>
        </div>
      ) : detail === 'help' ? (
        <div className="min-h-0 flex-1 overflow-auto p-4 text-secondary text-foreground">
          <h3 className="font-display text-ui-strong">Terminal help</h3>
          <p className="mt-2">
            Type <code>/vibespace</code> only at a verified local shell prompt. In interactive,
            remote, or full-screen programs, use the toolbar or Ctrl/⌘+Shift+P.
          </p>
          <p className="mt-2">
            The real <code>vibespace</code> and <code>vs</code> CLI commands are separate from this
            in-pane overlay.
          </p>
          <button type="button" onClick={() => setDetail(null)} className="mt-4 text-accent-copper">
            Back
          </button>
        </div>
      ) : (
        <>
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Filter terminal commands"
              aria-controls="vibespace-terminal-palette-list"
              aria-expanded="true"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Type to filter…"
              className="w-full rounded-md border border-border bg-paper px-3 py-2 text-body text-foreground outline-none focus:border-accent-copper"
            />
          </div>
          <div
            id="vibespace-terminal-palette-list"
            role="listbox"
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {filtered.map((item, index) => {
              const Icon = item.icon;
              const selected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-label={item.label}
                  aria-selected={selected}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => select(item)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left',
                    selected
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-body text-foreground">{item.label}</span>
                    <span className="block truncate text-metadata">{item.description}</span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-secondary text-muted-foreground">
                No matching VibeSpace commands.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
