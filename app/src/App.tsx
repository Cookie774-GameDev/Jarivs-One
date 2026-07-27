/**
 * Jarvis - root App component.
 *
 * Composes:
 *   <AuthGate>            - generates local user, seeds DB, gates onboarding
 *     <AppShell>          - the three-pane chrome (TopBar, Nav, Inspector, etc.)
 *       <ActiveCanvas />  - dispatches chat / council / doc / code mode
 *     </AppShell>
 *     <CommandPalette />  - global Cmd+K
 *     <SettingsModal />   - Cmd+, target
 *     <VoiceModal />      - Cmd+Space target
 *     <GlowBorder />      - screen-edge glow during voice listening
 *     <AmbientHome />     - V2 idle takeover with breathing orb + clock
 *     <Toaster />         - in-app toast outlet
 *   </AuthGate>
 *
 * Plus boot effects:
 *   - openDb + seedIfEmpty (no-throw)
 *   - registerMany default agents into the agent runtime store
 *   - register the chat -> AI runtime listener (jarvis:send / jarvis:cancel)
 *   - useGlobalHotkeys() to wire every HOTKEY -> palette action
 *   - useIdleDetection() to flip ambient mode on inactivity (V2)
 */
import * as React from 'react';
import { liveQuery } from 'dexie';
import { applyThemeToDocument, useUIStore } from '@/stores/ui';
import { handleVoiceModuleClosed, syncVoiceModuleOpenState } from '@/features/voice/voiceRouter';
import { useAgentStore } from '@/stores/agents';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/components/layout';
import { JarvisContextMenu } from '@/components/layout/JarvisContextMenu';
import { PageRouter } from '@/components/layout/PageRouter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { startNotificationLoop } from '@/features/tasks';
import { startClockEngine } from '@/features/clock/clockEngine';
import { WellnessBreak } from '@/features/wellness';
import { useGlobalHotkeys } from '@/features/command-palette';
import { WakeWordHost } from '@/features/voice/WakeWordHost';
import { ApiKeySaveBurst } from '@/features/settings/ApiKeySaveBurst';
import { CallModal, startOutboundTrigger } from '@/features/call';
import { useBridgeLifecycle } from '@/lib/bridge/useBridgeLifecycle';
import { useIdleDetection, AmbientAudioHost } from '@/features/ambient';
import { useLinkHotkeys } from '@/features/launcher';
import { startWorkspaceAnalyticsClock } from '@/features/inspector/workspaceAnalytics';
import { GlobalSttHost } from '@/features/composer-stt';
import { FileExplorerHost } from '@/features/files';
import { Toaster, toast } from '@/components/ui/toast';
import {
  createJarvisCommandCenterHostPort,
  getInstalledJarvisCommandCenterHostDependencies,
  openJarvisLiveEvidenceAccount,
  openJarvisVoiceRecovery,
  startRuntimeListener,
} from '@/lib/ai/runtime';
import {
  JarvisCommandCenterProvider,
  type JarvisCommandCenterBinding,
} from '@/features/jarvis-command-center/JarvisCommandCenter';
import { createJarvisCommandCenterDataPort } from '@/features/jarvis-command-center/commandCenterDataPort';
import { selectCurrentRun } from '@/features/jarvis-command-center/selectors';
import { startJarvisLearningListener } from '@/features/jarvis-memory/learningListener';
import { useJarvisLearningStore } from '@/features/jarvis-memory/learningStore';
import { startJarvisOperatorListener } from '@/lib/jarvis/operatorListener';
import { startAllAboutMePersistence } from '@/features/all-about-me/persistence';
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import { startJarvisTaskRunNotifications } from '@/features/jarvis-runs/taskRunNotifications';
import {
  resumeRecoverableJarvisRuns,
  type JarvisRecoveryPresentation,
} from '@/features/jarvis-runs/recoveryExecutor';
import { readLegacyJarvisTaskRunsOnce } from '@/features/jarvis-runs/taskRunPersistence';
import { useJarvisTaskRunStore, type JarvisTaskRun } from '@/features/jarvis-runs/taskRunStore';
import { privateAccountDirectory } from '@/features/jarvis-memory/accountStorage';
import type { ChatActivityEvent } from '@/features/chat/activity/types';
import { messageRepo, agentRepo, chatRepo, openDb, db } from '@/lib/db';
import {
  jarvisApprovalRepo,
  jarvisArtifactRepo,
  jarvisEventRepo,
  jarvisRunRepo,
} from '@/lib/db/jarvisRepositories';
import { useAuthStore } from '@/stores/auth';
import { resolveAccountIdentity } from '@/lib/accountIdentity';
import {
  createJarvisPersistenceCoordinator,
  type JarvisPersistenceReadyReceipt,
} from '@/lib/jarvis/persistenceCoordinator';
import { findProtectedJarvisAgent } from '@/lib/jarvis/identity';
import type {
  JarvisEvent,
  JarvisLiveEvidencePrimaryHostAccountSession,
  JarvisLiveSystemNode,
} from '@/lib/jarvis/contracts/execution';
import {
  projectJarvisRunForLegacyUi,
  type JarvisTaskRunProjection,
} from '@/lib/jarvis/executionJournal/legacyTaskRunAdapter';
import { projectJarvisEventsForLegacyActivity } from '@/lib/jarvis/executionJournal/legacyActivityProjection';
import { createJarvisRecoveryScanner } from '@/lib/jarvis/executionJournal';
import { recoverVoiceResponses as recoverBoundVoiceResponses } from '@/features/voice/voiceResponseRecovery';
import {
  activateSyncQueueCloudAuthority,
  releaseSyncQueueCloudAuthority,
  type SyncQueueCloudAuthorityLease,
} from '@/lib/cloudSyncQueueOwner';
import { getDefaultAgents } from '@/features/agents';
import { ensureActiveChat, branchChatFromMessage } from '@/features/chat/chatLifecycle';
import type { ChatId, MessageId } from '@/types/common';
import { useHotkey, HOTKEYS } from '@/lib/hotkeys';
import { DevConsoleHost } from '@/features/dev-console';
import { initTerminalScheduler } from '@/features/terminals/terminalScheduler';
import { TerminalCliRuntimeHost } from '@/features/terminals';
import { startJarvisScheduleRunner } from '@/features/schedule/jarvisScheduleRunner';
import { UpdateWarningHost } from '@/features/updates/UpdateWarningHost';
import {
  flushWorkspacePersistence,
  flushWorkspacePersistenceAndAcknowledge,
} from '@/lib/persistence/workspaceFlush';
import { GlobalDictationOverlay } from '@/features/global-dictation/GlobalDictationOverlay';
import { PluginManagementCapabilityProvider } from '@/features/plugins/managementContext';
import type { PluginManagementCapability } from '@/features/plugins/runtime';
import type { Agent, AgentId, Message } from '@/types';
import { KernelSmokeBindingHost } from '@/lib/jarvis/smoke/KernelSmokeBindingHost';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
});

type SupabaseSessionLike = {
  user?: {
    id?: string;
    email?: string;
  };
  expires_at?: number;
} | null;

let accountScopeTeardownBarrier: Promise<void> = Promise.resolve();
let cloudSyncTeardownBarrier: Promise<void> = Promise.resolve();
let invalidateActiveKernelAccount: (accountId: string) => void = () => {};

function cloudSessionUserId(session: SupabaseSessionLike): string {
  return session?.user?.id?.trim() ?? '';
}

type CanonicalProjectionSubscriptionInput = {
  accountId: string;
  accountScope: string;
  isCurrent: () => boolean;
  onTransition: (event: JarvisEvent) => void;
  onError?: (error: unknown) => void;
};

export interface JarvisLegacyLifecycleAccountServices {
  deriveAccountScope(accountId: string): Promise<string>;
  readLegacyRuns(input: { accountId: string }): Promise<readonly JarvisTaskRun[]>;
  setAccountScope(scope: string): void;
  replaceLegacyRuns(scope: string, runs: readonly JarvisTaskRun[]): void;
  startNotifications(input: {
    subscribe: (listener: (event: JarvisEvent) => void) => () => void;
    onError?: (error: unknown) => void;
  }): () => void;
  startCanonicalProjection(input: CanonicalProjectionSubscriptionInput): () => void;
  resumeRecovery(input: {
    accountId: string;
    readyReceipt: JarvisPersistenceReadyReceipt;
    signal?: AbortSignal;
    isCurrent: () => boolean;
  }): Promise<number>;
}

export interface JarvisVoiceResponseRecoveryAccountServices {
  openLiveEvidenceAccount(accountId: string): Promise<JarvisLiveEvidencePrimaryHostAccountSession>;
  recoverVoiceResponses(input: { accountId: string }): Promise<unknown>;
}

export type JarvisVoiceRecoveryAccountSession = Readonly<{
  session: JarvisLiveEvidencePrimaryHostAccountSession;
  recover(): Promise<unknown>;
}>;

function reportLifecycleError(error: unknown): void {
  console.warn(
    '[jarvis-task] canonical lifecycle projection unavailable',
    error instanceof Error ? error.message : String(error),
  );
}

async function readCanonicalProjectionSnapshot(accountId: string): Promise<{
  runs: JarvisTaskRunProjection[];
  activityByChat: Record<string, readonly ChatActivityEvent[]>;
  events: JarvisEvent[];
}> {
  const runs = await jarvisRunRepo.listByAccount(accountId, { limit: 500 });
  const rows = await Promise.all(
    runs.map(async (run) => {
      const [events, artifacts] = await Promise.all([
        jarvisEventRepo.listByRun(accountId, run.id, { limit: 500 }),
        jarvisArtifactRepo.listByRun(accountId, run.id, 500),
      ]);
      return { run, events, artifacts };
    }),
  );
  const activityByChat: Record<string, ChatActivityEvent[]> = {};
  const projections: JarvisTaskRunProjection[] = [];
  const allEvents: JarvisEvent[] = [];
  for (const row of rows) {
    projections.push(projectJarvisRunForLegacyUi(row));
    allEvents.push(...row.events);
    for (const activity of projectJarvisEventsForLegacyActivity({
      run: row.run,
      events: row.events,
      limit: 500,
    })) {
      const chatId = String(activity.chatId);
      const existing = activityByChat[chatId] ?? [];
      existing.push(activity);
      activityByChat[chatId] = existing;
    }
  }
  for (const [chatId, events] of Object.entries(activityByChat)) {
    activityByChat[chatId] = events.sort((left, right) => left.ts - right.ts).slice(-500);
  }
  return { runs: projections, activityByChat, events: allEvents };
}

function startCanonicalJarvisProjection(input: CanonicalProjectionSubscriptionInput): () => void {
  let initialized = false;
  let seenEvents = new Set<string>();
  const subscription = liveQuery(() => readCanonicalProjectionSnapshot(input.accountId)).subscribe({
    next(snapshot) {
      if (!input.isCurrent()) return;
      useJarvisTaskRunStore
        .getState()
        .replaceCanonicalForAccount(input.accountScope, snapshot.runs, snapshot.activityByChat);
      const currentKeys = new Set(snapshot.events.map((event) => `${event.runId}:${event.seq}`));
      if (initialized) {
        for (const event of snapshot.events) {
          if (!seenEvents.has(`${event.runId}:${event.seq}`)) input.onTransition(event);
        }
      }
      initialized = true;
      seenEvents = currentKeys;
    },
    error(error) {
      input.onError?.(error);
    },
  });
  return () => subscription.unsubscribe();
}

async function resumeCanonicalJarvisRecovery(input: {
  accountId: string;
  readyReceipt: JarvisPersistenceReadyReceipt;
  signal?: AbortSignal;
  isCurrent: () => boolean;
}): Promise<number> {
  if (
    input.readyReceipt.state !== 'ready' ||
    input.readyReceipt.accountId !== input.accountId ||
    !input.isCurrent()
  ) {
    return 0;
  }
  const scanner = createJarvisRecoveryScanner({ runs: jarvisRunRepo, events: jarvisEventRepo });
  return resumeRecoverableJarvisRuns({
    accountId: input.accountId,
    scanner,
    approvals: jarvisApprovalRepo,
    signal: input.signal,
    isCurrent: input.isCurrent,
    onPresentation: (presentation: JarvisRecoveryPresentation) => {
      if (typeof window !== 'undefined' && input.isCurrent()) {
        window.dispatchEvent(
          new CustomEvent('jarvis:recovery-presentation', { detail: presentation }),
        );
      }
    },
  });
}

const DEFAULT_JARVIS_VOICE_RESPONSE_RECOVERY_SERVICES: JarvisVoiceResponseRecoveryAccountServices =
  Object.freeze({
    openLiveEvidenceAccount: openJarvisLiveEvidenceAccount,
    recoverVoiceResponses: ({ accountId }: { accountId: string }) =>
      recoverBoundVoiceResponses({
        accountId,
        scanner: createJarvisRecoveryScanner({ runs: jarvisRunRepo, events: jarvisEventRepo }),
        openVoiceRecovery: openJarvisVoiceRecovery,
      }),
  });

export async function startJarvisVoiceRecoveryAccountSession(input: {
  accountId: string;
  readyReceipt: JarvisPersistenceReadyReceipt;
  isCurrent: () => boolean;
  services?: JarvisVoiceResponseRecoveryAccountServices;
}): Promise<JarvisVoiceRecoveryAccountSession | undefined> {
  if (
    input.readyReceipt.state !== 'ready' ||
    input.readyReceipt.accountId !== input.accountId ||
    !input.isCurrent()
  ) {
    return undefined;
  }

  const services = input.services ?? DEFAULT_JARVIS_VOICE_RESPONSE_RECOVERY_SERVICES;
  const session = await services.openLiveEvidenceAccount(input.accountId);
  if (!input.isCurrent()) {
    session.dispose();
    return undefined;
  }
  if (session.accountId !== input.accountId) {
    session.dispose();
    throw new Error('jarvis_live_evidence_account_mismatch');
  }
  try {
    session.assertCurrent();
  } catch (error) {
    session.dispose();
    throw error;
  }

  let recoveryClaimed = false;
  return Object.freeze({
    session,
    async recover(): Promise<unknown> {
      if (recoveryClaimed) throw new Error('voice_response_recovery_already_started');
      recoveryClaimed = true;
      try {
        if (!input.isCurrent()) {
          session.dispose();
          return undefined;
        }
        session.assertCurrent();
        const summary = await services.recoverVoiceResponses({ accountId: input.accountId });
        if (!input.isCurrent()) {
          session.dispose();
          return summary;
        }
        session.assertCurrent();
        return summary;
      } catch (error) {
        session.dispose();
        throw error;
      }
    },
  });
}

const DEFAULT_JARVIS_LEGACY_LIFECYCLE_SERVICES: JarvisLegacyLifecycleAccountServices = {
  deriveAccountScope: privateAccountDirectory,
  readLegacyRuns: readLegacyJarvisTaskRunsOnce,
  setAccountScope: (scope) => useJarvisTaskRunStore.getState().setAccountScope(scope),
  replaceLegacyRuns: (scope, runs) =>
    useJarvisTaskRunStore.getState().replaceLegacyForAccount(scope, runs),
  startNotifications: (input) => startJarvisTaskRunNotifications(input),
  startCanonicalProjection: startCanonicalJarvisProjection,
  resumeRecovery: resumeCanonicalJarvisRecovery,
};

export async function startJarvisLegacyLifecycleAccountSession(input: {
  accountId: string;
  readyReceipt: JarvisPersistenceReadyReceipt;
  signal?: AbortSignal;
  isCurrent: () => boolean;
  services?: JarvisLegacyLifecycleAccountServices;
  onError?: (error: unknown) => void;
}): Promise<() => void> {
  const services = input.services ?? DEFAULT_JARVIS_LEGACY_LIFECYCLE_SERVICES;
  const onError = input.onError ?? reportLifecycleError;
  let accountScope = '';
  let disposed = false;
  let stopNotifications: (() => void) | undefined;
  let stopCanonical: (() => void) | undefined;
  const transitionListeners = new Set<(event: JarvisEvent) => void>();
  services.setAccountScope('');

  const stop = () => {
    if (disposed) return;
    disposed = true;
    stopCanonical?.();
    stopNotifications?.();
    transitionListeners.clear();
    if (accountScope && input.isCurrent()) services.setAccountScope('');
  };

  try {
    if (
      input.readyReceipt.state !== 'ready' ||
      input.readyReceipt.accountId !== input.accountId ||
      !input.isCurrent()
    ) {
      return stop;
    }
    accountScope = await services.deriveAccountScope(input.accountId);
    if (!input.isCurrent()) return stop;
    services.setAccountScope(accountScope);
    const legacyRuns = await services.readLegacyRuns({ accountId: input.accountId });
    if (!input.isCurrent()) return stop;
    services.replaceLegacyRuns(accountScope, legacyRuns);
    stopNotifications = services.startNotifications({
      subscribe(listener) {
        transitionListeners.add(listener);
        return () => transitionListeners.delete(listener);
      },
      onError,
    });
    stopCanonical = services.startCanonicalProjection({
      accountId: input.accountId,
      accountScope,
      isCurrent: input.isCurrent,
      onTransition: (event) => {
        for (const listener of transitionListeners) listener(event);
      },
      onError,
    });
    if (!input.isCurrent()) {
      stop();
      return () => undefined;
    }
    void Promise.resolve()
      .then(() => {
        if (disposed || !input.isCurrent()) return 0;
        return services.resumeRecovery({
          accountId: input.accountId,
          readyReceipt: input.readyReceipt,
          signal: input.signal,
          isCurrent: input.isCurrent,
        });
      })
      .then(() => {
        if (!input.isCurrent()) stop();
      })
      .catch((error) => {
        if (!disposed && input.isCurrent()) onError(error);
        stop();
      });
    return stop;
  } catch (error) {
    onError(error);
    stop();
    return () => undefined;
  }
}

/**
 * Lazy-mounted modals + canvas surfaces.
 *
 * Two reasons each component is wrapped here instead of imported eagerly:
 *
 *   1. Code-splitting. The chat view, council grid, settings sections,
 *      schedule editor, launcher tile editor, what's-new modal, actions
 *      palette, ambient takeover, and wellness break all pull large
 *      dependency graphs (motion, dexie hooks, big component trees) that
 *      have no business landing in the boot chunk.
 *
 *   2. Runtime cost. Most of these are gated by an `open` boolean in the
 *      UI store; even when closed they pay rendering + tree-walk cost
 *      every time the store updates. Lazy-mounting means the React tree
 *      never sees them until the user actually summons them.
 *
 * Suspense fallbacks are deliberately `null` — these are overlays whose
 * own internal skeletons handle empty/loading states better than a
 * generic spinner would.
 */
const ChatView = React.lazy(() => import('@/features/chat').then((m) => ({ default: m.ChatView })));
const CouncilView = React.lazy(() =>
  import('@/features/council').then((m) => ({ default: m.CouncilView })),
);
import { getLastSettingsTab } from '@/features/settings/settingsTabMemory';

const SettingsModal = React.lazy(() =>
  import('@/features/settings').then((m) => ({ default: m.SettingsModal })),
);
const VoiceModal = React.lazy(() =>
  import('@/features/voice/VoiceModal').then((m) => ({ default: m.VoiceModal })),
);
const CommandPalette = React.lazy(() =>
  import('@/features/command-palette').then((m) => ({ default: m.CommandPalette })),
);
const LauncherDialog = React.lazy(() =>
  import('@/features/launcher').then((m) => ({ default: m.LauncherDialog })),
);
const AssistantBar = React.lazy(() =>
  import('@/features/assistant').then((m) => ({ default: m.AssistantBar })),
);
const WhatsNewHost = React.lazy(() =>
  import('@/features/whats-new').then((m) => ({ default: m.WhatsNewHost })),
);
const NewsHost = React.lazy(() => import('@/features/news').then((m) => ({ default: m.NewsHost })));
const ProductTutorialHost = React.lazy(() =>
  import('@/features/product-tutorial').then((m) => ({ default: m.ProductTutorialHost })),
);
const ActionsPalette = React.lazy(() =>
  import('@/features/actions').then((m) => ({ default: m.ActionsPalette })),
);
const AmbientHome = React.lazy(() =>
  import('@/features/ambient').then((m) => ({ default: m.AmbientHome })),
);
const PetHost = React.lazy(() => import('@/features/pets').then((m) => ({ default: m.PetHost })));
const CelebrationHost = React.lazy(() =>
  import('@/features/celebrate').then((m) => ({ default: m.CelebrationHost })),
);

let cloudPlanSyncGeneration = 0;

function applyCloudSession(session: SupabaseSessionLike): void {
  const requestGeneration = ++cloudPlanSyncGeneration;
  const store = useAuthStore.getState();
  if (session === null) {
    useAuthStore.setState({ cloudSession: null, plan: 'free' });
    return;
  }
  const userId = cloudSessionUserId(session);
  const previousUserId = store.cloudSession?.user_id.trim() ?? '';
  const resetPlan = !userId || previousUserId !== userId;
  useAuthStore.setState({
    cloudSession: {
      user_id: userId,
      email: session.user?.email ?? '',
      expires_at: session.expires_at ?? 0,
    },
    ...(resetPlan ? { plan: 'free' as const } : {}),
  });
  if (!userId) return;
  void syncPlanFromProfile(userId, requestGeneration);
}

/**
 * Pull the server-managed subscription tier into the local auth store so the
 * Plans/Account UI reflects Stripe state after sign-in and app restarts.
 * Fire-and-forget: a new authority starts at the fail-closed free tier, and
 * only the latest request for the still-active exact account may replace it.
 */
async function syncPlanFromProfile(userId: string, requestGeneration: number): Promise<void> {
  try {
    const { getSupabaseClient } = await import('@/lib/supabase/client');
    const supa = getSupabaseClient();
    if (!supa) return;
    const { data, error } = await supa
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data?.tier) return;
    const tier = data.tier === 'byok-only' ? 'free' : data.tier;
    const SYNCED_TIERS = new Set(['free', 'starter', 'pro', 'ultra', 'apex']);
    if (SYNCED_TIERS.has(tier)) {
      const store = useAuthStore.getState();
      if (
        requestGeneration !== cloudPlanSyncGeneration ||
        store.cloudSession?.user_id.trim() !== userId
      ) {
        return;
      }
      if (store.plan !== tier) store.setPlan(tier as import('@/lib/entitlements').PlanId);
    }
  } catch (err) {
    console.warn('[billing] plan sync skipped:', err);
  }
}

/**
 * Renders the right canvas based on `useUIStore.route` (V3) and
 * `chatMode` (V2). For non-`chat` routes (terminal / kanban / context /
 * benchmarks / history / agents) we delegate to `<PageRouter />`.
 *
 * For the `chat` route we keep the existing council bootstrap so
 * council mode still pulls per-chat agent ids and seeds messages.
 */
function ActiveCanvas() {
  const route = useUIStore((s) => s.route);
  const chatMode = useUIStore((s) => s.chatMode);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const [councilAgentIds, setCouncilAgentIds] = React.useState<AgentId[]>([]);
  const [councilMessages, setCouncilMessages] = React.useState<Message[]>([]);
  const agentMap = useAgentStore((s) => s.agents);

  // When council mode is on, pull the chat's `active_agent_ids` and stream
  // messages from the same chat so each panel can filter on agent_id.
  React.useEffect(() => {
    if (chatMode !== 'council' || !activeChatId) {
      setCouncilAgentIds([]);
      setCouncilMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const chat = await chatRepo.getById(activeChatId as never);
        if (cancelled || !chat) return;
        // Default to all built-in agents if the chat hasn't been wired yet.
        const ids =
          chat.active_agent_ids?.length > 0
            ? chat.active_agent_ids
            : (Object.values(agentMap) as Agent[]).slice(0, 4).map((a) => a.id);
        setCouncilAgentIds(ids);
        const msgs = await messageRepo.listByChat(activeChatId as never);
        if (!cancelled) setCouncilMessages(msgs);
      } catch (err) {
        console.error('Council bootstrap failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatMode, activeChatId, agentMap]);

  // V3 — non-chat routes go through the lazy PageRouter.
  if (route !== 'chat') {
    return <PageRouter />;
  }

  if (chatMode === 'council') {
    return (
      <React.Suspense fallback={null}>
        <CouncilView agentIds={councilAgentIds} messages={councilMessages} />
      </React.Suspense>
    );
  }
  // doc / code modes are placeholders in V1 - render the chat as a fallback.
  return (
    <React.Suspense fallback={null}>
      <ChatView />
    </React.Suspense>
  );
}

/**
 * Boot-time wiring: open DB, register default agents, start runtime + notification loops.
 * Mounted ONCE inside AuthGate (after seeding) via this effect.
 */
function useBoot() {
  const registerMany = useAgentStore((s) => s.registerMany);
  const [commandCenterBinding, setCommandCenterBinding] =
    React.useState<JarvisCommandCenterBinding>();

  React.useEffect(() => {
    let stopRuntime: (() => void) | undefined;
    let stopLearning: (() => void | Promise<void>) | undefined;
    let stopOperator: (() => void) | undefined;
    let stopAllAboutMePersistence: (() => void | Promise<void>) | undefined;
    let stopTaskRunLifecycle: (() => void) | undefined;
    let liveEvidenceAccountSession: JarvisLiveEvidencePrimaryHostAccountSession | undefined;
    let stopNotifications: (() => void) | undefined;
    let stopTerminalScheduler: (() => void) | undefined;
    let stopJarvisScheduleRunner: (() => void) | undefined;
    let stopClockEngine: (() => void) | undefined;
    type CloudSyncAuthorityLifecycle = {
      userId: string;
      generation: number;
      controller: AbortController;
      startup: Promise<void>;
      stopLoop?: () => Promise<void>;
    };
    let activeCloudSyncAuthority: CloudSyncAuthorityLifecycle | undefined;
    let enqueueCloudAuthorityLease: SyncQueueCloudAuthorityLease | undefined;
    let stopCloudAuth: (() => void) | undefined;
    let stopAccountSubscription: (() => void) | undefined;
    let persistenceCoordinator: ReturnType<typeof createJarvisPersistenceCoordinator> | undefined;
    let stopPersistenceCoordinator: (() => void) | undefined;
    let stopPersistenceState: (() => void) | undefined;
    let persistenceReadyReceipt: JarvisPersistenceReadyReceipt | null = null;
    let activeAccountIdentity: ReturnType<typeof resolveAccountIdentity> = null;
    let activePersistenceGeneration: number | null = null;
    let desiredAccountIdentity: ReturnType<typeof resolveAccountIdentity> = null;
    let desiredPersistenceReceipt: JarvisPersistenceReadyReceipt | null = null;
    let accountIdentityReady = false;
    let accountListenersBootReady = false;
    let accountTransitionRequest = 0;
    let accountScopeGeneration = 0;
    let cloudAuthGeneration = 0;
    let accountRecoveryController: AbortController | undefined;
    let accountTransition = accountScopeTeardownBarrier;
    let cancelled = false;
    const errors: string[] = [];

    quarantineAccountScopedState();

    function addError(label: string, err: unknown): void {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[boot] ${label}:`, msg);
      errors.push(`${label}: ${msg}`);
    }

    function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms),
        ),
      ]).catch((err) => {
        addError(label, err);
        throw err;
      });
    }

    function sameAccountIdentity(
      left: ReturnType<typeof resolveAccountIdentity>,
      right: ReturnType<typeof resolveAccountIdentity>,
    ): boolean {
      return left?.accountId === right?.accountId && left?.source === right?.source;
    }

    function sameReadyReceipt(
      left: JarvisPersistenceReadyReceipt | null,
      right: JarvisPersistenceReadyReceipt | null,
    ): boolean {
      return (
        left?.accountId === right?.accountId &&
        left?.generation === right?.generation &&
        left?.state === right?.state
      );
    }

    function releaseEnqueueCloudAuthority(expectedUserId?: string): void {
      const lease = enqueueCloudAuthorityLease;
      if (!lease || (expectedUserId && lease.userId !== expectedUserId)) return;
      enqueueCloudAuthorityLease = undefined;
      releaseSyncQueueCloudAuthority(lease);
    }

    function publishVerifiedEnqueueCloudAuthority(session: SupabaseSessionLike): void {
      const userId = cloudSessionUserId(session);
      if (enqueueCloudAuthorityLease?.userId === userId && userId) return;
      releaseEnqueueCloudAuthority();
      if (userId) {
        enqueueCloudAuthorityLease = activateSyncQueueCloudAuthority(userId);
      }
    }

    function revokeEnqueueAuthorityOnStoreDivergence(): void {
      const lease = enqueueCloudAuthorityLease;
      if (!lease) return;
      const storedUserId = useAuthStore.getState().cloudSession?.user_id.trim() ?? '';
      if (storedUserId !== lease.userId) {
        releaseEnqueueCloudAuthority(lease.userId);
      }
    }

    function stopActiveCloudSyncLoop(): Promise<void> {
      const authority = activeCloudSyncAuthority;
      activeCloudSyncAuthority = undefined;
      if (!authority) return cloudSyncTeardownBarrier;

      authority.controller.abort();
      const loopSettlement = authority.stopLoop?.() ?? Promise.resolve();
      const authoritySettlement = Promise.allSettled([authority.startup, loopSettlement]).then(
        () => undefined,
      );
      const priorSettlement = cloudSyncTeardownBarrier;
      cloudSyncTeardownBarrier = Promise.allSettled([priorSettlement, authoritySettlement]).then(
        () => undefined,
      );
      return cloudSyncTeardownBarrier;
    }

    function quarantineAccountScopedState(): void {
      useJarvisLearningStore.getState().clearAccountScope();
      useAllAboutMeStore.getState().clearAccountScope();
      useJarvisTaskRunStore.getState().setAccountScope('');
    }

    async function stopAccountScopedListeners(): Promise<void> {
      accountScopeGeneration += 1;
      accountRecoveryController?.abort();
      accountRecoveryController = undefined;
      const oldAccountId = activeAccountIdentity?.accountId;
      const oldLiveEvidenceSession = liveEvidenceAccountSession;
      setCommandCenterBinding(undefined);
      liveEvidenceAccountSession = undefined;
      if (oldAccountId) invalidateActiveKernelAccount(oldAccountId);
      const stops = [stopLearning, stopAllAboutMePersistence, stopTaskRunLifecycle].filter(
        (stop): stop is () => void | Promise<void> => Boolean(stop),
      );
      stopLearning = undefined;
      stopAllAboutMePersistence = undefined;
      stopTaskRunLifecycle = undefined;
      activeAccountIdentity = null;
      activePersistenceGeneration = null;
      const pendingStops = stops.map((stop) => {
        try {
          return Promise.resolve(stop());
        } catch (error) {
          return Promise.reject(error);
        }
      });
      oldLiveEvidenceSession?.dispose();
      quarantineAccountScopedState();
      const results = await Promise.allSettled(pendingStops);
      for (const result of results) {
        if (result.status === 'rejected') addError('account scope teardown', result.reason);
      }
    }

    async function transitionAccountScopedListeners(
      nextIdentity: ReturnType<typeof resolveAccountIdentity>,
      readyReceipt: JarvisPersistenceReadyReceipt,
      request: number,
    ): Promise<void> {
      if (
        sameAccountIdentity(nextIdentity, activeAccountIdentity) &&
        activePersistenceGeneration === readyReceipt.generation
      ) {
        return;
      }
      await stopAccountScopedListeners();
      if (
        cancelled ||
        !accountListenersBootReady ||
        request !== accountTransitionRequest ||
        !nextIdentity ||
        !sameAccountIdentity(nextIdentity, resolveAccountIdentity(useAuthStore.getState())) ||
        !sameReadyReceipt(readyReceipt, persistenceReadyReceipt)
      ) {
        return;
      }

      const accountId = nextIdentity.accountId;
      const generation = ++accountScopeGeneration;
      const recoveryController = new AbortController();
      accountRecoveryController = recoveryController;
      activeAccountIdentity = nextIdentity;
      activePersistenceGeneration = readyReceipt.generation;
      const fixedAccountBindings = {
        getAccountId: () => accountId,
        subscribeAccount: (_listener: () => void) => () => {},
      };
      try {
        const isCurrent = () =>
          !cancelled &&
          accountListenersBootReady &&
          accountScopeGeneration === generation &&
          sameAccountIdentity(activeAccountIdentity, nextIdentity) &&
          activePersistenceGeneration === readyReceipt.generation &&
          sameReadyReceipt(persistenceReadyReceipt, readyReceipt);
        const voiceRecovery = await startJarvisVoiceRecoveryAccountSession({
          accountId,
          readyReceipt,
          isCurrent,
        });
        if (!voiceRecovery) return;
        if (!isCurrent()) {
          voiceRecovery.session.dispose();
          return;
        }
        liveEvidenceAccountSession = voiceRecovery.session;
        const commandCenterHostPort = createJarvisCommandCenterHostPort({
          accountSession: voiceRecovery.session,
          ...getInstalledJarvisCommandCenterHostDependencies(),
        });
        const commandCenterDataPort = createJarvisCommandCenterDataPort({
          repositories: {
            runs: jarvisRunRepo,
            events: jarvisEventRepo,
            artifacts: jarvisArtifactRepo,
          },
          liveEvidence: commandCenterHostPort.liveEvidence,
          subscribeJournal(subscriptionAccountId, chatId, listener) {
            const subscription = liveQuery(async () => {
              const runs = await jarvisRunRepo.listByAccount(subscriptionAccountId, { limit: 100 });
              const currentRun = selectCurrentRun(runs, subscriptionAccountId, chatId);
              if (!currentRun) return undefined;
              await Promise.all([
                jarvisEventRepo.listByRun(subscriptionAccountId, currentRun.id, { limit: 500 }),
                jarvisArtifactRepo.listByRun(subscriptionAccountId, currentRun.id, 500),
              ]);
              return currentRun.updatedAt;
            }).subscribe({
              next: listener,
              error: listener,
            });
            return () => subscription.unsubscribe();
          },
        });
        setCommandCenterBinding(
          Object.freeze({ hostPort: commandCenterHostPort, dataPort: commandCenterDataPort }),
        );
        await voiceRecovery.recover();
        if (!isCurrent()) return;
        stopLearning = startJarvisLearningListener(fixedAccountBindings);
        stopAllAboutMePersistence = startAllAboutMePersistence(fixedAccountBindings);
        stopTaskRunLifecycle = await startJarvisLegacyLifecycleAccountSession({
          accountId,
          readyReceipt,
          signal: recoveryController.signal,
          isCurrent,
          onError: (error) => addError('canonical task projection', error),
        });
      } catch (error) {
        addError('account scope startup', error);
        await stopAccountScopedListeners();
      }
    }

    function syncAccountScopedListeners(): void {
      if (!accountListenersBootReady || !accountIdentityReady) {
        if (!activeAccountIdentity) quarantineAccountScopedState();
        return;
      }
      const nextIdentity = resolveAccountIdentity(useAuthStore.getState());
      const nextReadyReceipt =
        nextIdentity && persistenceReadyReceipt?.accountId === nextIdentity.accountId
          ? persistenceReadyReceipt
          : null;

      if (!nextIdentity || !nextReadyReceipt) {
        if (!desiredAccountIdentity && !desiredPersistenceReceipt && !activeAccountIdentity) {
          quarantineAccountScopedState();
          return;
        }
        desiredAccountIdentity = null;
        desiredPersistenceReceipt = null;
        accountTransitionRequest += 1;
        if (!activeAccountIdentity) {
          quarantineAccountScopedState();
          return;
        }
        const precedingTransition = accountTransition;
        const immediateTeardown = stopAccountScopedListeners();
        accountTransition = Promise.allSettled([precedingTransition, immediateTeardown]).then(
          () => undefined,
        );
        return;
      }

      if (
        sameAccountIdentity(nextIdentity, desiredAccountIdentity) &&
        sameReadyReceipt(nextReadyReceipt, desiredPersistenceReceipt)
      ) {
        return;
      }

      desiredAccountIdentity = nextIdentity;
      desiredPersistenceReceipt = nextReadyReceipt;
      const request = ++accountTransitionRequest;
      if (
        sameAccountIdentity(nextIdentity, activeAccountIdentity) &&
        activePersistenceGeneration === nextReadyReceipt.generation
      ) {
        return;
      }
      accountTransition = accountTransition
        .then(async () => {
          if (cancelled || request !== accountTransitionRequest) return;
          await transitionAccountScopedListeners(nextIdentity, nextReadyReceipt, request);
        })
        .catch((error) => addError('account scope transition', error));
    }

    function ensurePersistenceCoordinatorStarted(): void {
      if (
        cancelled ||
        !accountIdentityReady ||
        !persistenceCoordinator ||
        stopPersistenceCoordinator
      ) {
        return;
      }
      stopPersistenceCoordinator = persistenceCoordinator.start();
      persistenceReadyReceipt = persistenceCoordinator.getReadyReceipt();
      syncAccountScopedListeners();
    }

    stopAccountSubscription = useAuthStore.subscribe(() => {
      revokeEnqueueAuthorityOnStoreDivergence();
      syncAccountScopedListeners();
    });

    (async () => {
      // Phase 1: storage & keys
      let databaseOpened = false;
      try {
        await withTimeout(openDb(), 10_000, 'openDb');
        databaseOpened = true;
      } catch {
        /* degraded */
      }

      if (cancelled) return;

      if (databaseOpened) {
        persistenceCoordinator = createJarvisPersistenceCoordinator({
          db,
          readIdentity: () =>
            accountIdentityReady ? resolveAccountIdentity(useAuthStore.getState()) : null,
          subscribeIdentity: (listener) => useAuthStore.subscribe(listener),
        });
        stopPersistenceState = persistenceCoordinator.subscribe(() => {
          persistenceReadyReceipt = persistenceCoordinator?.getReadyReceipt() ?? null;
          syncAccountScopedListeners();
        });
        persistenceReadyReceipt = persistenceCoordinator.getReadyReceipt();
        ensurePersistenceCoordinatorStarted();
      }

      try {
        await withTimeout(useAuthStore.getState().hydrateApiKeysFromVault(), 5_000, 'hydrateKeys');
      } catch {
        /* fallback to localStorage */
      }

      if (cancelled) return;

      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('install_terminal_launcher'))
        .catch((err) => console.warn('[launcher] terminal command setup failed', err));

      // Phase 2: Supabase (non-blocking, fire-and-forget)
      try {
        const { isSupabaseConfigured } = await withTimeout(
          import('@/lib/supabase/env').then((m) => m),
          5_000,
          'supabaseCheck',
        );
        if (cancelled) return;
        if (!isSupabaseConfigured()) {
          publishVerifiedEnqueueCloudAuthority(null);
          applyCloudSession(null);
          accountIdentityReady = true;
          ensurePersistenceCoordinatorStarted();
        } else {
          const supabaseModules = await withTimeout(
            Promise.all([import('@/lib/supabase/client'), import('@/lib/sync')]),
            15_000,
            'supabaseImport',
          ).catch(() => null);
          if (supabaseModules && !cancelled) {
            const [{ getSupabaseClient }, { pruneSyncQueue, retrySyncErrors, startSyncLoop }] =
              supabaseModules;
            const supa = getSupabaseClient();
            const isCloudSyncAuthorityCurrent = (authority: CloudSyncAuthorityLifecycle) =>
              !cancelled &&
              activeCloudSyncAuthority === authority &&
              !authority.controller.signal.aborted &&
              authority.generation === cloudAuthGeneration &&
              useAuthStore.getState().cloudSession?.user_id.trim() === authority.userId;
            const startCloudSyncForAuthority = async (
              authority: CloudSyncAuthorityLifecycle,
              priorSettlement: Promise<void>,
            ): Promise<void> => {
              await priorSettlement;
              if (!isCloudSyncAuthorityCurrent(authority)) return;
              const syncAuthority = {
                userId: authority.userId,
                signal: authority.controller.signal,
              };
              await retrySyncErrors(syncAuthority).catch((err) =>
                console.warn('[sync] retrySyncErrors failed:', err),
              );
              if (!isCloudSyncAuthorityCurrent(authority)) return;
              await pruneSyncQueue(syncAuthority).catch((err) =>
                console.warn('[sync] prune failed:', err),
              );
              if (!isCloudSyncAuthorityCurrent(authority)) return;
              try {
                authority.stopLoop = startSyncLoop(syncAuthority);
              } catch (err) {
                console.warn('[sync] loop startup failed:', err);
              }
            };
            const reconcileCloudSyncAuthority = (
              session: SupabaseSessionLike,
              generation: number,
            ): void => {
              const userId = cloudSessionUserId(session);
              if (!userId) {
                void stopActiveCloudSyncLoop();
                return;
              }
              const current = activeCloudSyncAuthority;
              if (current && current.userId === userId && !current.controller.signal.aborted) {
                current.generation = generation;
                return;
              }

              const priorSettlement = stopActiveCloudSyncLoop();
              const authority: CloudSyncAuthorityLifecycle = {
                userId,
                generation,
                controller: new AbortController(),
                startup: Promise.resolve(),
              };
              activeCloudSyncAuthority = authority;
              authority.startup = startCloudSyncForAuthority(authority, priorSettlement).catch(
                (err) => {
                  if (activeCloudSyncAuthority === authority) {
                    activeCloudSyncAuthority = undefined;
                    releaseEnqueueCloudAuthority(authority.userId);
                  }
                  console.warn('[sync] authority startup failed:', err);
                },
              );
            };
            if (supa) {
              const sessionGeneration = ++cloudAuthGeneration;
              void supa.auth
                .getSession()
                .then(({ data }) => {
                  if (cancelled || sessionGeneration !== cloudAuthGeneration) return;
                  publishVerifiedEnqueueCloudAuthority(data.session as SupabaseSessionLike);
                  applyCloudSession(data.session as SupabaseSessionLike);
                  accountIdentityReady = true;
                  ensurePersistenceCoordinatorStarted();
                  syncAccountScopedListeners();
                  reconcileCloudSyncAuthority(
                    data.session as SupabaseSessionLike,
                    sessionGeneration,
                  );
                  const userId = cloudSessionUserId(data.session as SupabaseSessionLike);
                  // Startup routing: when cloud auth is configured but no one is
                  // signed in, open the Account page so the user can sign up /
                  // sign in. When signed in, the persisted last route is restored
                  // automatically (route is persisted in the UI store).
                  if (!data.session) {
                    useUIStore.getState().setRoute('account');
                  } else if (userId) {
                    void import('@/lib/launchPromo').then((m) => m.claimLaunchPromo(userId));
                  }
                })
                .catch((error) => {
                  if (cancelled || sessionGeneration !== cloudAuthGeneration) return;
                  releaseEnqueueCloudAuthority();
                  applyCloudSession(null);
                  console.warn('[auth] initial Supabase session unavailable:', error);
                  syncAccountScopedListeners();
                });
              const sub = supa.auth.onAuthStateChange((_event, session) => {
                if (cancelled) return;
                cloudAuthGeneration += 1;
                publishVerifiedEnqueueCloudAuthority(session as SupabaseSessionLike);
                applyCloudSession(session as SupabaseSessionLike);
                accountIdentityReady = true;
                ensurePersistenceCoordinatorStarted();
                syncAccountScopedListeners();
                reconcileCloudSyncAuthority(session as SupabaseSessionLike, cloudAuthGeneration);
                const userId = cloudSessionUserId(session as SupabaseSessionLike);
                if (userId) {
                  void import('@/lib/launchPromo').then((m) => m.claimLaunchPromo(userId));
                }
              });
              stopCloudAuth = () => sub.data.subscription.unsubscribe();
            } else {
              releaseEnqueueCloudAuthority();
              applyCloudSession(null);
            }
          } else if (!cancelled) {
            releaseEnqueueCloudAuthority();
            applyCloudSession(null);
          }
        }
      } catch {
        releaseEnqueueCloudAuthority();
        applyCloudSession(null);
        /* Supabase unavailable, app works offline */
      }

      if (cancelled) return;

      // Phase 3: agent registration
      try {
        const persistedAgents = await withTimeout(agentRepo.list(), 10_000, 'agentRepo');
        if (cancelled) return;
        registerMany(persistedAgents.length > 0 ? persistedAgents : getDefaultAgents());
      } catch {
        if (cancelled) return;
        registerMany(getDefaultAgents());
      }

      if (cancelled) return;

      // Phase 4: runtime listener
      accountListenersBootReady = true;
      if (cancelled) {
        accountListenersBootReady = false;
        return;
      }
      if (cancelled) {
        accountListenersBootReady = false;
        return;
      }
      syncAccountScopedListeners();
      stopOperator = startJarvisOperatorListener({
        appendMessage: async (msg) => messageRepo.create(msg as never),
      });
      stopRuntime = startRuntimeListener({
        getAgentById: (id) => useAgentStore.getState().agents[id] ?? null,
        getAgentBySlug: (slug) => {
          const agents = useAgentStore.getState().agents;
          const wanted = slug.trim().toLowerCase();
          return Object.values(agents).find((a) => a.slug.toLowerCase() === wanted) ?? null;
        },
        getAgentForChat: async (chatId) => {
          const agents = Object.values(useAgentStore.getState().agents) as Agent[];
          const chat = await chatRepo.getById(chatId as never);
          const chatAgentId = chat?.active_agent_ids?.[0];
          if (chatAgentId && useAgentStore.getState().agents[chatAgentId]) {
            return useAgentStore.getState().agents[chatAgentId];
          }
          return (
            findProtectedJarvisAgent(agents) ??
            agents.find((agent) => agent.slug !== 'jarvis') ??
            null
          );
        },
        getMessages: async (chatId) => {
          return messageRepo.listByChat(chatId as never);
        },
        appendMessage: async (msg) => {
          // messageRepo.create accepts the full message minus id+timestamps and
          // stamps them in for us.
          return messageRepo.create(msg as never);
        },
        updateMessage: async (id, patch) => {
          await messageRepo.update(id, patch);
        },
      });

      // Phase 5: background loops
      try {
        stopNotifications = startNotificationLoop();
      } catch (err) {
        console.error('Failed to start notification loop:', err);
      }
      try {
        stopTerminalScheduler = initTerminalScheduler();
      } catch (err) {
        console.error('Failed to start terminal scheduler:', err);
      }
      try {
        stopJarvisScheduleRunner = startJarvisScheduleRunner();
      } catch (err) {
        console.error('Failed to start Jarvis schedule runner:', err);
      }
      try {
        stopClockEngine = startClockEngine();
      } catch (err) {
        console.error('Failed to start clock engine:', err);
      }

      // Phase 6: Kokoro neural voice (background — default TTS, ~89 MB one-time)
      void import('@/features/voice/voiceRouter')
        .then(({ bootstrapKokoroVoiceOnLaunch }) => bootstrapKokoroVoiceOnLaunch())
        .catch((err) => console.warn('[boot] Kokoro voice bootstrap failed:', err));

      // Report accumulated errors
      if (errors.length > 0 && !cancelled) {
        toast.warning(
          `${errors.length} startup issue${errors.length > 1 ? 's' : ''}`,
          errors.slice(0, 3).join('; ') +
            (errors.length > 3 ? ` (+${errors.length - 3} more)` : ''),
        );
      }
    })();

    return () => {
      cancelled = true;
      releaseEnqueueCloudAuthority();
      accountListenersBootReady = false;
      accountTransitionRequest += 1;
      cloudAuthGeneration += 1;
      cloudPlanSyncGeneration += 1;
      accountRecoveryController?.abort();
      stopRuntime?.();
      stopAccountSubscription?.();
      stopPersistenceState?.();
      persistenceReadyReceipt = null;
      stopPersistenceCoordinator?.();
      const accountTeardown = stopAccountScopedListeners();
      accountScopeTeardownBarrier = Promise.allSettled([accountTransition, accountTeardown]).then(
        () => undefined,
      );
      stopOperator?.();
      stopNotifications?.();
      stopTerminalScheduler?.();
      stopJarvisScheduleRunner?.();
      stopClockEngine?.();
      void stopActiveCloudSyncLoop();
      stopCloudAuth?.();
    };
    // Run once - boot is one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return commandCenterBinding;
}

function KernelBridgeBootstrap() {
  const [ready, setReady] = React.useState(false);
  const [pluginManagement, setPluginManagement] = React.useState<
    PluginManagementCapability | undefined
  >(undefined);

  React.useEffect(() => {
    let disposed = false;
    let disposeBoundary: (() => void | Promise<void>) | undefined;
    let accountInvalidator: ((accountId: string) => void) | undefined;
    let disposeKernelRuntimeHost: (() => void) | undefined;
    let securityRuntime:
      | {
          bindKernelActions: import('@/lib/jarvis/approvalEngine').JarvisApprovalActionBinder;
          pluginManagement: PluginManagementCapability;
          invalidateAccount(accountId: string): void;
          invalidateAll(): void;
        }
      | undefined;
    const invalidateSecurityRuntime = () => {
      disposeKernelRuntimeHost?.();
      securityRuntime?.invalidateAll();
    };

    void import('@/lib/jarvis/kernelHost')
      .then(async ({ createUnavailableKernelHostRuntime, startJarvisKernelHost }) => {
        const session = await startJarvisKernelHost({
          createRuntime: async () => {
            // Browser preview may own its best-effort Web Lock, but it never
            // constructs credential or approval authority. Native registration
            // has already succeeded before this callback is invoked.
            if (!(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)) {
              return createUnavailableKernelHostRuntime();
            }

            const [
              { createJarvisSecurityRuntime },
              {
                createJarvisExistingCredentialAuthorization,
                createPluginCredentialAccountGrantRepository,
                createStrictPluginCredentialGrantStorage,
              },
              { selectPluginConnectionsForAccount, usePluginStore },
              { PLUGIN_CATALOG },
              { createJarvisPluginCapabilityProjection },
              { createJarvisMcpCapabilityProjection },
              { jarvisMcpServerManager },
              { createJarvisRepositories },
              { createJarvisCapabilitySnapshotProvider },
              { createJarvisEntitlementSnapshotProvider, fetchCloudAdminEntitlementSnapshot },
              { createJarvisActionCatalog, DEFAULT_JARVIS_ACTION_REGISTRATIONS },
              { getBuiltinAction },
              { resolveLocalDevelopmentEntitlementSnapshot },
            ] = await Promise.all([
              import('@/lib/jarvis/jarvisSecurityRuntime'),
              import('@/features/plugins/credentialAuthorization'),
              import('@/features/plugins/store'),
              import('@/features/plugins/catalog'),
              import('@/lib/jarvis/pluginCapabilityProducer'),
              import('@/lib/jarvis/mcpCapabilityProducer'),
              import('@/lib/mcp/serverManager'),
              import('@/lib/db/jarvisRepositories'),
              import('@/lib/jarvis/capabilitySnapshot'),
              import('@/lib/admin'),
              import('@/lib/jarvis/actions/catalog'),
              import('@/lib/actions/registry'),
              import('@/lib/entitlements'),
            ]);
            await openDb();
            if (disposed) return createUnavailableKernelHostRuntime();

            const randomUUID = () => crypto.randomUUID();
            const now = () => Date.now();
            const LOCAL_DEVELOPMENT_ENTITLEMENT_DECISION_FLOOR_MS = 2 * 60_000;
            const securityBootObservedAt = now();
            const bootId = `kernel-security-${randomUUID()}`;
            let localDevelopmentEntitlementCache:
              | Readonly<{
                  accountId: string;
                  email: string | null | undefined;
                  cloudEmail: string | null | undefined;
                  localUserId: string | null | undefined;
                  snapshot: ReturnType<typeof resolveLocalDevelopmentEntitlementSnapshot>;
                }>
              | undefined;
            const activeAccountId = () =>
              resolveAccountIdentity(useAuthStore.getState())?.accountId;
            const catalog = createJarvisActionCatalog(DEFAULT_JARVIS_ACTION_REGISTRATIONS);
            const entitlementSnapshots = createJarvisEntitlementSnapshotProvider({
              getActiveAccountId: activeAccountId,
              async loadForActiveAccount(accountId) {
                const auth = useAuthStore.getState();
                if (auth.cloudSession?.user_id.trim() === accountId) {
                  return await fetchCloudAdminEntitlementSnapshot(accountId);
                }
                if (resolveAccountIdentity(auth)?.accountId !== accountId) {
                  return { source: 'unavailable' as const, capabilities: [] };
                }
                const localIdentity = {
                  email: auth.email,
                  cloudEmail: auth.cloudSession?.email,
                  localUserId: auth.localUserId,
                };
                const localEntitlementObservedAt = now();
                if (
                  localDevelopmentEntitlementCache?.accountId === accountId &&
                  localDevelopmentEntitlementCache.email === localIdentity.email &&
                  localDevelopmentEntitlementCache.cloudEmail === localIdentity.cloudEmail &&
                  localDevelopmentEntitlementCache.localUserId === localIdentity.localUserId &&
                  typeof localDevelopmentEntitlementCache.snapshot.expiresAt === 'number' &&
                  localDevelopmentEntitlementCache.snapshot.expiresAt - localEntitlementObservedAt >
                    LOCAL_DEVELOPMENT_ENTITLEMENT_DECISION_FLOOR_MS
                ) {
                  return localDevelopmentEntitlementCache.snapshot;
                }
                const snapshot = resolveLocalDevelopmentEntitlementSnapshot(localIdentity, {
                  context: {
                    now: localEntitlementObservedAt,
                    production: import.meta.env.PROD,
                  },
                });
                localDevelopmentEntitlementCache =
                  snapshot.source !== 'unavailable' &&
                  typeof snapshot.expiresAt === 'number' &&
                  snapshot.expiresAt > localEntitlementObservedAt
                    ? Object.freeze({ accountId, ...localIdentity, snapshot })
                    : undefined;
                return snapshot;
              },
              now,
            });
            const capabilitySnapshots = createJarvisCapabilitySnapshotProvider({
              getActiveAccountId: activeAccountId,
              async resolveInputForActiveAccount(accountId) {
                const capturedAt = now();
                const pluginCapabilities = createJarvisPluginCapabilityProjection({
                  accountId,
                  capturedAt,
                  manifests: PLUGIN_CATALOG,
                  connections: selectPluginConnectionsForAccount(
                    usePluginStore.getState(),
                    accountId,
                  ),
                });
                const mcpCapabilities = createJarvisMcpCapabilityProjection({
                  accountId,
                  capturedAt,
                  statuses: jarvisMcpServerManager.discover(),
                });
                const tools = catalog
                  .listExposed()
                  .filter(
                    (registration) =>
                      registration.executor.kind === 'builtin' &&
                      getBuiltinAction(registration.executor.registryActionId) !== undefined,
                  )
                  .map((registration) => ({
                    id: registration.requiredCapabilities[0],
                    state: 'available' as const,
                    operations: ['execute'],
                    evidenceRef: `registered:${registration.id}:${registration.version}:${bootId}`,
                    lastVerifiedAt: securityBootObservedAt,
                  }));
                return {
                  capturedAt,
                  tools,
                  plugins: pluginCapabilities.refs,
                  mcps: mcpCapabilities.refs,
                  terminals: [],
                  agents: [],
                  entitlements: await entitlementSnapshots.getForAccount(accountId),
                  actionSchemas: catalog.listExposed(),
                };
              },
            });
            const credentialGrants = createPluginCredentialAccountGrantRepository({
              storage: createStrictPluginCredentialGrantStorage(window.localStorage),
            });
            const credentialAuthorization = createJarvisExistingCredentialAuthorization({
              grants: credentialGrants,
              getActiveAccountId: activeAccountId,
            });

            let kernelPluginArtifacts:
              | import('@/features/plugins/runtime').CanonicalPluginArtifactCapability
              | undefined;
            securityRuntime = createJarvisSecurityRuntime({
              repositories: createJarvisRepositories(db),
              catalog,
              capabilitySnapshots,
              entitlementSnapshots,
              credentialGrants,
              credentialAuthorization,
              pluginConnections: {
                upsertConnection: (connection) =>
                  usePluginStore.getState().upsertConnection(connection),
                removeConnection: (accountId, pluginId) =>
                  usePluginStore.getState().removeConnection(accountId, pluginId),
              },
              bindKernelPluginArtifacts(capability) {
                if (kernelPluginArtifacts) {
                  throw new Error('jarvis_plugin_artifact_authority_already_bound');
                }
                kernelPluginArtifacts = capability;
              },
              activeAccountId,
              executeRegisteredAction: async (dispatchInput) => {
                const { executeInstalledJarvisRegisteredAction } = await import('@/lib/ai/runtime');
                return executeInstalledJarvisRegisteredAction(dispatchInput);
              },
              bootId,
              randomUUID,
              now,
            });
            if (!kernelPluginArtifacts) {
              throw new Error('jarvis_plugin_artifact_authority_unavailable');
            }
            const { handleInstalledJarvisKernelClientRequest, installJarvisKernelRuntimeHost } =
              await import('@/lib/ai/runtime');
            disposeKernelRuntimeHost = await installJarvisKernelRuntimeHost({
              db,
              bindKernelActions: securityRuntime.bindKernelActions,
              pluginArtifacts: kernelPluginArtifacts,
              actionCatalog: catalog,
              capabilitySnapshots,
              randomUUID,
              now,
            });
            if (disposed) {
              disposeKernelRuntimeHost();
              securityRuntime.invalidateAll();
              return createUnavailableKernelHostRuntime();
            }
            window.addEventListener('pagehide', invalidateSecurityRuntime);
            if (!disposed) {
              React.startTransition(() => setPluginManagement(securityRuntime?.pluginManagement));
            }
            return Object.freeze({
              handleRequest: handleInstalledJarvisKernelClientRequest,
              invalidateAccount(accountId: string) {
                if (localDevelopmentEntitlementCache?.accountId === accountId) {
                  localDevelopmentEntitlementCache = undefined;
                }
                securityRuntime?.invalidateAccount(accountId);
              },
              dispose() {
                window.removeEventListener('pagehide', invalidateSecurityRuntime);
                localDevelopmentEntitlementCache = undefined;
                disposeKernelRuntimeHost?.();
                securityRuntime?.invalidateAll();
              },
            });
          },
        });
        if (disposed) {
          if (session.role === 'host') await session.dispose();
          return;
        }
        if (session.role === 'host') {
          accountInvalidator = session.invalidateAccount;
          invalidateActiveKernelAccount = accountInvalidator;
          disposeBoundary = session.dispose;
          return;
        }
        const { createJarvisKernelClient } = await import('@/lib/jarvis/kernelClient');
        const client = createJarvisKernelClient();
        if (disposed) {
          client.dispose();
          return;
        }
        disposeBoundary = client.dispose;
      })
      .catch(() => {
        /* Native/browser ownership remains unavailable and fail-closed. */
      })
      .finally(() => {
        if (!disposed) React.startTransition(() => setReady(true));
      });

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', invalidateSecurityRuntime);
      disposeKernelRuntimeHost?.();
      securityRuntime?.invalidateAll();
      if (accountInvalidator && invalidateActiveKernelAccount === accountInvalidator) {
        invalidateActiveKernelAccount = () => {};
      }
      void Promise.resolve(disposeBoundary?.()).catch(() => undefined);
    };
  }, []);

  return (
    <AuthGate>
      <PluginManagementCapabilityProvider value={pluginManagement}>
        {ready ? <WorkspaceRoot /> : null}
      </PluginManagementCapabilityProvider>
    </AuthGate>
  );
}

function useDesktopReopenLifecycle() {
  React.useEffect(() => {
    const refreshBranding = () => {
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('refresh_app_branding'))
        .catch(() => {
          /* Web preview or test runtime without Tauri invoke. */
        });
    };

    const notifyVisible = (reason: string) => {
      refreshBranding();
      window.requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent('jarvis:terminals:visible', {
            detail: { reason },
          }),
        );
      });
    };

    const onFocus = () => notifyVisible('window-focus');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') notifyVisible('visibility');
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // When the app is closed (hidden to tray) or torn down, stop any in-flight
    // speech so Jarvis does not keep talking in the background.
    const stopAllSpeech = () => {
      void flushWorkspacePersistence('before-hide');
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      void import('@/features/voice/speechSynthesis').then((m) => m.stopSpeech()).catch(() => {});
      void import('@/features/voice/TtsService').then((m) => m.TtsService.stop()).catch(() => {});
      handleVoiceModuleClosed();
      useUIStore.getState().setVoiceModalOpen(false);
    };
    window.addEventListener('pagehide', stopAllSpeech);

    let disposed = false;
    let unlistenReopen: (() => void) | null = null;
    let unlistenHide: (() => void) | null = null;
    let unlistenPersistNow: (() => void) | null = null;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen('jarvis:before-hide', () => stopAllSpeech()))
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenHide = unlisten;
      })
      .catch(() => {});
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ reason?: string }>('jarvis:persist-now', async (event) => {
          try {
            await flushWorkspacePersistenceAndAcknowledge(
              event.payload?.reason ?? 'desktop-persist',
              async () => {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('persistence_flush_complete');
              },
            );
          } catch {
            /* Desktop exit retains its native hard deadline if IPC is unavailable. */
          }
        }),
      )
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenPersistNow = unlisten;
      })
      .catch(() => {
        /* Web preview or test runtime without Tauri events. */
      });
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ reason?: string }>('jarvis:reopen', (event) => {
          notifyVisible(event.payload?.reason ?? 'desktop-reopen');
        }),
      )
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenReopen = unlisten;
      })
      .catch(() => {
        /* Web preview or test runtime without Tauri events. */
      });

    return () => {
      disposed = true;
      unlistenReopen?.();
      unlistenHide?.();
      unlistenPersistNow?.();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', stopAllSpeech);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}

/**
 * Wires up the global Cmd+K palette + every other hotkey across features.
 */
function GlobalHotkeysHost() {
  useGlobalHotkeys();

  // V2 — idle detection drives ambient takeover.
  useIdleDetection();

  // V2 — fullscreen chat toggle.
  const toggleChatFullscreen = useUIStore((s) => s.toggleChatFullscreen);
  useHotkey(
    HOTKEYS.TOGGLE_FULLSCREEN,
    (e) => {
      e.preventDefault();
      toggleChatFullscreen();
    },
    { whenInputs: true },
  );

  // V2 — manual ambient toggle (Mod+Shift+.).
  const setAmbientActive = useUIStore((s) => s.setAmbientActive);
  const ambientEnabled = useUIStore((s) => s.ambient);
  useHotkey(HOTKEYS.AMBIENT_TOGGLE, (e) => {
    e.preventDefault();
    if (!ambientEnabled) return;
    setAmbientActive(!useUIStore.getState().ambientActive);
  });

  // V2 — Schedule (Mod+Shift+S).
  const setRoute = useUIStore((s) => s.setRoute);
  useHotkey(HOTKEYS.SCHEDULE, (e) => {
    e.preventDefault();
    setRoute('schedule');
  });

  // V2 — Launcher (Mod+Shift+L).
  const setLauncherOpen = useUIStore((s) => s.setLauncherOpen);
  useHotkey(HOTKEYS.LAUNCHER, (e) => {
    e.preventDefault();
    setLauncherOpen(!useUIStore.getState().launcherOpen);
  });

  // V2 — Jarvis Assistant (Mod+J).
  const setAssistantOpen = useUIStore((s) => s.setAssistantOpen);
  useHotkey(HOTKEYS.ASSISTANT, (e) => {
    e.preventDefault();
    setAssistantOpen(!useUIStore.getState().assistantOpen);
  });
  useHotkey(
    HOTKEYS.JARVIS_BUBBLE,
    (e) => {
      e.preventDefault();
      if (useUIStore.getState().route === 'chat') {
        const next = !useAuthStore.getState().jarvisAutoApprove;
        useAuthStore.getState().setJarvisAutoApprove(next);
        toast.info(
          next ? 'Auto-approve on' : 'Auto-approve off',
          next
            ? 'Jarvis will run proposed actions without asking in this chat.'
            : 'Jarvis will show Approve cards before running actions.',
        );
        return;
      }
      setAssistantOpen(true);
    },
    { whenInputs: true },
  );

  // V3 — Actions palette (Mod+Shift+A). Sister to Mod+K (general
  // command palette) and Mod+Shift+L (launcher tiles); focused on
  // running registered actions + custom user-authored tools.
  const toggleActionsPalette = useUIStore((s) => s.toggleActionsPalette);
  useHotkey(HOTKEYS.ACTIONS, (e) => {
    e.preventDefault();
    toggleActionsPalette();
  });

  // V2 — per-link launcher hotkeys (e.g. Mod+Shift+1 jumps straight to YouTube).
  useLinkHotkeys();

  return null;
}

/**
 * Launcher dialog mount, listens to ui.launcherOpen.
 */
function LauncherDialogHost() {
  const open = useUIStore((s) => s.launcherOpen);
  const setOpen = useUIStore((s) => s.setLauncherOpen);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <LauncherDialog open={open} onOpenChange={setOpen} />
    </React.Suspense>
  );
}

/**
 * Jarvis Assistant mount, listens to ui.assistantOpen.
 *
 * The bar is the natural-language command surface (Mod+J). It runs a
 * deterministic local parser — no remote AI calls.
 */
function AssistantBarHost() {
  const open = useUIStore((s) => s.assistantOpen);
  const setOpen = useUIStore((s) => s.setAssistantOpen);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <AssistantBar open={open} onOpenChange={setOpen} />
    </React.Suspense>
  );
}

function CommandPaletteHost() {
  const open = useUIStore((s) => s.paletteOpen);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <CommandPalette />
    </React.Suspense>
  );
}

function SettingsModalHost() {
  const open = useUIStore((s) => s.settingsOpen);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <SettingsModal initialTab={getLastSettingsTab()} />
    </React.Suspense>
  );
}

function VoiceModuleLifecycle() {
  const open = useUIStore((s) => s.voiceModalOpen);
  React.useEffect(() => {
    syncVoiceModuleOpenState(open);
  }, [open]);
  return null;
}

function VoiceModalHost() {
  const open = useUIStore((s) => s.voiceModalOpen);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <VoiceModal />
    </React.Suspense>
  );
}

function ActionsPaletteHost() {
  const open = useUIStore((s) => s.actionsPaletteOpen);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <ActionsPalette />
    </React.Suspense>
  );
}

function ThemeHost() {
  const theme = useUIStore((state) => state.theme);

  React.useEffect(() => {
    applyThemeToDocument(theme);
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyThemeToDocument('system');
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [theme]);

  return null;
}

function KernelSmokeReconstructedLiveEvidenceHost({
  binding,
}: {
  binding: JarvisCommandCenterBinding | undefined;
}) {
  const [nodes, setNodes] = React.useState<readonly JarvisLiveSystemNode[]>([]);

  React.useEffect(() => {
    if (!KERNEL_SMOKE_ENABLED || !binding) {
      setNodes([]);
      return;
    }
    let disposed = false;
    let refreshing = false;
    const accountId = binding.hostPort.accountId;
    const refresh = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        const runs = await jarvisRunRepo.listByAccount(accountId, { limit: 500 });
        const snapshots = await Promise.all(
          runs.map((run) => binding.dataPort.getLiveEvidenceSnapshot({ accountId, runId: run.id })),
        );
        if (disposed) return;
        setNodes(
          snapshots.flatMap((snapshot) =>
            snapshot?.accountId === accountId ? snapshot.nodes : [],
          ),
        );
      } catch {
        if (!disposed) setNodes([]);
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 250);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [binding]);

  return (
    <>
      {nodes.map((node) => (
        <output
          hidden
          key={`${node.runId}:${node.id}:${node.evidenceRef}`}
          data-sik-evidence="live.reconstructed-node"
          data-live-node-state={node.state}
          data-live-proof-ref={node.evidenceRef}
        />
      ))}
    </>
  );
}

/**
 * Inner shell - rendered after AuthGate has confirmed local user + seeding.
 */
function WorkspaceRoot() {
  const commandCenterBinding = useBoot();
  useBridgeLifecycle();
  useDesktopReopenLifecycle();

  React.useEffect(() => startWorkspaceAnalyticsClock(), []);

  // Wire outbound-call trigger so any feature can call `fireOutboundCall(...)`.
  // Default categories (manual + error) are toggled in Settings → Phone & Voice.
  React.useEffect(() => {
    const stop = startOutboundTrigger({
      onResult: (ok, info) => {
        if (ok) {
          toast.info('Outbound call queued', `Reason: ${info.reason}`);
        } else if (
          info.error &&
          info.error !== 'cooldown' &&
          info.error !== 'cloud_not_configured'
        ) {
          // Quiet failures we don't want to spam the user about
          // (cooldown is normal during a crash burst; cloud-not-configured
          // is the user's setup problem already surfaced in Settings).
          console.warn('[outbound]', info);
        }
      },
    });
    return stop;
  }, []);

  // Listen for the jarvis:new-chat event to spawn a new chat
  React.useEffect(() => {
    const handleNewChat = async () => {
      try {
        const chatId = await ensureActiveChat({ forceNew: true });
        if (!chatId) {
          toast.warning('Still loading', 'Workspace is initializing — try again in a sec.');
        }
      } catch (err) {
        toast.error('Could not create chat', err instanceof Error ? err.message : 'Try again.');
      }
    };

    const handleBranch = async (event: Event) => {
      const detail = (event as CustomEvent<{ messageId: string; chatId: string }>).detail;
      if (!detail?.messageId || !detail?.chatId) return;
      try {
        await branchChatFromMessage({
          chatId: detail.chatId as ChatId,
          messageId: detail.messageId as MessageId,
        });
        toast.success('Branched', 'Opened a new chat from that message — continue from here.');
      } catch (err) {
        toast.error(
          'Branch failed',
          err instanceof Error ? err.message : 'Could not branch from this message.',
        );
      }
    };

    window.addEventListener('jarvis:new-chat', handleNewChat);
    window.addEventListener('jarvis:branch', handleBranch);
    return () => {
      window.removeEventListener('jarvis:new-chat', handleNewChat);
      window.removeEventListener('jarvis:branch', handleBranch);
    };
  }, []);

  return (
    <JarvisCommandCenterProvider value={commandCenterBinding}>
      {KERNEL_SMOKE_ENABLED ? (
        <KernelSmokeReconstructedLiveEvidenceHost binding={commandCenterBinding} />
      ) : null}
      <GlobalHotkeysHost />
      <AppShell>
        <ActiveCanvas />
      </AppShell>

      {/* Modal layer — mount only while open to avoid idle store subscriptions */}
      <CommandPaletteHost />
      <SettingsModalHost />
      <VoiceModuleLifecycle />
      <VoiceModalHost />
      <WakeWordHost />
      <React.Suspense fallback={null}>
        <CallModal />
      </React.Suspense>
      <LauncherDialogHost />
      <AssistantBarHost />
      <React.Suspense fallback={null}>
        <WhatsNewHost />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <NewsHost />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <ProductTutorialHost />
      </React.Suspense>
      <UpdateWarningHost />

      {/* Visual ambient effects removed — clean UI */}

      {/* V3 — confetti + serif gradient toast on success milestones. */}
      <React.Suspense fallback={null}>
        <CelebrationHost />
      </React.Suspense>

      {/* Provider key save success burst. */}
      <ApiKeySaveBurst />

      {/* V2 — idle takeover. Self-renders only when ambientActive=true. */}
      <React.Suspense fallback={null}>
        <AmbientHome />
      </React.Suspense>
      <AmbientAudioHost />

      {/* Pixel Pet — video-driven atlas animations + mini-panel on click. */}
      <React.Suspense fallback={null}>
        <PetHost />
      </React.Suspense>

      {/* V3 — 20-20-20 eye-break overlay. Self-renders only while
          wellnessActive=true (wellness.eyeBreak action / assistant). */}
      <WellnessBreak />

      {/* V3 — actions palette (Mod+Shift+A). Direct user invocation of
          built-in actions and saved custom tools. Sibling to the
          AI-proposed approval cards rendered inline in chat bubbles. */}
      <ActionsPaletteHost />

      <GlobalSttHost />

      {/* Themed desktop file / folder explorer (Context, Files, pickers). */}
      <FileExplorerHost />

      {/* Toast outlet */}
      <JarvisContextMenu />
      <Toaster />
    </JarvisCommandCenterProvider>
  );
}

/**
 * App root: AuthGate decides whether to show Onboarding or the workspace.
 * Onboarding flow is its own component owned by A8.
 *
 * Two safety wrappers sit around AuthGate:
 *
 *   - <ErrorBoundary>: catches any uncaught render error and shows a
 *     recoverable error card instead of the React tree blanking out.
 *     Without it, a crash inside any lazy chunk or boot effect would
 *     leave the user staring at a dark window.
 *
 *   - <DevConsoleHost>: installs the patchers (console / fetch /
 *     invoke / dispatch / window-error) that pump events into the
 *     in-app DevConsole panel, plus the Mod+Shift+D and F12 hotkeys
 *     to summon it. Mounted at the root so it captures onboarding-
 *     stage logs too.
 */
export function App() {
  const view = new URLSearchParams(window.location.search).get('view');
  const auxiliaryView = view === 'dictation' || view === 'pet-overlay' || view === 'pet-mini-panel';
  const cloudBootQuarantineStarted = React.useRef(false);
  const [cloudBootQuarantined, setCloudBootQuarantined] = React.useState(false);

  React.useLayoutEffect(() => {
    if (auxiliaryView || cloudBootQuarantineStarted.current) return;
    cloudBootQuarantineStarted.current = true;
    // Persisted cloud identity and billing state are recovery hints, not
    // authority. Hide them before AuthGate or any boot listener can observe
    // the first main-window render; Supabase may restore them after verification.
    applyCloudSession(null);
    React.startTransition(() => setCloudBootQuarantined(true));
  }, [auxiliaryView]);

  // Commit the fail-closed store state before mounting any child that can
  // subscribe to account identity or plan entitlements.
  if (!auxiliaryView && !cloudBootQuarantined) return null;

  if (view === 'dictation') {
    return (
      <ErrorBoundary>
        <ThemeHost />
        <GlobalDictationOverlay />
      </ErrorBoundary>
    );
  }

  if (view === 'pet-overlay') {
    const PetOverlayWindow = React.lazy(() =>
      import('@/features/pets/PetOverlayWindow').then((m) => ({ default: m.PetOverlayWindow })),
    );
    return (
      <ErrorBoundary>
        <React.Suspense fallback={null}>
          <PetOverlayWindow />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'pet-mini-panel') {
    const PetMiniPanelWindow = React.lazy(() =>
      import('@/features/pets/PetMiniPanelWindow').then((m) => ({ default: m.PetMiniPanelWindow })),
    );
    return (
      <ErrorBoundary>
        <ThemeHost />
        <React.Suspense fallback={null}>
          <PetMiniPanelWindow />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeHost />
      {KERNEL_SMOKE_ENABLED ? <KernelSmokeBindingHost /> : null}
      <KernelBridgeBootstrap />
      <TerminalCliRuntimeHost />
      <DevConsoleHost />
    </ErrorBoundary>
  );
}

export default App;
