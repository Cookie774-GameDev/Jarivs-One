export interface ReversibleAction {
  readonly label: string;
  readonly undo: () => void | Promise<void>;
  readonly redo: () => void | Promise<void>;
}

export interface GlobalHistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly busy: boolean;
  readonly lastError: string | null;
  readonly revision: number;
}

export interface GlobalHistory {
  record(action: ReversibleAction): void;
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  clear(): void;
  getSnapshot(): GlobalHistorySnapshot;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_LABEL_LENGTH = 72;

function conciseLabel(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return (normalized || 'Last action').slice(0, MAX_LABEL_LENGTH);
}

export function createGlobalHistory(options: { limit?: number } = {}): GlobalHistory {
  const requestedLimit = Math.trunc(options.limit ?? DEFAULT_HISTORY_LIMIT);
  const limit = Math.max(1, Math.min(200, requestedLimit || DEFAULT_HISTORY_LIMIT));
  const undoStack: ReversibleAction[] = [];
  const redoStack: ReversibleAction[] = [];
  const listeners = new Set<() => void>();
  let busy = false;
  let lastError: string | null = null;
  let revision = 0;
  let generation = 0;
  let branchRevision = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const emit = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  const snapshot = (): GlobalHistorySnapshot => ({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack.at(-1)?.label ?? null,
    redoLabel: redoStack.at(-1)?.label ?? null,
    busy,
    lastError,
    revision,
  });

  const run = (direction: 'undo' | 'redo'): Promise<boolean> => {
    const execute = async (): Promise<boolean> => {
      const from = direction === 'undo' ? undoStack : redoStack;
      const to = direction === 'undo' ? redoStack : undoStack;
      const action = from.at(-1);
      if (!action) return false;
      const actionGeneration = generation;
      const actionBranchRevision = branchRevision;

      busy = true;
      lastError = null;
      emit();
      try {
        await action[direction]();
        if (generation === actionGeneration) {
          const actionIndex = from.lastIndexOf(action);
          if (actionIndex >= 0) from.splice(actionIndex, 1);
          if (branchRevision === actionBranchRevision) {
            to.push(action);
            if (to.length > limit) to.splice(0, to.length - limit);
          }
        }
        return true;
      } catch (error) {
        if (generation === actionGeneration) {
          lastError = `${direction === 'undo' ? 'Undo' : 'Redo'} failed. Nothing else was changed.`;
        }
        throw error;
      } finally {
        busy = false;
        emit();
      }
    };

    const result = queue.then(execute, execute);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    record(action) {
      branchRevision += 1;
      undoStack.push({ ...action, label: conciseLabel(action.label) });
      if (undoStack.length > limit) undoStack.splice(0, undoStack.length - limit);
      redoStack.splice(0);
      lastError = null;
      emit();
    },
    undo: () => run('undo'),
    redo: () => run('redo'),
    clear() {
      generation += 1;
      branchRevision += 1;
      undoStack.splice(0);
      redoStack.splice(0);
      lastError = null;
      emit();
    },
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const globalUndoRedo = createGlobalHistory();
