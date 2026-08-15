import * as React from 'react';

import { useAuthStore } from '@/stores/auth';
import { useUIStore, type Route } from '@/stores/ui';
import { useBrowserChatStore, type VibeSpaceChatEngine } from './browserChatStore';
import { browserChatSurface, type ProviderSurfaceController } from './providerSurface';

type BrowserChatSurfaceRuntime = Pick<ProviderSurfaceController, 'hideAll'>;

interface BrowserChatSurfaceGuardProps {
  readonly runtime?: BrowserChatSurfaceRuntime;
}

export function shouldShowBrowserChatSurface(input: {
  readonly route: Route;
  readonly engine: VibeSpaceChatEngine;
}): boolean {
  return input.route === 'chat' && input.engine === 'browser';
}

/**
 * Global route/account authority for provider child WebViews.
 *
 * PageRouter intentionally defers route rendering for smooth transitions. A
 * provider WebView is native and therefore cannot depend on that deferred React
 * teardown. This guard reads the immediate UI route and hides every Browser
 * Chat child before another route can paint. It also hides on account changes so
 * a previous account's persistent provider profile is never left visible.
 */
export function BrowserChatSurfaceGuard({
  runtime = browserChatSurface,
}: BrowserChatSurfaceGuardProps) {
  const route = useUIStore((state) => state.route);
  const activeChatId = useUIStore((state) => state.activeChatId);
  const engine = useBrowserChatStore(
    (state) => state.chatPreferences[activeChatId ?? '']?.engine ?? state.engine,
  );
  const accountId = useAuthStore(
    (state) => state.cloudSession?.user_id ?? state.localUserId ?? '',
  );
  const visible = shouldShowBrowserChatSurface({ route, engine });
  const previousAccountId = React.useRef(accountId);

  React.useLayoutEffect(() => {
    const accountChanged = previousAccountId.current !== accountId;
    previousAccountId.current = accountId;
    if (!visible || accountChanged) {
      void runtime.hideAll().catch(() => undefined);
    }
  }, [accountId, runtime, visible]);

  React.useEffect(
    () => () => {
      void runtime.hideAll().catch(() => undefined);
    },
    [runtime],
  );

  return null;
}
