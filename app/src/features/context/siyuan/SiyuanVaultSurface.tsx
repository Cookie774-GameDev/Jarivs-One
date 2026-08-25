import * as React from 'react';
import { RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  measureSiyuanSurfaceBounds,
  productionSiyuanSurfaceBridge,
  redactSiyuanSurfaceError,
  type SiyuanSurfaceBridge,
} from './siyuanSurface';

export function SiyuanVaultSurface({
  projectId,
  mapId,
  notebookId,
  rootDocumentId,
  onClose,
  bridge = productionSiyuanSurfaceBridge,
}: {
  projectId: string;
  mapId: string;
  notebookId: string | null;
  rootDocumentId: string | null;
  onClose(): void;
  bridge?: SiyuanSurfaceBridge;
}) {
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = React.useState('');

  const open = React.useCallback(async () => {
    const element = surfaceRef.current;
    if (!element) return;
    setState('loading');
    setError('');
    try {
      const status = await bridge.open(
        projectId,
        { mapId, notebookId, rootDocumentId, graphMode: 'local' },
        measureSiyuanSurfaceBounds(element),
      );
      if (
        !status.created ||
        !status.visible ||
        status.projectId !== projectId ||
        status.mapId !== mapId ||
        status.notebookId !== notebookId ||
        status.rootDocumentId !== rootDocumentId ||
        status.graphMode !== 'local'
      ) {
        throw new Error('siyuan_surface_status_invalid');
      }
      setState('ready');
    } catch (cause) {
      setError(redactSiyuanSurfaceError(cause));
      setState('error');
    }
  }, [bridge, mapId, notebookId, projectId, rootDocumentId]);

  React.useEffect(() => {
    void open();
    return () => {
      // A retained child webview keeps the native window in multi-webview
      // mode even while hidden. Commands that legitimately require the
      // ordinary main WebviewWindow would then fail before reaching their
      // authority checks. Retire the child whenever focused-map mode exits;
      // reopening remains fast because the supervised SiYuan kernel stays up.
      void bridge.close();
    };
  }, [bridge, open]);

  React.useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    let lastBounds = '';
    const sync = () => {
      try {
        const bounds = measureSiyuanSurfaceBounds(element);
        const serialized = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
        if (serialized === lastBounds) return;
        lastBounds = serialized;
        void bridge.setBounds(bounds);
      } catch {
        // The open/retry state remains the user-facing authority.
      }
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    sync();
    const moveMonitor = window.setInterval(sync, 250);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.clearInterval(moveMonitor);
      window.removeEventListener('resize', sync);
    };
  }, [bridge]);

  const close = async () => {
    await bridge.close().catch(() => false);
    onClose();
  };

  return (
    <section
      data-testid="siyuan-vault-surface"
      data-siyuan-map-id={mapId}
      className="absolute inset-0 z-50 flex min-h-0 flex-col bg-background"
      aria-label="SiYuan Context Vault"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-ui-strong text-foreground">
            <ShieldCheck className="h-4 w-4 text-accent-sage" /> Context Vault
          </div>
          <p className="truncate text-metadata text-muted-foreground">
            Official SiYuan v3.8.1 graph · embedded · project-scoped · local loopback only
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void bridge.reload()}
          disabled={state !== 'ready'}
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void close()}>
          <X className="h-4 w-4" /> Close
        </Button>
      </header>
      <div
        ref={surfaceRef}
        className="relative min-h-[240px] flex-1 overflow-hidden bg-paper"
        data-siyuan-surface-state={state}
      >
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          {state === 'error' ? (
            <div role="alert" className="max-w-lg rounded-xl border border-destructive/30 p-5">
              <h2 className="text-ui-strong text-foreground">Context Vault could not open</h2>
              <p className="mt-2 font-mono text-metadata text-destructive">{error}</p>
              <Button className="mt-4" size="sm" variant="accent" onClick={() => void open()}>
                Retry
              </Button>
            </div>
          ) : (
            <div aria-live="polite" className="text-secondary text-muted-foreground">
              <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-accent-copper" />
              {state === 'ready'
                ? 'The official SiYuan graph is embedded inside this VibeSpace page.'
                : 'Starting the local Context Vault…'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
