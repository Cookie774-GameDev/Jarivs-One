import * as React from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe2, RefreshCw, Square } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { isTauri } from '@/lib/utils';
import { browserFramePolicy, normalizeBrowserUrl } from './browserSecurity';
import type { WorkbenchPanel } from './types';

interface BrowserPanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface NativeBrowserState {
  panelId: string;
  operationId: string;
  url: string;
  loading: boolean;
  error?: string | null;
}

interface SurfaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NativeOpenRequest {
  url: string;
  bounds: SurfaceBounds;
}

function readBounds(element: HTMLElement | null): SurfaceBounds | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function createOperationId(): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '');
  return `wb_${random ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function sameNativeOpenRequest(left: NativeOpenRequest | null, right: NativeOpenRequest): boolean {
  if (!left) return false;
  return (
    left.url === right.url &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
  );
}

function nativeFailureMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  if (typeof cause === 'string' && cause.trim()) return cause.trim();
  return fallback;
}

function waitForNativeStatus(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

export function BrowserPanel({ panel, onUpdate }: BrowserPanelProps) {
  const currentUrl = panel.settings.url ?? 'https://developer.mozilla.org';
  const [draft, setDraft] = React.useState(currentUrl);
  const [frameKey, setFrameKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>('idle');
  const [history, setHistory] = React.useState<string[]>([currentUrl]);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const operationId = React.useRef(createOperationId()).current;
  const onUpdateRef = React.useRef(onUpdate);
  const settingsRef = React.useRef(panel.settings);
  const nativeUrlRef = React.useRef(currentUrl);
  const nativeStatusGenerationRef = React.useRef(0);
  const nativeOpenRef = React.useRef<{
    active: NativeOpenRequest | null;
    pending: NativeOpenRequest | null;
    promise: Promise<void> | null;
  }>({ active: null, pending: null, promise: null });
  onUpdateRef.current = onUpdate;
  settingsRef.current = panel.settings;

  const applyNativeState = React.useCallback(
    (payload: NativeBrowserState) => {
      if (payload.panelId !== panel.id || payload.operationId !== operationId) {
        throw new Error('workbench_browser_operation_stale');
      }
      const normalized = normalizeBrowserUrl(payload.url);
      nativeUrlRef.current = normalized;
      setDraft(normalized);
      setError(payload.error ?? null);
      setLoadState(payload.error ? 'error' : payload.loading ? 'loading' : 'loaded');
      onUpdateRef.current({
        settings: { ...settingsRef.current, url: normalized },
        status: payload.error ? 'error' : 'ready',
      });
    },
    [operationId, panel.id],
  );

  const reconcileNativeState = React.useCallback(async () => {
    const generation = ++nativeStatusGenerationRef.current;
    let delayMs = 200;
    while (nativeStatusGenerationRef.current === generation) {
      const payload = await invoke<NativeBrowserState>('workbench_browser_surface_status', {
        panelId: panel.id,
        operationId,
      });
      if (nativeStatusGenerationRef.current !== generation) return;
      applyNativeState(payload);
      if (!payload.loading || payload.error) return;
      await waitForNativeStatus(delayMs);
      delayMs = Math.min(delayMs * 2, 1_000);
    }
  }, [applyNativeState, operationId, panel.id]);

  const policy = React.useMemo(() => {
    try {
      return browserFramePolicy(currentUrl);
    } catch {
      return null;
    }
  }, [currentUrl]);

  const openNative = React.useCallback(
    async (url: string) => {
      if (!isTauri) throw new Error('The in-window browser is available in the VibeSpace app.');
      const bounds = readBounds(surfaceRef.current);
      if (!bounds) return;
      setLoadState('loading');
      const next = { url, bounds };
      const state = nativeOpenRef.current;
      if (state.promise) {
        state.pending = sameNativeOpenRequest(state.active, next) ? null : next;
        return state.promise;
      }
      const run = async () => {
        let request: NativeOpenRequest | null = next;
        while (request) {
          state.active = request;
          state.pending = null;
          const opened = await invoke<NativeBrowserState>('workbench_browser_surface_open', {
            panelId: panel.id,
            operationId,
            url: request.url,
            bounds: request.bounds,
          });
          applyNativeState(opened);
          if (opened.loading && !opened.error) {
            void reconcileNativeState().catch((cause) => {
              if (nativeStatusGenerationRef.current === 0) return;
              setError(nativeFailureMessage(cause, 'Browser state is unavailable.'));
              setLoadState('error');
            });
          }
          request = state.pending;
        }
      };
      const promise = run().finally(() => {
        if (state.promise === promise) {
          state.active = null;
          state.pending = null;
          state.promise = null;
        }
      });
      state.promise = promise;
      return promise;
    },
    [applyNativeState, operationId, panel.id, reconcileNativeState],
  );

  React.useEffect(() => setDraft(currentUrl), [currentUrl]);

  React.useEffect(() => {
    if (policy?.delivery !== 'native-child') return;
    let disposed = false;

    const refreshBounds = () =>
      void openNative(nativeUrlRef.current).catch((cause) => {
        if (disposed) return;
        setError(nativeFailureMessage(cause, 'The page could not open.'));
        setLoadState('error');
      });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refreshBounds);
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    window.addEventListener('resize', refreshBounds);
    window.addEventListener('scroll', refreshBounds, true);
    refreshBounds();

    return () => {
      disposed = true;
      nativeStatusGenerationRef.current = 0;
      observer?.disconnect();
      window.removeEventListener('resize', refreshBounds);
      window.removeEventListener('scroll', refreshBounds, true);
      if (isTauri) {
        const closeAfterOpen = async () => {
          await nativeOpenRef.current.promise?.catch(() => undefined);
          await invoke('workbench_browser_surface_hide', { panelId: panel.id, operationId });
        };
        void closeAfterOpen().catch(() => undefined);
      }
    };
  }, [openNative, operationId, panel.id, policy?.delivery]);

  React.useEffect(() => {
    if (policy?.delivery !== 'native-child') return;
    nativeUrlRef.current = policy.externalUrl;
    void openNative(policy.externalUrl).catch((cause) => {
      const message = nativeFailureMessage(cause, 'The page could not open.');
      setError(message);
      setLoadState('error');
    });
  }, [openNative, policy?.delivery, policy?.externalUrl]);

  React.useEffect(() => {
    if (policy) setLoadState('loading');
  }, [frameKey, policy]);

  const commitUrl = (normalized: string, pushHistory: boolean) => {
    const nextPolicy = browserFramePolicy(normalized);
    setError(null);
    setDraft(normalized);
    onUpdate({ settings: { ...panel.settings, url: normalized }, status: 'ready' });
    if (pushHistory) {
      setHistory((previous) => {
        const base = previous.slice(0, historyIndex + 1);
        if (base[base.length - 1] === normalized) return base;
        return [...base, normalized].slice(-40);
      });
      setHistoryIndex((index) => Math.min(index + 1, 39));
    }
    setLoadState('loading');
    if (nextPolicy.delivery === 'embedded') setFrameKey((value) => value + 1);
    else
      void openNative(nextPolicy.externalUrl).catch((cause) => {
        const message = nativeFailureMessage(cause, 'The page could not open.');
        setError(message);
        setLoadState('error');
        toast.warning('Page could not open', message);
      });
  };

  const navigate = (event?: React.FormEvent) => {
    event?.preventDefault();
    try {
      commitUrl(normalizeBrowserUrl(draft), true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That address cannot be opened.';
      setError(message);
      setLoadState('error');
      toast.warning('Browser address blocked', message);
    }
  };

  const goHistory = (delta: -1 | 1) => {
    if (policy?.delivery === 'native-child') {
      setError(null);
      setLoadState('loading');
      void invoke('workbench_browser_surface_history', {
        panelId: panel.id,
        operationId,
        delta,
      }).catch((cause) => {
        setError(nativeFailureMessage(cause, 'History is unavailable.'));
        setLoadState('error');
      });
      return;
    }
    const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    setHistoryIndex(next);
    commitUrl(history[next]!, false);
  };

  const nativeControl = (command: 'reload' | 'stop') => {
    if (policy?.delivery !== 'native-child') {
      if (command === 'reload') {
        setLoadState('loading');
        setFrameKey((value) => value + 1);
      } else setLoadState('idle');
      return;
    }
    if (command === 'reload') setLoadState('loading');
    void invoke(`workbench_browser_surface_${command}`, {
      panelId: panel.id,
      operationId,
    }).catch((cause) => {
      setError(nativeFailureMessage(cause, `Browser ${command} failed.`));
      setLoadState('error');
    });
  };

  const showFrame = policy?.delivery === 'embedded' && loadState !== 'idle';
  return (
    <div
      className="workbench-browser"
      data-testid="workbench-browser-panel"
      onWheel={(event) => event.stopPropagation()}
    >
      <form className="workbench-browser-bar" onSubmit={navigate}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Back"
          onClick={() => goHistory(-1)}
        >
          <ArrowLeft />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Forward"
          onClick={() => goHistory(1)}
        >
          <ArrowRight />
        </Button>
        <Globe2 aria-hidden="true" />
        <input
          className="[html[data-theme=warm]_&]:border-border-mid [html[data-theme=warm]_&]:bg-background [html[data-theme=warm]_&]:text-foreground [html[data-theme=warm]_&]:caret-foreground [html[data-theme=warm]_&]:placeholder:text-muted-foreground"
          aria-label="Browser address"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Go">
          <ExternalLink />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Reload browser"
          onClick={() => nativeControl('reload')}
        >
          <RefreshCw />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Stop loading"
          onClick={() => nativeControl('stop')}
        >
          <Square />
        </Button>
      </form>
      {loadState === 'loading' ? (
        <p className="workbench-browser-status" aria-live="polite">
          Loading…
        </p>
      ) : null}
      {error ? (
        <div className="workbench-panel-empty" role="alert">
          <strong>Page could not open</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {policy?.delivery === 'native-child' ? (
        <div
          ref={surfaceRef}
          className="workbench-browser-native-surface"
          data-testid="workbench-browser-native-surface"
          aria-label="In-window web page"
        />
      ) : null}
      {showFrame && policy ? (
        <iframe
          key={`${policy.src}-${frameKey}`}
          title={`${panel.title} web page`}
          src={policy.src}
          sandbox={policy.sandbox}
          referrerPolicy={policy.referrerPolicy}
          allow={policy.allow}
          onLoad={() => setLoadState('loaded')}
        />
      ) : null}
      <p className="workbench-browser-engine">
        Remote pages stay inside a capability-free VibeSpace child WebView.
      </p>
    </div>
  );
}

export { readBounds };
