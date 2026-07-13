/**
 * TerminalsPage — the `'terminal'` route's body.
 *
 * Owns the pane tree state, persists shape (not session ids) to
 * localStorage so reloads restore the layout without zombie PTYs.
 *
 * Project-scoped: the pane tree key in localStorage is suffixed with
 * the active project id (`jarvis-terminal-pane-tree:<projectId>`) so
 * each project carries its own set of terminals. Switching projects
 * swaps the entire tree out from under the user — chats and terminals
 * "switch when I am in a different project," exactly as specced.
 *
 * Layout: tile-grid only as of the Projects update. The legacy splits
 * mode was retired because every cell border is a draggable resize
 * handle, which gives the same affordance with less mode chrome.
 *
 * Per-pane `agentSlug` lets the user tag each pane with one of the
 * seeded agents. Picking an agent on a blank pane pre-fills a sensible
 * CLI for that role (Coder → 'claude'), and any AI request fired
 * through the runtime that resolves to that slug picks up this pane's
 * `connectedFiles` and recent transcript.
 */

import * as React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { TileGrid } from './TileGrid';
import {
  type PaneNode,
  type PaneTreeChange,
  newLeaf,
  countLeaves,
  flattenLeaves,
  appendLeaf,
  fromLeaves,
  closePane,
  MAX_PANES,
  resolvePaneTreeChange,
  updateLeaf,
  type TerminalLeafRuntimeEvidence,
} from './paneTree';
import {
  useTerminalCommandQueue,
  type TerminalCommand,
} from './terminalCommandQueue';
import {
  markTerminalExecution,
  markTerminalPaneRuntime,
  useTerminalExecutionStore,
  type TerminalPaneRuntime,
} from './terminalExecutionStore';
import { planTerminalFleet } from './terminalFleet';
import { useTerminalFleetStore } from './terminalFleetStore';
import { getTerminalCliPreset } from './terminalCliPresets';
import type { TerminalRef } from './terminalRefs';
import {
  defaultShell,
  loadTerminalTreeForProject,
  moveTerminalLeafToProject,
  saveTerminalTree,
} from './terminalProjectMove';
import { useLiveQuery } from 'dexie-react-hooks';
import { projectRepo } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import {
  captureLiveTree,
  getLiveTree,
} from './terminalLiveCache';
import {
  useTerminalTranscriptStore,
  type SessionTranscript,
} from './transcriptStore';

/**
 * Map an agent slug to a default CLI to spawn in a fresh pane.
 *
 * Only used when the user assigns a role to a pane that has no command
 * yet. We never overwrite an existing command. With the trimmed
 * Coder/Builder use Claude, while review/scout-style panes use OpenCode.
 * We only apply this to blank panes; existing user commands are never
 * overwritten.
 */
export function commandForAgent(slug: string): string | undefined {
  switch (slug) {
    case 'coder':
    case 'builder':
      return 'claude';
    case 'scout':
    case 'reviewer':
    case 'critic':
      return 'opencode';
    case 'jarvis':
    default:
      return undefined;
  }
}

export function forgetTerminalLeafSessions(
  tree: PaneNode,
  forgetSession: (sessionId: string) => void,
): void {
  for (const leaf of flattenLeaves(tree)) {
    if (leaf.sessionId) forgetSession(leaf.sessionId);
  }
}

type InvokeCommand = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type TerminalLeaf = Extract<PaneNode, { kind: 'leaf' }>;
type TerminalFleetRequest = Extract<TerminalCommand, { kind: 'fleet' }>;

interface TerminalBackendInfo {
  sessionId: string;
}

interface TerminalCommandExistsResult {
  exists: boolean;
  reason?: string;
}

export interface ProcessTerminalFleetRequestDependencies {
  getTree: () => PaneNode;
  commitTree: (next: PaneNode) => void;
  invokeCommand?: InvokeCommand;
  wait?: (delayMs: number) => Promise<void>;
}

function transcriptForLeaf(
  leaf: TerminalLeaf,
  sessions: Readonly<Record<string, SessionTranscript>>,
): string {
  const session =
    (leaf.sessionId ? sessions[leaf.sessionId] : undefined) ??
    Object.values(sessions).find((item) => item.paneId === leaf.id);
  if (!session) return '';
  return [session.text, session.currentInput]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');
}

/**
 * Combine a successful backend snapshot with local pane lifecycle metadata.
 * Any missing or failed evidence remains `unknown`, which the Fleet planner
 * deliberately treats as occupied.
 */
export function buildTerminalFleetRuntimeEvidence(
  leaves: readonly TerminalLeaf[],
  activeSessionIds: ReadonlySet<string>,
  backendSnapshotAvailable: boolean,
  paneRuntime: Readonly<Record<string, TerminalPaneRuntime | undefined>>,
  sessions: Readonly<Record<string, SessionTranscript>>,
): Record<string, TerminalLeafRuntimeEvidence> {
  return Object.fromEntries(
    leaves.map((leaf) => {
      let backendState: TerminalLeafRuntimeEvidence['backendState'] = 'unknown';
      if (backendSnapshotAvailable && leaf.sessionId) {
        backendState = activeSessionIds.has(leaf.sessionId) ? 'active' : 'idle';
      } else if (backendSnapshotAvailable) {
        backendState = paneRuntime[leaf.id]?.backendState ?? 'unknown';
      }
      return [
        leaf.id,
        {
          backendState,
          transcript: transcriptForLeaf(leaf, sessions),
        },
      ];
    }),
  );
}

function parseTerminalBackendSnapshot(value: unknown): TerminalBackendInfo[] | null {
  if (!Array.isArray(value)) return null;
  const sessions: TerminalBackendInfo[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const sessionId = (item as { sessionId?: unknown }).sessionId;
    if (typeof sessionId === 'string' && sessionId) sessions.push({ sessionId });
  }
  return sessions;
}

function defaultFleetWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

/**
 * Execute one drained Fleet request against fresh state before every bounded
 * batch. Only planner-approved leaves are changed; cancellation stops future
 * scheduling and never kills work that already started.
 */
export async function processTerminalFleetRequest(
  request: TerminalFleetRequest,
  dependencies: ProcessTerminalFleetRequestDependencies,
): Promise<void> {
  const invokeCommand = dependencies.invokeCommand ?? invoke;
  const wait = dependencies.wait ?? defaultFleetWait;
  const fleetStore = useTerminalFleetStore.getState();
  if (!fleetStore.records.some((record) => record.requestId === request.requestId)) {
    fleetStore.begin({
      requestId: request.requestId,
      targetTotal: request.targetTotal,
    });
  }

  let createdCount = 0;
  let reusedCount = 0;
  let launchedCount = 0;
  let currentBatch = 0;
  let nextExecutionIndex = 1;

  const cancelIfRequested = (): boolean => {
    if (!useTerminalCommandQueue.getState().isFleetCancelled(request.requestId)) {
      return false;
    }
    useTerminalFleetStore.getState().update(request.requestId, {
      status: 'cancelled',
      createdCount,
      reusedCount,
      launchedCount,
      currentBatch,
    });
    return true;
  };

  try {
    useTerminalFleetStore.getState().update(request.requestId, {
      status: 'planning',
    });
    if (cancelIfRequested()) return;

    const availableExecutables = new Set<string>();
    if (request.selection.kind === 'preset') {
      const preset = getTerminalCliPreset(request.selection.presetId);
      if (!preset) {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: 'failed',
          errors: ['The selected CLI preset is no longer recognized.'],
        });
        return;
      }
      let availability: TerminalCommandExistsResult;
      try {
        availability = (await invokeCommand('terminal_command_exists', {
          name: preset.executable,
        })) as TerminalCommandExistsResult;
      } catch {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: 'failed',
          errors: ['CLI availability could not be verified safely.'],
        });
        return;
      }
      if (availability?.exists !== true) {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: 'failed',
          errors: [`${preset.displayName} is not available on PATH.`],
        });
        return;
      }
      availableExecutables.add(preset.executable);
    }

    for (let guard = 0; guard <= MAX_PANES; guard += 1) {
      if (cancelIfRequested()) return;

      let backendSnapshot: TerminalBackendInfo[] | null;
      try {
        backendSnapshot = parseTerminalBackendSnapshot(
          await invokeCommand('terminal_list'),
        );
      } catch {
        backendSnapshot = null;
      }
      if (!backendSnapshot) {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: launchedCount > 0 ? 'partial' : 'failed',
          createdCount,
          reusedCount,
          launchedCount,
          currentBatch,
          errors: ['Active terminal state could not be verified; remaining Fleet work was stopped.'],
        });
        return;
      }

      const tree = dependencies.getTree();
      const leaves = flattenLeaves(tree);
      const runtimeState = useTerminalExecutionStore.getState();
      const runtimeByPaneId = buildTerminalFleetRuntimeEvidence(
        leaves,
        new Set(backendSnapshot.map((item) => item.sessionId)),
        true,
        runtimeState.paneRuntime,
        useTerminalTranscriptStore.getState().sessions,
      );
      const planningLeaves = leaves.map((leaf) =>
        leaf.sessionId && runtimeByPaneId[leaf.id]?.backendState === 'idle'
          ? { ...leaf, sessionId: null }
          : leaf,
      );
      const plan = planTerminalFleet({
        targetTotal: request.targetTotal,
        leaves: planningLeaves,
        runtimeByPaneId,
        selection: request.selection,
        availableExecutables,
        maxPanes: MAX_PANES,
      });

      if (plan.kind === 'unavailable') {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: launchedCount > 0 ? 'partial' : 'failed',
          createdCount,
          reusedCount,
          launchedCount,
          currentBatch,
          errors: ['The selected CLI is no longer available on PATH.'],
        });
        return;
      }
      if (plan.kind === 'invalid') {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: launchedCount > 0 ? 'partial' : 'failed',
          createdCount,
          reusedCount,
          launchedCount,
          currentBatch,
          errors: [`Fleet request validation failed (${plan.reason}).`],
        });
        return;
      }
      if (plan.assignments.length === 0) {
        useTerminalFleetStore.getState().update(request.requestId, {
          status: plan.skippedCount > 0 ? 'partial' : 'complete',
          createdCount,
          reusedCount,
          launchedCount,
          skippedCount: plan.skippedCount,
          currentBatch,
        });
        return;
      }

      currentBatch += 1;
      const batch = plan.assignments.slice(0, request.batchSize);
      let nextTree = tree;
      for (const assignment of batch) {
        const executionId = `${request.requestId}:${nextExecutionIndex++}`;
        markTerminalExecution(executionId, 'queued');
        markTerminalExecution(executionId, 'starting');
        if (assignment.source === 'reuse') {
          // The fresh backend snapshot and planner both affirmed this ended
          // slot is idle. Record that evidence before the execution-id update
          // tells its existing TerminalView to rearm.
          markTerminalPaneRuntime(assignment.paneId, 'idle');
          nextTree = updateLeaf(nextTree, assignment.paneId, {
            sessionId: null,
            command: defaultShell(),
            startupCommand: assignment.command,
            cwd: request.cwd,
            executionId,
          });
          reusedCount += 1;
        } else {
          nextTree = appendLeaf(nextTree, {
            command: defaultShell(),
            startupCommand: assignment.command,
            cwd: request.cwd,
            executionId,
          });
          createdCount += 1;
        }
        launchedCount += 1;
      }
      dependencies.commitTree(nextTree);
      useTerminalFleetStore.getState().update(request.requestId, {
        status: 'launching',
        createdCount,
        reusedCount,
        launchedCount,
        currentBatch,
      });

      if (request.staggerDelayMs > 0) {
        await wait(request.staggerDelayMs);
      }
    }

    useTerminalFleetStore.getState().update(request.requestId, {
      status: 'partial',
      createdCount,
      reusedCount,
      launchedCount,
      currentBatch,
      errors: ['Fleet stopped at its bounded planning limit.'],
    });
  } finally {
    useTerminalCommandQueue.getState().completeFleet(request.requestId);
  }
}

export async function deleteTerminalProjectSnapshots(
  projectId: string | null,
  invokeCommand: InvokeCommand = invoke,
): Promise<void> {
  await invokeCommand('terminal_snapshot_delete_project', { projectId });
}

export function TerminalsPage() {
  const projectId = useAuthStore((s) => s.projectId);
  const currentProjectId = projectId ?? null;
  const setProjectId = useAuthStore((s) => s.setProjectId);
  const setRoute = useUIStore((s) => s.setRoute);
  const fleetRecords = useTerminalFleetStore((state) => state.records);
  const latestFleetRecord = fleetRecords.at(-1);

  const activeProject = useLiveQuery(
    () => (projectId ? projectRepo.getById(projectId) : Promise.resolve(undefined)),
    [projectId],
  );
  const projectName = activeProject?.name ?? null;

  /**
   * The tree is recreated when the active project changes. We keep the
   * dependent useState lazy-init so the *initial* mount uses whichever
   * project is active at render time, then a separate effect swaps
   * the tree on subsequent project changes.
   *
   * Order of preference for the initial value:
   *   1. The in-memory live cache (`terminalLiveCache`). Survives
   *      project switches AND TerminalsPage unmount/remount, and
   *      preserves `sessionId`s so we re-attach to existing PTYs
   *      instead of spawning new shells.
   *   2. localStorage shape (no session ids; safe across full app
   *      reloads where every PTY is dead anyway).
   *   3. A blank single-pane tree as the absolute fallback.
   */
  const [tree, setTree] = React.useState<PaneNode>(() => {
    const cached = getLiveTree(currentProjectId);
    if (cached) return cached;
    return loadTerminalTreeForProject(currentProjectId);
  });
  const [treeProjectId, setTreeProjectId] = React.useState<string | null>(() => currentProjectId);
  const treeReady = treeProjectId === currentProjectId;
  const treeRef = React.useRef(tree);
  const commandQueueEffectGenerationRef = React.useRef(0);
  treeRef.current = tree;
  const commitTree = React.useCallback((next: PaneNode) => {
    treeRef.current = next;
    setTree(next);
  }, []);

  /**
   * Currently fullscreened pane id, or null when in normal grid view.
   * Owned at the page level so Esc-to-exit and "auto-clear when the
   * fullscreen pane is closed" stay in lock-step with the tree state.
   * Transient (not persisted) — reload always lands in normal view.
   */
  const [fullscreenPaneId, setFullscreenPaneId] = React.useState<string | null>(
    null,
  );

  // Swap the tree when the user switches projects. Pane ids are
  // project-scoped now, so a stale `fullscreenPaneId` would point at
  // a leaf that no longer exists — clear it on every swap.
  //
  // We consult the in-memory live cache before falling back to
  // localStorage. The cache holds the live tree (with `sessionId`s),
  // so flipping A → B → A re-attaches to the same PTYs that were
  // running `opencode` / `claude` / etc. in project A. Without the
  // cache, the strip-on-localStorage logic would force a fresh spawn
  // and the user's running tools would appear to have been wiped.
  React.useLayoutEffect(() => {
    if (treeProjectId === currentProjectId) return;
    const cached = getLiveTree(currentProjectId);
    setTree(cached ?? loadTerminalTreeForProject(currentProjectId));
    setTreeProjectId(currentProjectId);
    setFullscreenPaneId(null);
  }, [currentProjectId, treeProjectId]);

  // Mirror every tree change into the in-memory live cache, keyed
  // by the active project. The cache is a write-through buffer:
  // every `setTree` produces an updated snapshot here, so when the
  // user switches away and back, the most recent tree (with live
  // session ids) is what gets restored. The localStorage write
  // below intentionally stays separate — it strips session ids and
  // serves the orthogonal "survive a full app reload" use case.
  React.useEffect(() => {
    if (!treeReady) return;
    captureLiveTree(treeProjectId, tree);
  }, [tree, treeProjectId, treeReady]);

  // Persist tree shape (not session ids) under the active project's key.
  // Debounced like transcript persistence so resize/rename bursts do not
  // synchronously hammer localStorage; flush on cleanup for durability.
  React.useEffect(() => {
    if (!treeReady) return;
    const handle = window.setTimeout(() => {
      saveTerminalTree(treeProjectId, tree);
    }, 350);
    return () => {
      window.clearTimeout(handle);
      saveTerminalTree(treeProjectId, tree);
    };
  }, [tree, treeProjectId, treeReady]);

  // Esc exits fullscreen. Hook only attaches while fullscreen is active so
  // it doesn't compete with other Esc handlers (popovers, dialogs, etc.).
  React.useEffect(() => {
    if (!fullscreenPaneId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenPaneId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreenPaneId]);

  // V3 — drain the action-runner's terminal command queue.
  //
  // The action layer (`lib/actions/registry.ts`) enqueues either a
  // shell command or a swarm-preset request. Swarm preset is gone with
  // the Projects revamp (the agent roster shrank to 2), so we treat
  // any `swarm` items as plain "append a leaf for jarvis" — keeps
  // older queued items behaving sensibly.
  React.useEffect(() => {
    const effectGeneration = ++commandQueueEffectGenerationRef.current;
    let disposed = false;
    let processing = Promise.resolve();
    let replaceRootNext = false;

    const processNonFleetItem = (
      item: Exclude<TerminalCommand, { kind: 'fleet' }>,
    ) => {
      let next = treeRef.current;
      if (item.kind === 'shell') {
        markTerminalExecution(item.id, 'starting');
        if (item.target === 'all') {
          const pendingCommandId = Date.now();
          next = fromLeaves(
            flattenLeaves(next).map((leaf, index) => ({
              ...leaf,
              pendingCommand: item.command,
              pendingCommandId: pendingCommandId + index,
            })),
          );
        } else if (item.target === 'refs' && item.refs && item.refs.length > 0) {
          const pendingCommandId = Date.now();
          let matched = false;
          next = fromLeaves(
            flattenLeaves(next).map((leaf, index) => {
              const hit = item.refs!.some(
                (ref) =>
                  (ref.paneId && ref.paneId === leaf.id) ||
                  (ref.sessionId && ref.sessionId === leaf.sessionId),
              );
              if (!hit) return leaf;
              matched = true;
              return {
                ...leaf,
                pendingCommand: item.command,
                pendingCommandId: pendingCommandId + index,
              };
            }),
          );
          if (!matched) {
            const first = item.refs[0];
            next = appendLeaf(next, {
              command: defaultShell(),
              startupCommand: item.command || undefined,
              agentSlug: first?.agentSlug ?? item.label,
            });
          }
        } else {
          const seed = {
            command: defaultShell(),
            startupCommand: item.command || undefined,
            agentSlug: item.agentSlug ?? item.label,
            name: item.agentSlug ? item.label : undefined,
            cwd: item.cwd,
            executionId: item.id,
          };
          if (replaceRootNext && countLeaves(next) === 1) {
            next = newLeaf(seed);
            replaceRootNext = false;
          } else {
            next = appendLeaf(next, seed);
          }
        }
      } else if (item.kind === 'swarm') {
        next = appendLeaf(next, {
          command: defaultShell(),
          agentSlug: 'jarvis',
        });
      } else {
        const leaves = flattenLeaves(next);
        const closeCount = Math.min(item.count, leaves.length);
        for (const leaf of leaves.slice(-closeCount)) {
          const closed = closePane(next, leaf.id);
          if (closed) next = closed;
        }
        if (closeCount >= leaves.length) replaceRootNext = true;
      }
      commitTree(next);
    };

    const drainAndProcess = () => {
      const items = useTerminalCommandQueue.getState().drain();
      if (items.length === 0) return;
      processing = processing
        .then(async () => {
          for (const item of items) {
            if (
              disposed &&
              commandQueueEffectGenerationRef.current === effectGeneration
            ) {
              if (item.kind === 'fleet') {
                useTerminalCommandQueue.getState().cancel(item.requestId);
              }
              continue;
            }
            if (item.kind === 'fleet') {
              try {
                await processTerminalFleetRequest(item, {
                  getTree: () => treeRef.current,
                  commitTree,
                });
              } catch {
                useTerminalFleetStore.getState().update(item.requestId, {
                  status: 'failed',
                  errors: ['Terminal Fleet stopped after an unexpected local error.'],
                });
                useTerminalCommandQueue
                  .getState()
                  .completeFleet(item.requestId);
              }
            } else {
              processNonFleetItem(item);
            }
          }
        })
        .catch(() => {
          // Fleet failures are written to the bounded progress store. Keep
          // this consumer alive so an unrelated later request can still run.
        });
    };

    drainAndProcess();
    const unsub = useTerminalCommandQueue.subscribe((state) => {
      if (state.queue.length > 0) drainAndProcess();
    });
    return () => {
      disposed = true;
      unsub();
      // Strict Mode performs a setup/cleanup/setup probe. Defer cancellation
      // until that replacement effect has a chance to claim a newer
      // generation; a genuine unmount leaves this generation current.
      queueMicrotask(() => {
        if (commandQueueEffectGenerationRef.current !== effectGeneration) return;
        for (const requestId of useTerminalCommandQueue.getState().activeFleetRequestIds) {
          useTerminalCommandQueue.getState().cancel(requestId);
        }
      });
    };
  }, [commitTree]);

  const handleChange = React.useCallback((next: PaneTreeChange) => {
    setTree((currentTree) => {
      return resolvePaneTreeChange(currentTree, next, {
        command: defaultShell(),
        projectId: currentProjectId,
      });
    });
  }, [currentProjectId]);

  React.useEffect(() => {
    if (!fullscreenPaneId) return;
    const stillExists = flattenLeaves(tree).some((l) => l.id === fullscreenPaneId);
    if (!stillExists) setFullscreenPaneId(null);
  }, [fullscreenPaneId, tree]);

  const handleAddPane = () => {
    setTree(appendLeaf(tree, { command: defaultShell() }));
  };

  const handleResetSizing = () => {
    window.dispatchEvent(new CustomEvent('jarvis:reset-terminal-sizes'));
    toast.success('Terminal layout reset', 'Sizing has been restored to default.');
  };

  const handleResetAllTerminals = () => {
    const forgetSession = useTerminalTranscriptStore.getState().forgetSession;
    for (const leaf of flattenLeaves(tree)) {
      if (leaf.sessionId) {
        invoke('terminal_kill', { sessionId: leaf.sessionId }).catch(() => {
          /* PTY may have already exited */
        });
      }
    }
    void deleteTerminalProjectSnapshots(currentProjectId).catch(() => {
      /* reset remains usable if native snapshot cleanup is unavailable */
    });
    forgetTerminalLeafSessions(tree, forgetSession);
    setTree(newLeaf({ command: defaultShell() }));
    setFullscreenPaneId(null);
    toast.success('Terminals reset', 'All terminals have been cleared.');
  };

  const [isHolding, setIsHolding] = React.useState(false);
  const holdTimerRef = React.useRef<any>(null);
  const hasTriggeredRef = React.useRef(false);

  const startHold = React.useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return;
    hasTriggeredRef.current = false;
    setIsHolding(true);
    holdTimerRef.current = setTimeout(() => {
      hasTriggeredRef.current = true;
      setIsHolding(false);
      const confirmed = window.confirm("Confirm to reset all terminals?");
      if (confirmed) {
        handleResetAllTerminals();
      }
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const endHold = React.useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    if (!hasTriggeredRef.current) {
      handleResetSizing();
    }
  }, []);

  const cancelHold = React.useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  }, []);

  React.useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const handleFullscreenToggle = (paneId: string) => {
    setFullscreenPaneId((current) => (current === paneId ? null : paneId));
  };

  const handleMoveTerminal = React.useCallback(
    (
      ref: TerminalRef,
      targetProjectId: string | null,
      targetPaneId?: string | null,
      targetProjectName?: string | null,
    ) => {
      const currentProjectId = projectId ?? null;
      const sourceProjectId = (ref.projectId ?? currentProjectId) as string | null;
      const result = moveTerminalLeafToProject({
        ref,
        sourceProjectId,
        targetProjectId,
        targetProjectName,
        targetPaneId,
        currentTree: sourceProjectId === currentProjectId ? tree : undefined,
      });
      if (!result.ok) {
        toast.warning('Could not move terminal', result.reason ?? 'Try again.');
        return;
      }
      if (result.targetProjectId === currentProjectId && result.targetTree) {
        setTree(result.targetTree);
        setRoute('terminal');
        return;
      }
      if (result.sourceProjectId === currentProjectId && result.sourceTree) {
        setTree(result.sourceTree);
      }
      setProjectId(result.targetProjectId as never);
      setRoute('terminal');
    },
    [projectId, setProjectId, setRoute, tree],
  );

  const count = countLeaves(tree);
  const atCap = count >= MAX_PANES;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-3 py-1 border-b border-border bg-paper-soft">
        <div className="flex items-center gap-3 text-metadata text-muted-foreground">
          <span className="font-display text-foreground text-secondary tracking-tight">
            Terminals
          </span>
          <span aria-hidden className="text-border-mid">·</span>
          <span>
            {count} / {MAX_PANES} pane{count === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddPane}
            disabled={atCap}
            className="gap-1"
            title={atCap ? `Max ${MAX_PANES} panes` : 'Add a pane'}
          >
            <Plus className="h-3.5 w-3.5" /> Add pane
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            className="gap-1 relative overflow-hidden select-none active:bg-transparent hover:bg-panel-soft"
            title="Click to reset sizing, hold 2s to clear all panes"
          >
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 transition-all pointer-events-none",
                isHolding ? "duration-[2000ms] ease-out w-full" : "duration-75 w-0"
              )}
            />
            <span className="relative z-10 flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </span>
          </Button>
        </div>
      </div>

      {latestFleetRecord && (
        <div
          className="shrink-0 border-b border-border bg-panel px-3 py-2"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-metadata">
              <span className="font-medium text-foreground">Terminal Fleet</span>
              <span className="font-mono text-accent-copper">
                {count} → {latestFleetRecord.targetTotal} total
              </span>
              <span className="text-muted-foreground">
                {latestFleetRecord.status} · reused {latestFleetRecord.reusedCount} ·
                created {latestFleetRecord.createdCount} · launched{' '}
                {latestFleetRecord.launchedCount} · skipped {latestFleetRecord.skippedCount}
              </span>
            </div>
            {['queued', 'planning', 'launching'].includes(latestFleetRecord.status) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  useTerminalCommandQueue
                    .getState()
                    .cancel(latestFleetRecord.requestId);
                  useTerminalFleetStore
                    .getState()
                    .cancel(latestFleetRecord.requestId);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          {latestFleetRecord.errors.map((error) => (
            <p key={error} className="mt-1 text-metadata text-destructive">
              {error}
            </p>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 p-2">
        <TileGrid
          tree={tree}
          onChange={handleChange}
          defaultCommand={defaultShell()}
          defaultCommandForAgent={commandForAgent}
          fullscreenPaneId={fullscreenPaneId}
          projectId={treeProjectId}
          projectName={projectName}
          onFullscreenToggle={handleFullscreenToggle}
          onMoveTerminal={handleMoveTerminal}
        />
      </div>
    </div>
  );
}
