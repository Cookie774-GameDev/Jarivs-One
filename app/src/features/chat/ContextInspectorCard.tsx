import { AlertTriangle, ExternalLink, Network } from 'lucide-react';
import { useUIStore } from '@/stores/ui';
import type { ContextResponseInspector } from '@/features/context/contextResponseIntegration';

export function ContextInspectorCard({ inspector }: { inspector: ContextResponseInspector }) {
  const setRoute = useUIStore((state) => state.setRoute);

  const openInMap = (item: ContextResponseInspector['items'][number]) => {
    setRoute('context');
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('jarvis:context:open-citation', { detail: item.openInMap }),
      );
    }, 0);
  };

  return (
    <details
      className="group/context max-w-xl rounded-xl border border-accent-copper/35 bg-elevated/70"
      data-testid="context-response-inspector"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-secondary text-foreground">
        <Network className="h-3.5 w-3.5 text-accent-copper" />
        <span className="font-medium">{inspector.title}</span>
        <span className="rounded-full bg-accent-copper/12 px-1.5 py-0.5 text-metadata text-accent-copper">
          {inspector.items.length}
        </span>
        {inspector.staleWarnings.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-metadata text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            stale
          </span>
        ) : (
          <span className="ml-auto text-metadata text-muted-foreground">details</span>
        )}
      </summary>
      <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
        {inspector.staleWarnings.map((warning) => (
          <div
            key={warning}
            className="flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/8 px-2 py-1.5 text-metadata text-amber-100"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{warning}</span>
          </div>
        ))}
        {inspector.items.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-background/45 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-secondary font-medium text-foreground">
                  {item.label}
                </div>
                <div className="truncate text-metadata text-muted-foreground">
                  {item.sourceKind} · {item.source} · {item.freshness}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openInMap(item)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent-copper/40 bg-accent-copper/10 px-2 py-1 text-metadata text-foreground hover:border-accent-copper/70"
                aria-label={`Open ${item.label} in Context map`}
              >
                <ExternalLink className="h-3 w-3" />
                Open in map
              </button>
            </div>
            <div className="mt-1.5 text-metadata text-muted-foreground">
              Why selected: {item.whySelected.join(', ')}
            </div>
            <div className="mt-2 text-metadata font-medium text-muted-foreground">
              {item.evidenceKind === 'exact_excerpt' ? 'Exact source excerpt' : 'Source summary'}
            </div>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-panel/65 p-2 text-metadata text-foreground">
              {item.evidenceText}
            </pre>
          </article>
        ))}
      </div>
    </details>
  );
}
