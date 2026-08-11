import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BROWSER_CHAT_STORAGE_KEY,
  createBrowserChatStore,
  migrateLegacyBrowserChatPreferences,
  resolveChatEngine,
  type BrowserChatPreference,
  type BrowserChatStorage,
} from './browserChatStore';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { ChatId, WorkspaceId } from '@/types/common';

function memoryStorage(seed?: Record<string, string>): BrowserChatStorage {
  const values = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => void values.set(name, value),
    removeItem: (name) => void values.delete(name),
  };
}

describe('Browser Chat engine state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts in native VibeSpace Chat and switches engines without changing routes or models', () => {
    const store = createBrowserChatStore(memoryStorage());

    expect(store.getState().engine).toBe('native');
    expect(store.getState().providerId).toBe('chatgpt');

    store.getState().setEngine('browser');
    store.getState().setProvider('claude');

    expect(store.getState().engine).toBe('browser');
    expect(store.getState().providerId).toBe('claude');
    expect(Object.keys(store.getState()).sort()).not.toContain('modelId');
    expect(Object.keys(store.getState()).sort()).not.toContain('route');
  });

  it('keeps Native and Browser mode independently for each VibeSpace conversation', () => {
    const storage = memoryStorage();
    const store = createBrowserChatStore(storage);

    store.getState().setEngine('browser', 'chat-browser');
    store.getState().setProvider('chatgpt', 'chat-browser');
    store.getState().setEngine('native', 'chat-native');

    expect(store.getState().chatPreferences['chat-browser']).toMatchObject({
      engine: 'browser',
      providerId: 'chatgpt',
    });
    expect(store.getState().chatPreferences['chat-native']).toMatchObject({
      engine: 'native',
    });
    expect(storage.getItem(BROWSER_CHAT_STORAGE_KEY)).toContain('"chat-browser"');
    expect(storage.getItem(BROWSER_CHAT_STORAGE_KEY)).toContain('"chat-native"');
  });

  it('defaults every unconfigured new conversation to native without changing explicit Browser chats', () => {
    const store = createBrowserChatStore(memoryStorage());
    store.getState().setEngine('browser');
    store.getState().setEngine('browser', 'explicit-browser-chat');

    expect(resolveChatEngine(store.getState(), 'new-chat')).toBe('native');
    expect(resolveChatEngine(store.getState(), 'explicit-browser-chat')).toBe('browser');
    expect(resolveChatEngine(store.getState(), null)).toBe('browser');
  });

  it('persists only local Browser Chat preferences', () => {
    const storage = memoryStorage();
    const store = createBrowserChatStore(storage);

    store.getState().setEngine('browser');
    store.getState().setProvider('gemini');
    store.getState().setPreferManagedSurface(false);

    const raw = storage.getItem(BROWSER_CHAT_STORAGE_KEY);
    expect(raw).toContain('"engine":"browser"');
    expect(raw).toContain('"providerId":"gemini"');
    expect(raw).toContain('"preferManagedSurface":false');
    expect(raw).not.toMatch(/cookie|password|token|conversation/i);
  });

  it('fails closed to safe defaults when persisted values are invalid', async () => {
    const storage = memoryStorage({
      [BROWSER_CHAT_STORAGE_KEY]: JSON.stringify({
        state: {
          engine: 'scraped-chat',
          providerId: 'untrusted-provider',
          preferManagedSurface: 'yes',
        },
        version: 1,
      }),
    });
    const store = createBrowserChatStore(storage);

    await store.persist.rehydrate();

    expect(store.getState().engine).toBe('native');
    expect(store.getState().providerId).toBe('chatgpt');
    expect(store.getState().preferManagedSurface).toBe(true);
  });
});

describe('legacy Browser Chat preference migration', () => {
  let database: JarvisDexie;

  beforeEach(async () => {
    database = createJarvisDb(
      uniqueTestDbName('browser-chat-preference-migration'),
      TEST_INDEXED_DB,
    );
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('migrates only browser chats in the exact workspace and is idempotent', async () => {
    await database.chats.bulkPut([
      {
        id: 'browser-chat' as ChatId,
        workspace_id: 'workspace-1' as WorkspaceId,
        title: 'Legacy browser chat',
        mode: 'chat',
        active_agent_ids: [],
        pinned: true,
        created_at: 1,
        updated_at: 2,
      },
      {
        id: 'native-chat' as ChatId,
        workspace_id: 'workspace-1' as WorkspaceId,
        title: 'Native chat',
        mode: 'chat',
        active_agent_ids: [],
        created_at: 1,
        updated_at: 2,
      },
      {
        id: 'foreign-chat' as ChatId,
        workspace_id: 'workspace-2' as WorkspaceId,
        title: 'Foreign browser chat',
        mode: 'chat',
        active_agent_ids: [],
        created_at: 1,
        updated_at: 2,
      },
    ]);
    const preferences = {
      'browser-chat': { engine: 'browser', providerId: 'chatgpt' },
      'native-chat': { engine: 'native', providerId: 'claude' },
      'foreign-chat': { engine: 'browser', providerId: 'gemini' },
      missing: { engine: 'browser', providerId: 'chatgpt' },
    } satisfies Record<string, BrowserChatPreference>;
    let id = 0;
    const input = {
      database,
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      preferences,
      clock: () => 100,
      idFactory: () => `migrated-${++id}`,
    };

    await expect(migrateLegacyBrowserChatPreferences(input)).resolves.toBe(1);
    await expect(migrateLegacyBrowserChatPreferences(input)).resolves.toBe(0);

    const rows = await database.browser_chat_bindings.toArray();
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'migrated-1',
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        chatId: 'browser-chat',
        provider: 'chatgpt',
        providerProfileKey: 'browser-chat/chatgpt',
        localTitle: 'Legacy browser chat',
        pinned: true,
      }),
    ]);
  });
});
