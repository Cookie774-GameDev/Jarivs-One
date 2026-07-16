import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accountListeners = vi.hoisted(() => {
  type Bindings = {
    getAccountId: () => string;
  };

  const events: string[] = [];
  const factory = (name: string) =>
    vi.fn((bindings: Bindings) => {
      const accountId = bindings.getAccountId();
      events.push(`start:${name}:${accountId}`);
      return () => {
        events.push(`stop:${name}:${accountId}`);
      };
    });

  return {
    events,
    learning: factory('learning'),
    allAboutMe: factory('all-about-me'),
    taskRuns: factory('task-runs'),
  };
});

const bootStorage = vi.hoisted(() => {
  const emptyCollection = new Proxy<Record<string, unknown>>(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') return undefined;
        if (property === 'toArray') return async () => [];
        if (property === 'count') return async () => 0;
        if (property === 'first' || property === 'get') return async () => undefined;
        if (
          property === 'add' ||
          property === 'put' ||
          property === 'update' ||
          property === 'delete' ||
          property === 'clear' ||
          property === 'each'
        ) {
          return async () => undefined;
        }
        return () => emptyCollection;
      },
    },
  );
  let db: Record<string, unknown>;
  db = new Proxy<Record<string, unknown>>(
    {
      isOpen: () => true,
      close: () => undefined,
      open: async () => db,
      transaction: async (...args: unknown[]) => {
        const callback = args.at(-1);
        return typeof callback === 'function' ? callback() : undefined;
      },
    },
    {
      get: (target, property) => target[String(property)] ?? emptyCollection,
    },
  );

  return {
    db,
    openDb: vi.fn(async () => db),
    listAgents: vi.fn(async () => []),
    seedIfEmpty: vi.fn(async () => ({ seeded: false })),
  };
});

vi.mock('@/features/jarvis-memory/learningListener', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/jarvis-memory/learningListener')>();
  return {
    ...actual,
    startJarvisLearningListener: accountListeners.learning,
  };
});

vi.mock('@/features/all-about-me/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/all-about-me/persistence')>();
  return {
    ...actual,
    startAllAboutMePersistence: accountListeners.allAboutMe,
  };
});

vi.mock('@/features/jarvis-runs/taskRunPersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/jarvis-runs/taskRunPersistence')>();
  return {
    ...actual,
    startJarvisTaskRunPersistence: accountListeners.taskRuns,
  };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    db: bootStorage.db,
    openDb: bootStorage.openDb,
    agentRepo: {
      ...actual.agentRepo,
      list: bootStorage.listAgents,
    },
  };
});

vi.mock('@/lib/db/seed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/seed')>();
  return {
    ...actual,
    seedIfEmpty: bootStorage.seedIfEmpty,
  };
});

vi.mock('@/features/pets', () => ({
  PetHost: () => null,
}));

vi.mock('@/features/whats-new', () => ({
  WhatsNewHost: () => null,
  useWhatsNew: () => ({
    currentVersion: 'test-version',
    lastSeenVersion: 'test-version',
    hasUpdate: false,
    markSeen: vi.fn(),
  }),
}));

import { App } from './App';
import { useAgentStore } from '@/stores/agents';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';

const originalAuth = useAuthStore.getState();
const originalUi = useUIStore.getState();
const originalAgents = useAgentStore.getState();

const cloudSession = (userId: string) => ({
  user_id: userId,
  email: 'account-identity-test@example.test',
  expires_at: 4_102_444_800,
});

function prepareAppIdentity(
  identity: Pick<ReturnType<typeof useAuthStore.getState>, 'cloudSession' | 'localUserId'>,
): void {
  useAuthStore.setState({
    ...identity,
    apiKeys: { mock: 'test-model-access' },
    offlineMode: false,
    workspaceId: null,
    projectId: null,
  });
  useUIStore.setState({
    onboardingComplete: true,
    productTutorialStatus: 'completed',
    route: 'benchmarks',
    ambientActive: false,
    inspectorOpen: false,
    activeChatId: null,
    paletteOpen: false,
    settingsOpen: false,
    voiceModalOpen: false,
    launcherOpen: false,
    assistantOpen: false,
    whatsNewOpen: false,
    newsPanelOpen: false,
    callModalOpen: false,
    wellnessActive: false,
    actionsPaletteOpen: false,
    lastSeenWhatsNewVersion: '1.5.0',
  });
  useAgentStore.setState({
    agents: {},
    runStates: {},
    verbs: {},
    tokens: {},
  });
}

async function waitForAccountScopeBoot(): Promise<void> {
  await waitFor(
    () => {
      expect(Object.keys(useAgentStore.getState().agents).length).toBeGreaterThan(0);
    },
    { timeout: 5_000 },
  );
  await act(async () => {
    await Promise.resolve();
  });
}

function expectEveryListenerStartedWith(accountId: string, callIndex = 0): void {
  for (const listener of [
    accountListeners.learning,
    accountListeners.allAboutMe,
    accountListeners.taskRuns,
  ]) {
    expect(listener.mock.calls[callIndex]?.[0].getAccountId()).toBe(accountId);
  }
}

describe('App canonical account identity boot', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    accountListeners.events.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    document.body.removeAttribute('data-scroll-locked');
    document.body.style.removeProperty('pointer-events');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAuthStore.setState(originalAuth, true);
    useUIStore.setState(originalUi, true);
    useAgentStore.setState(originalAgents, true);
  });

  it('starts no scoped listener when a blank cloud id is present at the Phase 4 boot boundary', async () => {
    const malformedCloudSession = cloudSession('   ');
    prepareAppIdentity({
      cloudSession: malformedCloudSession,
      localUserId: 'stable-local-user',
    });
    const stopPhaseBoundary = useAgentStore.subscribe((state, previous) => {
      if (Object.keys(previous.agents).length === 0 && Object.keys(state.agents).length > 0) {
        useAuthStore.setState({ cloudSession: malformedCloudSession });
      }
    });

    try {
      render(<App />);
      await waitForAccountScopeBoot();

      await waitFor(() => {
        expect(document.querySelector('main[aria-label="Workspace"]')).not.toBeNull();
      });
      expect(accountListeners.learning).not.toHaveBeenCalled();
      expect(accountListeners.allAboutMe).not.toHaveBeenCalled();
      expect(accountListeners.taskRuns).not.toHaveBeenCalled();
      expect(useAuthStore.getState().localUserId).toBe('stable-local-user');
    } finally {
      stopPhaseBoundary();
    }
  });

  it('keeps the V2 shell renderable when a live blank cloud id tears down the active scope', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();
    expectEveryListenerStartedWith('stable-local-user');

    act(() => {
      useAuthStore.setState({ cloudSession: cloudSession('   ') });
    });

    await waitFor(() => {
      expect(accountListeners.events.slice(-3)).toEqual([
        'stop:learning:stable-local-user',
        'stop:all-about-me:stable-local-user',
        'stop:task-runs:stable-local-user',
      ]);
    });

    await waitFor(() => {
      expect(document.querySelector('main[aria-label="Workspace"]')).not.toBeNull();
    });
    expect(accountListeners.learning).toHaveBeenCalledTimes(1);
    expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(1);
    expect(accountListeners.taskRuns).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().localUserId).toBe('stable-local-user');
  });

  it('starts every scoped listener with the exact signed-out local account id', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'signed-out-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();

    expectEveryListenerStartedWith('signed-out-local-user');
  });

  it('starts every scoped listener with the exact authenticated cloud account id', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();

    act(() => {
      useAuthStore.setState({ cloudSession: cloudSession('cloud-user') });
    });

    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(2);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(2);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(2);
    });

    expectEveryListenerStartedWith('cloud-user', 1);
    expect(useAuthStore.getState().localUserId).toBe('stable-local-user');
  });

  it('tears down every old scope before starting the new account and preserves the local id', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    const { unmount } = render(<App />);
    await waitForAccountScopeBoot();
    expectEveryListenerStartedWith('stable-local-user');

    act(() => {
      useAuthStore.setState({ cloudSession: cloudSession('cloud-user') });
    });

    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(2);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(2);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(2);
    });

    expect(accountListeners.events).toEqual([
      'start:learning:stable-local-user',
      'start:all-about-me:stable-local-user',
      'start:task-runs:stable-local-user',
      'stop:learning:stable-local-user',
      'stop:all-about-me:stable-local-user',
      'stop:task-runs:stable-local-user',
      'start:learning:cloud-user',
      'start:all-about-me:cloud-user',
      'start:task-runs:cloud-user',
    ]);
    expectEveryListenerStartedWith('cloud-user', 1);
    expect(useAuthStore.getState().localUserId).toBe('stable-local-user');

    act(() => {
      useAuthStore.setState({ cloudSession: null });
    });

    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(3);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(3);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(3);
    });

    expect(accountListeners.events.slice(9)).toEqual([
      'stop:learning:cloud-user',
      'stop:all-about-me:cloud-user',
      'stop:task-runs:cloud-user',
      'start:learning:stable-local-user',
      'start:all-about-me:stable-local-user',
      'start:task-runs:stable-local-user',
    ]);
    expect(useAuthStore.getState().localUserId).toBe('stable-local-user');

    unmount();
    expect(accountListeners.events.slice(-3)).toEqual([
      'stop:learning:stable-local-user',
      'stop:all-about-me:stable-local-user',
      'stop:task-runs:stable-local-user',
    ]);
  });
});
