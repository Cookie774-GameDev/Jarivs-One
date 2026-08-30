import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { readLiveTargetSnapshot } from '@/features/instant-command/targetSnapshot';
import {
  terminalPeerFabricCommandPort,
  type TerminalPeerFabricCommandPort,
} from './terminalPeerFabricTool';

export type FabricTerminalCandidate = Readonly<{
  sessionId: string;
  paneId: string;
  label: string;
}>;

export type TerminalPeerFabricSetupDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  port?: TerminalPeerFabricCommandPort;
  candidates?: readonly FabricTerminalCandidate[];
  createCorrelationId?: () => string;
}>;

function uniqueCandidates(
  candidates: readonly FabricTerminalCandidate[],
): FabricTerminalCandidate[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.sessionId, (counts.get(candidate.sessionId) ?? 0) + 1);
  }
  return candidates.filter(
    (candidate) =>
      candidate.sessionId.length > 0 &&
      candidate.paneId.length > 0 &&
      counts.get(candidate.sessionId) === 1,
  );
}

export function TerminalPeerFabricSetupDialog({
  open,
  onOpenChange,
  port = terminalPeerFabricCommandPort,
  candidates,
  createCorrelationId = () => crypto.randomUUID(),
}: TerminalPeerFabricSetupDialogProps) {
  const [availableCandidates, setAvailableCandidates] = React.useState<FabricTerminalCandidate[]>(
    () => uniqueCandidates(candidates ?? []),
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setError(null);
    if (candidates) {
      setAvailableCandidates(uniqueCandidates(candidates));
      return;
    }
    let active = true;
    void readLiveTargetSnapshot().then((targets) => {
      if (!active) return;
      setAvailableCandidates(
        uniqueCandidates(
          targets.map((target) => ({
            sessionId: target.sessionId,
            paneId: target.paneId,
            label: target.label ?? target.provider ?? `Terminal ${target.ordinal}`,
          })),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [candidates, open]);

  const toggle = (sessionId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const connect = async () => {
    if (selected.size < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const peerIds = availableCandidates
        .filter((candidate) => selected.has(candidate.sessionId))
        .map((candidate) => candidate.sessionId);
      await port.connect({ correlationId: createCorrelationId(), peerIds });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Terminal Peer Fabric could not connect.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Terminal Peer Fabric</DialogTitle>
          <DialogDescription>
            Select at least two verified live terminals. Membership is submitted atomically to the
            preloaded native capability.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-72 gap-2 overflow-y-auto py-2">
          {availableCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible live terminals found.</p>
          ) : (
            availableCandidates.map((candidate) => (
              <label
                key={candidate.sessionId}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selected.has(candidate.sessionId)}
                  onChange={() => toggle(candidate.sessionId)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {candidate.label}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {candidate.sessionId}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.size < 2 || submitting}
            onClick={() => void connect()}
            aria-label="Connect selected terminals"
          >
            {submitting ? 'Connecting…' : `Connect ${selected.size || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
