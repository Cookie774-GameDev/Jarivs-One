import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  Plus,
  RefreshCw,
  Shield,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { openExternal } from '@/lib/tauri';
import { normalizePreviewUrl } from '@/features/preview/previewUrl';
import {
  browserStart,
  browserStatus,
  browserStop,
  CdpSession,
  isTauriRuntime,
  resolvePageWsUrl,
} from './browserClient';
import { consumeBrowserReviewedAction } from './browserActions';
import { useBrowserStore } from './browserStore';
import './browser.css';

/**
 * Vibe Browser — Canvas / VS Code Simple Browser style:
 * primary surface is an in-app iframe (works for localhost + embeddable sites).
 * Optional CDP agent runtime for advanced control when Edge/Chrome is available.
 */
export function BrowserPage() {
  const cdpRef = React.useRef<CdpSession | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [iframeBlocked, setIframeBlocked] = React.useState(false);
  const [engine, setEngine] = React.useState<'iframe' | 'agent'>('iframe');

  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const runtime = useBrowserStore((s) => s.runtime);
  const frameDataUrl = useBrowserStore((s) => s.frameDataUrl);
  const consoleEntries = useBrowserStore((s) => s.consoleEntries);
  const agentActions = useBrowserStore((s) => s.agentActions);
  const agentArmed = useBrowserStore((s) => s.agentArmed);
  const sidebarOpen = useBrowserStore((s) => s.sidebarOpen);
  const consoleOpen = useBrowserStore((s) => s.consoleOpen);
  const draftUrl = useBrowserStore((s) => s.draftUrl);

  const setDraftUrl = useBrowserStore((s) => s.setDraftUrl);
  const setRuntime = useBrowserStore((s) => s.setRuntime);
  const setFrame = useBrowserStore((s) => s.setFrame);
  const setActiveTab = useBrowserStore((s) => s.setActiveTab);
  const newTab = useBrowserStore((s) => s.newTab);
  const closeTab = useBrowserStore((s) => s.closeTab);
  const updateTab = useBrowserStore((s) => s.updateTab);
  const pushConsole = useBrowserStore((s) => s.pushConsole);
  const resolveAgentAction = useBrowserStore((s) => s.resolveAgentAction);
  const abortAgentActions = useBrowserStore((s) => s.abortAgentActions);
  const setControlMode = useBrowserStore((s) => s.setControlMode);
  const setSidebarOpen = useBrowserStore((s) => s.setSidebarOpen);
  const setConsoleOpen = useBrowserStore((s) => s.setConsoleOpen);
  const restoreClosed = useBrowserStore((s) => s.restoreClosed);

  const active = tabs.find((t) => t.id === activeTabId);
  const pending = agentActions.filter((a) => a.status === 'pending');
  const reviewedOutcomes = agentActions.filter((a) => a.status !== 'pending').slice(0, 5);

  const refreshStatus = React.useCallback(async () => {
    const status = await browserStatus();
    setRuntime(status);
    return status;
  }, [setRuntime]);

  const connectCdp = React.useCallback(
    async (wsUrl: string): Promise<CdpSession> => {
      const pageWs = (await resolvePageWsUrl(wsUrl)) ?? wsUrl;
      const session = new CdpSession();
      await session.connect(pageWs);
      session.onScreencast((b64) => setFrame(`data:image/jpeg;base64,${b64}`));
      session.onCdpEvent((method, params) => {
        if (method === 'Runtime.consoleAPICalled' && params && typeof params === 'object') {
          const p = params as {
            type?: string;
            args?: Array<{ value?: unknown; description?: string }>;
          };
          const text = (p.args ?? [])
            .map((a) => String(a.value ?? a.description ?? ''))
            .join(' ')
            .slice(0, 500);
          const level = p.type === 'error' ? 'error' : p.type === 'warning' ? 'warn' : 'log';
          pushConsole(level, text || method);
        }
        if (method === 'Page.frameNavigated' && params && typeof params === 'object') {
          const frame = (params as { frame?: { url?: string } }).frame;
          if (frame?.url && activeTabId) {
            updateTab(activeTabId, { url: frame.url, title: frame.url, loading: false });
            setDraftUrl(frame.url);
          }
        }
      });
      await session.startScreencast();
      cdpRef.current = session;
      pushConsole('info', 'Agent CDP connected');
      return session;
    },
    [activeTabId, pushConsole, setDraftUrl, setFrame, updateTab],
  );

  React.useEffect(() => {
    void refreshStatus();
    const initial = sessionStorage.getItem('vibespace-browser-initial-url');
    if (initial) {
      sessionStorage.removeItem('vibespace-browser-initial-url');
      setDraftUrl(initial);
      if (activeTabId) updateTab(activeTabId, { url: initial, title: initial });
    }
    return () => {
      void cdpRef.current?.close();
      cdpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateIframe = (url: string) => {
    setIframeBlocked(false);
    if (active) updateTab(active.id, { url, title: url, loading: true });
    setDraftUrl(url);
    // iframe src is bound to active.url — loading ends on load event
    window.setTimeout(() => {
      if (active) updateTab(active.id, { loading: false });
    }, 800);
  };

  const go = async (raw?: string) => {
    const target = (raw ?? draftUrl).trim();
    if (!target || target === 'about:blank') {
      if (active) updateTab(active.id, { url: 'about:blank', title: 'New Tab', loading: false });
      setDraftUrl('about:blank');
      return;
    }

    const norm = normalizePreviewUrl(target);
    if (!norm.ok) {
      toast.warning('Invalid URL', norm.message);
      return;
    }
    const url = norm.url;

    if (engine === 'agent') {
      if (active) updateTab(active.id, { url, title: url, loading: true });
      setDraftUrl(url);
      try {
        if (!cdpRef.current) {
          const status = runtime?.running
            ? runtime
            : (await browserStart()).ok
              ? await browserStatus()
              : null;
          if (status?.cdp_ws_url) {
            setRuntime(status);
            await connectCdp(status.cdp_ws_url);
          } else {
            toast.warning(
              'Agent runtime',
              'Could not start Edge/Chrome CDP — switching to Simple Browser.',
            );
            setEngine('iframe');
            navigateIframe(url);
            return;
          }
        }
        await cdpRef.current?.navigate(url);
      } catch (e) {
        pushConsole('error', e instanceof Error ? e.message : 'Navigate failed');
        toast.warning('Agent navigate failed', 'Falling back to Simple Browser (iframe).');
        setEngine('iframe');
        navigateIframe(url);
      }
      if (active) updateTab(active.id, { loading: false, title: url });
      return;
    }

    navigateIframe(url);
    pushConsole('info', `Simple Browser → ${url}`);
  };

  const reload = () => {
    if (engine === 'agent') {
      void cdpRef.current?.reload(false);
      return;
    }
    const el = iframeRef.current;
    if (el && active?.url && active.url !== 'about:blank') {
      // Force reload
      const u = active.url;
      el.src = 'about:blank';
      window.setTimeout(() => {
        el.src = u;
      }, 30);
    }
  };

  const startAgentRuntime = async () => {
    setEngine('agent');
    const result = await browserStart();
    if (!result.ok) {
      toast.warning('Browser runtime', result.error.message);
      pushConsole('error', result.error.message);
      setEngine('iframe');
      await refreshStatus();
      return;
    }
    setRuntime(result.status);
    toast.success('Agent runtime', 'Isolated Edge/Chrome profile ready');
    if (result.status.cdp_ws_url) {
      try {
        await connectCdp(result.status.cdp_ws_url);
        if (active?.url && active.url !== 'about:blank') {
          await cdpRef.current?.navigate(active.url);
        }
      } catch (e) {
        pushConsole('error', e instanceof Error ? e.message : 'CDP connect failed');
        setEngine('iframe');
      }
    }
  };

  const stopAgentRuntime = async () => {
    abortAgentActions();
    await cdpRef.current?.close();
    cdpRef.current = null;
    setFrame(null);
    await browserStop();
    await refreshStatus();
    setEngine('iframe');
    toast.info('Back to Simple Browser');
  };

  const showUrl = active?.url && active.url !== 'about:blank' ? active.url : '';

  return (
    <div className="browser-shell" data-testid="vibe-browser">
      <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`browser-tab${tab.id === activeTabId ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => {
              setActiveTab(tab.id);
              setDraftUrl(tab.url);
              setIframeBlocked(false);
            }}
          >
            <span title={tab.url}>{tab.title || tab.url}</span>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="New tab"
          onClick={() => newTab('about:blank')}
        >
          <Plus />
        </Button>
      </div>

      <header className="browser-toolbar">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Back"
          onClick={() => {
            try {
              iframeRef.current?.contentWindow?.history.back();
            } catch {
              /* cross-origin */
            }
          }}
        >
          <ArrowLeft />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Forward"
          onClick={() => {
            try {
              iframeRef.current?.contentWindow?.history.forward();
            } catch {
              /* cross-origin */
            }
          }}
        >
          <ArrowRight />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Reload" onClick={reload}>
          <RefreshCw />
        </Button>

        <form
          className="browser-url"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          <Globe2
            className="h-3.5 w-3.5"
            style={{ color: 'hsl(var(--accent-copper))', flex: '0 0 auto' }}
          />
          <input
            aria-label="Address bar"
            value={draftUrl === 'about:blank' ? '' : draftUrl}
            placeholder="localhost:5173 or https://…"
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          <Button type="submit" size="sm" variant="accent">
            Go
          </Button>
        </form>

        <span className={`browser-agent-pill${engine === 'agent' ? ' is-hot' : ''}`}>
          <Shield className="h-3 w-3" />
          {engine === 'agent' ? 'Agent engine' : 'Simple Browser'}
        </span>

        {(agentArmed || pending.length > 0) && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => {
              abortAgentActions();
              toast.info('Agent stopped');
            }}
          >
            <Square className="h-3 w-3" /> Stop Agent
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          Profile
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
          disabled={!showUrl}
          onClick={() => showUrl && void openExternal(showUrl)}
        >
          <ExternalLink /> External
        </Button>

        {engine === 'agent' ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void stopAgentRuntime()}>
            Use Simple Browser
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!isTauriRuntime()}
            title={
              isTauriRuntime()
                ? 'Optional isolated Edge/Chrome for agent control'
                : 'Desktop app only'
            }
            onClick={() => void startAgentRuntime()}
          >
            Agent runtime
          </Button>
        )}
      </header>

      <div className="browser-body">
        {sidebarOpen ? (
          <aside className="browser-sidebar" aria-label="Browser sidebar">
            <h3>Engine</h3>
            <p>
              <strong style={{ color: 'hsl(var(--foreground))' }}>Simple Browser</strong> embeds
              pages in-app (same idea as VS Code / Canvas simple browser). Best for localhost and
              sites that allow framing.
            </p>
            <p style={{ marginTop: 8 }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>Agent runtime</strong> launches an
              isolated Edge/Chrome profile with CDP for automation. Optional.
            </p>
            <h3 style={{ marginTop: 14 }}>Profile</h3>
            <p>Isolated app-data profile — never your everyday browser.</p>
            <p style={{ marginTop: 8 }}>
              Status: {runtime?.running ? 'Agent running' : 'Simple mode'}
            </p>
            {runtime?.cdp_port ? <p>CDP: 127.0.0.1:{runtime.cdp_port}</p> : null}
            {runtime?.last_error ? <p className="err">{runtime.last_error}</p> : null}
            <h3 style={{ marginTop: 14 }}>Control mode</h3>
            <select
              aria-label="Agent control mode"
              value={active?.controlMode ?? 'ask_every_action'}
              onChange={(e) =>
                active && setControlMode(active.id, e.target.value as typeof active.controlMode)
              }
              style={{ width: '100%', marginBottom: 8 }}
            >
              <option value="user_only">User only</option>
              <option value="ask_every_action">Ask before every action</option>
              <option value="allow_safe_session">Allow safe actions (session)</option>
              <option value="agent_controlled">Agent controlled</option>
            </select>
            <Button type="button" size="sm" variant="ghost" onClick={() => restoreClosed()}>
              Restore closed tab
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              style={{ marginTop: 6 }}
              onClick={() => void refreshStatus()}
            >
              Refresh diagnostics
            </Button>
          </aside>
        ) : null}

        <div className="browser-viewport" data-testid="browser-viewport">
          {engine === 'agent' && frameDataUrl ? (
            <img
              src={frameDataUrl}
              alt="Live agent browser view"
              className="browser-viewport-cast"
            />
          ) : showUrl ? (
            <div className="browser-iframe-wrap">
              <iframe
                ref={iframeRef}
                key={`${activeTabId}:${showUrl}`}
                title={active?.title || 'Vibe Browser'}
                className="browser-iframe"
                src={showUrl}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={() => {
                  if (active)
                    updateTab(active.id, { loading: false, title: active.title || showUrl });
                  setIframeBlocked(false);
                }}
                onError={() => setIframeBlocked(true)}
              />
              {iframeBlocked ? (
                <div className="browser-iframe-block">
                  <h3>Page blocked embedding</h3>
                  <p>
                    This site refuses to load in an in-app browser (X-Frame-Options / CSP), same
                    limitation as VS Code Simple Browser.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      size="sm"
                      variant="accent"
                      onClick={() => void openExternal(showUrl)}
                    >
                      Open externally
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void startAgentRuntime()}
                    >
                      Try agent runtime
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="browser-viewport-empty">
              <p className="browser-kicker">Vibe Browser</p>
              <h2>Browse inside the workspace</h2>
              <p>
                Type a URL above (try <code>http://localhost:5173</code>) and press Go. Simple
                Browser mode works immediately — no extra runtime required.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  onClick={() => {
                    setDraftUrl('http://localhost:5173');
                    void go('http://localhost:5173');
                  }}
                >
                  localhost:5173
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftUrl('https://example.com');
                    void go('https://example.com');
                  }}
                >
                  example.com
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(consoleOpen || pending.length > 0 || reviewedOutcomes.length > 0) && (
        <div className="browser-console" aria-label="Browser console and approvals">
          {pending.map((action) => (
            <div key={action.id} className="browser-approval">
              <strong>
                {action.risk.toUpperCase()} · {action.kind}
              </strong>
              <div>{action.safeSummary}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  onClick={() => {
                    void consumeBrowserReviewedAction(action.id, cdpRef.current);
                  }}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => resolveAgentAction(action.id, 'denied', 'Denied by user.')}
                >
                  Deny
                </Button>
              </div>
            </div>
          ))}
          {reviewedOutcomes.map((action) => (
            <div key={action.id} className="browser-approval" data-status={action.status}>
              <strong>
                {action.status.toUpperCase()} · {action.kind}
              </strong>
              {action.result ? <div>{action.result}</div> : null}
            </div>
          ))}
          {consoleOpen
            ? consoleEntries.slice(0, 40).map((e) => (
                <div
                  key={e.id}
                  className={e.level === 'error' ? 'err' : e.level === 'warn' ? 'warn' : undefined}
                >
                  [{e.level}] {e.text}
                </div>
              ))
            : null}
        </div>
      )}
    </div>
  );
}

export default BrowserPage;
