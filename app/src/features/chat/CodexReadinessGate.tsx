import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui';
import { codexRuntimeManager, type CodexRuntimeManager } from '@/lib/harness/codexRuntimeManager';

export function CodexReadinessGate({
  manager = codexRuntimeManager,
}: {
  manager?: CodexRuntimeManager;
}) {
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  if (state.kind === 'ready') return null;
  const install = () => void manager.install();

  return (
    <section
      aria-label="Codex tools readiness"
      className="mb-2 rounded-lg border border-accent-copper/30 bg-accent-copper/5 px-3 py-2 text-sm"
    >
      {state.kind === 'checking' ? <p>Checking Codex tools…</p> : null}
      {state.kind === 'missing' || state.kind === 'incomplete' ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Codex tools required</p>
            <p className="text-muted-foreground">
              {state.kind === 'incomplete'
                ? state.reason
                : 'Install the pinned Codex and OpenCodex tools for this VibeSpace profile.'}
            </p>
          </div>
          <Button type="button" size="sm" variant="accent" onClick={install}>
            Install Codex tools
          </Button>
        </div>
      ) : null}
      {state.kind === 'installing' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p>
              Installing {state.component === 'codex' ? 'Codex' : 'OpenCodex'}…{' '}
              {Math.round(state.progress * 100)}%
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => void manager.cancel()}>
              Cancel installation
            </Button>
          </div>
          <div
            role="progressbar"
            aria-label="Codex tools installation"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-accent-copper"
              style={{ width: `${state.progress * 100}%` }}
            />
          </div>
        </div>
      ) : null}
      {state.kind === 'failed' ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Codex tools installation failed</p>
            <p className="text-muted-foreground">{state.message}</p>
          </div>
          {state.recoverable ? (
            <Button type="button" size="sm" variant="accent" onClick={install}>
              Retry installation
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
