import { beforeEach, describe, expect, it } from 'vitest';
import type { ContextMapRecord } from '../tree';
import {
  createSiyuanMapManifest,
  normalizeSiyuanSummaryPolicy,
  readSiyuanMapManifest,
  updateSiyuanMapManifest,
  writeSiyuanMapManifest,
} from './siyuanMapManifest';

function map(status: ContextMapRecord['status'] = 'active'): ContextMapRecord {
  return {
    id: 'map-1',
    projectId: 'project-1',
    rootDir: 'C:\\Users\\viper\\Documents',
    name: 'Documents',
    status,
    createdAt: 1,
    updatedAt: 1,
    tree: {
      version: 1,
      projectId: 'project-1',
      rootDir: 'C:\\Users\\viper\\Documents',
      generatedAt: 1,
      model: 'local-structural',
      fileCount: 0,
      totalBytes: 0,
      summary: '',
      nodes: [],
    },
  };
}

describe('SiYuan per-map manifest', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to user-selected summaries and never grants cloud authority', () => {
    const manifest = createSiyuanMapManifest(map(), 'project-1', undefined, undefined, 10);
    expect(manifest.summaryPolicy.mode).toBe('selected');
    expect(manifest.summaryModel).toEqual({ kind: 'none' });
    expect(manifest.cloudSummaryApproval).toBeNull();
    expect(manifest.sourcePolicy).toEqual({ readOnly: true, excludedPaths: [] });
    expect(manifest.status).toBe('pending');
  });

  it('persists only an explicit cloud approval with exact route, scope, and privacy disclosure', () => {
    const manifest = updateSiyuanMapManifest(
      createSiyuanMapManifest(map(), 'project-1', undefined, undefined, 10),
      {
        cloudSummaryApproval: {
          providerId: 'opencode-go',
          connectionId: 'opencode-go-primary',
          modelId: 'deepseek-v4-flash-vision-exp',
          sourceRoot: 'C:\\Users\\viper\\Documents',
          summaryPolicyFingerprint: 'policy:abc123',
          eligibleFileCount: 12,
          eligibleSourceBytes: 4_096,
          estimatedMaxSentBytes: 3_072,
          privacyAcknowledged: true,
          approvedAt: 20,
        },
      },
      20,
    );
    writeSiyuanMapManifest(manifest);
    expect(readSiyuanMapManifest('project-1', 'map-1')?.cloudSummaryApproval).toEqual(
      manifest.cloudSummaryApproval,
    );
  });

  it('fails closed when stored cloud approval disclosure is damaged', () => {
    const manifest = createSiyuanMapManifest(map(), 'project-1', undefined, undefined, 10);
    localStorage.setItem(
      'vibespace-siyuan-map-manifest-v1:project-1:map-1',
      JSON.stringify({
        ...manifest,
        cloudSummaryApproval: {
          providerId: 'opencode-go',
          connectionId: 'primary',
          modelId: 'deepseek-v4-flash-vision-exp',
          sourceRoot: manifest.sourceRoot,
          summaryPolicyFingerprint: 'policy:abc123',
          eligibleFileCount: 12,
          eligibleSourceBytes: 4_096,
          estimatedMaxSentBytes: 3_072,
          privacyAcknowledged: false,
          approvedAt: 20,
        },
      }),
    );
    expect(readSiyuanMapManifest('project-1', 'map-1')?.cloudSummaryApproval).toBeNull();
  });

  it('strips hostile approval fields and clears authority when source policy changes', () => {
    const base = createSiyuanMapManifest(map(), 'project-1', undefined, undefined, 10);
    const approval = {
      providerId: 'opencode-go',
      connectionId: 'primary',
      modelId: 'deepseek-v4-flash-vision-exp',
      sourceRoot: base.sourceRoot,
      summaryPolicyFingerprint: 'policy:abc123',
      eligibleFileCount: 1,
      eligibleSourceBytes: 100,
      estimatedMaxSentBytes: 100,
      privacyAcknowledged: true as const,
      approvedAt: 20,
      token: 'must-not-survive',
    };
    const approved = updateSiyuanMapManifest(base, { cloudSummaryApproval: approval }, 20);
    expect(approved.cloudSummaryApproval).not.toHaveProperty('token');
    expect(
      updateSiyuanMapManifest(approved, { sourcePolicy: { excludedPaths: ['private'] } }, 30)
        .cloudSummaryApproval,
    ).toBeNull();
    expect(() =>
      updateSiyuanMapManifest(base, {
        cloudSummaryApproval: { ...approval, sourceRoot: 'C:\\Other' },
      }),
    ).toThrow('siyuan_map_manifest_cloud_approval_scope_invalid');
  });

  it('normalizes the three user choices without changing selected provider identity', () => {
    expect(normalizeSiyuanSummaryPolicy({ mode: 'none' }).mode).toBe('none');
    expect(normalizeSiyuanSummaryPolicy({ mode: 'all' }).mode).toBe('all');
    expect(
      normalizeSiyuanSummaryPolicy({
        mode: 'selected',
        selectedExtensions: ['ts', 'ts', ' md '],
      }).selectedExtensions,
    ).toEqual(['md', 'ts']);
  });

  it('persists exact node bindings and treats recycled maps as index-only deletion', () => {
    let manifest = createSiyuanMapManifest(map('deleted'), 'project-1', undefined, undefined, 10);
    expect(manifest.status).toBe('recycled');
    manifest = updateSiyuanMapManifest(
      manifest,
      {
        notebookId: 'notebook-1',
        rootDocumentId: 'document-1',
        nodeBindings: { 'node-1': 'document-2' },
        counts: { indexed: 1 },
      },
      20,
    );
    writeSiyuanMapManifest(manifest);
    const restored = readSiyuanMapManifest('project-1', 'map-1');
    expect(restored).toMatchObject({
      notebookId: 'notebook-1',
      rootDocumentId: 'document-1',
      nodeBindings: { 'node-1': 'document-2' },
      status: 'recycled',
    });
    expect(restored?.revision).toBe(manifest.revision);
  });
});
