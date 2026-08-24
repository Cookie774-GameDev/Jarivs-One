import * as React from 'react';
import { useBoundHotkey } from '@/lib/hotkeys';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { globalUndoRedo } from './history';

const LOCAL_HISTORY_ROUTES = new Set(['canvas', 'workbench']);

/**
 * Invisible app-wide command host.
 *
 * Editable controls and terminal surfaces are deliberately ignored by
 * `useBoundHotkey`, leaving the WebView's native phrase-grouped undo, redo,
 * and Cut behavior intact. Canvas and Workbench keep their richer document
 * histories. All remaining routes use the bounded reversible-command stack.
 */
export function GlobalUndoRedoHost(): null {
  const route = useUIStore((state) => state.route);
  const localUserId = useAuthStore((state) => state.localUserId);
  const cloudUserId = useAuthStore((state) => state.cloudSession?.user_id ?? null);
  const workspaceId = useAuthStore((state) => state.workspaceId);
  const projectId = useAuthStore((state) => state.projectId);
  const historyContext = `${cloudUserId ?? localUserId ?? 'anonymous'}:${workspaceId ?? ''}:${projectId ?? ''}`;
  const previousContext = React.useRef(historyContext);
  const localHistoryOwnsRoute = LOCAL_HISTORY_ROUTES.has(route);

  React.useEffect(() => {
    if (previousContext.current !== historyContext) {
      globalUndoRedo.clear();
      previousContext.current = historyContext;
    }
  }, [historyContext]);

  const undo = React.useCallback((event: KeyboardEvent) => {
    event.preventDefault();
    void globalUndoRedo.undo().catch(() => undefined);
  }, []);
  const redo = React.useCallback((event: KeyboardEvent) => {
    event.preventDefault();
    void globalUndoRedo.redo().catch(() => undefined);
  }, []);

  useBoundHotkey('UNDO', undo, { disabled: localHistoryOwnsRoute });
  useBoundHotkey('UNDO_X', undo, { disabled: localHistoryOwnsRoute });
  useBoundHotkey('REDO', redo, { disabled: localHistoryOwnsRoute });
  useBoundHotkey('REDO_SHIFT', redo, { disabled: localHistoryOwnsRoute });

  return null;
}
