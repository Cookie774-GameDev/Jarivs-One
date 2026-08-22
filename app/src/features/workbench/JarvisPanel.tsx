import * as React from 'react';
import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChatThread, Composer, EmptyChat, ensureActiveChat } from '@/features/chat';
import { TokenBossCinematic } from '@/features/chat/token-boss/TokenBossCinematic';
import { toast } from '@/components/ui/toast';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import type { WorkspaceId } from '@/types';
import type { WorkbenchPanel } from './types';
import { useStorageDoctorSnapshot } from '@/features/doctor/StorageDoctorNotice';
import { isStorageDoctorUnavailableError } from '@/lib/doctor/storageDoctor';

interface JarvisPanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

/**
 * Real VibeSpace chat surface inside Workbench with chat picker + new-chat control.
 */
export function JarvisPanel({ panel, onUpdate }: JarvisPanelProps) {
  const storageHealth = useStorageDoctorSnapshot();
  const chatCreationBlocked = storageHealth.kind !== 'healthy';
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChat = useUIStore((state) => state.setActiveChat);
  const workspaceId = useAuthStore((state) => state.workspaceId) as WorkspaceId | null;
  const projectId = useAuthStore((state) => state.projectId);
  const [ensuring, setEnsuring] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const onUpdateRef = React.useRef(onUpdate);
  const statusRef = React.useRef(panel.status);
  onUpdateRef.current = onUpdate;
  statusRef.current = panel.status;

  const chats = useLiveQuery(
    async () => {
      if (!workspaceId) return [];
      const rows = await db.chats.where('workspace_id').equals(workspaceId).toArray();
      const filtered = projectId
        ? rows.filter((c) => c.project_id === projectId || !c.project_id)
        : rows;
      return filtered.sort((a, b) => b.updated_at - a.updated_at).slice(0, 80);
    },
    [workspaceId, projectId],
    [],
  );

  const setStatusIfChanged = React.useCallback((status: WorkbenchPanel['status']) => {
    if (statusRef.current === status) return;
    statusRef.current = status;
    onUpdateRef.current({ status });
  }, []);

  React.useEffect(() => {
    if (activeChatId) {
      setEnsuring(false);
      setFailed(false);
      setStatusIfChanged('ready');
      return;
    }
    let cancelled = false;
    setEnsuring(true);
    setFailed(false);
    void ensureActiveChat()
      .then((id) => {
        if (cancelled) return;
        if (!id) {
          setFailed(true);
          setStatusIfChanged('attention');
        } else {
          setStatusIfChanged('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setStatusIfChanged('error');
        }
      })
      .finally(() => {
        if (!cancelled) setEnsuring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChatId, setStatusIfChanged]);

  const createNewChat = React.useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setFailed(false);
    try {
      // Same path as the rest of the app (Ctrl+N / EmptyChat / jarvis:new-chat).
      const chatId = await ensureActiveChat({ forceNew: true });
      if (!chatId) {
        toast.warning('Still loading', 'Workspace is initializing — try again in a moment.');
        setFailed(true);
        setStatusIfChanged('attention');
        return;
      }
      setActiveChat(chatId);
      setStatusIfChanged('ready');
      toast.success('New chat', 'Ready in Workbench Jarvis');
    } catch (err) {
      if (!isStorageDoctorUnavailableError(err)) {
        toast.error('Could not create chat', err instanceof Error ? err.message : 'Try again.');
      }
      setFailed(true);
      setStatusIfChanged('error');
    } finally {
      setCreating(false);
    }
  }, [creating, setActiveChat, setStatusIfChanged]);

  return (
    <div
      className="workbench-jarvis"
      data-testid="workbench-jarvis-panel"
      data-panel-id={panel.id}
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="workbench-jarvis-toolbar">
        <label htmlFor={`workbench-chat-select-${panel.id}`}>Chat</label>
        <select
          id={`workbench-chat-select-${panel.id}`}
          aria-label="Select chat"
          value={activeChatId ?? ''}
          onChange={(event) => {
            const next = event.target.value;
            if (next) setActiveChat(next);
          }}
        >
          {!activeChatId ? <option value="">Select a chat…</option> : null}
          {chats.map((chat) => (
            <option key={chat.id} value={chat.id}>
              {chat.title?.trim() || 'Untitled chat'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="workbench-jarvis-new-chat"
          aria-label="New chat"
          title="New chat"
          disabled={creating || !workspaceId || chatCreationBlocked}
          aria-describedby={chatCreationBlocked ? 'vibespace-storage-doctor-status' : undefined}
          onClick={() => void createNewChat()}
        >
          <Plus aria-hidden="true" strokeWidth={2.25} />
        </button>
      </div>
      {activeChatId ? (
        <div className="workbench-jarvis-body relative min-h-0" data-token-boss-host="true">
          <ChatThread chatId={activeChatId} compact />
          <Composer chatId={activeChatId} compact disableRouteSlashCommands />
          <TokenBossCinematic chatId={String(activeChatId)} compact />
        </div>
      ) : ensuring || creating ? (
        <div className="workbench-panel-empty">
          <strong>{creating ? 'Creating chat…' : 'Starting Jarvis…'}</strong>
          <span>Opening the shared conversation for this workspace.</span>
        </div>
      ) : failed ? (
        <div className="workbench-panel-empty" role="alert">
          <strong>Chat unavailable</strong>
          <span>Could not open a chat — use the + button to try again.</span>
          <button
            type="button"
            className="workbench-jarvis-new-chat workbench-jarvis-new-chat--lg"
            aria-label="New chat"
            disabled={chatCreationBlocked}
            aria-describedby={chatCreationBlocked ? 'vibespace-storage-doctor-status' : undefined}
            onClick={() => void createNewChat()}
          >
            <Plus aria-hidden="true" strokeWidth={2.25} />
            <span>New chat</span>
          </button>
        </div>
      ) : (
        <EmptyChat onNewChat={() => void createNewChat()} />
      )}
    </div>
  );
}
