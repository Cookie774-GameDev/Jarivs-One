import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveInitialRoute } from '@/stores/ui';
import { getAllActions, performAction } from '@/features/command-palette/actions';
import { ArtifactReferenceResolverProvider, ReferencePanel } from './ReferencePanel';
import { useWorkbenchStore } from './store';
import type {
  WorkbenchArtifactReferenceResolver,
  WorkbenchArtifactReferenceSnapshot,
  WorkbenchPanel,
} from './types';
import { MAX_WORKBENCH_PANELS } from './types';
import './registerCommandActions';

const ARTIFACT_DIGEST = 'a'.repeat(64);

function artifactPanel(
  artifactId = 'jart_opaque-alpha',
  artifactDigest = ARTIFACT_DIGEST,
): WorkbenchPanel {
  return {
    id: 'artifact-panel-1',
    kind: 'artifact-reference',
    title: 'Artifact reference',
    x: 0,
    y: 0,
    width: 440,
    height: 360,
    z: 1,
    minimized: false,
    status: 'idle',
    settings: { artifactId, artifactDigest },
  };
}

function resolvedArtifact(
  overrides: Partial<WorkbenchArtifactReferenceSnapshot> = {},
): WorkbenchArtifactReferenceSnapshot {
  return {
    accountId: 'account-alpha',
    artifactId: 'jart_opaque-alpha',
    artifactDigest: ARTIFACT_DIGEST,
    title: 'Verified design document',
    safeSummary: 'A bounded verified summary.',
    preview: {
      kind: 'text',
      text: '# Safe preview\n\nApproved content.',
      truncated: false,
    },
    ...overrides,
  };
}

function renderArtifactReference(
  resolver: WorkbenchArtifactReferenceResolver,
  panel = artifactPanel(),
) {
  return render(
    React.createElement(
      ArtifactReferenceResolverProvider,
      { accountId: 'account-alpha', resolve: resolver },
      React.createElement(ReferencePanel, { panel, onUpdate: () => undefined }),
    ),
  );
}

describe('Workbench integration seams', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkbenchStore.getState().resetWorkbench();
  });

  it('uses the detached-window query only for an explicit Workbench launch', () => {
    expect(resolveInitialRoute('?workbench=1')).toBe('workbench');
    expect(resolveInitialRoute('?workbench=0')).toBe('chat');
    expect(resolveInitialRoute('')).toBe('chat');
  });

  it('registers open and spawn actions that open Workbench without requiring setRoute', () => {
    const ids = getAllActions().map((action) => action.id);
    expect(ids).toContain('open-workbench');
    expect(ids).toContain('spawn-workbench');

    const closePalette = vi.fn();
    performAction('spawn-workbench', { closePalette });
    expect(closePalette).toHaveBeenCalled();
    // Web-dev layout applied for spawn action
    expect(
      useWorkbenchStore.getState().panels.filter((p) => p.kind === 'terminal').length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('stores terminal resource ids for reconnect without transcripts', () => {
    const id = useWorkbenchStore.getState().addPanel('terminal');
    expect(id).toBeTruthy();
    useWorkbenchStore.getState().updatePanel(id!, {
      settings: { resourceId: 'pty-live-1' },
      status: 'ready',
    });
    const panel = useWorkbenchStore.getState().panels.find((p) => p.id === id);
    expect(panel?.settings.resourceId).toBe('pty-live-1');
    const saved = useWorkbenchStore.getState().flushPersistence();
    expect(saved.ok).toBe(true);
    const raw = window.localStorage.getItem('vibespace-workbench:v1') ?? '';
    expect(raw).toContain('pty-live-1');
    expect(raw).not.toContain('transcript');
  });

  it('opens files into an editor panel via the store', () => {
    const editorId = useWorkbenchStore.getState().openFileInEditor('C:\\proj\\readme.md');
    expect(editorId).toBeTruthy();
    const editor = useWorkbenchStore.getState().panels.find((p) => p.id === editorId);
    expect(editor?.kind).toBe('editor');
    expect(editor?.settings.filePath).toContain('readme.md');
  });

  it('refreshes an existing device preview when the panel limit is already full', () => {
    const previewId = useWorkbenchStore.getState().openDevicePreview({
      sourcePanelId: 'editor-source',
      deviceId: 'iphone-15',
      language: 'html',
      content: '<p>first preview</p>',
    });
    expect(previewId).toBeTruthy();

    while (useWorkbenchStore.getState().panels.length < MAX_WORKBENCH_PANELS) {
      expect(useWorkbenchStore.getState().addPanel('notes')).toBeTruthy();
    }

    const refreshedId = useWorkbenchStore.getState().openDevicePreview({
      sourcePanelId: 'editor-source',
      deviceId: 'iphone-15',
      language: 'html',
      content: '<p>updated preview</p>',
    });

    expect(refreshedId).toBe(previewId);
    expect(useWorkbenchStore.getState().panels).toHaveLength(MAX_WORKBENCH_PANELS);
    expect(
      useWorkbenchStore.getState().panels.find((panel) => panel.id === previewId)?.settings
        .previewDocument,
    ).toContain('updated preview');
  });

  it('restores an account-owned artifact by opaque id only after its digest is revalidated', async () => {
    const resolve: WorkbenchArtifactReferenceResolver = vi.fn(async (input) =>
      input.accountId === 'account-alpha' && input.artifactId === 'jart_opaque-alpha'
        ? Object.freeze({
            ...resolvedArtifact(),
            backingPath: 'C:\\private\\verified-design.md',
            rawContent: 'must never render',
          })
        : null,
    );

    renderArtifactReference(resolve);

    expect(await screen.findByRole('heading', { name: 'Verified design document' })).toBeTruthy();
    expect(screen.getByText('A bounded verified summary.')).toBeTruthy();
    expect(screen.getByText(/approved content/i)).toBeTruthy();
    expect(screen.queryByText(/private\\verified-design/i)).toBeNull();
    expect(screen.queryByText('must never render')).toBeNull();
    expect(document.querySelector('a')).toBeNull();
  });

  it.each([
    ['missing artifact', null],
    ['foreign account', resolvedArtifact({ accountId: 'account-other' })],
    ['mismatched opaque id', resolvedArtifact({ artifactId: 'jart_opaque-other' })],
    ['mismatched digest', resolvedArtifact({ artifactDigest: 'b'.repeat(64) })],
    ['malformed preview', resolvedArtifact({ preview: { kind: 'image' } as never })],
  ])('fails closed for a %s without rendering returned metadata', async (_label, result) => {
    const resolve: WorkbenchArtifactReferenceResolver = vi.fn(async () => result);

    renderArtifactReference(resolve);

    expect((await screen.findByRole('alert')).textContent).toMatch(/artifact preview unavailable/i);
    expect(screen.queryByText('Verified design document')).toBeNull();
    expect(screen.queryByText(/approved content/i)).toBeNull();
  });

  it('discards a stale resolver response after the panel restores another artifact id', async () => {
    let releaseFirst: ((value: WorkbenchArtifactReferenceSnapshot) => void) | undefined;
    const first = new Promise<WorkbenchArtifactReferenceSnapshot>((resolve) => {
      releaseFirst = resolve;
    });
    const resolve: WorkbenchArtifactReferenceResolver = vi.fn(async ({ artifactId }) => {
      if (artifactId === 'jart_opaque-alpha') return first;
      return resolvedArtifact({
        artifactId: 'jart_opaque-beta',
        artifactDigest: 'b'.repeat(64),
        title: 'Current artifact',
        preview: { kind: 'text', text: 'Current safe preview.', truncated: false },
      });
    });
    const rendered = renderArtifactReference(resolve);

    rendered.rerender(
      React.createElement(
        ArtifactReferenceResolverProvider,
        { accountId: 'account-alpha', resolve },
        React.createElement(ReferencePanel, {
          panel: artifactPanel('jart_opaque-beta', 'b'.repeat(64)),
          onUpdate: () => undefined,
        }),
      ),
    );

    expect(await screen.findByRole('heading', { name: 'Current artifact' })).toBeTruthy();
    releaseFirst?.(resolvedArtifact({ title: 'Stale artifact' }));
    await Promise.resolve();
    expect(screen.queryByText('Stale artifact')).toBeNull();
    expect(screen.getByText('Current safe preview.')).toBeTruthy();
  });
});
