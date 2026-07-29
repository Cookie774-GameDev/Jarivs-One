import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  RefreshCw,
  RotateCw,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useUIStore } from '@/stores/ui';
import { DEVICE_PRESETS, ZOOM_STEPS, getDevicePreset, orientSize } from './previewDevices';
import { normalizePreviewUrl } from './previewUrl';
import {
  isTauriRuntime,
  measurePreviewBounds,
  previewCreate,
  previewDestroy,
  previewHide,
  previewNavigate,
  previewProbeUrl,
  previewReload,
  previewSetBounds,
  previewShow,
  probeDevServers,
  startStaticServer,
} from './previewBridge';
import { usePreviewStore } from './previewStore';
import './preview.css';

export function PreviewStudio() {
  const route = useUIStore((s) => s.route);
  const setRoute = useUIStore((s) => s.setRoute);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);

  const draftUrl = usePreviewStore((s) => s.draftUrl);
  const url = usePreviewStore((s) => s.url);
  const deviceId = usePreviewStore((s) => s.deviceId);
  const orientation = usePreviewStore((s) => s.orientation);
  const zoom = usePreviewStore((s) => s.zoom);
  const fitToWorkspace = usePreviewStore((s) => s.fitToWorkspace);
  const showDeviceFrame = usePreviewStore((s) => s.showDeviceFrame);
  const showRulers = usePreviewStore((s) => s.showRulers);
  const customWidth = usePreviewStore((s) => s.customWidth);
  const customHeight = usePreviewStore((s) => s.customHeight);
  const error = usePreviewStore((s) => s.error);
  const loading = usePreviewStore((s) => s.loading);
  const detectedServers = usePreviewStore((s) => s.detectedServers);
  const recentUrls = usePreviewStore((s) => s.recentUrls);
  const consoleOpen = usePreviewStore((s) => s.consoleOpen);
  const diagnostics = usePreviewStore((s) => s.diagnostics);

  const setDraftUrl = usePreviewStore((s) => s.setDraftUrl);
  const setUrl = usePreviewStore((s) => s.setUrl);
  const setDeviceId = usePreviewStore((s) => s.setDeviceId);
  const setOrientation = usePreviewStore((s) => s.setOrientation);
  const setZoom = usePreviewStore((s) => s.setZoom);
  const setFitToWorkspace = usePreviewStore((s) => s.setFitToWorkspace);
  const setShowDeviceFrame = usePreviewStore((s) => s.setShowDeviceFrame);
  const setShowRulers = usePreviewStore((s) => s.setShowRulers);
  const setCustomSize = usePreviewStore((s) => s.setCustomSize);
  const pushRecent = usePreviewStore((s) => s.pushRecent);
  const setLoading = usePreviewStore((s) => s.setLoading);
  const setError = usePreviewStore((s) => s.setError);
  const setDetectedServers = usePreviewStore((s) => s.setDetectedServers);
  const setStaticServerUrl = usePreviewStore((s) => s.setStaticServerUrl);
  const setConsoleOpen = usePreviewStore((s) => s.setConsoleOpen);
  const pushDiagnostic = usePreviewStore((s) => s.pushDiagnostic);
  const clearPreviewData = usePreviewStore((s) => s.clearPreviewData);

  const [hostSize, setHostSize] = React.useState({ w: 900, h: 640 });
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = React.useState(-1);

  const preset = getDevicePreset(deviceId);
  const logical = orientSize(
    preset,
    orientation,
    customWidth,
    customHeight,
    hostSize.w - 48,
    hostSize.h - 48,
  );
  const displayZoom = fitToWorkspace
    ? Math.min(
        1.25,
        Math.max(
          0.25,
          Math.min((hostSize.w - 80) / logical.width, (hostSize.h - 80) / logical.height),
        ),
      )
    : zoom;
  const frameW = Math.round(logical.width * displayZoom);
  const frameH = Math.round(logical.height * displayZoom);

  // Host size observer
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      setHostSize({ w: host.clientWidth, h: host.clientHeight });
    });
    ro.observe(host);
    setHostSize({ w: host.clientWidth, h: host.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Hide native surface when leaving route; show when returning
  React.useEffect(() => {
    if (route !== 'preview') {
      void previewHide();
      return;
    }
    void previewShow();
    return () => {
      void previewHide();
    };
  }, [route]);

  // Destroy on unmount of app surface
  React.useEffect(() => {
    return () => {
      void previewHide();
    };
  }, []);

  // Sync child webview bounds to the reserved rectangle
  React.useEffect(() => {
    if (route !== 'preview') return;
    const el = surfaceRef.current;
    if (!el || !url) return;

    const sync = () => {
      const bounds = measurePreviewBounds(el);
      void previewSetBounds(bounds);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [route, url, frameW, frameH, showDeviceFrame, fitToWorkspace, displayZoom]);

  const navigateTo = React.useCallback(
    async (raw: string, pushHist = true) => {
      const norm = normalizePreviewUrl(raw);
      if (!norm.ok) {
        setError({ code: norm.code, message: norm.message, recoverable: true, url: raw });
        return;
      }
      setLoading(true);
      setError(null);
      setUrl(norm.url);
      pushRecent(norm.url);
      pushDiagnostic(`navigate ${norm.url}`);

      if (pushHist) {
        setHistory((h) => {
          const next = [...h.slice(0, historyIdx + 1), norm.url].slice(-40);
          setHistoryIdx(next.length - 1);
          return next;
        });
      }

      const el = surfaceRef.current;
      const bounds = el
        ? measurePreviewBounds(el)
        : { x: 100, y: 100, width: frameW, height: frameH };

      if (!isTauriRuntime()) {
        setLoading(false);
        setError({
          code: 'not_tauri',
          message:
            'Native Preview Studio runs in the VibeSpace desktop app (isolated child WebView).',
          recoverable: true,
          url: norm.url,
        });
        return;
      }

      const probe = await previewProbeUrl(norm.url);
      if (!probe.ok) {
        setLoading(false);
        setError({
          code: probe.error.code,
          message: probe.error.message,
          recoverable: true,
          url: norm.url,
        });
        pushDiagnostic(`error ${probe.error.code}: ${probe.error.message}`);
        // Still try to create so user can hard-retry when server starts
      }

      const created = await previewCreate(norm.url, bounds);
      if (!created.ok) {
        setLoading(false);
        setError({
          code: created.error.code,
          message: created.error.message,
          recoverable: created.error.recoverable,
          url: norm.url,
        });
        return;
      }
      setLoading(false);
      void previewShow();
    },
    [frameH, frameW, historyIdx, pushDiagnostic, pushRecent, setError, setLoading, setUrl],
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void navigateTo(draftUrl);
  };

  const detectServers = async () => {
    const rows = await probeDevServers();
    setDetectedServers(rows);
    if (rows[0]?.url) {
      toast.success('Server detected', rows[0].url);
      setDraftUrl(rows[0].url);
    } else {
      toast.info('No local servers', 'Nothing responded on common loopback ports.');
    }
  };

  const openHtmlFolder = async () => {
    // Uses dialog if available via dynamic import; falls back to toast.
    try {
      const { open: pick } = await import('@tauri-apps/plugin-dialog');
      const selected = await pick({
        directory: true,
        multiple: false,
        title: 'Select project folder',
      });
      if (!selected || Array.isArray(selected)) return;
      const result = await startStaticServer(selected);
      if (!result.ok) {
        setError({
          code: result.error.code,
          message: result.error.message,
          recoverable: true,
        });
        return;
      }
      setStaticServerUrl(result.info.url);
      setDraftUrl(result.info.url);
      await navigateTo(result.info.url);
      toast.success('Local preview', result.info.url);
    } catch (e) {
      toast.warning(
        'Folder picker unavailable',
        e instanceof Error ? e.message : 'Could not open folder dialog.',
      );
    }
  };

  const openExternal = async () => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openInBrowser = () => {
    if (url) {
      sessionStorage.setItem('vibespace-browser-initial-url', url);
    }
    setRoute('browser');
  };

  return (
    <div
      className="preview-shell [html[data-theme=monochrome]_&]:bg-background [html[data-theme=monochrome]_&]:font-sans [html[data-theme=monochrome]_&_.preview-toolbar]:border-border-mid [html[data-theme=monochrome]_&_.preview-toolbar]:bg-panel [html[data-theme=monochrome]_&_.preview-toolbar]:shadow-none [html[data-theme=monochrome]_&_.preview-stage-wrap]:bg-background [html[data-theme=monochrome]_&_.preview-device-frame]:rounded-sm [html[data-theme=monochrome]_&_.preview-device-frame]:border-border-mid [html[data-theme=monochrome]_&_.preview-device-frame]:shadow-none [html[data-theme=monochrome]_&_.preview-empty-card]:rounded-sm [html[data-theme=monochrome]_&_.preview-empty-card]:border-border-mid [html[data-theme=monochrome]_&_.preview-empty-card]:bg-panel [html[data-theme=monochrome]_&_.preview-empty-card]:shadow-none [html[data-theme=monochrome]_&_.preview-error-card]:rounded-sm [html[data-theme=monochrome]_&_.preview-error-card]:shadow-none [html[data-theme=monochrome]_&_.preview-console]:border-border-mid [html[data-theme=monochrome]_&_.preview-console]:bg-panel [html[data-theme=monochrome]_&_.preview-console]:shadow-none"
      data-testid="preview-studio"
      data-monochrome-route="preview"
    >
      <header data-monochrome-surface="preview-toolbar" className="preview-toolbar">
        <span className="preview-toolbar-kicker">Preview Studio</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Back"
          disabled={historyIdx <= 0}
          onClick={() => {
            if (historyIdx <= 0) return;
            const next = historyIdx - 1;
            setHistoryIdx(next);
            void navigateTo(history[next]!, false);
          }}
        >
          <ArrowLeft />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Forward"
          disabled={historyIdx < 0 || historyIdx >= history.length - 1}
          onClick={() => {
            if (historyIdx >= history.length - 1) return;
            const next = historyIdx + 1;
            setHistoryIdx(next);
            void navigateTo(history[next]!, false);
          }}
        >
          <ArrowRight />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Reload"
          onClick={() => void previewReload(false)}
        >
          <RefreshCw />
        </Button>
        <form className="preview-url-form" onSubmit={onSubmit}>
          <input
            aria-label="Preview URL"
            value={draftUrl}
            placeholder="http://localhost:5173 or https://…"
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          <Button type="submit" size="sm" variant="accent" disabled={loading}>
            Go
          </Button>
        </form>
        <select
          aria-label="Device preset"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          {DEVICE_PRESETS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Rotate orientation"
          onClick={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
        >
          <RotateCw />
        </Button>
        <select
          className="preview-zoom"
          aria-label="Zoom"
          value={fitToWorkspace ? 'fit' : String(zoom)}
          onChange={(e) => {
            if (e.target.value === 'fit') {
              setFitToWorkspace(true);
              return;
            }
            setFitToWorkspace(false);
            setZoom(Number(e.target.value));
          }}
        >
          <option value="fit">Fit</option>
          {ZOOM_STEPS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        {deviceId === 'custom' ? (
          <>
            <input
              aria-label="Custom width"
              type="number"
              min={200}
              max={3840}
              value={customWidth}
              style={{ width: 72 }}
              onChange={(e) => setCustomSize(Number(e.target.value), customHeight)}
            />
            <input
              aria-label="Custom height"
              type="number"
              min={200}
              max={2160}
              value={customHeight}
              style={{ width: 72 }}
              onChange={(e) => setCustomSize(customWidth, Number(e.target.value))}
            />
          </>
        ) : null}
        <span className="preview-toolbar-divider" />
        <Button type="button" size="sm" variant="ghost" onClick={() => void detectServers()}>
          Detect servers
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void openHtmlFolder()}>
          Open folder
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowDeviceFrame(!showDeviceFrame)}
        >
          {showDeviceFrame ? <Smartphone /> : <Monitor />} Frame
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowRulers(!showRulers)}>
          Rulers
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setConsoleOpen(!consoleOpen)}
        >
          Console
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void openExternal()}
          disabled={!url}
        >
          <ExternalLink /> External
        </Button>
        <Button type="button" size="sm" variant="accent" onClick={openInBrowser} disabled={!url}>
          <Globe2 /> Vibe Browser
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            clearPreviewData();
            void previewDestroy();
            setUrl('');
            setDraftUrl('');
          }}
        >
          Clear
        </Button>
      </header>

      {(detectedServers.length > 0 || recentUrls.length > 0) && (
        <div className="preview-toolbar" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {detectedServers.slice(0, 4).map((s) => (
            <Button
              key={s.url}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftUrl(s.url);
                void navigateTo(s.url);
              }}
            >
              {s.url}
            </Button>
          ))}
          {recentUrls.slice(0, 4).map((u) => (
            <Button
              key={`r-${u}`}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraftUrl(u);
                void navigateTo(u);
              }}
            >
              {u.replace(/^https?:\/\//, '').slice(0, 28)}
            </Button>
          ))}
        </div>
      )}

      <div data-monochrome-surface="preview-workspace" className="preview-stage-wrap" ref={hostRef}>
        {!url && !error ? (
          <div className="preview-empty-card">
            <p className="preview-toolbar-kicker">Responsive emulation</p>
            <h2>Preview Studio</h2>
            <p>
              Load a localhost dev server, an https site, or a local HTML project folder. Device
              sizes are responsive emulation — not a claim of real Mobile Safari.
            </p>
            <div className="preview-empty-actions">
              <Button
                type="button"
                size="sm"
                variant="accent"
                onClick={() => {
                  setDraftUrl('http://localhost:5173');
                  void navigateTo('http://localhost:5173');
                }}
              >
                localhost:5173
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void detectServers()}
              >
                Detect local server
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void openHtmlFolder()}
              >
                Open HTML project
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="preview-error-card" role="alert">
            <p className="preview-toolbar-kicker">{error.code}</p>
            <h2>Preview could not connect</h2>
            <p>{error.message}</p>
            {error.url ? <code title={error.url}>{error.url}</code> : null}
            <div className="preview-error-actions">
              <Button
                type="button"
                size="sm"
                variant="accent"
                onClick={() => void navigateTo(error.url || draftUrl || url)}
              >
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void detectServers()}
              >
                Detect local server
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setError(null)}>
                Edit URL
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    JSON.stringify({ error, url, diagnostics: diagnostics.slice(0, 20) }, null, 2),
                  );
                  toast.success('Diagnostics copied');
                }}
              >
                Copy diagnostics
              </Button>
              {error.url ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(error.url!, '_blank', 'noopener,noreferrer')}
                >
                  Open externally
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {url ? (
          <div
            className="preview-device-frame"
            data-monochrome-surface="preview-device"
            data-frame={showDeviceFrame ? 'true' : 'false'}
            style={{ width: frameW + (showDeviceFrame ? 20 : 0) }}
          >
            {showDeviceFrame ? (
              <div className="preview-device-chrome">
                <span>{preset.name}</span>
                <span>
                  {logical.width}×{logical.height}
                  {orientation === 'landscape' ? ' · landscape' : ''}
                  {' · '}
                  {Math.round(displayZoom * 100)}%
                </span>
              </div>
            ) : null}
            {showRulers ? (
              <>
                <span className="preview-ruler preview-ruler--w">{logical.width}px</span>
                <span className="preview-ruler preview-ruler--h">{logical.height}px</span>
              </>
            ) : null}
            <div
              ref={surfaceRef}
              className="preview-surface"
              data-testid="preview-surface"
              style={{ width: frameW, height: frameH }}
            >
              {!isTauriRuntime() ? (
                <div className="preview-surface-fallback">
                  <strong>Desktop surface</strong>
                  <span>
                    Isolated child WebView is available in the packaged / Tauri app. URL ready:{' '}
                    {url}
                  </span>
                </div>
              ) : loading ? (
                <div className="preview-surface-fallback">
                  <strong>Loading</strong>
                  <span>{url}</span>
                </div>
              ) : (
                <div className="preview-surface-fallback" style={{ opacity: 0.35 }}>
                  <strong>Native preview</strong>
                  <span>Child WebView is positioned over this rectangle.</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {consoleOpen ? (
        <aside
          data-monochrome-surface="preview-diagnostics"
          className="preview-console"
          aria-label="Preview diagnostics"
        >
          <h3>Diagnostics</h3>
          {diagnostics.length === 0 ? (
            <div>No events yet.</div>
          ) : (
            diagnostics.map((line) => <div key={line}>{line}</div>)
          )}
        </aside>
      ) : null}
    </div>
  );
}

export default PreviewStudio;
