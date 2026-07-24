import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { JarvisArtifactV1 } from './types';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';
import { SIK_CONTROL } from '@/lib/jarvis/smoke/evidenceIds';
import { isTauri, openLocalArtifactPath } from '@/lib/tauri';
import {
  conciseJarvisArtifactSummary,
  isRenderableJarvisArtifact,
  resolveJarvisArtifactAccess,
} from './artifactAccess';

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
});

export function JarvisOutputsTab({ outputs }: { outputs: readonly JarvisArtifactV1[] }) {
  const [accessStatus, setAccessStatus] = useState('');
  const renderableOutputs = outputs.filter(isRenderableJarvisArtifact);

  if (renderableOutputs.length === 0) {
    return (
      <p
        className="jarvis-command-center__empty"
        data-sik-output-count={KERNEL_SMOKE_ENABLED ? 0 : undefined}
        data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_CONTROL.outputsState : undefined}
      >
        No persisted outputs for this run yet.
      </p>
    );
  }

  return (
    <>
      <ul
        className="jarvis-command-center__rows"
        aria-label="Persisted run outputs"
        data-sik-output-count={KERNEL_SMOKE_ENABLED ? renderableOutputs.length : undefined}
        data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_CONTROL.outputsState : undefined}
      >
        {renderableOutputs.map((output) => {
          const access = resolveJarvisArtifactAccess(output, { desktop: isTauri });
          const summary = conciseJarvisArtifactSummary(output.safeSummary);
          const accessLabel = `Open output: ${output.title}`;
          return (
            <li className="jarvis-command-center__row" key={output.id}>
              <span className="jarvis-command-center__rail" data-state={output.state} />
              <span className="jarvis-command-center__row-copy">
                <span className="jarvis-command-center__row-title">{output.title}</span>
                {summary ? (
                  <span className="jarvis-command-center__row-detail">{summary}</span>
                ) : null}
              </span>
              <span className="jarvis-command-center__row-meta">
                <span className="jarvis-command-center__state">{output.state}</span>
                {access?.kind === 'uri' ? (
                  <a
                    className="jarvis-command-center__output-action"
                    href={access.target}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={accessLabel}
                  >
                    Open
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                ) : access?.kind === 'local_path' ? (
                  <button
                    className="jarvis-command-center__output-action"
                    type="button"
                    aria-label={accessLabel}
                    onClick={() => {
                      setAccessStatus('');
                      void openLocalArtifactPath(access.target).then(
                        () => setAccessStatus(`Opened output: ${output.title}`),
                        () => setAccessStatus(`Could not open output: ${output.title}`),
                      );
                    }}
                  >
                    Open
                    <ArrowUpRight aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">
        {accessStatus}
      </span>
    </>
  );
}
