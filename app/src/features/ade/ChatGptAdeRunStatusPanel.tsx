import type { ChatGptAdeRunSnapshot } from './adeContracts';

export function ChatGptAdeRunStatusPanel({
  run,
}: Readonly<{ run: Readonly<ChatGptAdeRunSnapshot> }>) {
  return (
    <section
      aria-label="ChatGPT ADE run status"
      className="rounded-2xl border border-border/70 bg-card/70 p-4 text-foreground shadow-sm backdrop-blur-sm"
      data-ade-run-status={run.status}
      data-warm-surface="chatgpt-ade-status"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            VibeSpace-local
          </p>
          <h2 className="text-lg font-semibold">ChatGPT ADE</h2>
        </div>
        <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium">
          {run.status}
        </span>
      </header>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Selected route</dt>
          <dd className="font-medium">
            {run.executionIdentity.upstreamProviderId} / {run.executionIdentity.upstreamModelId}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {run.executionIdentity.effort} effort · {run.executionIdentity.fastVariant}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Context</dt>
          <dd className="font-medium">
            {run.context ? `${run.context.route} · ${run.context.status}` : 'preparing'}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {run.context
              ? `${run.context.sources.length} source revision${run.context.sources.length === 1 ? '' : 's'}`
              : 'No receipt yet'}
          </dd>
        </div>
      </dl>

      {run.context?.sources.length ? (
        <ul aria-label="Context provenance" className="mt-4 space-y-1 text-xs">
          {run.context.sources.map((source) => (
            <li key={`${source.sourceId}:${source.revision}`}>
              <span className="font-medium">{source.sourceId}</span>{' '}
              <span className="text-muted-foreground">revision {source.revision}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {run.terminalLink ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Linked terminal {run.terminalLink.terminalSessionId} · pane {run.terminalLink.paneId}
        </p>
      ) : null}

      {run.safeFailure ? (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {run.safeFailure}
        </p>
      ) : null}
    </section>
  );
}
