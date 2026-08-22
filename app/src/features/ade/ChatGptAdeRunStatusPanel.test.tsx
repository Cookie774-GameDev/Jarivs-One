import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ChatGptAdeRunSnapshot } from './adeContracts';
import { ChatGptAdeRunStatusPanel } from './ChatGptAdeRunStatusPanel';

const run: Readonly<ChatGptAdeRunSnapshot> = Object.freeze({
  runId: 'ade-run-a',
  requestId: 'ade-request-a',
  selectedHarness: 'chatgpt',
  status: 'completed',
  scope: Object.freeze({
    accountId: 'account-a',
    workspaceId: 'workspace-a',
    projectId: 'project-a',
    worktreeId: 'worktree-a',
    revision: 'revision-a',
  }),
  executionIdentity: Object.freeze({
    transportConnectionId: 'connection-a',
    transportAdapterId: 'opencode',
    upstreamProviderId: 'openai',
    upstreamModelId: 'gpt-5.6-luna',
    providerQualifiedModelId: 'openai/gpt-5.6-luna',
    authBillingRoute: 'chatgpt-subscription',
    effort: 'max',
    fastVariant: 'fast',
    catalogRevision: 'catalog-a',
  }),
  terminalLink: Object.freeze({
    terminalSessionId: 'terminal-session-a',
    paneId: 'pane-a',
    runGeneration: 2,
  }),
  context: Object.freeze({
    receiptId: 'receipt-a',
    policyVersion: 'vibespace-context-policy-v1',
    route: 'focused',
    decision: 'required-focused',
    reasons: Object.freeze(['write-capable'] as const),
    required: true,
    status: 'ready',
    safeFailure: null,
    sources: Object.freeze([
      Object.freeze({ sourceId: 'context-map', revision: 'source-revision-a' }),
    ]),
    cacheStatus: 'hit',
    queueDepthAtStart: 0,
    stageTimingsMs: Object.freeze({ retrieval: 2 }),
  }),
  output: 'done',
  safeFailure: null,
  startedAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:01.000Z',
  completedAt: '2026-08-22T00:00:01.000Z',
});

describe('ChatGptAdeRunStatusPanel', () => {
  it('renders safe status, exact selection, provenance, and terminal linkage', () => {
    const { container } = render(<ChatGptAdeRunStatusPanel run={run} />);

    expect(
      screen
        .getByRole('region', { name: 'ChatGPT ADE run status' })
        .getAttribute('data-ade-run-status'),
    ).toBe('completed');
    expect(screen.getByText('openai / gpt-5.6-luna')).toBeTruthy();
    expect(screen.getByText('max effort · fast')).toBeTruthy();
    expect(screen.getByText('focused · ready')).toBeTruthy();
    expect(screen.getByText('context-map')).toBeTruthy();
    expect(screen.getByText(/Linked terminal terminal-session-a/u)).toBeTruthy();
    expect(screen.getByRole('log', { name: 'ChatGPT ADE output' }).textContent).toBe('done');
    expect(container.querySelector('[data-warm-surface="chatgpt-ade-status"]')).not.toBeNull();
  });

  it('cannot render internal evidence handles or context prompt content', () => {
    const { container } = render(<ChatGptAdeRunStatusPanel run={run} />);
    const text = container.textContent ?? '';

    expect(text).not.toContain('evidenceHandles');
    expect(text).not.toContain('promptBlock');
    expect(text).not.toContain('secret-handle');
  });
});
