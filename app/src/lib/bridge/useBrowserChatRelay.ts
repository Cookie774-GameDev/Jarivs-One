import { useEffect, useRef, useState } from 'react';

import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  getBrowserChatBridgeClient,
  resetBrowserChatBridgeClient,
  setBridgeWorkspaceGrant,
  type BridgeStatus,
} from './BridgeClient';
import { revokeBrowserChatWorkspace } from '@/features/browser-chat/workspaceGrant';

export const DEFAULT_VIBESPACE_MCP_URL = 'https://vibespace-mcp.combatonline02.workers.dev';
const RELAY_TICKET_TIMEOUT_MS = 10_000;

interface RelayTicketRequestOptions {
  signal?: AbortSignal;
}

export interface BrowserChatRelayScope {
  readonly accountId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}

export function resolveBrowserChatRelayUrl(cloudUrl: string | undefined): string | null {
  const value = cloudUrl?.trim().replace(/\/+$/u, '');
  if (!value || !/^https?:\/\//u.test(value)) return null;
  return `${value.replace(/^http/u, 'ws')}/browser-chat/bridge`;
}

export function resolveBrowserChatMcpUrl(cloudUrl: string | undefined): string | null {
  const value = cloudUrl?.trim().replace(/\/+$/u, '');
  if (!value || !/^https:\/\//u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || (url.pathname !== '' && url.pathname !== '/')) return null;
    url.pathname = '/mcp';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return null;
  }
}

export function resolveBrowserChatCloudUrl(
  environment: Record<string, string | undefined>,
): string | undefined {
  return (
    environment.VITE_VIBESPACE_MCP_URL ??
    environment.VITE_PHONE_JARVIS_CLOUD_URL ??
    DEFAULT_VIBESPACE_MCP_URL
  );
}

export async function requestBrowserChatRelayTicket(
  cloudUrl: string,
  jwt: string,
  fetcher: typeof fetch = fetch,
  options: RelayTicketRequestOptions = {},
): Promise<string> {
  const value = cloudUrl.trim().replace(/\/+$/u, '');
  const base = new URL(value);
  const loopback = base.hostname === '127.0.0.1' || base.hostname === 'localhost';
  if (
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback)) ||
    base.username ||
    base.password ||
    (base.pathname !== '' && base.pathname !== '/')
  ) {
    throw new Error('The VibeSpace MCP relay URL is invalid.');
  }
  base.pathname = '/relay/ticket';
  base.search = '';
  base.hash = '';
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(abort, RELAY_TICKET_TIMEOUT_MS);
  try {
    if (controller.signal.aborted)
      throw new DOMException('Relay ticket request aborted.', 'AbortError');
    const response = await fetcher(base, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      throw new DOMException('Relay ticket request aborted.', 'AbortError');
    }
    if (!response.ok) throw new Error('The VibeSpace MCP relay is unavailable.');
    const payload = (await response.json()) as { url?: unknown };
    if (controller.signal.aborted) {
      throw new DOMException('Relay ticket request aborted.', 'AbortError');
    }
    if (typeof payload.url !== 'string' || !/^wss?:\/\//u.test(payload.url)) {
      throw new Error('The VibeSpace MCP relay returned an invalid ticket.');
    }
    const relay = new URL(payload.url);
    const expectedProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const queryEntries = [...relay.searchParams.entries()];
    const ticket = queryEntries[0]?.[1] ?? '';
    if (
      relay.protocol !== expectedProtocol ||
      relay.host !== base.host ||
      relay.username ||
      relay.password ||
      relay.pathname !== '/browser-chat/bridge' ||
      relay.hash ||
      queryEntries.length !== 1 ||
      queryEntries[0]?.[0] !== 'ticket' ||
      !ticket ||
      ticket.length > 2_048 ||
      /[\s\u0000-\u001f\u007f]/u.test(ticket)
    ) {
      throw new Error('The VibeSpace MCP relay returned an invalid ticket.');
    }
    return relay.toString();
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function useBrowserChatRelay(
  enabled: boolean,
  scope?: BrowserChatRelayScope,
): BridgeStatus | 'disabled' {
  const [status, setStatus] = useState<BridgeStatus | 'disabled'>('disabled');
  const lifecycleGenerationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const activeScopeRef = useRef<string | null>(null);

  useEffect(() => {
    const scopeKey = `${scope?.accountId ?? ''}\u0000${scope?.workspaceId ?? ''}\u0000${scope?.projectId ?? ''}`;
    if (activeScopeRef.current !== null && activeScopeRef.current !== scopeKey) {
      setBridgeWorkspaceGrant();
      revokeBrowserChatWorkspace();
    }
    activeScopeRef.current = scopeKey;
    const lifecycleGeneration = ++lifecycleGenerationRef.current;
    const environment = import.meta.env as Record<string, string | undefined>;
    const cloudUrl = resolveBrowserChatCloudUrl(environment);
    const url = resolveBrowserChatRelayUrl(cloudUrl);
    const usesTicketGateway =
      Boolean(environment.VITE_VIBESPACE_MCP_URL) ||
      (!environment.VITE_PHONE_JARVIS_CLOUD_URL && cloudUrl === DEFAULT_VIBESPACE_MCP_URL);
    let cancelled = false;
    let activeRequest: AbortController | undefined;
    let unsubscribe: (() => void) | undefined;
    let activeIdentity: { accountId: string; jwt: string } | undefined;
    const lifecycleIsCurrent = () =>
      !cancelled && lifecycleGenerationRef.current === lifecycleGeneration;
    const invalidateAuthWork = () => {
      authGenerationRef.current += 1;
      activeRequest?.abort();
      activeRequest = undefined;
    };
    const clearSessionGrant = () => {
      setBridgeWorkspaceGrant();
      revokeBrowserChatWorkspace();
    };
    const disableRelay = (clearGrant = false) => {
      invalidateAuthWork();
      activeIdentity = undefined;
      resetBrowserChatBridgeClient();
      if (clearGrant) clearSessionGrant();
      if (lifecycleIsCurrent()) setStatus('disabled');
    };

    if (!enabled || !url || !isSupabaseConfigured()) {
      disableRelay(!enabled);
      return;
    }

    const start = async (jwt: string, accountId: string) => {
      if (!lifecycleIsCurrent()) return;
      if (!accountId || (scope?.accountId && accountId !== scope.accountId)) {
        disableRelay(true);
        return;
      }
      if (
        activeIdentity &&
        (activeIdentity.accountId !== accountId || activeIdentity.jwt !== jwt)
      ) {
        clearSessionGrant();
      }
      activeIdentity = { accountId, jwt };
      invalidateAuthWork();
      const authGeneration = authGenerationRef.current;
      const requestController = new AbortController();
      activeRequest = requestController;
      resetBrowserChatBridgeClient();
      const generationIsCurrent = () =>
        lifecycleIsCurrent() &&
        !requestController.signal.aborted &&
        authGenerationRef.current === authGeneration;
      try {
        const client = getBrowserChatBridgeClient({
          url,
          jwt,
          accountId,
          workspaceId: scope?.workspaceId,
          projectId: scope?.projectId,
          ...(usesTicketGateway
            ? {
                resolveUrl: (token) =>
                  requestBrowserChatRelayTicket(cloudUrl!, token, fetch, {
                    signal: requestController.signal,
                  }),
              }
            : {}),
          onStatus: (nextStatus) => {
            if (generationIsCurrent()) setStatus(nextStatus);
          },
        });
        client.setJwt(jwt);
        if (!generationIsCurrent()) return;
        await client.start();
      } catch {
        if (generationIsCurrent()) setStatus('error');
      }
    };

    void (async () => {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase/client');
        if (!lifecycleIsCurrent()) return;
        const client = getSupabaseClient();
        if (!client) return;
        const initialAuthGeneration = authGenerationRef.current;
        const subscription = client.auth.onAuthStateChange((event, session) => {
          if (!lifecycleIsCurrent()) return;
          const nextJwt = session?.access_token;
          const nextAccountId = session?.user?.id ?? '';
          if (event === 'SIGNED_OUT' || !nextJwt || !nextAccountId) {
            disableRelay(true);
            return;
          }
          void start(nextJwt, nextAccountId);
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        const { data } = await client.auth.getSession();
        if (!lifecycleIsCurrent() || authGenerationRef.current !== initialAuthGeneration) {
          return;
        }
        const jwt = data.session?.access_token;
        const accountId = data.session?.user?.id ?? '';
        if (jwt && accountId) await start(jwt, accountId);
        else disableRelay(true);
      } catch {
        if (lifecycleIsCurrent()) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      lifecycleGenerationRef.current += 1;
      invalidateAuthWork();
      unsubscribe?.();
      resetBrowserChatBridgeClient();
    };
  }, [enabled, scope?.accountId, scope?.workspaceId, scope?.projectId]);

  return status;
}
