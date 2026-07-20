import type { JarvisCommandCenterSnapshot, JarvisLiveSystemNode } from './types';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';
import { SIK_CONTROL } from '@/lib/jarvis/smoke/evidenceIds';

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
});

function nodeLabel(node: JarvisLiveSystemNode): string {
  return node.kind === 'model'
    ? `${node.providerId} / ${node.modelId}`
    : `${node.category} / ${node.capabilityId}`;
}

export function JarvisLiveSystemsTab({
  liveSystems,
}: {
  liveSystems: JarvisCommandCenterSnapshot['liveSystems'];
}) {
  if (liveSystems.state === 'not_loaded' || liveSystems.state === 'loading') {
    return (
      <p
        className="jarvis-command-center__empty"
        aria-live="polite"
        data-sik-live-state={KERNEL_SMOKE_ENABLED ? liveSystems.state : undefined}
      >
        {liveSystems.state === 'loading'
          ? 'Reading verified live evidence…'
          : 'Live evidence not loaded.'}
      </p>
    );
  }
  if (liveSystems.state === 'unavailable') {
    return (
      <p
        className="jarvis-command-center__empty"
        data-sik-live-state={KERNEL_SMOKE_ENABLED ? liveSystems.state : undefined}
      >
        {liveSystems.reason}
      </p>
    );
  }
  if (liveSystems.nodes.length === 0) {
    return (
      <p
        className="jarvis-command-center__empty"
        data-sik-live-state={KERNEL_SMOKE_ENABLED ? liveSystems.state : undefined}
      >
        No verified live systems for this run.
      </p>
    );
  }

  return (
    <ul
      className="jarvis-command-center__rows"
      aria-label="Verified live systems"
      data-sik-live-state={KERNEL_SMOKE_ENABLED ? liveSystems.state : undefined}
    >
      {liveSystems.nodes.map((node) => (
        <li
          className="jarvis-command-center__row"
          key={node.id}
          data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_CONTROL.liveSystemNode : undefined}
          data-live-node-state={KERNEL_SMOKE_ENABLED ? node.state : undefined}
          data-live-proof-ref={KERNEL_SMOKE_ENABLED ? node.evidenceRef : undefined}
        >
          <span className="jarvis-command-center__rail" data-state={node.state} />
          <span className="jarvis-command-center__row-copy">
            <span className="jarvis-command-center__row-title">{nodeLabel(node)}</span>
            <span className="jarvis-command-center__row-detail">{node.operations.join(' · ')}</span>
          </span>
          <span className="jarvis-command-center__state">{node.state}</span>
        </li>
      ))}
    </ul>
  );
}
