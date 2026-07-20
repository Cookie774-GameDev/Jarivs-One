import * as React from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { createJarvisCommandCenterStore } from './commandCenterStore';
import {
  mapJarvisCancellationRequestResult,
  mapScheduledJarvisAttemptResult,
} from './resultMappers';
import { canCancelRun, selectRetryAction } from './selectors';
import type {
  JarvisCommandCenterDataPort,
  JarvisCommandCenterHandlers,
  JarvisCommandCenterHostPort,
  JarvisCommandCenterTab,
} from './types';
import { JarvisOutputsTab } from './JarvisOutputsTab';
import './jarvis-command-center.css';

const LazyJarvisLiveSystemsTab = React.lazy(() =>
  import('./JarvisLiveSystemsTab').then((module) => ({
    default: module.JarvisLiveSystemsTab,
  })),
);

export type JarvisCommandCenterBinding = Readonly<{
  hostPort: JarvisCommandCenterHostPort;
  dataPort: JarvisCommandCenterDataPort;
}>;

const JarvisCommandCenterContext = React.createContext<JarvisCommandCenterBinding | undefined>(
  undefined,
);

export const JarvisCommandCenterProvider = JarvisCommandCenterContext.Provider;

export function useJarvisCommandCenterBinding(): JarvisCommandCenterBinding | undefined {
  return React.useContext(JarvisCommandCenterContext);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );

  React.useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function JarvisCommandCenter({
  accountId,
  chatId,
  dataPort,
  handlers,
  compact = false,
}: {
  accountId: string;
  chatId: string;
  dataPort: JarvisCommandCenterDataPort;
  handlers: JarvisCommandCenterHandlers;
  compact?: boolean;
}) {
  const store = React.useMemo(
    () => createJarvisCommandCenterStore({ accountId, chatId, dataPort }),
    [accountId, chatId, dataPort],
  );
  const snapshot = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [feedback, setFeedback] = React.useState<string>();
  const [busyAction, setBusyAction] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  React.useEffect(() => () => store.dispose(), [store]);
  React.useEffect(() => setFeedback(undefined), [snapshot.currentRun?.id]);

  const expanded = snapshot.expansion === 'expanded';
  const run = snapshot.currentRun;
  const retryAction = selectRetryAction(snapshot.retryState, handlers);
  const cancelVisible = canCancelRun(run, snapshot.retryState, handlers);

  const execute = async (operation: () => Promise<string>) => {
    setBusyAction(true);
    setFeedback(undefined);
    try {
      setFeedback(await operation());
      await store.refresh();
    } catch {
      setFeedback('The requested action is unavailable for this account session.');
    } finally {
      setBusyAction(false);
    }
  };

  const toggle = () => {
    store.setExpansion(expanded ? 'collapsed' : 'expanded');
  };

  const onEscape = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    store.setExpansion('collapsed');
    toggleRef.current?.focus();
  };

  return (
    <section
      className={cn(
        'jarvis-command-center',
        !reducedMotion && 'jarvis-command-center--motion',
        compact && 'jarvis-command-center--compact',
      )}
      aria-label="Jarvis Command Center"
      data-testid="jarvis-command-center"
      onKeyDown={onEscape}
    >
      <header className="jarvis-command-center__header">
        <div className="jarvis-command-center__identity">
          <div className="jarvis-command-center__eyebrow">Command Center</div>
          <div className="jarvis-command-center__summary">
            {run ? `Run ${run.status.replaceAll('_', ' ')}` : 'Waiting for a canonical run'}
          </div>
        </div>

        <div className="jarvis-command-center__actions">
          {cancelVisible && run && handlers.cancelRun ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busyAction}
              onClick={() =>
                void execute(async () =>
                  mapJarvisCancellationRequestResult(await handlers.cancelRun!(accountId, run.id)),
                )
              }
            >
              <Square aria-hidden="true" />
              Cancel
            </Button>
          ) : null}

          {run && retryAction.kind !== 'none' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busyAction}
              onClick={() =>
                void execute(async () => {
                  const result =
                    retryAction.kind === 'retry_transport'
                      ? await retryAction.handler(accountId, run.id)
                      : await retryAction.handler(accountId, run.id);
                  return mapScheduledJarvisAttemptResult(result);
                })
              }
            >
              <RotateCcw aria-hidden="true" />
              {retryAction.kind === 'retry_transport' ? 'Retry transport' : 'Retry as new run'}
            </Button>
          ) : null}

          <Button
            ref={toggleRef}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-expanded={expanded}
            aria-controls="jarvis-command-center-body"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} Command Center`}
            onClick={toggle}
          >
            {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </Button>
        </div>
      </header>

      {snapshot.retryState.kind !== 'none' && retryAction.kind === 'none' ? (
        <p className="jarvis-command-center__feedback">
          {snapshot.retryState.kind === 'scheduled_transport_available'
            ? 'Transport retry is available; this view cannot request it.'
            : 'A new logical run is available; this view cannot request it.'}
        </p>
      ) : null}
      {feedback ? (
        <p className="jarvis-command-center__feedback" aria-live="polite">
          {feedback}
        </p>
      ) : null}

      {expanded ? (
        <div className="jarvis-command-center__body" id="jarvis-command-center-body">
          <Tabs
            className="jarvis-command-center__tabs"
            value={snapshot.activeTab}
            onValueChange={(value) => store.setActiveTab(value as JarvisCommandCenterTab)}
          >
            <TabsList className="jarvis-command-center__tablist" aria-label="Command Center views">
              <TabsTrigger value="outputs">Outputs</TabsTrigger>
              <TabsTrigger value="live_systems">Live Systems</TabsTrigger>
            </TabsList>
            <TabsContent className="jarvis-command-center__panel" value="outputs">
              {snapshot.error ? (
                <p className="jarvis-command-center__empty">{snapshot.error}</p>
              ) : (
                <JarvisOutputsTab outputs={snapshot.outputs} />
              )}
            </TabsContent>
            <TabsContent className="jarvis-command-center__panel" value="live_systems">
              {snapshot.error ? (
                <p className="jarvis-command-center__empty">{snapshot.error}</p>
              ) : snapshot.activeTab === 'live_systems' ? (
                <React.Suspense
                  fallback={<p className="jarvis-command-center__empty">Loading Live Systems…</p>}
                >
                  <LazyJarvisLiveSystemsTab liveSystems={snapshot.liveSystems} />
                </React.Suspense>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </section>
  );
}
