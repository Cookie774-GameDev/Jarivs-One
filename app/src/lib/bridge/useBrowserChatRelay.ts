import { useEffect, useState } from 'react';

import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  getBrowserChatBridgeClient,
  resetBrowserChatBridgeClient,
  type BridgeStatus,
} from './BridgeClient';

export function resolveBrowserChatRelayUrl(cloudUrl: string | undefined): string | null {
  const value = cloudUrl?.trim().replace(/\/+$/u, '');
  if (!value || !/^https?:\/\//u.test(value)) return null;
  return `${value.replace(/^http/u, 'ws')}/browser-chat/bridge`;
}

export function useBrowserChatRelay(enabled: boolean): BridgeStatus | 'disabled' {
  const [status, setStatus] = useState<BridgeStatus | 'disabled'>('disabled');

  useEffect(() => {
    const url = resolveBrowserChatRelayUrl(
      (import.meta.env as Record<string, string | undefined>).VITE_PHONE_JARVIS_CLOUD_URL,
    );
    if (!enabled || !url || !isSupabaseConfigured()) {
      resetBrowserChatBridgeClient();
      setStatus('disabled');
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const start = async (jwt: string) => {
      if (cancelled) return;
      try {
        const client = getBrowserChatBridgeClient({
          url,
          jwt,
          onStatus: setStatus,
        });
        client.setJwt(jwt);
        await client.start();
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void (async () => {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase/client');
        if (cancelled) return;
        const client = getSupabaseClient();
        if (!client) return;
        const { data } = await client.auth.getSession();
        const jwt = data.session?.access_token;
        if (jwt) await start(jwt);
        const subscription = client.auth.onAuthStateChange((event, session) => {
          const nextJwt = session?.access_token;
          if (nextJwt && event !== 'SIGNED_OUT') void start(nextJwt);
          if (event === 'SIGNED_OUT') {
            resetBrowserChatBridgeClient();
            setStatus('disabled');
          }
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      resetBrowserChatBridgeClient();
    };
  }, [enabled]);

  return status;
}
