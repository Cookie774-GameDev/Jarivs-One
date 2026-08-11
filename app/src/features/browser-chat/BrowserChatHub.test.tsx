import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserChatStore } from './browserChatStore';
import { BrowserChatHub, browserChatMcpStatusLabel } from './BrowserChatHub';
import { browserChatSurface } from './providerSurface';
import { useAuthStore } from '@/stores/auth';
import * as bridge from '@/lib/bridge';
import { getBridgeWorkspaceGrant, setBridgeWorkspaceGrant } from '@/lib/bridge';
import { projectStorageKey, ROOT_PREFIX } from '@/features/files/projectFiles';
import type { ProjectId } from '@/types/common';
import { browserChatWorkspaceGrantStore, revokeBrowserChatWorkspace } from './workspaceGrant';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { createBrowserChatBindingRepository } from './browserChatRepository';
import type { ChatId, WorkspaceId } from '@/types/common';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Chat } from '@/types/chat';
import {
  beginBrowserChatToolCall,
  clearBrowserChatToolActivity,
  finishBrowserChatToolCall,
  publishBrowserChatToolCatalog,
} from './browserChatToolActivity';
import * as outputFeedModule from './browserChatOutputFeed';

const providerSurfaceHarness = vi.hoisted(() => ({
  onNavigation: undefined as
    | ((navigation: {
        providerId: 'chatgpt';
        surfaceId: string;
        url: string;
        timestamp: number;
        kind: 'conversation';
        providerConversationKey: string;
      }) => void)
    | undefined,
}));

const exportImportHarness = vi.hoisted(() => ({
  importExport: vi.fn(),
}));

vi.mock('./chatGptExport', () => ({
  importChatGptExport: exportImportHarness.importExport,
}));

vi.mock('./BrowserProviderSurface', () => ({
  BrowserProviderSurface: ({
    provider,
    onNavigation,
  }: {
    provider: { label: string };
    onNavigation?: typeof providerSurfaceHarness.onNavigation;
  }) => {
    providerSurfaceHarness.onNavigation = onNavigation;
    return (
      <div aria-label={`${provider.label} provider surface`}>
        {provider.label} real provider page
      </div>
    );
  },
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockSuccessfulMcpDiscovery() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(
      jsonResponse({
        resource: 'https://vibespace-mcp.fly.dev/mcp',
        authorization_servers: ['https://auth.example/auth/v1'],
        scopes_supported: ['email', 'profile'],
        bearer_methods_supported: ['header'],
        resource_name: 'VibeSpace MCP',
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        issuer: 'https://auth.example/auth/v1',
        authorization_endpoint: 'https://auth.example/auth/v1/authorize',
        token_endpoint: 'https://auth.example/auth/v1/token',
        registration_endpoint: 'https://auth.example/auth/v1/register',
        scopes_supported: ['openid', 'offline_access'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      }),
    );
}

describe('BrowserChatHub', () => {
  let testDatabase: JarvisDexie;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PHONE_JARVIS_CLOUD_URL', 'https://vibespace-mcp.fly.dev');
    providerSurfaceHarness.onNavigation = undefined;
    localStorage.clear();
    revokeBrowserChatWorkspace();
    setBridgeWorkspaceGrant();
    bridge.resetBrowserChatRelayStatus();
    clearBrowserChatToolActivity();
    useAuthStore.setState({
      workspaceId: 'workspace-1' as WorkspaceId,
      projectId: 'project-1' as ProjectId,
      localUserId: 'account-1',
      cloudSession: {
        user_id: 'account-1',
        email: 'account-1@example.test',
        expires_at: 4_102_444_800,
      },
    });
    browserChatStore.setState({
      engine: 'browser',
      providerId: 'chatgpt',
      chatPreferences: {},
      preferManagedSurface: true,
      providerRuntime: {},
    });
    testDatabase = createJarvisDb(uniqueTestDbName('browser-chat-hub'), TEST_INDEXED_DB);
    await testDatabase.open();
    exportImportHarness.importExport.mockReset();
    exportImportHarness.importExport.mockResolvedValue({
      importId: 'import-a',
      added: 1,
      updated: 0,
      unchanged: 0,
      reusedImport: false,
    });
  });

  it.each([
    ['disabled', false, 'idle', 'VibeSpace sign-in required'],
    ['disabled', true, 'idle', 'Setup required'],
    ['connecting', true, 'idle', 'Connecting desktop relay'],
    ['reconnecting', true, 'idle', 'Reconnecting desktop relay'],
    ['error', true, 'idle', 'Connection error'],
    ['connected', true, 'idle', 'Desktop connected'],
    ['disabled', true, 'checking', 'Checking secure connection'],
    ['disabled', true, 'waiting', 'Waiting for owner approval'],
  ] as const)(
    'reports relay=%s signedIn=%s setup=%s as %s',
    (relayStatus, signedIn, setupState, expected) => {
      expect(browserChatMcpStatusLabel(relayStatus, signedIn, setupState)).toBe(expected);
    },
  );
  afterEach(async () => {
    cleanup();
    testDatabase.close();
    await testDatabase.delete();
  });

  const updateTestChat = async (id: ChatId, patch: Partial<Chat>): Promise<Chat> => {
    await testDatabase.chats.update(id, patch);
    const row = await testDatabase.chats.get(id);
    if (!row) throw new Error('chat_not_found');
    return row;
  };

  const renderHub = (
    chatId?: string,
    initialSessions?: ComponentProps<typeof BrowserChatHub>['initialSessions'],
    initialProjects?: ComponentProps<typeof BrowserChatHub>['initialProjects'],
    initialOutputFeed?: ComponentProps<typeof BrowserChatHub>['initialOutputFeed'],
  ) =>
    render(
      <BrowserChatHub
        chatId={chatId}
        database={testDatabase}
        updateChat={updateTestChat}
        bindingScope={{ accountId: 'account-1', workspaceId: 'workspace-1' }}
        initialSessions={initialSessions}
        initialProjects={initialProjects}
        initialOutputFeed={initialOutputFeed}
      />,
    );

  it('shows the three provider-owned surfaces with separate page and bridge status', () => {
    renderHub();

    expect(screen.getByRole('tab', { name: 'ChatGPT' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Claude/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Gemini/i })).toBeTruthy();
    expect(screen.getByText(/page status/i)).toBeTruthy();
    expect(screen.getByText(/tool bridge/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /open chatgpt/i })).toBeTruthy();
    expect(screen.queryByText(/sign in or sign up/i)).toBeNull();
    expect(screen.getByText(/not auto-connected/i)).toBeTruthy();
    expect(screen.getByText(/provider subscription and limits still apply/i)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders provider, account, authorization, relay, model, and usage states independently', () => {
    bridge.publishBrowserChatRelayStatus('connected');

    renderHub();

    expect(screen.getByText('Provider session')).toBeTruthy();
    expect(screen.getByText('Provider-managed · sign-in state not exposed')).toBeTruthy();
    expect(screen.getByText('VibeSpace account')).toBeTruthy();
    expect(screen.getByText('account-1@example.test')).toBeTruthy();
    expect(screen.getByText('MCP authorization')).toBeTruthy();
    expect(screen.getByText('Unknown · no OAuth authorization evidence')).toBeTruthy();
    expect(screen.getByText('Desktop relay')).toBeTruthy();
    expect(screen.getByText('Provider-controlled · not exposed to VibeSpace')).toBeTruthy();
    expect(screen.getByText('ChatGPT web quota is not exposed to VibeSpace')).toBeTruthy();
    expect(screen.queryByText(/^authorized$/i)).toBeNull();
  });

  it('renders only verified account-project output metadata from the live feed', async () => {
    await testDatabase.jarvis_runs.bulkAdd([
      {
        id: 'run-output',
        account_id: 'account-1',
        workspace_id: 'workspace-1',
        project_id: 'project-1',
        source: 'browser_chat',
        status: 'completed',
        agent_id: 'jarvis',
        identity_version: 1,
        profile_revision_id: 'revision-output',
        model: {
          provider_id: 'local',
          model_id: 'fixture',
          connection_mode: 'local',
          capabilities: {},
          captured_at: 1,
        },
        created_at: 1,
        updated_at: 30,
        completed_at: 30,
      },
      {
        id: 'run-output-foreign',
        account_id: 'account-2',
        workspace_id: 'workspace-1',
        project_id: 'project-1',
        source: 'browser_chat',
        status: 'completed',
        agent_id: 'jarvis',
        identity_version: 1,
        profile_revision_id: 'revision-foreign',
        model: {
          provider_id: 'local',
          model_id: 'fixture',
          connection_mode: 'local',
          capabilities: {},
          captured_at: 1,
        },
        created_at: 1,
        updated_at: 40,
        completed_at: 40,
      },
    ]);
    await testDatabase.jarvis_artifacts.bulkAdd([
      {
        schema_version: 1,
        id: 'artifact-output',
        run_id: 'run-output',
        request_id: 'request-output',
        attempt_number: 1,
        state: 'ready',
        kind: 'code',
        title: 'Generated browser output',
        safe_summary: 'Verified output metadata.',
        source_refs: [],
        created_at: 30,
      },
      {
        schema_version: 1,
        id: 'artifact-output-foreign',
        run_id: 'run-output-foreign',
        request_id: 'request-output-foreign',
        attempt_number: 1,
        state: 'ready',
        kind: 'text',
        title: 'Foreign browser output',
        source_refs: [],
        created_at: 40,
      },
    ]);
    const outputFeed = await outputFeedModule.listBrowserChatOutputFeed({
      database: testDatabase,
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
    });
    expect(outputFeed).toMatchObject({
      runs: [{ id: 'run-output', outputs: [{ title: 'Generated browser output' }] }],
    });

    renderHub(undefined, undefined, undefined, outputFeed);

    expect(await screen.findByText('Generated browser output')).toBeTruthy();
    expect(screen.getByText(/browser chat · completed/i)).toBeTruthy();
    expect(screen.queryByText('Foreign browser output')).toBeNull();
    expect(screen.getByRole('button', { name: /open verified outputs in history/i })).toBeTruthy();
  });

  it('imports only an explicitly selected official ChatGPT export ZIP', async () => {
    renderHub();
    const input = screen.getByLabelText('Choose official ChatGPT export ZIP');
    const file = new File([new Uint8Array([1, 2, 3])], 'chatgpt-export.zip', {
      type: 'application/zip',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(exportImportHarness.importExport).toHaveBeenCalledWith(
        expect.objectContaining({
          database: testDatabase,
          accountId: 'account-1',
          workspaceId: 'workspace-1',
          fileName: 'chatgpt-export.zip',
          archive: expect.any(ArrayBuffer),
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it('keeps Claude and Gemini gated as future providers without scraping remote history', () => {
    renderHub();

    const claude = screen.getByRole('tab', { name: /Claude/i });
    const gemini = screen.getByRole('tab', { name: /Gemini/i });
    expect(claude).toHaveProperty('disabled', true);
    expect(gemini).toHaveProperty('disabled', true);
    fireEvent.click(claude);
    expect(browserChatStore.getState().providerId).toBe('chatgpt');
    expect(screen.getByLabelText('ChatGPT provider surface')).toBeTruthy();
    expect(document.body.textContent).toMatch(/does not.*read provider messages/i);
    expect(document.body.textContent).not.toMatch(/sync remote history/i);
  });

  it('renders durable pinned and provider sessions and persists their local actions', async () => {
    await testDatabase.projects.bulkPut([
      {
        id: 'project-1' as ProjectId,
        workspace_id: 'workspace-1' as WorkspaceId,
        name: 'Project One',
        created_at: 1,
        updated_at: 1,
      },
      {
        id: 'project-2' as ProjectId,
        workspace_id: 'workspace-1' as WorkspaceId,
        name: 'Project Two',
        created_at: 1,
        updated_at: 1,
      },
    ]);
    await testDatabase.chats.bulkPut([
      {
        id: 'chat-pinned' as ChatId,
        workspace_id: 'workspace-1' as WorkspaceId,
        project_id: 'project-1' as ProjectId,
        title: 'Legacy pinned title',
        mode: 'chat',
        active_agent_ids: [],
        pinned: false,
        created_at: 1,
        updated_at: 1,
      },
      {
        id: 'chat-regular' as ChatId,
        workspace_id: 'workspace-1' as WorkspaceId,
        project_id: 'project-1' as ProjectId,
        title: 'Legacy regular title',
        mode: 'chat',
        active_agent_ids: [],
        created_at: 1,
        updated_at: 1,
      },
    ]);
    let id = 0;
    const repository = createBrowserChatBindingRepository(
      testDatabase,
      () => 100,
      () => `binding-${++id}`,
    );
    const pinned = await repository.create({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      chatId: 'chat-pinned',
      provider: 'chatgpt',
      providerProfileKey: 'browser-chat/chatgpt',
      localTitle: 'Pinned architecture',
      pinned: true,
    });
    const regular = await repository.create({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      chatId: 'chat-regular',
      provider: 'chatgpt',
      providerProfileKey: 'browser-chat/chatgpt',
      localTitle: 'Research notes',
    });
    expect(
      await repository.list({ accountId: 'account-1', workspaceId: 'workspace-1' }),
    ).toHaveLength(2);
    const seededChats = await testDatabase.chats.bulkGet([
      'chat-pinned',
      'chat-regular',
    ] as ChatId[]);
    const seededProjects = await testDatabase.projects
      .where('workspace_id')
      .equals('workspace-1')
      .sortBy('name');
    expect(seededChats).toEqual([
      expect.objectContaining({ id: 'chat-pinned' }),
      expect.objectContaining({ id: 'chat-regular' }),
    ]);
    browserChatStore.getState().setEngine('browser', 'chat-regular');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderHub(
      'chat-regular',
      [
        { binding: pinned, chat: seededChats[0]! },
        { binding: regular, chat: seededChats[1]! },
      ],
      seededProjects,
    );

    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Pinned architecture' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Research notes' })).toBeTruthy();

    providerSurfaceHarness.onNavigation?.({
      providerId: 'chatgpt',
      surfaceId: 'browser-chat-chatgpt',
      url: 'https://chatgpt.com/c/conversation-1',
      timestamp: 101,
      kind: 'conversation',
      providerConversationKey: 'conversation-1',
    });
    await waitFor(async () =>
      expect(await testDatabase.browser_chat_bindings.get(regular.id)).toMatchObject({
        providerConversationKey: 'conversation-1',
        resumeUrl: 'https://chatgpt.com/c/conversation-1',
        bindingState: 'bound',
        lastOpenedAt: 101,
      }),
    );
    expect(
      (await testDatabase.browser_chat_bindings.get(pinned.id))?.providerConversationKey,
    ).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Unpin Pinned architecture' }));
    await waitFor(async () =>
      expect((await testDatabase.browser_chat_bindings.get(pinned.id))?.pinned).toBe(false),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename Research notes' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Browser Chat title' }), {
      target: { value: 'Renamed research' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Browser Chat title' }));
    await waitFor(async () => {
      expect((await testDatabase.browser_chat_bindings.get(regular.id))?.localTitle).toBe(
        'Renamed research',
      );
      expect((await testDatabase.chats.get('chat-regular' as ChatId))?.title).toBe(
        'Renamed research',
      );
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Project for Renamed research' }), {
      target: { value: 'project-2' },
    });
    await waitFor(async () => {
      expect((await testDatabase.browser_chat_bindings.get(regular.id))?.projectId).toBe(
        'project-2',
      );
      expect((await testDatabase.chats.get('chat-regular' as ChatId))?.project_id).toBe(
        'project-2',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Renamed research' }));
    await waitFor(async () =>
      expect(await testDatabase.browser_chat_bindings.get(regular.id)).toBeUndefined(),
    );
    expect(browserChatStore.getState().chatPreferences['chat-regular']?.engine).toBe('native');
  });

  it('requires an explicit project grant before arming the local relay', () => {
    localStorage.setItem(
      projectStorageKey(ROOT_PREFIX, 'project-1'),
      'C:\\Users\\viper\\Projects\\Safe',
    );
    renderHub('chat-1');

    expect(browserChatWorkspaceGrantStore.getSnapshot()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /approve current project access/i }));

    expect(browserChatWorkspaceGrantStore.getSnapshot()).toMatchObject({
      accountId: 'account-1',
      projectId: 'project-1',
      canonicalRoot: 'C:\\Users\\viper\\Projects\\Safe',
      readAllowed: true,
      modifyAllowed: false,
      terminalAllowed: false,
    });
    expect(getBridgeWorkspaceGrant()).toMatchObject({
      root: 'C:\\Users\\viper\\Projects\\Safe',
      displayName: 'Safe',
    });
    expect(screen.getByText(/local relay armed/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /revoke project access/i }));
    expect(browserChatWorkspaceGrantStore.getSnapshot()).toBeNull();
    expect(getBridgeWorkspaceGrant()).toBeUndefined();
    expect(screen.getByText(/grant revoked/i)).toBeTruthy();
  });

  it('persists the selected permission plan by account/project and applies it to a live grant', async () => {
    localStorage.setItem(
      projectStorageKey(ROOT_PREFIX, 'project-1'),
      'C:\\Users\\viper\\Projects\\Safe',
    );
    const first = renderHub('chat-1');
    const selector = await screen.findByLabelText('VibeSpace permission plan');

    fireEvent.change(selector, { target: { value: 'project_developer' } });
    await waitFor(async () =>
      expect(
        await testDatabase.browser_chat_permission_profiles
          .where('[accountId+workspaceId+projectId]')
          .equals(['account-1', 'workspace-1', 'project-1'])
          .first(),
      ).toMatchObject({ plan: 'project_developer' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /approve current project access/i }));
    expect(getBridgeWorkspaceGrant()).toMatchObject({
      permissionProfile: { plan: 'project_developer' },
    });

    first.unmount();
    renderHub('chat-1');
    await waitFor(() =>
      expect((screen.getByLabelText('VibeSpace permission plan') as HTMLSelectElement).value).toBe(
        'project_developer',
      ),
    );
  });

  it('starts the authenticated relay for a signed-in account before local project access is granted', () => {
    bridge.publishBrowserChatRelayStatus('connected');

    renderHub('chat-1');

    expect(browserChatWorkspaceGrantStore.getSnapshot()).toBeNull();
    expect(screen.getByText(/connected to this signed-in vibespace account/i)).toBeTruthy();
  });

  it('shows a relay failure instead of falling back to a not-configured provider status', () => {
    bridge.publishBrowserChatRelayStatus('error');

    renderHub('chat-1');

    expect(screen.getAllByText(/connection error/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^setup required$/i)).toBeNull();
  });

  it('shows only account-scoped advertised, running, and last-result tool truth', () => {
    publishBrowserChatToolCatalog({
      accountId: 'account-1',
      toolNames: ['fs.read', 'fs.list'],
      now: 100,
    });
    beginBrowserChatToolCall({
      accountId: 'account-1',
      callId: 'call_completed0001',
      toolName: 'fs.list',
      now: 110,
    });
    finishBrowserChatToolCall({
      accountId: 'account-1',
      callId: 'call_completed0001',
      ok: false,
      errorCode: 'LOCAL_READ_DENIED',
      elapsedMs: 25,
      now: 135,
    });
    beginBrowserChatToolCall({
      accountId: 'account-1',
      callId: 'call_running000001',
      toolName: 'fs.read',
      now: 140,
    });

    renderHub('chat-1');

    expect(screen.getByText(/2 advertised · 1 running/i)).toBeTruthy();
    expect(screen.getByText(/^fs\.read running$/i)).toBeTruthy();
    expect(screen.getByText(/last: fs\.list · local read denied · 25 ms/i)).toBeTruthy();
  });

  it('presents one branded VibeSpace MCP connection with honest approval boundaries', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fetcher = mockSuccessfulMcpDiscovery();
    const openPlugins = vi.spyOn(browserChatSurface, 'openChatGptPlugins').mockResolvedValue();

    renderHub('chat-1');

    expect(screen.getByText('VibeSpace MCP')).toBeTruthy();
    const permissionPlan = await screen.findByLabelText('VibeSpace permission plan');
    expect((permissionPlan as HTMLSelectElement).value).toBe('read');
    expect(screen.getByText(/write support not verified/i)).toBeTruthy();
    expect(screen.queryByText(/^file writes$/i)).toBeNull();
    expect(screen.getByText(/blocked by plan/i)).toBeTruthy();
    expect(screen.getByText('https://vibespace-mcp.fly.dev/mcp')).toBeTruthy();
    expect(screen.getAllByText(/enable developer mode/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/add vibespace mcp/i)).toBeTruthy();
    expect(screen.getByText(/approve access/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /connect vibespace mcp/i }));
    await waitFor(() => expect(openPlugins).toHaveBeenCalledOnce());

    expect(fetcher.mock.calls.map(([request]) => request.toString())).toEqual([
      'https://vibespace-mcp.fly.dev/health',
      'https://vibespace-mcp.fly.dev/.well-known/oauth-protected-resource',
      'https://auth.example/.well-known/oauth-authorization-server/auth/v1',
    ]);
    expect(writeText).toHaveBeenCalledWith('https://vibespace-mcp.fly.dev/mcp');
    expect(screen.getByText(/waiting for owner approval/i)).toBeTruthy();
    expect(screen.getByText(/one-time oauth approval/i)).toBeTruthy();
  });

  it('does not copy or navigate when MCP discovery fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 503 }));
    const openPlugins = vi.spyOn(browserChatSurface, 'openChatGptPlugins').mockResolvedValue();

    renderHub('chat-1');
    fireEvent.click(screen.getByRole('button', { name: /connect vibespace mcp/i }));

    expect(await screen.findByText(/health check failed/i)).toBeTruthy();
    expect(writeText).not.toHaveBeenCalled();
    expect(openPlugins).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /retry vibespace mcp/i })).toBeTruthy();
  });

  it('continues the safe browser handoff when clipboard access is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mockSuccessfulMcpDiscovery();
    const openPlugins = vi.spyOn(browserChatSurface, 'openChatGptPlugins').mockResolvedValue();

    renderHub('chat-1');
    fireEvent.click(screen.getByRole('button', { name: /connect vibespace mcp/i }));

    await waitFor(() => expect(openPlugins).toHaveBeenCalledOnce());
    expect(screen.getByText('https://vibespace-mcp.fly.dev/mcp')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy mcp endpoint/i })).toBeTruthy();
    expect(screen.getByText(/waiting for owner approval/i)).toBeTruthy();
  });

  it('retains both setup URLs when the system browser cannot open', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mockSuccessfulMcpDiscovery();
    vi.spyOn(browserChatSurface, 'openChatGptPlugins').mockRejectedValue(
      new Error('OS browser unavailable'),
    );

    renderHub('chat-1');
    fireEvent.click(screen.getByRole('button', { name: /connect vibespace mcp/i }));

    expect(await screen.findByText(/chatgpt apps could not be opened/i)).toBeTruthy();
    expect(screen.getByText('https://vibespace-mcp.fly.dev/mcp')).toBeTruthy();
    expect(screen.getByText('https://chatgpt.com/')).toBeTruthy();
  });
});
