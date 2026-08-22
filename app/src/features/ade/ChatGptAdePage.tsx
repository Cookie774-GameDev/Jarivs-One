export function ChatGptAdePage() {
  return (
    <main
      className="h-full overflow-auto bg-background p-6 text-foreground"
      data-ade-implementation-state="not-implemented"
      data-monochrome-route="ade"
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl items-center justify-center">
        <section className="w-full rounded-2xl border border-border/70 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            VibeSpace-local agent development environment
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">ChatGPT ADE</h1>
            <span className="rounded-full border border-border/70 bg-background/55 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Not implemented
            </span>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            The scoped adapter, Context policy, terminal linkage, durable lifecycle, and safe task
            presentation are staged. VibeSpace will not expose a runnable ADE until the remaining
            production and native proof gates are complete.
          </p>

          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <dt className="font-medium">Production dispatch</dt>
              <dd className="mt-1 text-muted-foreground">
                Production model dispatcher is not bound to the exact observed route.
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <dt className="font-medium">Native acceptance</dt>
              <dd className="mt-1 text-muted-foreground">
                Official native acceptance is pending for task, terminal, cancellation, and route
                identity behavior.
              </dd>
            </div>
          </dl>

          <p className="mt-5 text-xs text-muted-foreground">
            No model substitution, duplicate context system, or unrestricted terminal authority is
            enabled by this route.
          </p>
        </section>
      </div>
    </main>
  );
}
