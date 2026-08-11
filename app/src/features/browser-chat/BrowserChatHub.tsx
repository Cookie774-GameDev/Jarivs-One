import * as React from 'react';
import { liveQuery } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  Bot,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  FolderKey,
  Globe2,
  KeyRound,
  LockKeyhole,
  MonitorUp,
  Pencil,
  Pin,
  PinOff,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { ensureActiveChat } from '@/features/chat/chatLifecycle';
import { formatContextTreeForPrompt, loadSelectedContextMap } from '@/features/context';
import { selectPluginConnectionsForAccount, usePluginStore } from '@/features/plugins/store';
import { taskbarUsageStore } from '@/features/taskbar-usage/taskbarUsageStore';
import { chatRepo, db, type JarvisDexie } from '@/lib/db';
import type { Chat } from '@/types/chat';
import type { ChatId } from '@/types/common';
import { getStoredProjectRoot, basename } from '@/features/files/projectFiles';
import {
  resolveBrowserChatCloudUrl,
  resolveBrowserChatMcpUrl,
  setBridgeWorkspaceGrant,
  browserChatRelayStatusStore,
  type BrowserChatRelayStatus,
} from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { BrowserProviderSurface } from './BrowserProviderSurface';
import type { ProviderSurfaceNavigation } from './providerSurface';
import { migrateLegacyBrowserChatPreferences, useBrowserChatStore } from './browserChatStore';
import { BROWSER_CHAT_PROVIDERS, browserChatProvider } from './providerRegistry';
import { browserChatSurface } from './providerSurface';
import { buildBrowserAgentPrompt } from './browserAgentPrompt';
import {
  CHATGPT_APPS_URL,
  McpConnectionPreflightError,
  preflightVibeSpaceMcp,
} from './mcpConnection';
import {
  browserChatWorkspaceGrantStore,
  grantBrowserChatWorkspace,
  revokeBrowserChatWorkspace,
  updateBrowserChatWorkspacePermissionProfile,
} from './workspaceGrant';
import {
  createBrowserChatBindingRepository,
  type BrowserChatBindingUpdateInput,
  type BrowserChatScope,
} from './browserChatRepository';
import { importChatGptExport } from './chatGptExport';
import type { BrowserChatBindingRow, Project } from '@/lib/db/schema';
import {
  createBrowserChatPermissionProfileRepository,
  type BrowserChatPermissionProfileScope,
} from './permissionProfileRepository';
import {
  type BrowserChatCapabilityId,
  type BrowserChatPermissionProfile,
} from './permissionRegistry';
import { BrowserChatPermissionPanel } from './BrowserChatPermissionPanel';
import { browserChatToolActivityStore } from './browserChatToolActivity';
import {
  deriveBrowserChatStatusModel,
  type BrowserChatMcpSetupState,
} from './browserChatStatusModel';

const BROWSER_CHAT_EXECUTABLE_CAPABILITIES = new Set<BrowserChatCapabilityId>([
  'files.list',
  'files.read',
]);

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

const stagedFilesByChat = new Map<string, File[]>();

export function browserChatMcpStatusLabel(
  relayStatus: BrowserChatRelayStatus,
  signedIn: boolean,
  setupState: BrowserChatMcpSetupState,
): string {
  if (relayStatus === 'connected') return 'Desktop connected';
  if (relayStatus === 'connecting') return 'Connecting desktop relay';
  if (relayStatus === 'reconnecting') return 'Reconnecting desktop relay';
  if (relayStatus === 'error') return 'Connection error';
  if (!signedIn) return 'VibeSpace sign-in required';
  if (setupState === 'checking') return 'Checking secure connection';
  if (setupState === 'opening') return 'Opening ChatGPT Apps';
  if (setupState === 'waiting') return 'Waiting for owner approval';
  return 'Setup required';
}

function usageText(value: number | null, limit: number | null, unit: string | null): string {
  if (value === null || limit === null || !unit) {
    return 'No VibeSpace OpenAI API usage snapshot.';
  }
  return `${value.toLocaleString()} of ${limit.toLocaleString()} ${unit}`;
}

type BrowserChatHubProps = {
  readonly chatId?: string | null;
  readonly database?: JarvisDexie;
  readonly updateChat?: (id: ChatId, patch: Partial<Chat>) => Promise<Chat>;
  readonly bindingScope?: BrowserChatScope;
  readonly initialSessions?: ReadonlyArray<{
    readonly binding: BrowserChatBindingRow;
    readonly chat: Chat;
  }>;
  readonly initialProjects?: ReadonlyArray<Project>;
};

export function BrowserChatHub({
  chatId,
  database = db,
  updateChat = (id, patch) => chatRepo.update(id, patch),
  bindingScope,
  initialSessions,
  initialProjects,
}: BrowserChatHubProps) {
  const providerId = useBrowserChatStore(
    (state) => state.chatPreferences[chatId ?? '']?.providerId ?? state.providerId,
  );
  const setProvider = useBrowserChatStore((state) => state.setProvider);
  const setEngine = useBrowserChatStore((state) => state.setEngine);
  const legacyChatPreferences = useBrowserChatStore((state) => state.chatPreferences);
  const runtime = useBrowserChatStore((state) => state.providerRuntime[providerId]);
  const provider = browserChatProvider(providerId);
  const pageStatus = runtime?.pageStatus ?? provider.pageStatus;
  const providerBridgeStatus = runtime?.toolBridgeStatus ?? provider.toolBridgeStatus;
  const workspaceId = useAuthStore((state) => state.workspaceId);
  const projectId = useAuthStore((state) => state.projectId);
  const cloudAccountId = useAuthStore((state) => state.cloudSession?.user_id ?? '');
  const cloudAccountLabel = useAuthStore(
    (state) => state.cloudSession?.email ?? state.cloudSession?.user_id ?? '',
  );
  const authenticatedAccountId = useAuthStore(
    (state) => state.cloudSession?.user_id ?? state.localUserId ?? '',
  );
  const accountId = bindingScope?.accountId ?? authenticatedAccountId;
  const bindingWorkspaceId = bindingScope?.workspaceId ?? (workspaceId ? String(workspaceId) : '');
  const workspaceGrant = React.useSyncExternalStore(
    browserChatWorkspaceGrantStore.subscribe,
    browserChatWorkspaceGrantStore.getSnapshot,
    () => null,
  );
  const projectRoot = getStoredProjectRoot(projectId);
  const activeWorkspaceGrant =
    workspaceGrant?.accountId === cloudAccountId && workspaceGrant.projectId === projectId
      ? workspaceGrant
      : null;
  const relayStatus = React.useSyncExternalStore(
    browserChatRelayStatusStore.subscribe,
    browserChatRelayStatusStore.getSnapshot,
    () => 'disabled' as const,
  );
  const toolActivity = React.useSyncExternalStore(
    browserChatToolActivityStore.subscribe,
    browserChatToolActivityStore.getSnapshot,
    browserChatToolActivityStore.getSnapshot,
  );
  const accountToolActivity = toolActivity.accountId === cloudAccountId ? toolActivity : null;
  const mcpUrl = resolveBrowserChatMcpUrl(
    resolveBrowserChatCloudUrl(import.meta.env as Record<string, string | undefined>),
  );
  const bridgeStatus =
    relayStatus === 'connected' ||
    relayStatus === 'connecting' ||
    relayStatus === 'reconnecting' ||
    relayStatus === 'error'
      ? relayStatus
      : providerBridgeStatus;
  const setActiveChat = useUIStore((state) => state.setActiveChat);
  const bindingRepository = React.useMemo(
    () => createBrowserChatBindingRepository(database),
    [database],
  );
  const permissionProfileRepository = React.useMemo(
    () => createBrowserChatPermissionProfileRepository(database),
    [database],
  );
  const permissionScope = React.useMemo<BrowserChatPermissionProfileScope | null>(
    () =>
      cloudAccountId && bindingWorkspaceId && projectId
        ? {
            accountId: cloudAccountId,
            workspaceId: bindingWorkspaceId,
            projectId: String(projectId),
          }
        : null,
    [bindingWorkspaceId, cloudAccountId, projectId],
  );
  const [permissionProfile, setPermissionProfile] =
    React.useState<BrowserChatPermissionProfile | null>(null);
  const [permissionProfileSaving, setPermissionProfileSaving] = React.useState(false);
  const [sessions, setSessions] = React.useState<
    Array<{ readonly binding: BrowserChatBindingRow; readonly chat: Chat }>
  >(() => [...(initialSessions ?? [])]);
  React.useEffect(() => {
    if (initialSessions || !accountId || !bindingWorkspaceId) return;
    void migrateLegacyBrowserChatPreferences({
      database,
      accountId,
      workspaceId: bindingWorkspaceId,
      preferences: legacyChatPreferences,
    }).catch((cause) => {
      toast.error(
        'Browser Chat migration incomplete',
        cause instanceof Error
          ? cause.message
          : 'Some legacy Browser Chat preferences could not be migrated.',
      );
    });
  }, [accountId, bindingWorkspaceId, database, initialSessions, legacyChatPreferences]);
  React.useEffect(() => {
    if (initialSessions) {
      setSessions([...initialSessions]);
      return;
    }
    if (!accountId || !bindingWorkspaceId) {
      setSessions([]);
      return;
    }
    const subscription = liveQuery(async () => {
      const bindings = await bindingRepository.list({
        accountId,
        workspaceId: bindingWorkspaceId,
      });
      const chats = await database.chats.bulkGet(
        bindings.map((binding) => binding.chatId as ChatId),
      );
      return bindings.flatMap((binding, index) => {
        const chat = chats[index];
        return chat ? [{ binding, chat }] : [];
      });
    }).subscribe({
      next: setSessions,
      error: (cause) => {
        setSessions([]);
        toast.error(
          'Browser Chat sessions unavailable',
          cause instanceof Error ? cause.message : 'The local session list could not be loaded.',
        );
      },
    });
    return () => subscription.unsubscribe();
  }, [accountId, bindingWorkspaceId, bindingRepository, database, initialSessions]);
  const liveProjects = useLiveQuery(
    async (): Promise<Project[]> =>
      workspaceId
        ? await database.projects.where('workspace_id').equals(workspaceId).sortBy('name')
        : [],
    [database, workspaceId],
    [] as Project[],
  );
  const projects = initialProjects ?? liveProjects;
  const importedSnapshotCount = useLiveQuery(
    async () => {
      if (!accountId || !bindingWorkspaceId) return 0;
      return database.browser_chat_snapshots
        .where('[accountId+workspaceId]')
        .equals([accountId, bindingWorkspaceId])
        .count();
    },
    [accountId, bindingWorkspaceId, database],
    0,
  );
  const connections = usePluginStore((state) =>
    selectPluginConnectionsForAccount(state, accountId),
  );
  const enabledConnections = React.useMemo(
    () =>
      Object.values(connections)
        .filter((connection) => connection.enabled)
        .sort((left, right) => left.pluginId.localeCompare(right.pluginId)),
    [connections],
  );
  const usageState = React.useSyncExternalStore(
    taskbarUsageStore.subscribe,
    taskbarUsageStore.getSnapshot,
    taskbarUsageStore.getSnapshot,
  );
  const openAiUsage = usageState.payload.snapshots.find(
    (snapshot) =>
      snapshot.providerId === 'openai' ||
      snapshot.providerFamilyId === 'openai' ||
      snapshot.displayName.toLowerCase() === 'openai',
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const exportInputRef = React.useRef<HTMLInputElement>(null);
  const connectionAbortRef = React.useRef<AbortController | null>(null);
  const exportAbortRef = React.useRef<AbortController | null>(null);
  const [mcpSetupState, setMcpSetupState] = React.useState<BrowserChatMcpSetupState>('idle');
  const [mcpSetupError, setMcpSetupError] = React.useState('');
  const [importingExport, setImportingExport] = React.useState(false);
  const [projectGrantRevoked, setProjectGrantRevoked] = React.useState(false);
  const [stagedFiles, setStagedFiles] = React.useState<File[]>(() =>
    chatId ? (stagedFilesByChat.get(chatId) ?? []) : [],
  );

  React.useEffect(
    () => () => {
      exportAbortRef.current?.abort();
    },
    [],
  );

  const importOfficialExport = async (file: File | undefined) => {
    if (!file || !accountId || !bindingWorkspaceId || importingExport) return;
    const controller = new AbortController();
    exportAbortRef.current?.abort();
    exportAbortRef.current = controller;
    setImportingExport(true);
    try {
      const result = await importChatGptExport({
        database,
        accountId,
        workspaceId: bindingWorkspaceId,
        fileName: file.name,
        archive: await file.arrayBuffer(),
        signal: controller.signal,
      });
      toast.success(
        result.reusedImport ? 'Export already imported' : 'ChatGPT export imported',
        result.reusedImport
          ? `${result.unchanged} existing snapshot${result.unchanged === 1 ? '' : 's'} left unchanged.`
          : `${result.added} added · ${result.updated} updated · ${result.unchanged} unchanged. View snapshots in History.`,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(
          'Export import failed',
          error instanceof Error ? error.message : 'The archive was rejected safely.',
        );
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      setImportingExport(false);
    }
  };
  const agents = useLiveQuery(() => database.agents.toArray(), [database], []);
  const project = useLiveQuery(
    async (): Promise<Project | undefined> =>
      projectId ? await database.projects.get(projectId) : undefined,
    [database, projectId],
    undefined as Project | undefined,
  );
  const [selectedAgentId, setSelectedAgentId] = React.useState('');
  const [contextRevision, setContextRevision] = React.useState(0);
  const [renamingBindingId, setRenamingBindingId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const contextMap = React.useMemo(
    () => loadSelectedContextMap(projectId),
    [contextRevision, projectId],
  );
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const agentPrompt = React.useMemo(
    () =>
      selectedAgent
        ? buildBrowserAgentPrompt({
            agent: selectedAgent,
            projectName: project?.name,
            projectContext: project?.no_context_mode ? '' : project?.system_prompt_context,
            contextMap,
            formattedContextMap: contextMap ? formatContextTreeForPrompt(contextMap.tree) : '',
          })
        : '',
    [contextMap, project, selectedAgent],
  );

  React.useEffect(() => {
    if (!selectedAgentId && agents[0]) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  React.useEffect(() => {
    const refreshContext = () => setContextRevision((revision) => revision + 1);
    window.addEventListener('jarvis:context-tree-updated', refreshContext);
    return () => window.removeEventListener('jarvis:context-tree-updated', refreshContext);
  }, []);

  React.useEffect(() => {
    setStagedFiles(chatId ? (stagedFilesByChat.get(chatId) ?? []) : []);
  }, [chatId]);

  React.useEffect(() => {
    setProjectGrantRevoked(false);
  }, [cloudAccountId, projectId]);

  React.useEffect(
    () => () => {
      connectionAbortRef.current?.abort();
    },
    [],
  );

  React.useEffect(() => {
    if (
      workspaceGrant &&
      (workspaceGrant.accountId !== cloudAccountId || workspaceGrant.projectId !== projectId)
    ) {
      revokeBrowserChatWorkspace();
      setBridgeWorkspaceGrant();
    }
  }, [cloudAccountId, projectId, workspaceGrant]);

  React.useEffect(() => {
    let active = true;
    if (!permissionScope) {
      setPermissionProfile(null);
      return () => {
        active = false;
      };
    }
    setPermissionProfile(null);
    void permissionProfileRepository
      .get(permissionScope)
      .then((stored) => {
        if (!active) return;
        setPermissionProfile(
          stored ?? {
            version: 1,
            accountId: permissionScope.accountId,
            workspaceId: permissionScope.projectId,
            plan: 'read',
            overrides: {},
            updatedAt: Date.now(),
          },
        );
      })
      .catch(() => {
        if (active) setPermissionProfile(null);
      });
    return () => {
      active = false;
    };
  }, [permissionProfileRepository, permissionScope]);

  const applyProfileToActiveGrant = React.useCallback(
    (profile: BrowserChatPermissionProfile) => {
      if (!activeWorkspaceGrant) return;
      const grant = updateBrowserChatWorkspacePermissionProfile(profile);
      setBridgeWorkspaceGrant({
        id: grant.id,
        accountId: grant.accountId,
        projectId: grant.projectId,
        root: grant.canonicalRoot,
        displayName: grant.displayName,
        permissionProfile: grant.permissionProfile,
      });
      setProjectGrantRevoked(false);
    },
    [activeWorkspaceGrant],
  );

  React.useEffect(() => {
    if (!permissionProfile || !activeWorkspaceGrant) return;
    applyProfileToActiveGrant(permissionProfile);
  }, [activeWorkspaceGrant, applyProfileToActiveGrant, permissionProfile]);

  const changePermissionProfile = (next: BrowserChatPermissionProfile) => {
    if (!permissionScope || permissionProfileSaving) return;
    const previous = permissionProfile;
    setPermissionProfile(next);
    applyProfileToActiveGrant(next);
    setPermissionProfileSaving(true);
    void permissionProfileRepository
      .save(permissionScope, next)
      .then(() => {
        toast.success(
          'Permission plan updated',
          'The desktop relay catalog now reflects this VibeSpace permission plan.',
        );
      })
      .catch((cause) => {
        if (previous) {
          setPermissionProfile(previous);
          applyProfileToActiveGrant(previous);
        }
        toast.error(
          'Permission plan was not saved',
          cause instanceof Error ? cause.message : 'The local permission profile is invalid.',
        );
      })
      .finally(() => setPermissionProfileSaving(false));
  };

  const stageFiles = (files: FileList | null) => {
    if (!chatId || !files) return;
    const next = [
      ...(stagedFilesByChat.get(chatId) ?? []),
      ...Array.from(files).filter(
        (file) =>
          !(stagedFilesByChat.get(chatId) ?? []).some(
            (current) =>
              current.name === file.name &&
              current.size === file.size &&
              current.lastModified === file.lastModified,
          ),
      ),
    ].slice(0, 24);
    stagedFilesByChat.set(chatId, next);
    setStagedFiles(next);
  };

  const createBrowserChat = async () => {
    const nextId = await ensureActiveChat({
      forceNew: true,
      title: `${provider.label} browser chat`,
    });
    if (!nextId || !accountId || !bindingWorkspaceId) return;
    await bindingRepository.create({
      accountId,
      workspaceId: bindingWorkspaceId,
      projectId: projectId ? String(projectId) : undefined,
      chatId: String(nextId),
      provider: provider.id,
      providerProfileKey: provider.profileKey,
      localTitle: `${provider.label} browser chat`,
    });
    setEngine('browser', nextId);
    setProvider(provider.id, nextId);
  };

  const updateBrowserSession = async (
    binding: BrowserChatBindingRow,
    patch: BrowserChatBindingUpdateInput,
    chatPatch?: Partial<Chat>,
  ) => {
    if (!accountId || !bindingWorkspaceId) return;
    try {
      const updatedBinding = await bindingRepository.update(
        { accountId, workspaceId: bindingWorkspaceId },
        binding.id,
        patch,
      );
      const updatedChat = chatPatch
        ? await updateChat(binding.chatId as ChatId, chatPatch)
        : undefined;
      setSessions((current) =>
        current.map((session) =>
          session.binding.id === binding.id
            ? { binding: updatedBinding, chat: updatedChat ?? session.chat }
            : session,
        ),
      );
    } catch (cause) {
      toast.error(
        'Browser Chat update failed',
        cause instanceof Error ? cause.message : 'The Browser Chat could not be updated.',
      );
    }
  };

  const openBrowserSession = (binding: BrowserChatBindingRow) => {
    setProvider(binding.provider, binding.chatId);
    setEngine('browser', binding.chatId);
    setActiveChat(binding.chatId as ChatId);
  };

  const saveBrowserSessionTitle = async (binding: BrowserChatBindingRow) => {
    const title = renameDraft.trim();
    if (!title) return;
    await updateBrowserSession(binding, { localTitle: title }, { title });
    setRenamingBindingId(null);
    setRenameDraft('');
  };

  const removeBrowserSession = async (binding: BrowserChatBindingRow) => {
    if (!accountId || !bindingWorkspaceId) return;
    if (
      !window.confirm(
        `Remove the local Browser Chat binding for "${binding.localTitle}"? The provider conversation will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await bindingRepository.remove({ accountId, workspaceId: bindingWorkspaceId }, binding.id);
      setSessions((current) => current.filter((session) => session.binding.id !== binding.id));
      setEngine('native', binding.chatId);
    } catch (cause) {
      toast.error(
        'Browser Chat removal failed',
        cause instanceof Error ? cause.message : 'The local binding could not be removed.',
      );
    }
  };

  const captureProviderNavigation = (navigation: ProviderSurfaceNavigation) => {
    const activeBinding = sessions.find(
      (session) =>
        session.binding.chatId === chatId && session.binding.provider === navigation.providerId,
    )?.binding;
    if (!activeBinding) return;
    const commonPatch = {
      lastOpenedAt: navigation.timestamp,
      providerProjectKey: navigation.providerProjectKey,
    };
    if (navigation.kind === 'conversation' && navigation.providerConversationKey) {
      void updateBrowserSession(activeBinding, {
        ...commonPatch,
        providerConversationKey: navigation.providerConversationKey,
        resumeUrl: navigation.url,
        bindingState: 'bound',
      });
    } else {
      void updateBrowserSession(activeBinding, commonPatch);
    }
  };

  const approveProjectRead = () => {
    if (!cloudAccountId || !projectId || !projectRoot) {
      toast.error(
        'Project access is unavailable',
        'Select a signed-in account and a project folder before enabling the local relay.',
      );
      return;
    }
    try {
      const grant = grantBrowserChatWorkspace({
        accountId: cloudAccountId,
        projectId,
        root: projectRoot,
        displayName: basename(projectRoot),
        ...(permissionProfile ? { permissionProfile } : {}),
      });
      setBridgeWorkspaceGrant({
        id: grant.id,
        accountId: grant.accountId,
        projectId: grant.projectId,
        root: grant.canonicalRoot,
        displayName: grant.displayName,
        permissionProfile: grant.permissionProfile,
      });
      setProjectGrantRevoked(false);
      toast.success(
        'Project access approved',
        'The local relay can use only capabilities enabled by the selected plan and available in this build.',
      );
    } catch (cause) {
      toast.error(
        'Project access was denied',
        cause instanceof Error ? cause.message : 'This project cannot be granted.',
      );
    }
  };

  const revokeProjectRead = () => {
    revokeBrowserChatWorkspace();
    setBridgeWorkspaceGrant();
    setProjectGrantRevoked(true);
    toast.success('Project access revoked', 'The local relay no longer exposes project tools.');
  };

  const connectVibeSpaceMcp = async () => {
    if (!mcpUrl) {
      toast.error(
        'VibeSpace MCP is not configured',
        'This build does not have a verified public VibeSpace MCP endpoint.',
      );
      return;
    }
    connectionAbortRef.current?.abort();
    const controller = new AbortController();
    connectionAbortRef.current = controller;
    setMcpSetupError('');
    setMcpSetupState('checking');
    try {
      const preflight = await preflightVibeSpaceMcp(mcpUrl, {
        signal: controller.signal,
      });
      let endpointCopied = true;
      try {
        await navigator.clipboard.writeText(preflight.mcpUrl);
      } catch {
        endpointCopied = false;
      }
      if (controller.signal.aborted) return;
      setMcpSetupState('opening');
      try {
        await browserChatSurface.openChatGptPlugins();
      } catch {
        throw new McpConnectionPreflightError(
          'ChatGPT Apps could not be opened. Use the visible endpoint to continue.',
        );
      }
      if (controller.signal.aborted) return;
      setMcpSetupState('waiting');
      toast.success(
        'VibeSpace MCP setup opened',
        endpointCopied
          ? 'The endpoint is copied. Add VibeSpace MCP and complete the one-time OAuth approval.'
          : 'Clipboard access was unavailable. Copy the visible endpoint, then complete the one-time OAuth approval.',
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message =
        cause instanceof McpConnectionPreflightError
          ? cause.message
          : 'The VibeSpace MCP connection check failed.';
      setMcpSetupError(message);
      setMcpSetupState('error');
      toast.error('Could not start VibeSpace MCP setup', message);
    } finally {
      if (connectionAbortRef.current === controller) {
        connectionAbortRef.current = null;
      }
    }
  };

  const copyMcpEndpoint = async () => {
    if (!mcpUrl) return;
    try {
      await navigator.clipboard.writeText(mcpUrl);
      toast.success('VibeSpace MCP endpoint copied', 'Paste it into ChatGPT Apps setup.');
    } catch {
      toast.error(
        'Could not copy the MCP endpoint',
        'Select the visible endpoint and copy it manually.',
      );
    }
  };

  const mcpStatusLabel = browserChatMcpStatusLabel(
    relayStatus,
    Boolean(cloudAccountId),
    mcpSetupState,
  );
  const mcpSetupBusy = mcpSetupState === 'checking' || mcpSetupState === 'opening';
  const pinnedSessions = sessions.filter(({ binding }) => binding.pinned);
  const providerSessions = sessions.filter(({ binding }) => !binding.pinned);
  const activeBinding = sessions.find(
    ({ binding }) => binding.chatId === chatId && binding.provider === provider.id,
  )?.binding;
  const independentStatus = deriveBrowserChatStatusModel({
    provider: { id: provider.id, label: provider.label, pageStatus },
    account: cloudAccountId
      ? { id: cloudAccountId, label: cloudAccountLabel || cloudAccountId }
      : null,
    relayStatus,
    mcpSetupState,
    permissionProfile,
    workspaceGrant: activeWorkspaceGrant ? { displayName: activeWorkspaceGrant.displayName } : null,
    providerCapabilityTier: 'unknown',
    availableCapabilities: BROWSER_CHAT_EXECUTABLE_CAPABILITIES,
    toolActivity: accountToolActivity,
    project: projectId
      ? {
          name: project?.name ?? (projectRoot ? basename(projectRoot) : String(projectId)),
          linkedProviderProjectId: activeBinding?.providerProjectKey ?? null,
        }
      : null,
    contextAvailable: Boolean(
      contextMap || (!project?.no_context_mode && project?.system_prompt_context),
    ),
    grantRevoked: projectGrantRevoked,
  });

  const renderBrowserSession = ({ binding }: { readonly binding: BrowserChatBindingRow }) => {
    const providerDefinition = browserChatProvider(binding.provider);
    const isRenaming = renamingBindingId === binding.id;
    return (
      <div
        key={binding.id}
        className={cn(
          'rounded-lg border px-2 py-2',
          binding.chatId === chatId
            ? 'border-accent-copper/35 bg-accent-copper/10'
            : 'border-transparent hover:border-border hover:bg-muted/45',
        )}
      >
        {isRenaming ? (
          <div className="space-y-1.5">
            <label className="sr-only" htmlFor={`browser-chat-title-${binding.id}`}>
              Browser Chat title
            </label>
            <input
              id={`browser-chat-title-${binding.id}`}
              aria-label="Browser Chat title"
              value={renameDraft}
              maxLength={512}
              autoFocus
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveBrowserSessionTitle(binding);
                if (event.key === 'Escape') setRenamingBindingId(null);
              }}
              className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-copper/50"
            />
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                className="h-6 px-2 text-[9px]"
                onClick={() => void saveBrowserSessionTitle(binding)}
              >
                Save Browser Chat title
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[9px]"
                onClick={() => setRenamingBindingId(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Open ${binding.localTitle}`}
              onClick={() => openBrowserSession(binding)}
              className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-copper/50"
            >
              <span className="block truncate text-[11px] font-medium text-foreground">
                {binding.localTitle}
              </span>
              <span className="mt-0.5 block text-[9px] text-muted-foreground">
                {providerDefinition.label} · {statusLabel(binding.bindingState)}
              </span>
            </button>
            <div className="mt-1.5 flex items-center gap-0.5">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="h-6 w-6"
                aria-label={`${binding.pinned ? 'Unpin' : 'Pin'} ${binding.localTitle}`}
                onClick={() =>
                  void updateBrowserSession(
                    binding,
                    { pinned: !binding.pinned },
                    {
                      pinned: !binding.pinned,
                      pinned_at: binding.pinned ? undefined : Date.now(),
                    },
                  )
                }
              >
                {binding.pinned ? (
                  <PinOff className="h-3 w-3" aria-hidden />
                ) : (
                  <Pin className="h-3 w-3" aria-hidden />
                )}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="h-6 w-6"
                aria-label={`Rename ${binding.localTitle}`}
                onClick={() => {
                  setRenamingBindingId(binding.id);
                  setRenameDraft(binding.localTitle);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden />
              </Button>
              <label className="sr-only" htmlFor={`browser-chat-project-${binding.id}`}>
                Project for {binding.localTitle}
              </label>
              <select
                id={`browser-chat-project-${binding.id}`}
                aria-label={`Project for ${binding.localTitle}`}
                value={binding.projectId ?? ''}
                onChange={(event) => {
                  const nextProjectId = event.target.value || undefined;
                  void updateBrowserSession(
                    binding,
                    { projectId: nextProjectId },
                    { project_id: nextProjectId as Chat['project_id'] },
                  );
                }}
                className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[9px] text-muted-foreground"
              >
                <option value="">No project</option>
                {projects.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                aria-label={`Remove ${binding.localTitle}`}
                onClick={() => void removeBrowserSession(binding)}
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <section
      aria-label="Browser Chat hub"
      data-vibespace-page="browser-chat"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-panel/95 px-4 py-3">
        <div className="flex min-w-52 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent-copper/25 bg-accent-copper/10 text-accent-copper">
            <Globe2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Browser Chat</h1>
            <p className="text-[11px] text-muted-foreground">
              Real provider pages. Your subscriptions. VibeSpace organization.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Browser Chat providers"
          className="flex min-w-0 flex-1 items-center justify-center gap-1"
        >
          {BROWSER_CHAT_PROVIDERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={option.id === providerId}
              aria-disabled={option.availability === 'future'}
              disabled={option.availability === 'future'}
              onClick={() => setProvider(option.id, chatId)}
              className={cn(
                'min-h-9 rounded-lg border px-4 text-xs font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-copper/50',
                option.id === providerId
                  ? 'border-accent-copper/45 bg-accent-copper/12 text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
                option.availability === 'future' && 'cursor-not-allowed opacity-50',
              )}
            >
              {option.label}
              {option.availability === 'future' ? (
                <span className="ml-1.5 text-[9px] uppercase tracking-wide">Future</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={exportInputRef}
            className="sr-only"
            type="file"
            accept=".zip,application/zip"
            aria-label="Choose official ChatGPT export ZIP"
            onChange={(event) => {
              void importOfficialExport(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={importingExport || !accountId || !bindingWorkspaceId}
            onClick={() => exportInputRef.current?.click()}
          >
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
            {importingExport ? 'Importing…' : 'Import export'}
            {importedSnapshotCount ? (
              <span className="ml-1 text-[9px] text-muted-foreground">{importedSnapshotCount}</span>
            ) : null}
          </Button>
          <Badge variant={pageStatus === 'ready' ? 'success' : 'secondary'}>
            Page · {statusLabel(pageStatus)}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void browserChatSurface.openSystemBrowser(provider)}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {provider.id === 'chatgpt' ? 'Open ChatGPT' : 'System browser'}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(22rem,1fr)_17rem] gap-3 p-3 max-[1050px]:grid-cols-[11rem_minmax(20rem,1fr)]">
        <aside
          aria-label="Browser Chat local sessions"
          className="flex min-h-0 flex-col rounded-xl border border-border bg-panel/70 p-2.5"
        >
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-xs font-semibold text-foreground">Provider sessions</h2>
              <p className="text-[10px] text-muted-foreground">Saved per VibeSpace chat</p>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="New provider chat"
              onClick={() => void createBrowserChat()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto">
            {sessions.length ? (
              <>
                {pinnedSessions.length ? (
                  <section aria-labelledby="browser-chat-pinned-heading">
                    <h3
                      id="browser-chat-pinned-heading"
                      className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Pinned
                    </h3>
                    <div className="space-y-1">{pinnedSessions.map(renderBrowserSession)}</div>
                  </section>
                ) : null}
                <section aria-labelledby="browser-chat-provider-sessions-heading">
                  <h3
                    id="browser-chat-provider-sessions-heading"
                    className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Provider sessions
                  </h3>
                  <div className="space-y-1">
                    {providerSessions.length ? (
                      providerSessions.map(renderBrowserSession)
                    ) : (
                      <p className="px-2 py-2 text-[10px] text-muted-foreground">
                        All saved Browser Chats are pinned.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
                <p className="text-[11px] font-medium text-foreground">ChatGPT home</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  Create a Browser Chat to keep its mode separate from native chats.
                </p>
              </div>
            )}
          </div>
          <div className="mt-auto space-y-2 border-t border-border/70 px-1 pt-3">
            <div className="flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-copper" />
              Cookies stay in this provider’s isolated local profile.
            </div>
            <div className="flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-copper" />
              Google and other external sign-in opens in your OS default browser. Its cookies are
              never copied into VibeSpace.
            </div>
          </div>
        </aside>

        <BrowserProviderSurface
          key={provider.id}
          provider={provider}
          onNavigation={captureProviderNavigation}
        />

        <aside
          aria-label="Browser Chat connection inspector"
          className="min-h-0 overflow-auto rounded-xl border border-border bg-panel/70 p-3 max-[1050px]:col-span-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-foreground">Connection</h2>
          </div>

          <dl className="mt-3 space-y-3 text-[11px]">
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <MonitorUp className="h-3.5 w-3.5 text-accent-copper" />
                Page status
              </dt>
              <dd className="mt-1 text-muted-foreground">{independentStatus.providerPage.label}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="font-medium text-foreground">Provider session</dt>
              <dd className="mt-1 text-muted-foreground">
                {independentStatus.providerSession.label}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="font-medium text-foreground">VibeSpace account</dt>
              <dd className="mt-1 text-muted-foreground">
                {independentStatus.vibespaceAccount.label}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="font-medium text-foreground">MCP authorization</dt>
              <dd className="mt-1 text-muted-foreground">
                {independentStatus.mcpAuthorization.label}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="font-medium text-foreground">Desktop relay</dt>
              <dd className="mt-1 text-muted-foreground">{independentStatus.desktopRelay.label}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-accent-copper" />
                Tool bridge
              </dt>
              <dd className="mt-1 capitalize text-muted-foreground">{statusLabel(bridgeStatus)}</dd>
              <dd className="mt-1 text-[10px] leading-4 text-muted-foreground">
                {statusLabel(independentStatus.toolBridge.profile)} profile ·{' '}
                {independentStatus.toolBridge.executableCount} executable now ·{' '}
                {independentStatus.toolBridge.advertisedCount} advertised ·{' '}
                {independentStatus.toolBridge.providerLimitedCount} provider-limited
              </dd>
              <dd className="mt-1 text-[10px] leading-4 text-muted-foreground">
                The provider page has no direct device authority. The official VibeSpace MCP app can
                use only the project you approve below.
              </dd>
              <dd
                aria-live="polite"
                className="mt-2 rounded-md border border-border/70 bg-muted/25 p-2 text-[9px] leading-4 text-muted-foreground"
              >
                {accountToolActivity ? (
                  <>
                    <span className="block font-medium text-foreground">
                      {accountToolActivity.advertisedTools.length} advertised
                      {' · '}
                      {accountToolActivity.activeCalls.length} running
                    </span>
                    {accountToolActivity.activeCalls.map((call) => (
                      <span key={call.callId} className="block">
                        {call.toolName} running
                      </span>
                    ))}
                    {accountToolActivity.lastResult ? (
                      <span className="block">
                        Last: {accountToolActivity.lastResult.toolName}
                        {' · '}
                        {accountToolActivity.lastResult.ok
                          ? 'completed'
                          : statusLabel(
                              accountToolActivity.lastResult.errorCode ?? 'runtime failure',
                            )}
                        {' · '}
                        {accountToolActivity.lastResult.elapsedMs} ms
                      </span>
                    ) : (
                      <span className="block">No tool result in this relay session.</span>
                    )}
                  </>
                ) : (
                  <span>No account-scoped relay catalog is active.</span>
                )}
              </dd>
              {relayStatus === 'connected' ? (
                <dd className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  Desktop relay connected to this signed-in VibeSpace account. ChatGPT app and
                  provider-session status remain owned by ChatGPT.
                </dd>
              ) : null}
              <dd className="mt-1 text-[10px] leading-4 text-muted-foreground">
                It is not auto-connected by page login. Approve a project, configure the public
                VibeSpace MCP endpoint, then enable VibeSpace MCP in ChatGPT Settings → Apps.
              </dd>
              <dd className="mt-2 rounded-md border border-border/70 bg-muted/25 p-2">
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-[11px] text-foreground">VibeSpace MCP</strong>
                  <Badge variant={relayStatus === 'connected' ? 'success' : 'secondary'}>
                    {mcpStatusLabel}
                  </Badge>
                </span>
                {mcpUrl ? (
                  <span className="mt-2 flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-background/55 p-1">
                    <code
                      className="min-w-0 flex-1 select-all truncate px-1 text-[9px] text-foreground"
                      title={mcpUrl}
                    >
                      {mcpUrl}
                    </code>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Copy MCP endpoint"
                      onClick={() => void copyMcpEndpoint()}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
                <ol className="mt-2 grid gap-1 text-[9px] leading-4 text-muted-foreground">
                  <li>1. Enable Developer mode.</li>
                  <li>2. Add VibeSpace MCP.</li>
                  <li>3. Approve access.</li>
                </ol>
                {permissionProfile ? (
                  <BrowserChatPermissionPanel
                    profile={permissionProfile}
                    workspaceGranted={Boolean(activeWorkspaceGrant)}
                    providerBridgeAvailable={relayStatus === 'connected'}
                    availableCapabilities={BROWSER_CHAT_EXECUTABLE_CAPABILITIES}
                    disabled={permissionProfileSaving}
                    onProfileChange={changePermissionProfile}
                  />
                ) : (
                  <span className="mt-2 block text-[9px] text-muted-foreground">
                    Loading the scoped permission plan…
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={!mcpUrl || mcpSetupBusy}
                  onClick={() => void connectVibeSpaceMcp()}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  {mcpSetupState === 'checking'
                    ? 'Checking VibeSpace MCP'
                    : mcpSetupState === 'opening'
                      ? 'Opening ChatGPT Apps'
                      : mcpSetupState === 'error'
                        ? 'Retry VibeSpace MCP'
                        : 'Connect VibeSpace MCP'}
                </Button>
                {mcpSetupError ? (
                  <span role="alert" className="mt-1 block text-[9px] leading-4 text-destructive">
                    <span className="block">{mcpSetupError}</span>
                    <span className="block text-muted-foreground">
                      Open manually:{' '}
                      <code className="select-all text-foreground">{CHATGPT_APPS_URL}</code>
                    </span>
                  </span>
                ) : null}
                <span className="mt-1 block text-[9px] leading-4 text-muted-foreground">
                  In ChatGPT, open Settings → Apps → Advanced settings, enable Developer mode, then
                  create or refresh the VibeSpace app with the MCP endpoint above. ChatGPT requires
                  one-time OAuth approval; the desktop relay then reconnects automatically while
                  this session grant is active.
                </span>
              </dd>
              <dd className="mt-2 space-y-1">
                {enabledConnections.length ? (
                  enabledConnections.slice(0, 8).map((connection) => (
                    <span
                      key={connection.pluginId}
                      className="flex items-center justify-between rounded-md bg-muted/45 px-2 py-1"
                    >
                      <span className="truncate">{connection.pluginId}</span>
                      <span className="ml-2 inline-flex items-center gap-1 capitalize text-muted-foreground">
                        {connection.state === 'connecting' ? (
                          <span
                            className="inline-flex gap-0.5 motion-safe:animate-pulse"
                            aria-hidden
                          >
                            <i>·</i>
                            <i>·</i>
                            <i>·</i>
                          </span>
                        ) : null}
                        {statusLabel(connection.state)}
                      </span>
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    No enabled VibeSpace MCP or app connections.
                  </span>
                )}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <FolderKey className="h-3.5 w-3.5 text-accent-copper" />
                Local project grant
              </dt>
              <dd className="mt-1 text-[10px] leading-4 text-muted-foreground">
                {activeWorkspaceGrant
                  ? `Local relay armed · ${activeWorkspaceGrant.displayName} · ${activeWorkspaceGrant.permissionProfile.plan.replaceAll('_', ' ')}`
                  : projectRoot
                    ? `${basename(projectRoot)} is available but not exposed.`
                    : 'Choose a project folder in Files before enabling local reads.'}
              </dd>
              <dd className="mt-2">
                {activeWorkspaceGrant ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={revokeProjectRead}
                  >
                    Revoke project access
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!projectRoot || !cloudAccountId || !projectId}
                    onClick={approveProjectRead}
                  >
                    Approve current project access
                  </Button>
                )}
              </dd>
              <dd className="mt-2 text-[9px] leading-4 text-muted-foreground">
                Session-only. Absolute paths are never sent to ChatGPT or stored by the relay.
              </dd>
              <dd className="mt-1 text-[9px] leading-4 text-muted-foreground">
                {independentStatus.localProject.label}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <Bot className="h-3.5 w-3.5 text-accent-copper" />
                Agent &amp; project context
              </dt>
              <dd className="mt-2 space-y-2">
                <select
                  aria-label="Browser Chat agent"
                  value={selectedAgent?.id ?? ''}
                  onChange={(event) => setSelectedAgentId(event.currentTarget.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] text-foreground"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={!agentPrompt}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(agentPrompt)
                      .then(() =>
                        toast.success(
                          'Agent prompt copied',
                          'Paste it into ChatGPT. It includes the selected agent, project instructions, and current Context Map.',
                        ),
                      )
                      .catch(() =>
                        toast.error(
                          'Could not copy agent prompt',
                          'Clipboard access is unavailable.',
                        ),
                      );
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy agent + Context prompt
                </Button>
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Prepared locally and sent only when you paste it into ChatGPT. Direct VibeSpace
                  tools and approvals remain inside VibeSpace.
                </p>
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <Bot className="h-3.5 w-3.5 text-accent-copper" />
                Model
              </dt>
              <dd className="mt-1 text-muted-foreground">{independentStatus.model.label}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <Activity className="h-3.5 w-3.5 text-accent-copper" />
                ChatGPT usage
              </dt>
              <dd className="mt-1 text-muted-foreground">{independentStatus.chatGptUsage.label}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <Activity className="h-3.5 w-3.5 text-accent-copper" />
                VibeSpace OpenAI API usage
              </dt>
              <dd className="mt-1 text-muted-foreground">
                {usageText(
                  openAiUsage?.usageValue ?? null,
                  openAiUsage?.usageLimit ?? null,
                  openAiUsage?.usageUnit ?? null,
                )}
              </dd>
              {openAiUsage?.usagePercent !== null && openAiUsage?.usagePercent !== undefined ? (
                <dd className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-accent-copper transition-[width]"
                    style={{ width: `${Math.min(100, openAiUsage.usagePercent)}%` }}
                  />
                </dd>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-background/55 p-2.5">
              <dt className="flex items-center justify-between gap-2 font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <FileUp className="h-3.5 w-3.5 text-accent-copper" />
                  Files and outputs
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Stage files for Browser Chat"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!chatId}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </dt>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                multiple
                onChange={(event) => {
                  stageFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
              <dd className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Stage files here, then drag them into ChatGPT or use ChatGPT’s attachment control.
              </dd>
              <dd className="mt-2 space-y-1">
                {stagedFiles.map((file) => (
                  <span
                    key={`${file.name}:${file.size}:${file.lastModified}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.items.add(file);
                    }}
                    className="flex cursor-grab items-center gap-1.5 rounded-md bg-muted/45 px-2 py-1 text-[10px]"
                  >
                    <Download className="h-3 w-3 shrink-0 text-accent-copper" />
                    <span className="truncate">{file.name}</span>
                  </span>
                ))}
                {!stagedFiles.length ? (
                  <span className="text-[10px] text-muted-foreground">No files staged.</span>
                ) : null}
              </dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-[10px] leading-4 text-muted-foreground">
            <p>{provider.serviceSummary}</p>
            <p className="font-medium text-foreground">
              Your provider subscription and limits still apply.
            </p>
            <p>
              VibeSpace does not resell this subscription, read provider messages, or turn a web
              subscription into an unofficial API.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
