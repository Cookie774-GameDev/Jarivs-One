import type { JarvisArtifactV1 } from './types';

export function JarvisOutputsTab({ outputs }: { outputs: readonly JarvisArtifactV1[] }) {
  if (outputs.length === 0) {
    return <p className="jarvis-command-center__empty">No persisted outputs for this run yet.</p>;
  }

  return (
    <ul className="jarvis-command-center__rows" aria-label="Persisted run outputs">
      {outputs.map((output) => (
        <li className="jarvis-command-center__row" key={output.id}>
          <span className="jarvis-command-center__rail" data-state={output.state} />
          <span className="jarvis-command-center__row-copy">
            <span className="jarvis-command-center__row-title">{output.title}</span>
            {output.safeSummary ? (
              <span className="jarvis-command-center__row-detail">{output.safeSummary}</span>
            ) : null}
          </span>
          <span className="jarvis-command-center__state">{output.state}</span>
        </li>
      ))}
    </ul>
  );
}
