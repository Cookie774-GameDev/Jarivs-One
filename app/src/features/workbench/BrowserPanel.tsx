import * as React from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe2, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { openExternal } from '@/lib/tauri';
import { browserFramePolicy, normalizeBrowserUrl } from './browserSecurity';
import type { WorkbenchPanel } from './types';

interface BrowserPanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'external' | 'error';

async function requestNamedBrowser(url: string, browser: 'chrome' | 'edge'): Promise<void> {
  const normalized = normalizeBrowserUrl(url);
  const protocol =
    browser === 'edge'
      ? `microsoft-edge:${normalized}`
      : `googlechrome://navigate?url=${encodeURIComponent(normalized)}`;
  await openExternal(protocol);
}

export function BrowserPanel({ panel, onUpdate }: BrowserPanelProps) {
  const currentUrl = panel.settings.url ?? 'https://developer.mozilla.org';
  const [draft, setDraft] = React.useState(currentUrl);
  const [frameKey, setFrameKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>('idle');
  const [history, setHistory] = React.useState<string[]>([currentUrl]);
  const [historyIndex, setHistoryIndex] = React.useState(0);

  const policy = React.useMemo(() => {
    try {
      return browserFramePolicy(currentUrl);
    } catch {
      return null;
    }
  }, [currentUrl]);

  React.useEffect(() => {
    setDraft(currentUrl);
  }, [currentUrl]);

  React.useEffect(() => {
    if (!policy) return;
    if (policy.delivery === 'system-browser') {
      setLoadState('external');
      return;
    }
    setLoadState('loading');
  }, [policy?.src, policy?.frameBlocked, frameKey]);

  const commitUrl = (normalized: string, pushHistory: boolean) => {
    const nextPolicy = browserFramePolicy(normalized);
    setError(null);
    setDraft(normalized);
    onUpdate({ settings: { ...panel.settings, url: normalized }, status: 'ready' });
    if (pushHistory) {
      setHistory((prev) => {
        const base = prev.slice(0, historyIndex + 1);
        if (base[base.length - 1] === normalized) return base;
        return [...base, normalized].slice(-40);
      });
      setHistoryIndex((idx) => Math.min(idx + 1, 39));
    }
    setLoadState(nextPolicy.delivery === 'embedded' ? 'loading' : 'external');
    if (nextPolicy.delivery === 'embedded') setFrameKey((value) => value + 1);
    return nextPolicy;
  };

  const navigate = async (event?: React.FormEvent) => {
    event?.preventDefault();
    try {
      const normalized = normalizeBrowserUrl(draft);
      const nextPolicy = commitUrl(normalized, true);
      if (nextPolicy.delivery === 'system-browser') {
        await openExternal(normalized);
        toast.success('Opened in your browser', 'Using your normal signed-in browser profile.');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That address cannot be opened.';
      setError(message);
      setLoadState('error');
      toast.warning('Browser address blocked', message);
    }
  };

  const goHistory = (delta: number) => {
    const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    setHistoryIndex(next);
    const url = history[next]!;
    try {
      const normalized = normalizeBrowserUrl(url);
      setDraft(normalized);
      onUpdate({ settings: { ...panel.settings, url: normalized }, status: 'ready' });
      const nextPolicy = browserFramePolicy(normalized);
      setLoadState(nextPolicy.delivery === 'embedded' ? 'loading' : 'external');
      if (nextPolicy.delivery === 'embedded') setFrameKey((value) => value + 1);
    } catch (cause) {
      toast.warning(
        'History address blocked',
        cause instanceof Error ? cause.message : 'Unsafe URL in history.',
      );
    }
  };

  const openExternalSafe = async (url = currentUrl) => {
    try {
      const normalized = normalizeBrowserUrl(url);
      await openExternal(normalized);
      toast.success('Opened in system browser', normalized);
    } catch (cause) {
      toast.warning(
        'Could not open externally',
        cause instanceof Error ? cause.message : 'Address rejected.',
      );
    }
  };

  const launchNamed = async (browser: 'chrome' | 'edge') => {
    try {
      await requestNamedBrowser(policy?.externalUrl ?? currentUrl, browser);
      toast.info(`${browser === 'chrome' ? 'Chrome' : 'Edge'} launch requested`, currentUrl);
    } catch (cause) {
      toast.warning(
        `${browser === 'chrome' ? 'Chrome' : 'Edge'} unavailable`,
        cause instanceof Error ? cause.message : 'Use Open externally instead.',
      );
    }
  };

  const showFrame = policy?.delivery === 'embedded' && loadState !== 'idle';

  return (
    <div
      className="workbench-browser"
      data-testid="workbench-browser-panel"
      onWheel={(event) => event.stopPropagation()}
    >
      <form className="workbench-browser-bar" onSubmit={(event) => void navigate(event)}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Back"
          disabled={historyIndex <= 0}
          onClick={() => goHistory(-1)}
        >
          <ArrowLeft />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Forward"
          disabled={historyIndex >= history.length - 1}
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
          onClick={() => {
            setLoadState('loading');
            setFrameKey((value) => value + 1);
          }}
        >
          <RefreshCw />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Stop loading"
          onClick={() => setLoadState('idle')}
        >
          <Square />
        </Button>
      </form>
      <div className="workbench-browser-launchers" aria-label="External browser controls">
        <button type="button" onClick={() => void openExternalSafe()}>
          Open in system browser
        </button>
        <button type="button" onClick={() => void launchNamed('chrome')}>
          Open in Chrome
        </button>
        <button type="button" onClick={() => void launchNamed('edge')}>
          Open in Edge
        </button>
      </div>
      {error ? (
        <div className="workbench-panel-empty" role="alert">
          <strong>Address blocked</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {!error && (policy?.delivery === 'system-browser' || loadState === 'external') ? (
        <div
          className="workbench-panel-empty"
          role="status"
          data-testid="workbench-browser-external"
        >
          <strong>Ready in your normal browser</strong>
          <span>
            Remote sites open with your normal signed-in browser profile so saved sessions and site
            credentials keep working. Localhost and approved media embeds stay interactive here.
          </span>
          <Button
            type="button"
            size="sm"
            variant="accent"
            onClick={() => void openExternalSafe(policy?.externalUrl)}
          >
            <ExternalLink /> Open in my browser
          </Button>
        </div>
      ) : null}
      {showFrame && policy ? (
        <>
          {loadState === 'loading' ? (
            <p className="workbench-browser-status" aria-live="polite">
              Loading{policy.usedEmbed ? ' embed' : ''}…
            </p>
          ) : null}
          <iframe
            key={`${policy.src}-${frameKey}`}
            title={`${panel.title} web page`}
            src={policy.src}
            sandbox={policy.sandbox}
            referrerPolicy={policy.referrerPolicy}
            allow={policy.allow}
            onLoad={() => {
              setLoadState('loaded');
            }}
          />
        </>
      ) : null}
      <p className="workbench-browser-engine">
        Local previews stay sandboxed. Remote sites use your normal browser profile.
      </p>
    </div>
  );
}

export { requestNamedBrowser };
