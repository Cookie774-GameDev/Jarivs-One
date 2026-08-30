import * as React from 'react';
import { Network, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readLiveTargetSnapshot } from '@/features/instant-command/targetSnapshot';
import {
  terminalPeerFabricCommandPort,
  type TerminalPeerFabricCommandPort,
} from './terminalPeerFabricTool';

type CapabilityState = 'checking' | 'available' | 'unavailable';

export type TerminalPeerFabricToolCardProps = Readonly<{
  port?: TerminalPeerFabricCommandPort;
  eligibleTerminalCount?: number;
  onOpen?: () => void;
}>;

export function TerminalPeerFabricToolCard({
  port = terminalPeerFabricCommandPort,
  eligibleTerminalCount,
  onOpen,
}: TerminalPeerFabricToolCardProps) {
  const [capability, setCapability] = React.useState<CapabilityState>('checking');
  const [discoveredCount, setDiscoveredCount] = React.useState(eligibleTerminalCount ?? 0);

  React.useEffect(() => {
    let active = true;
    const probe = window.setTimeout(() => {
      void port
        .capability()
        .then((result) => {
          if (active) {
            setCapability(
              result.available && result.operations?.includes('connect')
                ? 'available'
                : 'unavailable',
            );
          }
        })
        .catch(() => {
          if (active) setCapability('unavailable');
        });
      if (eligibleTerminalCount == null) {
        void readLiveTargetSnapshot().then((targets) => {
          if (active) setDiscoveredCount(targets.length);
        });
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(probe);
    };
  }, [eligibleTerminalCount, port]);

  const count = eligibleTerminalCount ?? discoveredCount;
  const canRun = capability === 'available' && count >= 2;
  const status =
    capability === 'checking'
      ? 'Checking native capability…'
      : capability === 'unavailable'
        ? 'Not available in this build.'
        : count < 2
          ? 'Needs at least two eligible terminals.'
          : `${count} eligible terminals ready.`;

  return (
    <article className="flex min-h-36 items-center gap-4 rounded-lg border border-accent-copper/35 bg-gradient-to-br from-paper to-accent-copper/10 px-4 py-4 shadow-soft">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-accent-copper/35 bg-accent-copper/15">
        <Network className="h-5 w-5 text-accent-copper" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">Terminal Peer Fabric</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          Connect VibeSpace terminals as one capability-gated team. Preloaded; no separate install.
        </span>
        <span className="mt-1 block text-xs text-muted-foreground" role="status">
          {status}
        </span>
      </span>
      <Button
        type="button"
        size="sm"
        disabled={!canRun}
        onClick={onOpen}
        aria-label="Run Terminal Peer Fabric"
      >
        <Play className="h-3.5 w-3.5" /> Run
      </Button>
    </article>
  );
}
