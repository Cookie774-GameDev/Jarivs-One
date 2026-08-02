import * as React from 'react';
import {
  BringToFront,
  Copy,
  LocateFixed,
  Minus,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useWorkbenchStore } from './store';

type MenuMode =
  | { kind: 'panel'; panelId: string; x: number; y: number }
  | { kind: 'canvas'; x: number; y: number }
  | { kind: 'rename'; panelId: string; x: number; y: number; draft: string };

/**
 * Workbench-only right-click menu — copper/paper styling to match the spatial shell.
 * Suppresses the global Jarvis context menu via data-jarvis-suppress-context-menu on the shell.
 */
export function WorkbenchContextMenu() {
  const [menu, setMenu] = React.useState<MenuMode | null>(null);
  const renameRef = React.useRef<HTMLInputElement>(null);

  const panels = useWorkbenchStore((s) => s.panels);
  const history = useWorkbenchStore((s) => s.history);
  const future = useWorkbenchStore((s) => s.future);
  const updatePanel = useWorkbenchStore((s) => s.updatePanel);
  const duplicatePanel = useWorkbenchStore((s) => s.duplicatePanel);
  const removePanel = useWorkbenchStore((s) => s.removePanel);
  const bringToFront = useWorkbenchStore((s) => s.bringToFront);
  const selectPanel = useWorkbenchStore((s) => s.selectPanel);
  const fitView = useWorkbenchStore((s) => s.fitView);
  const undo = useWorkbenchStore((s) => s.undo);
  const redo = useWorkbenchStore((s) => s.redo);

  const close = React.useCallback(() => setMenu(null), []);
  const renamingRef = React.useRef(false);

  React.useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const shell = target.closest('.workbench-shell');
      if (!shell) return;

      // Let native menus work on real form fields / embeds when requested.
      if (target.closest('[data-native-context-menu], input, textarea, select, iframe')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const panelEl = target.closest('.workbench-panel') as HTMLElement | null;
      const panelId = panelEl?.dataset.panelId;
      if (panelId) {
        selectPanel(panelId);
        bringToFront(panelId);
        renamingRef.current = false;
        setMenu({ kind: 'panel', panelId, x: event.clientX, y: event.clientY });
        return;
      }

      if (target.closest('.workbench-canvas, .workbench-content, .workbench-palette')) {
        renamingRef.current = false;
        setMenu({ kind: 'canvas', x: event.clientX, y: event.clientY });
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    // Do not close when interacting with the menu itself (esp. rename input).
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.workbench-context-menu')) return;
      close();
    };

    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [bringToFront, close, selectPanel]);

  // Focus rename field only when entering rename mode — not on every keystroke
  // (re-selecting each render caused the "only one character" bug).
  React.useEffect(() => {
    if (menu?.kind === 'rename' && !renamingRef.current) {
      renamingRef.current = true;
      const id = window.requestAnimationFrame(() => {
        renameRef.current?.focus();
        renameRef.current?.select();
      });
      return () => window.cancelAnimationFrame(id);
    }
    if (menu?.kind !== 'rename') renamingRef.current = false;
  }, [menu?.kind]);

  if (!menu) return null;

  const left = Math.min(menu.x, window.innerWidth - 240);
  const top = Math.min(menu.y, window.innerHeight - 320);

  const panel =
    menu.kind === 'panel' || menu.kind === 'rename'
      ? panels.find((p) => p.id === menu.panelId)
      : undefined;

  const commitRename = () => {
    if (menu.kind !== 'rename' || !panel) return;
    const next = menu.draft.trim().slice(0, 80);
    if (next) updatePanel(panel.id, { title: next });
    close();
  };

  return (
    <div
      className="workbench-context-menu [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:bg-panel [html[data-theme=monochrome]_&]:bg-none [html[data-theme=monochrome]_&]:shadow-none [html[data-theme=monochrome]_&]:backdrop-blur-none"
      data-testid="workbench-context-menu"
      style={{ left, top }}
      role="menu"
      aria-label="Workbench menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="workbench-context-menu-kicker">
        {menu.kind === 'canvas' ? 'Workbench' : (panel?.title ?? 'Panel')}
      </div>

      {menu.kind === 'rename' ? (
        <div className="workbench-context-rename">
          <label htmlFor="workbench-context-rename-input">Rename</label>
          <input
            ref={renameRef}
            id="workbench-context-rename-input"
            value={menu.draft}
            maxLength={80}
            onChange={(e) => {
              // Functional update of draft only — do not remount/reselect input.
              setMenu((prev) =>
                prev && prev.kind === 'rename' ? { ...prev, draft: e.target.value } : prev,
              );
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            onBlur={(e) => {
              // Only commit if focus left the menu entirely.
              const next = e.relatedTarget as HTMLElement | null;
              if (next?.closest('.workbench-context-menu')) return;
              commitRename();
            }}
          />
        </div>
      ) : null}

      {menu.kind === 'panel' && panel ? (
        <>
          <MenuItem
            icon={<Pencil />}
            label="Rename"
            onClick={() =>
              setMenu({
                kind: 'rename',
                panelId: panel.id,
                x: menu.x,
                y: menu.y,
                draft: panel.title,
              })
            }
          />
          <MenuItem
            icon={<Copy />}
            label="Duplicate"
            onClick={() => {
              duplicatePanel(panel.id);
              close();
            }}
          />
          <MenuItem
            icon={<BringToFront />}
            label="Bring to front"
            onClick={() => {
              bringToFront(panel.id);
              close();
            }}
          />
          <MenuItem
            icon={panel.minimized ? <Square /> : <Minus />}
            label={panel.minimized ? 'Restore' : 'Minimize'}
            onClick={() => {
              updatePanel(panel.id, { minimized: !panel.minimized });
              close();
            }}
          />
          <div className="workbench-context-menu-sep" />
          <MenuItem
            icon={<Trash2 />}
            label="Close"
            danger
            onClick={() => {
              removePanel(panel.id);
              close();
            }}
          />
        </>
      ) : null}

      {menu.kind === 'canvas' ? (
        <>
          <MenuItem
            icon={<LocateFixed />}
            label="Recenter workspace"
            onClick={() => {
              fitView();
              close();
            }}
          />
          <MenuItem
            icon={<Undo2 />}
            label="Undo"
            disabled={!history.length}
            onClick={() => {
              undo();
              close();
            }}
          />
          <MenuItem
            icon={<Redo2 />}
            label="Redo"
            disabled={!future.length}
            onClick={() => {
              redo();
              close();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`workbench-context-menu-item${danger ? ' is-danger' : ''}`}
      onClick={onClick}
    >
      <span className="workbench-context-menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
