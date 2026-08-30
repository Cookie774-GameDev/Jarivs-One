import { describe, expect, it } from 'vitest';
import type { JarvisArtifactV1 } from '@/lib/jarvis/contracts/execution';
import { buildAccountReferenceCatalog, filterReferenceCatalog } from './referenceCatalog';

function artifact(overrides: Partial<JarvisArtifactV1> = {}): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id: 'jart_launch-report',
    runId: 'jrun_launch',
    requestId: 'jreq_launch',
    attemptNumber: 1,
    state: 'ready',
    kind: 'document',
    title: 'Launch report',
    sourceRefs: [],
    createdAt: 100,
    ...overrides,
  };
}

const agents = [
  {
    id: 'agent_builder',
    slug: 'builder',
    name: 'Builder',
    description: 'Builds the selected change',
  },
] as const;

const plugins = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories and pull requests',
    category: 'Developer Tools',
  },
] as const;

describe('buildAccountReferenceCatalog', () => {
  it('builds CAO, agent, plugin, and opaque artifact references without backing data', () => {
    const catalog = buildAccountReferenceCatalog({
      accountId: 'account-alpha',
      artifactScope: {
        accountId: 'account-alpha',
        artifacts: [
          artifact({
            uri: 'https://user:password@example.test/private',
            safeSummary: 'credential=do-not-render',
            preview: {
              kind: 'text',
              text: 'private document body',
              truncated: false,
              sizeBytes: 21,
            },
            localReference: { kind: 'path', value: 'C:\\private\\launch.md' },
          }),
        ],
      },
      agents,
      plugins,
    });

    expect(catalog).toEqual([
      {
        key: 'cao:jarvis-cao',
        kind: 'cao',
        entityId: 'jarvis-cao',
        mention: '@CAO',
        aliases: ['@Jarvis CAO'],
        label: 'Jarvis CAO',
        description: 'First-party learning and improvement authority',
        metadata: 'Native · Codex learner',
      },
      {
        key: 'agent:agent_builder',
        kind: 'agent',
        entityId: 'agent_builder',
        mention: '@builder',
        label: 'Builder',
        description: 'Builds the selected change',
      },
      {
        key: 'plugin:github',
        kind: 'plugin',
        entityId: 'github',
        mention: '@github',
        label: 'GitHub',
        description: 'Repositories and pull requests',
        metadata: 'Developer Tools',
      },
      {
        key: 'artifact:jart_launch-report',
        kind: 'artifact',
        entityId: 'jart_launch-report',
        mention: '@artifact:jart_launch-report',
        label: 'Launch report',
        description: 'Document artifact · Ready',
      },
    ]);
    expect(JSON.stringify(catalog)).not.toMatch(
      /password|credential|private document|private\\\\launch/u,
    );
  });

  it('fails artifact discovery closed on an account-scope mismatch while preserving agents and plugins', () => {
    const catalog = buildAccountReferenceCatalog({
      accountId: 'account-alpha',
      artifactScope: { accountId: 'account-beta', artifacts: [artifact()] },
      agents,
      plugins,
    });

    expect(catalog.map(({ kind, entityId }) => ({ kind, entityId }))).toEqual([
      { kind: 'cao', entityId: 'jarvis-cao' },
      { kind: 'agent', entityId: 'agent_builder' },
      { kind: 'plugin', entityId: 'github' },
    ]);
  });

  it('omits quarantined and invalid artifacts without dropping safe entities', () => {
    const catalog = buildAccountReferenceCatalog({
      accountId: 'account-alpha',
      artifactScope: {
        accountId: 'account-alpha',
        artifacts: [artifact({ state: 'quarantined' }), artifact({ attemptNumber: 0 })],
      },
      agents,
      plugins,
    });

    expect(catalog.map((entry) => entry.kind)).toEqual(['cao', 'agent', 'plugin']);
  });
});

describe('filterReferenceCatalog', () => {
  it('finds each entity kind by its stable mention or display metadata', () => {
    const catalog = buildAccountReferenceCatalog({
      accountId: 'account-alpha',
      artifactScope: { accountId: 'account-alpha', artifacts: [artifact()] },
      agents,
      plugins,
    });

    expect(filterReferenceCatalog(catalog, 'build').map((entry) => entry.key)).toEqual([
      'agent:agent_builder',
    ]);
    expect(filterReferenceCatalog(catalog, 'cao').map((entry) => entry.key)).toEqual([
      'cao:jarvis-cao',
    ]);
    expect(filterReferenceCatalog(catalog, 'jarvis cao').map((entry) => entry.key)).toEqual([
      'cao:jarvis-cao',
    ]);
    expect(filterReferenceCatalog(catalog, 'github').map((entry) => entry.key)).toEqual([
      'plugin:github',
    ]);
    expect(filterReferenceCatalog(catalog, 'launch').map((entry) => entry.key)).toEqual([
      'artifact:jart_launch-report',
    ]);
    expect(
      filterReferenceCatalog(catalog, 'artifact:jart_launch').map((entry) => entry.key),
    ).toEqual(['artifact:jart_launch-report']);
  });
});
