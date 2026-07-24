import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactV1 } from './types';
import { JarvisOutputsTab } from './JarvisOutputsTab';

const { openLocalArtifactPath } = vi.hoisted(() => ({
  openLocalArtifactPath: vi.fn<(path: string) => Promise<void>>(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauri: true,
  openLocalArtifactPath,
}));

function localArtifact(): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id: 'artifact-local-desktop',
    runId: 'run-output-desktop',
    requestId: 'request-output-desktop',
    attemptNumber: 1,
    state: 'ready',
    kind: 'document',
    title: 'Local report',
    sourceRefs: [],
    createdAt: 100,
    localReference: {
      kind: 'path',
      value: 'C:\\workspace\\private\\local-report.md',
    },
  };
}

describe('JarvisOutputsTab desktop local access', () => {
  beforeEach(() => {
    openLocalArtifactPath.mockReset();
    openLocalArtifactPath.mockResolvedValue(undefined);
  });

  it('routes an absolute local artifact through the fail-closed desktop bridge', async () => {
    const output = localArtifact();
    const view = render(<JarvisOutputsTab outputs={[output]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open output: Local report' }));

    await waitFor(() =>
      expect(openLocalArtifactPath).toHaveBeenCalledWith(output.localReference?.value),
    );
    expect(view.container.innerHTML).not.toContain(output.localReference?.value);
    expect(screen.getByRole('status').textContent).toBe('Opened output: Local report');
  });

  it('announces a local-open failure without disclosing its path', async () => {
    const output = localArtifact();
    openLocalArtifactPath.mockRejectedValueOnce(new Error('native open failed'));
    const view = render(<JarvisOutputsTab outputs={[output]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open output: Local report' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Could not open output: Local report'),
    );
    expect(view.container.innerHTML).not.toContain(output.localReference?.value);
  });
});
