import * as React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useBrowserChatStore } from './browserChatStore';
import type { BrowserChatProviderDefinition } from './providerRegistry';
import {
  browserChatSurface,
  type ProviderSurfaceController,
  type ProviderSurfaceBounds,
} from './providerSurface';

interface BrowserProviderSurfaceProps {
  readonly provider: BrowserChatProviderDefinition;
  readonly runtime?: ProviderSurfaceController;
}

export function BrowserProviderSurface({
  provider,
  runtime = browserChatSurface,
}: BrowserProviderSurfaceProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const setProviderRuntime = useBrowserChatStore((state) => state.setProviderRuntime);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frame = 0;
    let unsubscribeHostGeometry: (() => void) | undefined;

    const synchronize = () => {
      setProviderRuntime(provider.id, {
        pageStatus: 'opening',
        toolBridgeStatus: provider.toolBridgeStatus,
      });
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (disposed) return;
        const rect = host.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const bounds: ProviderSurfaceBounds = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
        void runtime
          .openManaged(provider, bounds)
          .then((result) => {
            if (!disposed) {
              setError(null);
              setProviderRuntime(provider.id, {
                pageStatus: result.kind === 'managed' ? 'ready' : 'system_browser',
                toolBridgeStatus: provider.toolBridgeStatus,
              });
            }
          })
          .catch((cause) => {
            if (!disposed) {
              const message =
                cause instanceof Error ? cause.message : 'Managed provider surface failed.';
              setError(message);
              setProviderRuntime(provider.id, {
                pageStatus: 'error',
                toolBridgeStatus: provider.toolBridgeStatus,
                error: message,
              });
            }
          });
      });
    };

    synchronize();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => synchronize());
    observer?.observe(host);
    window.addEventListener('resize', synchronize);
    void runtime.subscribeHostGeometry?.(synchronize).then((unsubscribe) => {
      if (disposed) {
        unsubscribe();
      } else {
        unsubscribeHostGeometry = unsubscribe;
      }
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', synchronize);
      unsubscribeHostGeometry?.();
      void runtime.hideAll();
    };
  }, [provider, runtime, setProviderRuntime]);

  return (
    <div
      ref={hostRef}
      aria-label={`${provider.label} provider surface`}
      className="relative min-h-[22rem] flex-1 overflow-hidden rounded-xl border border-border/80 bg-background"
    >
      <div className="absolute inset-0 grid place-items-center p-8 text-center">
        <div className="max-w-md space-y-3">
          <ShieldCheck className="mx-auto h-8 w-8 text-accent-copper" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {error ? 'Managed provider surface is unavailable' : `Opening ${provider.label}`}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {error
                ? `${error} Your provider account is untouched; use the supported system-browser fallback.`
                : 'The provider owns this page and sign-in. VibeSpace does not read passwords, cookies, prompts, or replies.'}
            </p>
          </div>
          {error ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void runtime.openSystemBrowser(provider)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open {provider.label} in system browser
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
