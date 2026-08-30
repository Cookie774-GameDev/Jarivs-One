import { describe, expect, it } from 'vitest';
import {
  createJarvisChatIntentStore,
  selectJarvisChatForIntent,
  type JarvisChatScope,
} from './jarvisChatIntent';

const scope: JarvisChatScope = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('Jarvis chat intent persistence', () => {
  it('reloads a versioned specific-chat intent and primary pointer only in its exact scope', () => {
    const storage = memoryStorage();
    const first = createJarvisChatIntentStore(storage);
    first.write(scope, {
      intent: { kind: 'specific-chat', chatId: 'chat-a' },
      primaryChatId: 'chat-a',
    });

    const reloaded = createJarvisChatIntentStore(storage);
    expect(reloaded.read(scope)).toEqual({
      version: 1,
      intent: { kind: 'specific-chat', chatId: 'chat-a' },
      primaryChatId: 'chat-a',
    });
    expect(reloaded.read({ ...scope, projectId: 'project-b' })).toEqual({
      version: 1,
      intent: { kind: 'reuse-primary' },
    });
  });

  it('reconciles a deleted primary/specific chat and records a recreated primary', () => {
    const store = createJarvisChatIntentStore(memoryStorage());
    store.write(scope, {
      intent: { kind: 'specific-chat', chatId: 'chat-a' },
      primaryChatId: 'chat-a',
    });

    expect(store.reconcileDeleted(scope, ['chat-a'])).toEqual({
      version: 1,
      intent: { kind: 'reuse-primary' },
    });
    expect(store.recordCreatedPrimary(scope, 'chat-b')).toEqual({
      version: 1,
      intent: { kind: 'reuse-primary' },
      primaryChatId: 'chat-b',
    });
  });

  it('fails malformed persisted authority closed', () => {
    const storage = memoryStorage();
    storage.setItem(
      'vibespace.jarvis-chat-intent.v1:value-account-a:value-workspace-a:value-project-a',
      '{"version":2}',
    );
    expect(createJarvisChatIntentStore(storage).read(scope)).toEqual({
      version: 1,
      intent: { kind: 'reuse-primary' },
    });
  });

  it('keeps null scope distinct from a project id that resembles its storage sentinel', () => {
    const storage = memoryStorage();
    const store = createJarvisChatIntentStore(storage);
    store.write({ ...scope, projectId: null }, { intent: { kind: 'explicit-new' } });
    store.write(
      { ...scope, projectId: '~' },
      { intent: { kind: 'specific-chat', chatId: 'chat-a' } },
    );

    expect(store.read({ ...scope, projectId: null }).intent).toEqual({ kind: 'explicit-new' });
    expect(store.read({ ...scope, projectId: '~' }).intent).toEqual({
      kind: 'specific-chat',
      chatId: 'chat-a',
    });
  });
});

describe('selectJarvisChatForIntent', () => {
  const chats = [
    { id: 'chat-old', updatedAt: 10 },
    { id: 'chat-new', updatedAt: 20 },
  ] as const;

  it('reuses the valid primary, elects newest when missing, and creates only when none exist', () => {
    expect(
      selectJarvisChatForIntent(
        { version: 1, intent: { kind: 'reuse-primary' }, primaryChatId: 'chat-old' },
        chats,
      ),
    ).toEqual({ kind: 'use-chat', chatId: 'chat-old' });
    expect(
      selectJarvisChatForIntent({ version: 1, intent: { kind: 'reuse-primary' } }, chats),
    ).toEqual({ kind: 'use-chat', chatId: 'chat-new' });
    expect(
      selectJarvisChatForIntent({ version: 1, intent: { kind: 'reuse-primary' } }, []),
    ).toEqual({ kind: 'create-chat' });
  });

  it('creates once for explicit-new and never falls back from an unavailable specific chat', () => {
    expect(
      selectJarvisChatForIntent({ version: 1, intent: { kind: 'explicit-new' } }, chats),
    ).toEqual({ kind: 'create-chat' });
    expect(
      selectJarvisChatForIntent(
        { version: 1, intent: { kind: 'specific-chat', chatId: 'chat-missing' } },
        chats,
      ),
    ).toEqual({ kind: 'unavailable-specific-chat', chatId: 'chat-missing' });
  });
});
