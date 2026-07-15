import * as React from 'react';
import { ExternalLink, Globe2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { openExternal } from '@/lib/tauri';
import { browserFramePolicy, normalizeBrowserUrl } from './browserSecurity';
import type { WorkbenchPanel } from './types';

interface BrowserPanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

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
  const policy = React.useMemo(() => {
    try {
      return browserFramePolicy(currentUrl);
    } catch {
      return null;
    }
  }, [currentUrl]);

  const navigate = (event?: React.FormEvent) => {
    event?.preventDefault();
    try {
      const normalized = normalizeBrowserUrl(draft);
      setError(null);
      setDraft(normalized);
      onUpdate({ settings: { ...panel.settings, url: normalized }, status: 'ready' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That address cannot be opened.';
      setError(message);
      toast.warning('Browser address blocked', message);
    }
  };

  const launchNamed = async (browser: 'chrome' | 'edge') => {
    try {
      await requestNamedBrowser(currentUrl, browser);
      toast.info(`${browser === 'chrome' ? 'Chrome' : 'Edge'} launch requested`, currentUrl);
    } catch (cause) {
      toast.warning(
        `${browser === 'chrome' ? 'Chrome' : 'Edge'} unavailable`,
        cause instanceof Error ? cause.message : 'Use Open externally instead.',
      );
    }
  };

  return (
    <div className="workbench-browser">
      <form className="workbench-browser-bar" onSubmit={navigate}>
        <Globe2 aria-hidden="true" />
        <input
          aria-label="Browser address"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Navigate">
          <ExternalLink />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Reload browser"
          onClick={() => setFrameKey((value) => value + 1)}
        >
          <RefreshCw />
        </Button>
      </form>
      <div className="workbench-browser-launchers" aria-label="External browser controls">
        <button type="button" onClick={() => void openExternal(currentUrl)}>Open externally</button>
        <button type="button" onClick={() => void launchNamed('chrome')}>Open in Chrome</button>
        <button type="button" onClick={() => void launchNamed('edge')}>Open in Edge</button>
      </div>
      {error ? (
        <div className="workbench-panel-empty" role="alert">
          <strong>Address blocked</strong>
          <span>{error}</span>
        </div>
      ) : policy ? (
        <iframe
          key={`${policy.src}-${frameKey}`}
          title={`${panel.title} web page`}
          {...policy}
        />
      ) : null}
      <p className="workbench-browser-engine">Embedded WebView - isolated from VibeSpace data</p>
    </div>
  );
}

export { requestNamedBrowser };
