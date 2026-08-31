import { MessageSquareShare, X } from 'lucide-react';
import type { ChatHandoffProjectionV1 } from './chatHandoffProjection';

export interface ChatHandoffDraftCardProps {
  handoff: ChatHandoffProjectionV1;
  instruction: string;
  onInstructionChange: (value: string) => void;
  onRemove: () => void;
}

export function ChatHandoffDraftCard({
  handoff,
  instruction,
  onInstructionChange,
  onRemove,
}: ChatHandoffDraftCardProps) {
  return (
    <section
      aria-label={`Pending handoff from ${handoff.source.title}`}
      className="rounded-lg border border-accent-copper/40 bg-elevated/70 p-3 motion-reduce:transition-none"
    >
      <div className="flex items-start gap-2">
        <MessageSquareShare
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-copper"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-metadata font-semibold uppercase tracking-wide text-muted-foreground">
                Chat handoff
              </p>
              <p className="truncate text-body font-medium text-foreground">
                {handoff.source.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove handoff from ${handoff.source.title}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <dl className="mt-2 grid gap-1 text-secondary">
            {handoff.goal ? (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-muted-foreground">Goal:</dt>
                <dd className="min-w-0 break-words">{handoff.goal}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-muted-foreground">Status:</dt>
              <dd>{handoff.status}</dd>
            </div>
          </dl>
          {handoff.lastMeaningfulActivity ? (
            <p className="mt-2 line-clamp-2 text-secondary text-muted-foreground">
              {handoff.lastMeaningfulActivity}
            </p>
          ) : null}
          <label className="mt-3 block text-secondary font-medium text-foreground">
            Instruction for {handoff.source.title}
            <textarea
              value={instruction}
              onChange={(event) => onInstructionChange(event.currentTarget.value)}
              rows={2}
              className="mt-1 min-h-14 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-body font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <p className="mt-1 text-metadata text-muted-foreground" aria-live="polite">
            Editable draft · nothing sends until you press Send.
          </p>
        </div>
      </div>
    </section>
  );
}
