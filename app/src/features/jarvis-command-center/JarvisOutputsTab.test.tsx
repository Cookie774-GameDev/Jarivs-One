import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JarvisArtifactV1 } from './types';
import { JarvisOutputsTab } from './JarvisOutputsTab';

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
  it('gives concise real URI access without exposing unsafe, invalid, or quarantined backing', () => {
    const localPath = 'C:\\workspace\\private\\local-report.md';
    const longSummary = 'Verified launch evidence '.repeat(20);
    const outputs = [
      artifact('artifact-web', 'Web report', {
        uri: 'https://example.test/reports/launch',
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

    expect(screen.getByRole('link', { name: 'Open output: Web report' }).getAttribute('href')).toBe(
      'https://example.test/reports/launch',
    );
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
});
