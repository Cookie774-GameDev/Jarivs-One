import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  JarvisArtifactV1,
  JarvisCommandCenterSnapshot,
  JarvisEvent,
  JarvisLiveSystemNode,
  JarvisRun,
} from './types';
import { createLiveGraphProjectionSelector, JarvisLiveSystemsTab } from './JarvisLiveSystemsTab';

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-live-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-1',
    model: {
      providerId: 'provider-1',
      modelId: 'model-1',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: 90,
    },
    createdAt: 100,
    updatedAt: 150,
    ...overrides,
  };
}

function readyLiveSystems(): Extract<
  JarvisCommandCenterSnapshot['liveSystems'],
  { state: 'ready' }
> {
  return {
    state: 'ready',
    nodes: [
      {
        kind: 'model',
        id: 'model:provider-1',
        accountId: 'account-1',
        runId: 'run-live-1',
        state: 'active',
        operations: ['generate', 'stream'],
        evidenceRef: 'jlive_model-proof',
        verifiedAt: 120,
        providerId: 'provider-1',
        modelId: 'model-1',
        modelSnapshotRef: 'snapshot-1',
      },
      {
        kind: 'capability',
        id: 'capability:search',
        accountId: 'account-1',
        runId: 'run-live-1',
        state: 'busy',
        operations: ['execute', 'cancel'],
        evidenceRef: 'jlive_tool-proof',
        verifiedAt: 125,
        category: 'tool',
        capabilityId: 'knowledge-search',
      },
      {
        kind: 'capability',
        id: 'capability:github',
        accountId: 'account-1',
        runId: 'run-live-1',
        state: 'busy',
        operations: ['execute', 'inspect'],
        evidenceRef: 'jlive_mcp-proof',
        verifiedAt: 130,
        category: 'mcp',
        capabilityId: 'github',
      },
    ],
  };
}

function events(): readonly JarvisEvent[] {
  return [
    {
      runId: 'run-live-1',
      seq: 1,
      idempotencyKey: 'event-1-started',
      type: 'retrieval',
      status: 'started',
      title: 'Reading project brief',
      sourceRefs: [
        {
          id: 'source-1',
          kind: 'project_file',
          label: 'Launch Brief.md',
          uri: 'https://example.test/brief?token=do-not-render#private',
          accountId: 'account-1',
          trust: 'user_direct',
          sensitivity: 'private',
          observedAt: 105,
        },
      ],
      artifactIds: [],
      createdAt: 105,
    },
    {
      runId: 'run-live-1',
      seq: 2,
      idempotencyKey: 'event-1-completed',
      type: 'retrieval',
      status: 'completed',
      title: 'Read project brief',
      safeSummary: 'Found the approved launch brief.',
      sourceRefs: [
        {
          id: 'source-1',
          kind: 'project_file',
          label: 'Launch Brief.md',
          uri: 'https://example.test/brief?token=do-not-render#private',
          accountId: 'account-1',
          trust: 'user_direct',
          sensitivity: 'private',
          observedAt: 110,
        },
      ],
      artifactIds: [],
      createdAt: 110,
    },
  ];
}

function outputs(): readonly JarvisArtifactV1[] {
  return [
    {
      schemaVersion: 1,
      id: 'artifact-1',
      runId: 'run-live-1',
      requestId: 'request-1',
      attemptNumber: 1,
      state: 'ready',
      kind: 'document',
      title: 'Launch plan',
      safeSummary: 'Verified launch plan document.',
      sourceRefs: [],
      createdAt: 140,
    },
  ];
}

describe('JarvisLiveSystemsTab', () => {
  it('reuses the graph projection until graph-affecting canonical evidence changes', () => {
    const selectProjection = createLiveGraphProjectionSelector();
    const canonicalRun = run();
    const canonicalNodes = readyLiveSystems().nodes;
    const canonicalEvents = events();
    const canonicalOutputs = outputs();
    const input = {
      nodes: canonicalNodes,
      events: canonicalEvents,
      outputs: canonicalOutputs,
      run: canonicalRun,
    };

    const first = selectProjection(input);
    expect(selectProjection(input)).toBe(first);
    expect(selectProjection({ ...input, events: [...canonicalEvents] })).toBe(first);
    expect(
      selectProjection({
        ...input,
        events: [
          ...canonicalEvents,
          {
            runId: 'run-live-1',
            seq: 3,
            idempotencyKey: 'source-free-event',
            type: 'tool',
            status: 'completed',
            title: 'Source-free tool activity',
            sourceRefs: [],
            artifactIds: [],
            createdAt: 120,
          },
        ],
      }),
    ).toBe(first);
    expect(
      selectProjection({
        ...input,
        events: [
          ...canonicalEvents,
          {
            runId: 'run-live-1',
            seq: 3,
            idempotencyKey: 'new-source-event',
            type: 'retrieval',
            status: 'completed',
            title: 'Read another source',
            sourceRefs: [
              {
                id: 'source-2',
                kind: 'project_file',
                label: 'Architecture.md',
                accountId: 'account-1',
                trust: 'user_direct',
                sensitivity: 'private',
                observedAt: 120,
              },
            ],
            artifactIds: [],
            createdAt: 120,
          },
        ],
      }),
    ).not.toBe(first);
  });

  it('renders only the newest eight canonical run events', () => {
    const activity = Array.from(
      { length: 10 },
      (_, index): JarvisEvent => ({
        runId: 'run-live-1',
        seq: index + 1,
        idempotencyKey: `bounded-event-${index + 1}`,
        type: 'tool',
        status: 'completed',
        title: `Bounded activity ${index + 1}`,
        sourceRefs: [],
        artifactIds: [],
        createdAt: 100 + index,
      }),
    );

    render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run()}
        events={activity}
        outputs={[]}
      />,
    );

    const list = screen.getByRole('list', { name: 'Run activity' });
    expect(list.children).toHaveLength(8);
    expect(screen.queryByText('Bounded activity 1')).toBeNull();
    expect(screen.queryByText('Bounded activity 2')).toBeNull();
    expect(screen.getByText('Bounded activity 3')).not.toBeNull();
    expect(screen.getByText('Bounded activity 10')).not.toBeNull();
  });

  it('projects only canonical current-run systems, sources, and outputs into a truthful summary and graph', () => {
    render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run()}
        events={events()}
        outputs={outputs()}
        motionEnabled
      />,
    );

    expect(screen.getByText('provider-1 / model-1')).not.toBeNull();
    expect(screen.getByText('Connectors 1')).not.toBeNull();
    expect(screen.getByText('Tools 1')).not.toBeNull();
    expect(screen.getByText('Sources 1')).not.toBeNull();
    expect(screen.getByText('Outputs 1')).not.toBeNull();
    expect(
      screen.getByRole('img', { name: 'Current run execution map' }).getAttribute('data-run-id'),
    ).toBe('run-live-1');
    expect(screen.getByRole('button', { name: 'Jarvis run' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Source Launch Brief.md' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Output Launch plan' })).not.toBeNull();
    expect(document.querySelectorAll('[data-graph-edge]')).toHaveLength(5);
  });

  it('animates only verified active work and disables edge animation under reduced motion', () => {
    const view = render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run()}
        events={events()}
        outputs={outputs()}
        motionEnabled
      />,
    );

    expect(
      document.querySelector('[data-graph-edge="model:provider-1"]')?.getAttribute('data-animated'),
    ).toBe('true');
    expect(
      document
        .querySelector('[data-graph-edge="capability:search"]')
        ?.getAttribute('data-animated'),
    ).toBe('true');
    expect(
      document
        .querySelector('[data-graph-edge="capability:github"]')
        ?.getAttribute('data-animated'),
    ).toBe('true');
    expect(
      document.querySelector('[data-graph-edge="source:source-1"]')?.getAttribute('data-animated'),
    ).toBe('false');

    view.rerender(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run()}
        events={events()}
        outputs={outputs()}
        motionEnabled={false}
      />,
    );
    expect(document.querySelectorAll('[data-animated="true"]')).toHaveLength(0);
  });

  it('stops every edge animation when the canonical run becomes terminal partial', () => {
    render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run({ status: 'partial' })}
        events={events()}
        outputs={outputs()}
        motionEnabled
      />,
    );

    expect(document.querySelectorAll('[data-animated="true"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-edge-state="active"]')).toHaveLength(0);
  });

  it('shows safe node details on keyboard focus without exposing evidence references', () => {
    render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run()}
        events={events()}
        outputs={outputs()}
        motionEnabled
      />,
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Tool knowledge-search' }));
    expect(screen.getByRole('status', { name: 'Live system details' }).textContent).toContain(
      'execute · cancel',
    );
    expect(screen.getByRole('status', { name: 'Live system details' }).textContent).toContain(
      'Tool',
    );
    expect(screen.getByRole('status', { name: 'Live system details' }).textContent).toContain(
      'busy',
    );
    expect(screen.getByRole('status', { name: 'Live system details' }).textContent).toContain(
      'Run duration · <1s',
    );
    expect(screen.queryByText('jlive_tool-proof')).toBeNull();
  });

  it('fails closed on cross-run, cross-account, secret-source, and invalid output projections', () => {
    const liveSystems = readyLiveSystems();
    const capability = liveSystems.nodes.find(
      (node): node is Extract<JarvisLiveSystemNode, { kind: 'capability' }> =>
        node.kind === 'capability',
    );
    if (!capability) throw new Error('Expected capability fixture.');
    render(
      <JarvisLiveSystemsTab
        liveSystems={{
          state: 'ready',
          nodes: [
            ...liveSystems.nodes,
            {
              ...capability,
              id: 'capability:cross-account',
              accountId: 'account-other',
              capabilityId: 'must-not-render',
            },
            {
              ...capability,
              id: 'capability:cross-run',
              runId: 'run-other',
              capabilityId: 'must-not-render-cross-run-node',
            },
          ],
        }}
        run={run()}
        events={[
          ...events(),
          {
            runId: 'run-live-1',
            seq: 3,
            idempotencyKey: 'secret-source',
            type: 'retrieval',
            status: 'completed',
            title: 'Secret source was withheld',
            sourceRefs: [
              {
                id: 'source-secret',
                kind: 'project_file',
                label: 'do-not-render-secret-label',
                accountId: 'account-1',
                trust: 'user_direct',
                sensitivity: 'secret',
              },
            ],
            artifactIds: [],
            createdAt: 115,
          },
          {
            runId: 'run-other',
            seq: 4,
            idempotencyKey: 'cross-run',
            type: 'tool',
            status: 'completed',
            title: 'do-not-render-cross-run-event',
            sourceRefs: [],
            artifactIds: [],
            createdAt: 120,
          },
        ]}
        outputs={[
          ...outputs(),
          {
            ...outputs()[0]!,
            id: 'artifact-other',
            runId: 'run-other',
            title: 'do-not-render-cross-run-output',
          },
        ]}
        motionEnabled
      />,
    );

    expect(screen.queryByText('tool / must-not-render')).toBeNull();
    expect(screen.queryByText('tool / must-not-render-cross-run-node')).toBeNull();
    expect(screen.queryByText('do-not-render-secret-label')).toBeNull();
    expect(screen.queryByText('do-not-render-cross-run-event')).toBeNull();
    expect(screen.queryByText('do-not-render-cross-run-output')).toBeNull();
    expect(screen.getByText('Sources 1')).not.toBeNull();
    expect(screen.getByText('Outputs 1')).not.toBeNull();
  });

  it('fairly bounds a busy run without starving canonical source or output nodes', () => {
    const liveSystems = readyLiveSystems();
    const capability = liveSystems.nodes.find(
      (node): node is Extract<JarvisLiveSystemNode, { kind: 'capability' }> =>
        node.kind === 'capability',
    );
    if (!capability) throw new Error('Expected capability fixture.');
    const manyTools = Array.from({ length: 16 }, (_, index) => ({
      ...capability,
      id: `capability:tool-${index}` as const,
      capabilityId: `tool-${index}`,
    }));

    render(
      <JarvisLiveSystemsTab
        liveSystems={{ state: 'ready', nodes: [liveSystems.nodes[0]!, ...manyTools] }}
        run={run()}
        events={events()}
        outputs={outputs()}
        motionEnabled
      />,
    );

    expect(document.querySelectorAll('[data-graph-edge]')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Source Launch Brief.md' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Output Launch plan' })).not.toBeNull();
  });

  it('shows only sanitized canonical locations and safe result summaries in node details', () => {
    render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run()}
        events={events()}
        outputs={outputs()}
        motionEnabled
      />,
    );

    const details = screen.getByRole('status', { name: 'Live system details' });
    fireEvent.focus(screen.getByRole('button', { name: 'Source Launch Brief.md' }));
    expect(details.textContent).toContain('Location · https://example.test/brief');
    expect(details.textContent).not.toContain('token=do-not-render');
    expect(details.textContent).not.toContain('#private');

    fireEvent.focus(screen.getByRole('button', { name: 'Output Launch plan' }));
    expect(details.textContent).toContain('Result · Verified launch plan document.');
  });

  it('renders canonical event timestamps/statuses and makes permission and error states visible', () => {
    const activity: readonly JarvisEvent[] = [
      {
        runId: 'run-live-1',
        seq: 1,
        idempotencyKey: 'approval-1',
        type: 'approval',
        status: 'waiting_permission',
        title: 'Approve draft creation',
        sourceRefs: [],
        artifactIds: [],
        createdAt: 110,
      },
      {
        runId: 'run-live-1',
        seq: 2,
        idempotencyKey: 'error-1',
        type: 'error',
        status: 'failed',
        title: 'Connector request failed',
        safeSummary: 'The connector rejected the request.',
        sourceRefs: [],
        artifactIds: [],
        createdAt: 120,
      },
    ];
    render(
      <JarvisLiveSystemsTab
        liveSystems={readyLiveSystems()}
        run={run({ status: 'awaiting_approval' })}
        events={activity}
        outputs={[]}
        motionEnabled
      />,
    );

    expect(screen.getByText('Waiting for approval')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Jarvis run' }).getAttribute('data-blocked')).toBe(
      'approval',
    );
    expect(screen.getByText('Approve draft creation')).not.toBeNull();
    expect(screen.getByText('waiting permission')).not.toBeNull();
    expect(screen.getByText('Connector request failed')).not.toBeNull();
    expect(screen.getByText('failed')).not.toBeNull();
    expect(screen.getByRole('status', { name: 'Live system details' }).textContent).toContain(
      'Run error · The connector rejected the request.',
    );
    expect(document.querySelectorAll('time[datetime]')).toHaveLength(2);
  });

  it('shows only the immutable model snapshot when no live activity has arrived', () => {
    render(
      <JarvisLiveSystemsTab
        liveSystems={{ state: 'ready', nodes: [] }}
        run={run({ status: 'completed' })}
        events={[]}
        outputs={[]}
        motionEnabled
      />,
    );

    expect(screen.getByText('Model provider-1 / model-1')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Model provider-1 / model-1' })).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Current run execution map' })).not.toBeNull();
    expect(screen.queryByRole('list', { name: 'Run activity' })).toBeNull();
  });

  it('keeps the immutable run model visible when live evidence reports another model node', () => {
    const liveSystems = readyLiveSystems();
    const mismatchedModel: JarvisLiveSystemNode = {
      ...liveSystems.nodes[0]!,
      id: 'model:other',
      providerId: 'provider-other',
      modelId: 'model-other',
    } as JarvisLiveSystemNode;

    render(
      <JarvisLiveSystemsTab
        liveSystems={{ state: 'ready', nodes: [mismatchedModel] }}
        run={run()}
        events={[]}
        outputs={[]}
      />,
    );

    expect(screen.getByText('Model provider-1 / model-1')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Model provider-1 / model-1' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Model provider-other / model-other' })).toBeNull();
    expect(screen.queryByText(/provider-other|model-other/)).toBeNull();
  });

  it('keeps the blocked approval root visible before branch evidence arrives', () => {
    render(
      <JarvisLiveSystemsTab
        liveSystems={{ state: 'ready', nodes: [] }}
        run={run({ status: 'awaiting_approval' })}
        events={[]}
        outputs={[]}
        motionEnabled
      />,
    );

    const root = screen.getByRole('button', { name: 'Jarvis run' });
    expect(root.getAttribute('data-state')).toBe('awaiting_approval');
    expect(root.getAttribute('data-blocked')).toBe('approval');
    expect(screen.getByText('Waiting for approval')).not.toBeNull();
  });
});
