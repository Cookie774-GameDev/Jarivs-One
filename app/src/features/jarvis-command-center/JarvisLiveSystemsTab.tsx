import type { JarvisCommandCenterSnapshot, JarvisLiveSystemNode } from './types';

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
      <p className="jarvis-command-center__empty" aria-live="polite">
        {liveSystems.state === 'loading'
          ? 'Reading verified live evidence…'
          : 'Live evidence not loaded.'}
      </p>
    );
  }
  if (liveSystems.state === 'unavailable') {
    return <p className="jarvis-command-center__empty">{liveSystems.reason}</p>;
  }
  if (liveSystems.nodes.length === 0) {
    return <p className="jarvis-command-center__empty">No verified live systems for this run.</p>;
  }

  return (
    <ul className="jarvis-command-center__rows" aria-label="Verified live systems">
      {liveSystems.nodes.map((node) => (
        <li className="jarvis-command-center__row" key={node.id}>
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
