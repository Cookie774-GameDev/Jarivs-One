import * as React from 'react';
import { Copy, MessageSquarePlus, Mic, MousePointer2, PanelRightOpen, Search } from 'lucide-react';
import { requestComposerSttToggle } from '@/features/composer-stt/composerSttService';
import {
  noteSttEditableFromPointer,
  resolveComposerSttTextarea,
  resolveGlobalSttEditable,
} from '@/features/composer-stt/insertText';
import { HOTKEYS } from '@/lib/hotkeys';
import { useUIStore } from '@/stores/ui';
import { cn, renderHotkey } from '@/lib/utils';

type ContextMenuDictationTarget = 'composer' | 'global';

interface MenuState {
  x: number;
  y: number;
  selection: string;
  dictationTarget: ContextMenuDictationTarget | null;
}

const SUPPRESS_CONTEXT_MENU_CLASSES = [
  'jarvis-terminal-right-dragging',
  'jarvis-context-map-right-dragging',
];
const CONTAINED_CONTEXT_MENU: MenuState = Object.freeze({
  x: 24,
  y: 24,
  selection: '',
  dictationTarget: null,
});

function resolveContextMenuDictationTarget(
  target: EventTarget | null,
): ContextMenuDictationTarget | null {
  noteSttEditableFromPointer(target);
  if (resolveComposerSttTextarea()) return 'composer';
  if (resolveGlobalSttEditable()) return 'global';
  return null;
}

export function JarvisContextMenu({
  runtimeEffectsEnabled = true,
}: {
  runtimeEffectsEnabled?: boolean;
} = {}) {
  const [menu, setMenu] = React.useState<MenuState | null>(() =>
    runtimeEffectsEnabled ? null : CONTAINED_CONTEXT_MENU,
  );
  const composerSttEnabled = useUIStore((s) => s.composerStt);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const toggleInspector = useUIStore((s) => s.toggleInspector);
  const setRoute = useUIStore((s) => s.setRoute);

  React.useEffect(() => {
    if (!runtimeEffectsEnabled) return;
    const close = () => setMenu(null);
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (
        SUPPRESS_CONTEXT_MENU_CLASSES.some((className) =>
          document.body.classList.contains(className),
        )
      ) {
        event.preventDefault();
        return;
      }
      const suppressUntil = Number(document.body.dataset.jarvisSuppressContextMenuUntil ?? 0);
      if (Number.isFinite(suppressUntil) && Date.now() < suppressUntil) {
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-jarvis-suppress-context-menu]')) {
        event.preventDefault();
        return;
      }
      if (target?.closest('[data-native-context-menu]')) return;
      event.preventDefault();
      const selection = window.getSelection()?.toString().trim() ?? '';
      setMenu({
        x: event.clientX,
        y: event.clientY,
        selection,
        dictationTarget: resolveContextMenuDictationTarget(event.target),
      });
    };
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
    };
  }, [runtimeEffectsEnabled]);

  if (!menu) return null;

  const copySelection = async () => {
    if (!menu.selection) return;
    await navigator.clipboard?.writeText(menu.selection);
    setMenu(null);
  };

  const startDictation = () => {
    if (!composerSttEnabled || !menu.dictationTarget) return;
    requestComposerSttToggle('context-menu');
    setMenu(null);
  };

  const left = Math.min(menu.x, window.innerWidth - 260);
  const top = Math.min(menu.y, window.innerHeight - 260);
  const canDictate = composerSttEnabled && menu.dictationTarget !== null;

  return (
    <div
      className="jarvis-context-menu"
      data-monochrome-surface="context-menu"
      style={{ left, top }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
    >
      <MenuButton
        icon={<Search />}
        label="Command Palette"
        shortcut="Ctrl+K"
        onClick={() => {
          setPaletteOpen(true);
          setMenu(null);
        }}
      />
      <MenuButton
        icon={<PanelRightOpen />}
        label="Toggle Inspector"
        shortcut="Ctrl+\\"
        onClick={() => {
          toggleInspector();
          setMenu(null);
        }}
      />
      <MenuButton
        icon={<MessageSquarePlus />}
        label="Open Chat"
        onClick={() => {
          setRoute('chat');
          setMenu(null);
        }}
      />
      <MenuButton
        icon={<Mic />}
        label="Microphone"
        shortcut={renderHotkey(HOTKEYS.COMPOSER_STT)}
        disabled={!canDictate}
        onClick={startDictation}
      />
      <div className="my-1 h-px bg-border/80" />
      <MenuButton
        icon={<Copy />}
        label="Copy Selection"
        shortcut="Ctrl+C"
        disabled={!menu.selection}
        onClick={() => void copySelection()}
      />
      <div className="mt-1 rounded-lg bg-accent-copper/10 px-2 py-1.5 text-[11px] text-accent-copper">
        <MousePointer2 className="mr-1 inline h-3 w-3" /> Right-drag files or Context maps to paste
        paths.
      </div>
    </div>
  );
}

function MenuButton({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: React.ReactElement;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-secondary text-foreground transition-colors',
        disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-accent-copper/12',
      )}
      role="menuitem"
    >
      {React.cloneElement(icon, { className: 'h-4 w-4 text-accent-copper' })}
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut ? (
        <span className="font-mono text-[11px] text-muted-foreground">{shortcut}</span>
      ) : null}
    </button>
  );
}
