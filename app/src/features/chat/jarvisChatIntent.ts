export type JarvisChatScope = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string | null;
}>;

export type JarvisChatIntent =
  | Readonly<{ kind: 'reuse-primary' }>
  | Readonly<{ kind: 'explicit-new' }>
  | Readonly<{ kind: 'specific-chat'; chatId: string }>;

export type JarvisChatIntentState = Readonly<{
  version: 1;
  intent: JarvisChatIntent;
  primaryChatId?: string;
}>;

export type JarvisChatSelection =
  | Readonly<{ kind: 'use-chat'; chatId: string }>
  | Readonly<{ kind: 'create-chat' }>
  | Readonly<{ kind: 'unavailable-specific-chat'; chatId: string }>;

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const DEFAULT_STATE: JarvisChatIntentState = Object.freeze({
  version: 1,
  intent: Object.freeze({ kind: 'reuse-primary' }),
});

function scopeKey(scope: JarvisChatScope): string {
  const part = (value: string | null) =>
    value === null ? 'null' : `value-${encodeURIComponent(value)}`;
  return `vibespace.jarvis-chat-intent.v1:${part(scope.accountId)}:${part(scope.workspaceId)}:${part(scope.projectId)}`;
}

function parseState(value: string | null): JarvisChatIntentState {
  if (!value) return DEFAULT_STATE;
  try {
    const candidate = JSON.parse(value) as Record<string, unknown>;
    const intent = candidate.intent as Record<string, unknown> | undefined;
    const primaryChatId = candidate.primaryChatId;
    if (
      candidate.version !== 1 ||
      !intent ||
      (primaryChatId !== undefined &&
        (typeof primaryChatId !== 'string' || primaryChatId.trim().length === 0))
    ) {
      return DEFAULT_STATE;
    }
    if (
      intent.kind !== 'reuse-primary' &&
      intent.kind !== 'explicit-new' &&
      !(
        intent.kind === 'specific-chat' &&
        typeof intent.chatId === 'string' &&
        intent.chatId.trim().length > 0
      )
    ) {
      return DEFAULT_STATE;
    }
    return {
      version: 1,
      intent:
        intent.kind === 'specific-chat'
          ? { kind: 'specific-chat', chatId: intent.chatId as string }
          : { kind: intent.kind },
      ...(typeof primaryChatId === 'string' ? { primaryChatId } : {}),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function createJarvisChatIntentStore(storage: IntentStorage) {
  const persist = (scope: JarvisChatScope, state: JarvisChatIntentState) => {
    storage.setItem(scopeKey(scope), JSON.stringify(state));
    return state;
  };
  return {
    read(scope: JarvisChatScope): JarvisChatIntentState {
      return parseState(storage.getItem(scopeKey(scope)));
    },
    write(
      scope: JarvisChatScope,
      state: Omit<JarvisChatIntentState, 'version'>,
    ): JarvisChatIntentState {
      return persist(scope, { version: 1, ...state });
    },
    reconcileDeleted(scope: JarvisChatScope, deletedChatIds: readonly string[]) {
      const deleted = new Set(deletedChatIds);
      const current = this.read(scope);
      const intent =
        current.intent.kind === 'specific-chat' && deleted.has(current.intent.chatId)
          ? ({ kind: 'reuse-primary' } as const)
          : current.intent;
      const primaryChatId =
        current.primaryChatId && !deleted.has(current.primaryChatId)
          ? current.primaryChatId
          : undefined;
      return persist(scope, {
        version: 1,
        intent,
        ...(primaryChatId ? { primaryChatId } : {}),
      });
    },
    recordCreatedPrimary(scope: JarvisChatScope, chatId: string) {
      return persist(scope, {
        version: 1,
        intent: { kind: 'reuse-primary' },
        primaryChatId: chatId,
      });
    },
  };
}

export function selectJarvisChatForIntent(
  state: JarvisChatIntentState,
  chats: readonly Readonly<{ id: string; updatedAt: number }>[],
): JarvisChatSelection {
  if (state.intent.kind === 'explicit-new') return { kind: 'create-chat' };
  if (state.intent.kind === 'specific-chat') {
    const chatId = state.intent.chatId;
    return chats.some((chat) => chat.id === chatId)
      ? { kind: 'use-chat', chatId }
      : { kind: 'unavailable-specific-chat', chatId };
  }
  if (state.primaryChatId && chats.some((chat) => chat.id === state.primaryChatId)) {
    return { kind: 'use-chat', chatId: state.primaryChatId };
  }
  const newest = [...chats].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  return newest ? { kind: 'use-chat', chatId: newest.id } : { kind: 'create-chat' };
}
