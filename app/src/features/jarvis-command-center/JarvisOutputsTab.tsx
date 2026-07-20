import type { JarvisArtifactV1 } from './types';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';
import { SIK_CONTROL } from '@/lib/jarvis/smoke/evidenceIds';

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
});

export function JarvisOutputsTab({ outputs }: { outputs: readonly JarvisArtifactV1[] }) {
  if (outputs.length === 0) {
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
    <ul
      className="jarvis-command-center__rows"
      aria-label="Persisted run outputs"
      data-sik-output-count={KERNEL_SMOKE_ENABLED ? outputs.length : undefined}
      data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_CONTROL.outputsState : undefined}
    >
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
