import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactV1 } from './types';
import { JarvisOutputsTab } from './JarvisOutputsTab';

const commandCenterStyles = readFileSync(
  resolve(process.cwd(), 'src/features/jarvis-command-center/jarvis-command-center.css'),
  'utf8',
);

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauri: false,
  openExternal,
  openLocalArtifactPath: vi.fn(),
}));

function artifact(
  id: string,
  title: string,
  overrides: Partial<JarvisArtifactV1> = {},
): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id,
    runId: 'run-output-1',
    requestId: 'request-output-1',
    attemptNumber: 1,
    state: 'ready',
    kind: 'document',
    title,
    sourceRefs: [],
    createdAt: 100,
    ...overrides,
  };
}

describe('JarvisOutputsTab', () => {
  beforeEach(() => {
    openExternal.mockReset();
    openExternal.mockResolvedValue(undefined);
  });

  it('discloses an external hostname and opens through the safe bridge without exposing its URL', async () => {
    const localPath = 'C:\\workspace\\private\\local-report.md';
    const longSummary = 'Verified launch evidence '.repeat(20);
    const externalUrl = 'https://example.test/reports/launch?token=opaque';
    const outputs = [
      artifact('artifact-web', 'Web report', {
        uri: externalUrl,
        safeSummary: longSummary,
      }),
      artifact('artifact-local', 'Local report', {
        localReference: { kind: 'path', value: localPath },
      }),
      artifact('artifact-opaque', 'Opaque output', {
        localReference: { kind: 'blob_key', value: 'artifact-private-blob' },
      }),
      artifact('artifact-unsafe', 'Unsafe output', {
        uri: 'javascript:alert(document.domain)',
      }),
      artifact('artifact-quarantined', 'Quarantined output', {
        state: 'quarantined',
        uri: 'https://example.test/quarantined',
      }),
      artifact('artifact-invalid', 'Invalid output', {
        attemptNumber: 0,
        safeSummary: 'Invalid output summary must not render.',
      }),
    ];

    const view = render(<JarvisOutputsTab outputs={outputs} />);

    const externalAction = screen.getByRole('button', {
      name: 'Open output: Web report on example.test',
    });
    expect(externalAction.textContent).toContain('example.test');
    expect(view.container.innerHTML).not.toContain(externalUrl);
    fireEvent.click(externalAction);
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(externalUrl));
    expect(screen.getByRole('status').textContent).toBe('Opened output: Web report');
    expect(screen.queryByRole('button', { name: 'Open output: Local report' })).toBeNull();
    expect(view.container.textContent).not.toContain(localPath);
    expect(view.container.innerHTML).not.toContain(localPath);
    expect(view.container.textContent).not.toContain('artifact-private-blob');
    expect(screen.queryByRole('link', { name: /Opaque|Unsafe|Quarantined/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Opaque|Unsafe|Quarantined/ })).toBeNull();
    expect(screen.queryByText('Quarantined output')).toBeNull();
    expect(screen.queryByText('Invalid output')).toBeNull();
    expect(screen.queryByText('Invalid output summary must not render.')).toBeNull();

    const summary = screen.getByText((content) => content.endsWith('…'));
    expect(Array.from(summary.textContent ?? '').length).toBeLessThanOrEqual(160);
  });

  it('announces an external-open failure without disclosing the URL', async () => {
    const externalUrl = 'https://unknown.example/private/report';
    openExternal.mockRejectedValueOnce(new Error('native open failed'));
    const view = render(
      <JarvisOutputsTab
        outputs={[artifact('artifact-web-failure', 'External report', { uri: externalUrl })]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open output: External report on unknown.example',
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Could not open output: External report'),
    );
    expect(view.container.innerHTML).not.toContain(externalUrl);
  });

  it('does not expose a local-path action in the browser runtime', () => {
    render(
      <JarvisOutputsTab
        outputs={[
          artifact('artifact-local-browser', 'Local browser report', {
            localReference: { kind: 'path', value: '/workspace/report.md' },
          }),
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: /Open output/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Open output/ })).toBeNull();
  });

  it('keeps long output titles and disclosed hostnames in a shrinkable wrapping row', () => {
    const hostname =
      'very-long-verified-output-host.research-archive.integration-evidence.example.test';
    const title =
      'A deliberately long persisted artifact title that must reflow at two-hundred-percent text scaling';
    render(
      <JarvisOutputsTab
        outputs={[
          artifact('artifact-long-layout', title, {
            uri: `https://${hostname}/verified-report`,
          }),
        ]}
      />,
    );

    const action = screen.getByRole('button', {
      name: `Open output: ${title} on ${hostname}`,
    });
    expect(action.textContent).toContain(hostname);
    expect(screen.getByText(title).textContent).toBe(title);
    expect(commandCenterStyles).toMatch(
      /\.jarvis-command-center__row\s*\{[^}]*grid-template-columns:\s*0\.1875rem minmax\(0,\s*1fr\);/s,
    );
    expect(commandCenterStyles).toMatch(
      /\.jarvis-command-center__row-meta\s*\{[^}]*min-width:\s*0;[^}]*flex-wrap:\s*wrap;/s,
    );
    expect(commandCenterStyles).toMatch(
      /\.jarvis-command-center__output-action\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
    );
  });
});
