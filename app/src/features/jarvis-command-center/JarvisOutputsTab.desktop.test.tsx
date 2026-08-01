import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactV1 } from './types';
import { JarvisOutputsTab } from './JarvisOutputsTab';

const { openExternal, openLocalArtifactPath } = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  openLocalArtifactPath: vi.fn<(path: string) => Promise<void>>(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauri: true,
  openExternal,
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
    openExternal.mockReset();
    openExternal.mockResolvedValue(undefined);
    openLocalArtifactPath.mockReset();
    openLocalArtifactPath.mockResolvedValue(undefined);
  });

  it('routes HTTPS artifacts through the desktop external-open bridge after showing the host', async () => {
    const url = 'https://downloads.example.test/reports/launch';
    render(<JarvisOutputsTab outputs={[{ ...localArtifact(), uri: url }]} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open output: Local report on downloads.example.test',
      }),
    );

    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(url));
    expect(openLocalArtifactPath).not.toHaveBeenCalled();
  });

  it('renders a persisted local artifact without exposing an unverified native-open action', () => {
    const output = localArtifact();
    const view = render(<JarvisOutputsTab outputs={[output]} />);

    expect(screen.getByText('Local report')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open output: Local report' })).toBeNull();
    expect(view.container.innerHTML).not.toContain(output.localReference?.value);
    expect(openLocalArtifactPath).not.toHaveBeenCalled();
  });
});
