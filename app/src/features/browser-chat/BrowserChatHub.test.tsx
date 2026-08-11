import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('./BrowserProviderSurface', () => ({
  BrowserProviderSurface: ({ provider }: { provider: { label: string } }) => (
    <div aria-label={`${provider.label} provider surface`}>{provider.label} real provider page</div>
  ),
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
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PHONE_JARVIS_CLOUD_URL', 'https://vibespace-mcp.fly.dev');
    localStorage.clear();
    revokeBrowserChatWorkspace();
    setBridgeWorkspaceGrant();
    bridge.resetBrowserChatRelayStatus();
    useAuthStore.setState({
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
  afterEach(cleanup);

  it('shows the three provider-owned surfaces with separate page and bridge status', () => {
    render(<BrowserChatHub />);

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

  it('keeps Claude and Gemini gated as future providers without scraping remote history', () => {
    render(<BrowserChatHub />);

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

  it('requires an explicit read-only project grant before arming the local relay', () => {
    localStorage.setItem(
      projectStorageKey(ROOT_PREFIX, 'project-1'),
      'C:\\Users\\viper\\Projects\\Safe',
    );
    render(<BrowserChatHub chatId="chat-1" />);

    expect(browserChatWorkspaceGrantStore.getSnapshot()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /approve current project read-only/i }));

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
  });

  it('starts the authenticated relay for a signed-in account before local project access is granted', () => {
    bridge.publishBrowserChatRelayStatus('connected');

    render(<BrowserChatHub chatId="chat-1" />);

    expect(browserChatWorkspaceGrantStore.getSnapshot()).toBeNull();
    expect(screen.getByText(/connected to this signed-in vibespace account/i)).toBeTruthy();
  });

  it('shows a relay failure instead of falling back to a not-configured provider status', () => {
    bridge.publishBrowserChatRelayStatus('error');

    render(<BrowserChatHub chatId="chat-1" />);

    expect(screen.getAllByText(/connection error/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^setup required$/i)).toBeNull();
  });

  it('presents one branded VibeSpace MCP connection with honest approval boundaries', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fetcher = mockSuccessfulMcpDiscovery();
    const openPlugins = vi.spyOn(browserChatSurface, 'openChatGptPlugins').mockResolvedValue();

    render(<BrowserChatHub chatId="chat-1" />);

    expect(screen.getByText('VibeSpace MCP')).toBeTruthy();
    expect(screen.getByText(/file reads/i)).toBeTruthy();
    expect(screen.getByText(/file writes/i)).toBeTruthy();
    expect(screen.getByText(/playwright browser/i)).toBeTruthy();
    expect(screen.getByText(/installed mcp tools/i)).toBeTruthy();
    expect(screen.getAllByText(/approval required/i).length).toBeGreaterThanOrEqual(3);
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

    render(<BrowserChatHub chatId="chat-1" />);
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

    render(<BrowserChatHub chatId="chat-1" />);
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

    render(<BrowserChatHub chatId="chat-1" />);
    fireEvent.click(screen.getByRole('button', { name: /connect vibespace mcp/i }));

    expect(await screen.findByText(/chatgpt apps could not be opened/i)).toBeTruthy();
    expect(screen.getByText('https://vibespace-mcp.fly.dev/mcp')).toBeTruthy();
    expect(screen.getByText('https://chatgpt.com/')).toBeTruthy();
  });
});
