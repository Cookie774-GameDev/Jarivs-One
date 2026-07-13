/**
 * Terminal command queue — bridges the action runner to TerminalsPage.
 *
 * Why a queue rather than a direct call: TerminalsPage owns its pane
 * tree as React-local state and may not be mounted when an action
 * runner wants to launch a command. The user might be on the chat
 * page, Jarvis proposes "open Claude Code in a new pane", the user
 * approves — we need to navigate to the Terminals route AND inject
 * the command, but the route component is lazy-loaded and won't exist
 * for a few hundred milliseconds while its chunk fetches.
 *
 * Lifecycle:
 *   1. The action runner enqueues a `TerminalCommand` (`shell`, `swarm`,
 *      or bounded `fleet`) and switches the route to 'terminal'.
 *   2. React commits the route change. The lazy chunk loads.
 *   3. TerminalsPage mounts and subscribes to this store. Its first
 *      effect drains every queued item — appending panes for `shell`
 *      items and replacing the tree with the swarm preset for `swarm`
 *      items, in arrival order.
 *   4. Subsequent enqueues while the page is mounted re-trigger the
 *      subscription, draining new items in arrival order.
 *
 * The discriminated union (rather than a separate "swarm pending"
 * flag) keeps ordering crisp: if a future flow does
 * `enqueue(claude); requestSwarm()`, the swarm runs *after* the claude
 * pane is appended, not before — the user sees what they asked for in
 * the order they asked for it.
 */

import { create } from 'zustand';
import type { TerminalRef } from './terminalRefs';
import { MAX_PANES } from './paneTree';
import type { TerminalFleetSelection } from './terminalFleet';

export const MAX_TERMINAL_FLEET_BATCH_SIZE = MAX_PANES;
export const MAX_TERMINAL_FLEET_STAGGER_DELAY_MS = 5_000;

export interface TerminalFleetRequestInput {
  targetTotal: number;
  selection: TerminalFleetSelection;
  cwd?: string;
  batchSize: number;
  staggerDelayMs: number;
}

/**
 * Queue item. Discriminated union so a single drain() call can deliver
 * mixed work to the page in order.
 */
export type TerminalCommand =
  | {
      kind: 'shell';
      /** Stable id; sortable, dedupable. */
      id: string;
      /** Shell command line to run in the new pane. */
      command: string;
      /** Optional friendly label shown on the pane chrome. */
      label?: string;
      /**
       * Agent role slug for the new pane. Distinct from `label`: the slug
       * drives AGENTS.md briefing delivery and env vars, the label is only
       * chrome text. Orchestrated batches set both.
       */
      agentSlug?: string;
      /**
       * Optional working directory. Fresh panes pass this straight to
       * the PTY spawn command; broadcasts keep the current pane cwd.
       */
      cwd?: string;
      /** Open a new pane, send to all panes, or send to specific terminal refs. */
      target?: 'new' | 'all' | 'refs';
      /** Stable terminal refs captured from drag/drop or scheduled chat actions. */
      refs?: TerminalRef[];
    }
  | {
      kind: 'swarm';
      /** Stable id. */
      id: string;
    }
  | {
      kind: 'close';
      /** Stable id. */
      id: string;
      /** How many of the most-recently-added panes to close. Clamped 1–10. */
      count: number;
    }
  | {
      kind: 'fleet';
      /** Queue identity and public request identity stay identical. */
      id: string;
      requestId: string;
      targetTotal: number;
      selection: TerminalFleetSelection;
      cwd?: string;
      batchSize: number;
      staggerDelayMs: number;
    };

interface TerminalCommandQueueState {
  queue: TerminalCommand[];
  activeFleetRequestIds: string[];
  cancelledFleetRequestIds: string[];

  /** Append a shell command; returns the assigned id. */
  enqueue: (
    cmd: Omit<Extract<TerminalCommand, { kind: 'shell' }>, 'id' | 'kind'>,
  ) => string;

  /** Append a swarm-preset request; returns the assigned id. */
  requestSwarm: () => string;

  /** Append a close request for the N most-recent panes; returns the assigned id. */
  requestClose: (count: number) => string;

  /** Append one bounded target-total Fleet transaction. */
  requestFleet: (input: TerminalFleetRequestInput) => string;

  /**
   * Drain everything currently queued and return it. Resets the queue
   * to empty. Idempotent on subsequent calls.
   */
  drain: () => TerminalCommand[];

  /** Remove one command before the terminal page drains it. */
  cancel: (id: string) => boolean;

  /** Query cooperative cancellation while a drained Fleet batch is launching. */
  isFleetCancelled: (id: string) => boolean;

  /** Release cancellation/in-flight bookkeeping after Fleet processing ends. */
  completeFleet: (id: string) => void;

  /** Clear without returning. Used on TerminalsPage unmount as a
   *  defensive cleanup (anything still in the queue is stale). */
  clear: () => void;
}

let nextId = 1;
function newId(prefix: string): string {
  // Date-based seed so the id is sortable + unique across reloads in
  // the same second. The counter prevents collisions inside the same
  // millisecond when an action queues several commands at once.
  return `${prefix}_${Date.now().toString(36)}_${(nextId++).toString(36)}`;
}

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export const useTerminalCommandQueue = create<TerminalCommandQueueState>(
  (set, get) => ({
    queue: [],
    activeFleetRequestIds: [],
    cancelledFleetRequestIds: [],
    enqueue: (cmd) => {
      const id = newId('tcmd');
      const next: TerminalCommand = { kind: 'shell', id, ...cmd };
      set((s) => ({ queue: [...s.queue, next] }));
      return id;
    },
    requestSwarm: () => {
      const id = newId('tswm');
      set((s) => ({ queue: [...s.queue, { kind: 'swarm', id }] }));
      return id;
    },
    requestClose: (count) => {
      const id = newId('tcls');
      const clamped = Math.min(10, Math.max(1, Math.floor(count)));
      set((s) => ({ queue: [...s.queue, { kind: 'close', id, count: clamped }] }));
      return id;
    },
    requestFleet: (input) => {
      const id = newId('tflt');
      const next: TerminalCommand = {
        kind: 'fleet',
        id,
        requestId: id,
        targetTotal: boundedInteger(input.targetTotal, 0, MAX_PANES),
        selection: input.selection,
        cwd: input.cwd,
        batchSize: boundedInteger(input.batchSize, 1, MAX_TERMINAL_FLEET_BATCH_SIZE),
        staggerDelayMs: boundedInteger(
          input.staggerDelayMs,
          0,
          MAX_TERMINAL_FLEET_STAGGER_DELAY_MS,
        ),
      };
      set((state) => ({ queue: [...state.queue, next] }));
      return id;
    },
    drain: () => {
      const items = get().queue;
      if (items.length === 0) return items;
      const fleetIds = items
        .filter((item): item is Extract<TerminalCommand, { kind: 'fleet' }> =>
          item.kind === 'fleet',
        )
        .map((item) => item.requestId);
      set((state) => ({
        queue: [],
        activeFleetRequestIds: [...new Set([...state.activeFleetRequestIds, ...fleetIds])],
      }));
      return items;
    },
    cancel: (id) => {
      const state = get();
      if (state.queue.some((item) => item.id === id)) {
        set({ queue: state.queue.filter((item) => item.id !== id) });
        return true;
      }
      if (!state.activeFleetRequestIds.includes(id)) return false;
      if (!state.cancelledFleetRequestIds.includes(id)) {
        set({
          cancelledFleetRequestIds: [...state.cancelledFleetRequestIds, id],
        });
      }
      return true;
    },
    isFleetCancelled: (id) => get().cancelledFleetRequestIds.includes(id),
    completeFleet: (id) => {
      set((state) => ({
        activeFleetRequestIds: state.activeFleetRequestIds.filter((item) => item !== id),
        cancelledFleetRequestIds: state.cancelledFleetRequestIds.filter(
          (item) => item !== id,
        ),
      }));
    },
    clear: () =>
      set({
        queue: [],
        activeFleetRequestIds: [],
        cancelledFleetRequestIds: [],
      }),
  }),
);

/** Convenience for non-React callers (the action runner). */
export function enqueueTerminalCommand(
  cmd: Omit<Extract<TerminalCommand, { kind: 'shell' }>, 'id' | 'kind'>,
): string {
  return useTerminalCommandQueue.getState().enqueue(cmd);
}

export function cancelQueuedTerminalCommand(id: string): boolean {
  return useTerminalCommandQueue.getState().cancel(id);
}

/** Send a command to every live terminal pane. */
export function broadcastTerminalCommand(
  cmd: Omit<Extract<TerminalCommand, { kind: 'shell' }>, 'id' | 'kind' | 'target'>,
): string {
  return useTerminalCommandQueue.getState().enqueue({ ...cmd, target: 'all' });
}

/** Convenience for non-React callers — enqueue a swarm-preset request. */
export function requestTerminalSwarm(): string {
  return useTerminalCommandQueue.getState().requestSwarm();
}

/** Close the N most-recently-added terminal panes. */
export function enqueueTerminalClose(count: number): string {
  return useTerminalCommandQueue.getState().requestClose(count);
}

/** Queue a bounded Fleet transaction for TerminalsPage to process. */
export function requestTerminalFleet(input: TerminalFleetRequestInput): string {
  return useTerminalCommandQueue.getState().requestFleet(input);
}

export function isTerminalFleetRequestCancelled(id: string): boolean {
  return useTerminalCommandQueue.getState().isFleetCancelled(id);
}

export function completeTerminalFleetRequest(id: string): void {
  useTerminalCommandQueue.getState().completeFleet(id);
}
