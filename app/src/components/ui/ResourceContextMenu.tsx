import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  attachResourceToChat,
  resourceReferenceText,
  resolveResourceDestination,
  routeResourceInteraction,
  type ResourceReference,
} from '@/lib/resourceInteraction';

interface ResourceContextMenuProps {
  x: number;
  y: number;
  resource: ResourceReference;
  activeChatId?: string | null;
  insertTarget?: EventTarget | null;
  returnFocus?: HTMLElement | null;
  onOpen?: () => void;
  onPreview?: () => void;
  onReveal?: (path: string) => void | Promise<void>;
  extraActions?: Array<{
    id: string;
    label: string;
    run: () => void | Promise<void>;
  }>;
  onClose: () => void;
}

interface MenuAction {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

export function ResourceContextMenu({
  x,
  y,
  resource,
  activeChatId,
  insertTarget,
  returnFocus,
  onOpen,
  onPreview,
  onReveal,
  extraActions = [],
  onClose,
}: ResourceContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const insertDestination = resolveResourceDestination(insertTarget ?? null);
  const canInsert = insertDestination?.kind === 'text';
  const reference = resourceReferenceText(resource);
  const path = resource.path;

  const close = React.useCallback(() => {
    onClose();
    window.setTimeout(() => returnFocus?.focus(), 0);
  }, [onClose, returnFocus]);

  const run = React.useCallback(async (action: MenuAction) => {
    try {
      await action.run();
    } finally {
      close();
    }
  }, [close]);

  const actions = React.useMemo<MenuAction[]>(() => {
    const next: MenuAction[] = [];
    if (onOpen) next.push({ id: 'open', label: 'Open', run: onOpen });
    if (onPreview && path) next.push({ id: 'preview', label: 'Preview', run: onPreview });
    if (activeChatId) {
      next.push({
        id: 'attach',
        label: 'Attach to active chat',
        run: () => { attachResourceToChat(resource, activeChatId); },
      });
    }
    if (canInsert && insertTarget) {
      next.push({
        id: 'insert',
        label: 'Insert reference',
        run: () => { routeResourceInteraction(resource, insertTarget); },
      });
    }
    next.push(...extraActions);
    next.push({
      id: 'copy-reference',
      label: path ? 'Copy path' : 'Copy reference',
      run: () => navigator.clipboard.writeText(reference),
    });
    next.push({
      id: 'copy-name',
      label: 'Copy name',
      run: () => navigator.clipboard.writeText(resource.name),
    });
    if (onReveal && path) {
      next.push({
        id: 'reveal',
        label: 'Reveal externally',
        run: () => onReveal(path),
      });
    }
    return next;
  }, [activeChatId, canInsert, extraActions, insertTarget, onOpen, onPreview, onReveal, path, reference, resource]);

  React.useEffect(() => {
    itemRefs.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onBlur = () => close();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [close]);

  const focusAt = (index: number) => {
    if (!actions.length) return;
    const normalized = (index + actions.length) % actions.length;
    itemRefs.current[normalized]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusAt(current + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusAt(current - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusAt(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusAt(actions.length - 1);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault();
      void run(actions[current]);
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${resource.name}`}
      className={cn(
        'jarvis-resource-context-menu fixed z-[100] min-w-[210px] max-w-[min(280px,calc(100vw-16px))]',
        'rounded-lg border border-border bg-panel/98 p-1.5 shadow-xl backdrop-blur-sm',
      )}
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {actions.map((action, index) => (
        <button
          key={action.id}
          ref={(node) => { itemRefs.current[index] = node; }}
          type="button"
          role="menuitem"
          tabIndex={index === 0 ? 0 : -1}
          className={cn(
            'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-secondary text-foreground',
            'hover:bg-muted focus:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          onClick={() => void run(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export default ResourceContextMenu;
