import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accountListeners = vi.hoisted(() => {
  type Bindings = {
    getAccountId: () => string;
  };

  const events: string[] = [];
  const deferredStops = new Map<string, Promise<void>>();
  const factory = (name: string) =>
    vi.fn((bindings: Bindings) => {
      const accountId = bindings.getAccountId();
      events.push(`start:${name}:${accountId}`);
      return () => {
        events.push(`stop:${name}:${accountId}`);
        const pending = deferredStops.get(`${name}:${accountId}`);
        if (pending) {
          return pending.then(() => {
            events.push(`flush:${name}:${accountId}`);
          });
        }
      };
    });

  return {
    events,
    learning: factory('learning'),
    allAboutMe: factory('all-about-me'),
    taskRuns: factory('task-runs'),
    deferStop: (name: string, accountId: string) => {
      let resolve: (() => void) | undefined;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      deferredStops.set(`${name}:${accountId}`, promise);
      return () => resolve?.();
    },
    reset: () => {
      events.length = 0;
      deferredStops.clear();
    },
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

const cloudBoot = vi.hoisted(() => {
  type Session = {
    user?: {
      id?: string;
      email?: string;
    };
    expires_at?: number;
  } | null;
  type SessionResult = {
    data: {
      session: Session;
    };
  };

  let configured = false;
  let configurationError: unknown;
  let getSessionImpl = async (): Promise<SessionResult> => ({
    data: { session: null },
  });
  let authListener: ((_event: string, session: Session) => void) | undefined;
  const getSession = vi.fn(() => getSessionImpl());
  const unsubscribe = vi.fn();
  const onAuthStateChange = vi.fn((listener: (_event: string, session: Session) => void) => {
    authListener = listener;
    return {
      data: {
        subscription: {
          unsubscribe,
        },
      },
    };
  });
  const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle,
      }),
    }),
  }));

  return {
    client: {
      auth: {
        getSession,
        onAuthStateChange,
      },
      from,
    },
    configured: () => {
      if (configurationError) throw configurationError;
      return configured;
    },
    setConfigured: (value: boolean) => {
      configured = value;
    },
    failConfigurationCheck: (error: unknown) => {
      configurationError = error;
    },
    deferSession: () => {
      let resolve: ((value: SessionResult) => void) | undefined;
      let reject: ((error: unknown) => void) | undefined;
      const promise = new Promise<SessionResult>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      getSessionImpl = () => promise;
      return {
        resolve: (session: Session) => resolve?.({ data: { session } }),
        reject: (error: unknown) => reject?.(error),
      };
    },
    emitAuth: (session: Session) => authListener?.('SIGNED_IN', session),
    getSession,
    onAuthStateChange,
    reset: () => {
      configured = false;
      configurationError = undefined;
      getSessionImpl = async () => ({ data: { session: null } });
      authListener = undefined;
    },
  };
});

const bootListeners = vi.hoisted(() => ({
  runtime: vi.fn(() => () => undefined),
}));

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

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => cloudBoot.configured(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => cloudBoot.client,
}));

vi.mock('@/lib/sync', () => ({
  processCloudPull: vi.fn(async () => undefined),
  processSyncQueue: vi.fn(async () => undefined),
  pruneSyncQueue: vi.fn(async () => undefined),
  retrySyncErrors: vi.fn(async () => undefined),
  startSyncLoop: vi.fn(() => () => undefined),
}));

vi.mock('@/lib/ai/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/runtime')>();
  return {
    ...actual,
    startRuntimeListener: bootListeners.runtime,
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
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import { useJarvisLearningStore } from '@/features/jarvis-memory/learningStore';
import { createJarvisTaskRun, useJarvisTaskRunStore } from '@/features/jarvis-runs/taskRunStore';
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

const supabaseSession = (userId: string) => ({
  user: {
    id: userId,
    email: 'account-identity-test@example.test',
  },
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
    accountListeners.reset();
    cloudBoot.reset();
    useJarvisLearningStore.getState().clearForTests();
    useAllAboutMeStore.setState(useAllAboutMeStore.getInitialState(), true);
    useJarvisTaskRunStore.getState().clearForTests();
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
    useJarvisLearningStore.getState().clearForTests();
    useAllAboutMeStore.setState(useAllAboutMeStore.getInitialState(), true);
    useJarvisTaskRunStore.getState().clearForTests();
  });

  it('keeps every account listener closed until configured Supabase confirms signed-out state', async () => {
    cloudBoot.setConfigured(true);
    const session = cloudBoot.deferSession();
    prepareAppIdentity({
      cloudSession: cloudSession('persisted-cloud-user'),
      localUserId: 'stable-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();

    expect(cloudBoot.getSession).toHaveBeenCalledTimes(1);
    expect(accountListeners.learning).not.toHaveBeenCalled();
    expect(accountListeners.allAboutMe).not.toHaveBeenCalled();
    expect(accountListeners.taskRuns).not.toHaveBeenCalled();
    expect(bootListeners.runtime).toHaveBeenCalledTimes(1);
    expect(document.querySelector('main[aria-label="Workspace"]')).not.toBeNull();

    await act(async () => {
      session.resolve(null);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(1);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(1);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(1);
    });
    expectEveryListenerStartedWith('stable-local-user');
  });

  it('starts the exact cloud scope only after configured Supabase resolves it', async () => {
    cloudBoot.setConfigured(true);
    const session = cloudBoot.deferSession();
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();

    expect(accountListeners.learning).not.toHaveBeenCalled();
    expect(accountListeners.allAboutMe).not.toHaveBeenCalled();
    expect(accountListeners.taskRuns).not.toHaveBeenCalled();

    await act(async () => {
      session.resolve(supabaseSession('confirmed-cloud-user'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(1);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(1);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(1);
    });
    expectEveryListenerStartedWith('confirmed-cloud-user');
  });

  it('remains fail-closed when configured Supabase session recovery rejects', async () => {
    cloudBoot.setConfigured(true);
    const session = cloudBoot.deferSession();
    prepareAppIdentity({
      cloudSession: cloudSession('persisted-cloud-user'),
      localUserId: 'stable-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();

    await act(async () => {
      session.reject(new Error('session unavailable'));
      await Promise.resolve();
    });

    expect(accountListeners.learning).not.toHaveBeenCalled();
    expect(accountListeners.allAboutMe).not.toHaveBeenCalled();
    expect(accountListeners.taskRuns).not.toHaveBeenCalled();
    expect(bootListeners.runtime).toHaveBeenCalledTimes(1);
    expect(document.querySelector('main[aria-label="Workspace"]')).not.toBeNull();
  });

  it('remains fail-closed when Supabase configuration detection fails', async () => {
    cloudBoot.failConfigurationCheck(new Error('configuration unavailable'));
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    render(<App />);
    await waitForAccountScopeBoot();

    expect(accountListeners.learning).not.toHaveBeenCalled();
    expect(accountListeners.allAboutMe).not.toHaveBeenCalled();
    expect(accountListeners.taskRuns).not.toHaveBeenCalled();
    expect(bootListeners.runtime).toHaveBeenCalledTimes(1);
    expect(document.querySelector('main[aria-label="Workspace"]')).not.toBeNull();
  });

  it('starts no scoped listener when a blank cloud id is present at the Phase 4 boot boundary', async () => {
    const malformedCloudSession = cloudSession('   ');
    prepareAppIdentity({
      cloudSession: malformedCloudSession,
      localUserId: 'stable-local-user',
    });
    useJarvisLearningStore.getState().setAccount('previous-private-account');
    useJarvisLearningStore.getState().remember({
      value: 'Previous private learning',
      category: 'personal',
      source: { kind: 'explicit' },
    });
    useAllAboutMeStore.getState().setAccountScope('previous-private-account');
    useAllAboutMeStore.getState().setMarkdown('# All About Me\n\nPrevious private profile');
    useJarvisTaskRunStore.getState().setAccountScope('previous-private-scope');
    useJarvisTaskRunStore.getState().addRun(
      createJarvisTaskRun({
        id: 'previous-private-run',
        goal: 'Previous private task',
        steps: [
          {
            id: 'inspect',
            action: 'agent.status',
            label: 'Inspect',
            recoverable: true,
          },
        ],
      }),
    );
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
      expect(useJarvisLearningStore.getState()).toMatchObject({
        activeAccountId: '',
        profiles: {},
        history: {},
      });
      expect(useAllAboutMeStore.getState()).toMatchObject({
        accountScope: '',
        markdown: '',
      });
      expect(useJarvisTaskRunStore.getState()).toMatchObject({
        accountScope: '',
        runs: {},
      });
      expect(
        JSON.stringify({
          learning: useJarvisLearningStore.getState(),
          profile: useAllAboutMeStore.getState(),
        }),
      ).not.toContain('local-unassigned');
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
    useJarvisLearningStore.getState().setAccount('stable-local-user');
    useJarvisLearningStore.getState().remember({
      value: 'Stable user private learning',
      category: 'personal',
      source: { kind: 'explicit' },
    });
    useAllAboutMeStore.getState().setAccountScope('stable-local-user');
    useAllAboutMeStore.getState().setMarkdown('# All About Me\n\nStable user profile');
    useJarvisTaskRunStore.getState().setAccountScope('stable-local-scope');
    useJarvisTaskRunStore.getState().addRun(
      createJarvisTaskRun({
        id: 'stable-local-run',
        goal: 'Stable local private task',
        steps: [
          {
            id: 'inspect',
            action: 'agent.status',
            label: 'Inspect',
            recoverable: true,
          },
        ],
      }),
    );

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
    expect(useJarvisLearningStore.getState()).toMatchObject({
      activeAccountId: '',
      profiles: {},
      history: {},
    });
    expect(useAllAboutMeStore.getState()).toMatchObject({
      accountScope: '',
      markdown: '',
    });
    expect(useJarvisTaskRunStore.getState()).toMatchObject({
      accountScope: '',
      runs: {},
    });
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

  it('waits for pending learning and All About Me flushes before starting a new account', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });
    const finishLearningFlush = accountListeners.deferStop('learning', 'stable-local-user');
    const finishProfileFlush = accountListeners.deferStop('all-about-me', 'stable-local-user');

    render(<App />);
    await waitForAccountScopeBoot();
    expectEveryListenerStartedWith('stable-local-user');
    useJarvisLearningStore.getState().setAccount('stable-local-user');
    useJarvisLearningStore.getState().remember({
      value: 'Private learning pending flush',
      category: 'personal',
      source: { kind: 'explicit' },
    });
    useAllAboutMeStore.getState().setAccountScope('stable-local-user');
    useAllAboutMeStore.getState().setMarkdown('# All About Me\n\nPrivate pending profile');
    useJarvisTaskRunStore.getState().setAccountScope('stable-local-scope');
    useJarvisTaskRunStore.getState().addRun(
      createJarvisTaskRun({
        id: 'pending-private-run',
        goal: 'Pending private task',
        steps: [
          {
            id: 'inspect',
            action: 'agent.status',
            label: 'Inspect',
            recoverable: true,
          },
        ],
      }),
    );

    act(() => {
      useAuthStore.setState({ cloudSession: cloudSession('cloud-user') });
    });
    await waitFor(() => {
      expect(accountListeners.events.slice(-3)).toEqual([
        'stop:learning:stable-local-user',
        'stop:all-about-me:stable-local-user',
        'stop:task-runs:stable-local-user',
      ]);
    });
    expect(accountListeners.learning).toHaveBeenCalledTimes(1);
    expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(1);
    expect(accountListeners.taskRuns).toHaveBeenCalledTimes(1);
    expect(useJarvisLearningStore.getState().profiles).toEqual({});
    expect(useAllAboutMeStore.getState()).toMatchObject({
      accountScope: '',
      markdown: '',
    });
    expect(useJarvisTaskRunStore.getState()).toMatchObject({
      accountScope: '',
      runs: {},
    });

    await act(async () => {
      finishLearningFlush();
      await Promise.resolve();
    });
    expect(accountListeners.events).toContain('flush:learning:stable-local-user');
    expect(accountListeners.learning).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishProfileFlush();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(2);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(2);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(2);
    });
    expectEveryListenerStartedWith('cloud-user', 1);
  });

  it('invalidates a pending valid switch when identity becomes malformed during teardown', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });
    const finishLearningFlush = accountListeners.deferStop('learning', 'stable-local-user');
    const finishProfileFlush = accountListeners.deferStop('all-about-me', 'stable-local-user');

    render(<App />);
    await waitForAccountScopeBoot();
    expectEveryListenerStartedWith('stable-local-user');

    act(() => {
      useAuthStore.setState({ cloudSession: cloudSession('stale-cloud-target') });
    });
    await waitFor(() => {
      expect(accountListeners.events).toContain('stop:task-runs:stable-local-user');
    });

    act(() => {
      useAuthStore.setState({ cloudSession: cloudSession('   ') });
    });
    await act(async () => {
      finishLearningFlush();
      finishProfileFlush();
      await Promise.resolve();
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(accountListeners.learning).toHaveBeenCalledTimes(1);
    expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(1);
    expect(accountListeners.taskRuns).toHaveBeenCalledTimes(1);
    expect(accountListeners.events).not.toContain('start:learning:stale-cloud-target');
    expect(useJarvisLearningStore.getState().profiles).toEqual({});
    expect(useAllAboutMeStore.getState().markdown).toBe('');
    expect(useJarvisTaskRunStore.getState().runs).toEqual({});
  });

  it('keeps a StrictMode-style remount behind the previous account flush', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    const firstMount = render(<App />);
    await waitForAccountScopeBoot();
    expectEveryListenerStartedWith('stable-local-user');
    const finishLearningFlush = accountListeners.deferStop('learning', 'stable-local-user');
    const finishProfileFlush = accountListeners.deferStop('all-about-me', 'stable-local-user');

    firstMount.unmount();
    render(<App />);
    await waitFor(() => expect(bootListeners.runtime).toHaveBeenCalledTimes(2));

    try {
      expect(accountListeners.learning).toHaveBeenCalledTimes(1);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(1);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        finishLearningFlush();
        finishProfileFlush();
        await Promise.resolve();
      });
    }
    await waitFor(() => {
      expect(accountListeners.learning).toHaveBeenCalledTimes(2);
      expect(accountListeners.allAboutMe).toHaveBeenCalledTimes(2);
      expect(accountListeners.taskRuns).toHaveBeenCalledTimes(2);
    });
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

  it('does not register listeners when an awaited agent boot resolves after unmount', async () => {
    prepareAppIdentity({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });
    let finishAgentList: ((agents: never[]) => void) | undefined;
    bootStorage.listAgents.mockImplementationOnce(
      () =>
        new Promise<never[]>((resolve) => {
          finishAgentList = resolve;
        }),
    );

    const { unmount } = render(<App />);
    await waitFor(() => expect(bootStorage.listAgents).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      finishAgentList?.([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(accountListeners.learning).not.toHaveBeenCalled();
    expect(accountListeners.allAboutMe).not.toHaveBeenCalled();
    expect(accountListeners.taskRuns).not.toHaveBeenCalled();
    expect(bootListeners.runtime).not.toHaveBeenCalled();
    expect(useAgentStore.getState().agents).toEqual({});
  });
});
