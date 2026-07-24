import { describe, expect, it } from 'vitest';
import type { JarvisCadenceState } from './cadence';
import {
  formatJarvisVerifiedNarration,
  verifiedResponseTemplate,
  type JarvisVerifiedNarrationInput,
} from './templates';
import type { JarvisVerifiedFacts } from './modeClassifier';

function facts(status?: string): JarvisVerifiedFacts {
  return {
    ...(status
      ? { executionState: { status, verifiedBy: 'journal', lastEventSeq: 1 } as never }
      : {}),
    modelState: 'authenticated',
    plugins: [],
    mcps: [],
  };
}

describe('verifiedResponseTemplate', () => {
  it.each([
    ['awaiting_approval', /awaiting your authorisation/i, /completed|running/i],
    ['running', /running/i, /completed successfully/i],
    ['completed', /completed successfully/i, /still running/i],
    ['partial', /partially complete|unfinished/i, /completed successfully/i],
    ['failed', /failed/i, /completed successfully/i],
    ['cancelled', /Jarvis was stopped/i, /completed successfully/i],
    ['timed_out', /timed out/i, /completed successfully/i],
  ] as const)('narrates %s without contradicting it', (status, required, forbidden) => {
    const text = verifiedResponseTemplate(facts(status));
    expect(text).toMatch(required);
    expect(text).not.toMatch(forbidden);
  });

  it('gives concise, safe next actions for connector, timeout, partial, and stopped states', () => {
    expect(
      formatJarvisVerifiedNarration({
        kind: 'unavailable_connector',
        connectorName: 'Google Drive',
        nextAction: 'Connect Google Drive in Settings',
      }).text.replace(', sir', ''),
    ).toBe('Google Drive needs to be connected. Next action: Connect Google Drive in Settings.');

    expect(verifiedResponseTemplate(facts('partial'))).toMatch(
      /Some work completed.*Some work remains unfinished.*retry only the unfinished step if it is safe/i,
    );
    expect(verifiedResponseTemplate(facts('timed_out'))).toMatch(
      /timed out.*verify whether it completed before retrying/i,
    );
    expect(verifiedResponseTemplate(facts('cancelled'))).toMatch(/^Jarvis was stopped\./i);
  });

  it('distinguishes available, connected, and authenticated integrations', () => {
    const text = verifiedResponseTemplate({
      ...facts(),
      plugins: [
        { id: 'available-plugin', state: 'available', operations: [] },
        { id: 'connected-plugin', state: 'connected', operations: [] },
      ],
      mcps: [{ id: 'authenticated-mcp', state: 'authenticated', operations: [] }],
    });
    expect(text).toContain('available-plugin is available');
    expect(text).toContain('connected-plugin is connected');
    expect(text).toContain('authenticated-mcp is authenticated');
  });

  it('names operations only when the integration snapshot says it is usable', () => {
    const text = verifiedResponseTemplate({
      ...facts(),
      plugins: [
        { id: 'catalog-only', state: 'available', operations: ['must.not.appear'] },
        { id: 'connected-plugin', state: 'connected', operations: ['drive.search'] },
      ],
      mcps: [
        {
          id: 'Zapier',
          state: 'authenticated',
          operations: ['canva.create', 'slack.send'],
        },
      ],
    });

    expect(text).toContain('connected-plugin is connected. Available operations: drive.search.');
    expect(text).toContain(
      'Zapier is authenticated. Available operations: canva.create, slack.send.',
    );
    expect(text).not.toContain('must.not.appear');
  });

  it('bounds deterministic operation narration for a large connected catalog', () => {
    const text = verifiedResponseTemplate({
      ...facts(),
      plugins: [],
      mcps: [
        {
          id: 'gateway',
          state: 'connected',
          operations: Array.from({ length: 9 }, (_, index) => `operation-${index + 1}`),
        },
      ],
    });

    expect(text).toContain('Available operations include:');
    expect(text).toContain('operation-8');
    expect(text).not.toContain('operation-9');
  });

  it.each([
    ['queued', /queued and not running/i, /completed/i],
    ['running', /running and not completed/i, /completed with/i],
    ['completed', /completed with executor verification/i, /not completed/i],
  ] as const)(
    'narrates terminal %s from verified executor state',
    (terminalState, required, forbidden) => {
      const text = verifiedResponseTemplate({ ...facts(), terminalState });
      expect(text).toMatch(required);
      expect(text).not.toMatch(forbidden);
    },
  );

  it('reports an unavailable model without inventing a switch', () => {
    expect(verifiedResponseTemplate({ ...facts(), modelState: 'unavailable' })).toBe(
      'The selected model is unavailable, sir. No model switch was made.',
    );
  });

  it('labels provider-only completion as unverified', () => {
    const text = verifiedResponseTemplate({
      ...facts(),
      executionState: { status: 'completed', verifiedBy: 'provider', lastEventSeq: 0 },
    });
    expect(text).toMatch(/provider reported completion|verification is still required/i);
    expect(text).not.toMatch(/completed successfully/i);
  });

  it('uses the cadence helper for significant completion but not routine running updates', () => {
    expect(verifiedResponseTemplate(facts('completed')).match(/\bsir\b/gi)).toHaveLength(1);
    expect(verifiedResponseTemplate(facts('running'))).not.toMatch(/\bsir\b/i);
  });

  it('suppresses a consecutive short acknowledgement while retaining the JARVIS wording', () => {
    const cadenceState: JarvisCadenceState = {
      previousReplyUsedSir: true,
      previousReplyWasShort: true,
    };

    expect(verifiedResponseTemplate(facts('awaiting_approval'), cadenceState)).toBe(
      'Certainly. The action is prepared and awaiting your authorisation. Action: Current action.',
    );
    expect(verifiedResponseTemplate(facts('completed'), cadenceState)).toBe(
      'Completed, sir. The action completed successfully.',
    );
  });
});

describe('formatJarvisVerifiedNarration', () => {
  it.each([
    ['authenticated', 'Current model: openai / gpt-5 (native-api, authenticated).'],
    ['degraded', 'Current model: openai / gpt-5 (native-api, degraded).'],
    ['unavailable', 'Current model: openai / gpt-5 (native-api, unavailable).'],
  ] as const)('formats immutable current-model state %s', (state, expected) => {
    expect(
      formatJarvisVerifiedNarration({
        kind: 'current_model',
        providerId: 'openai',
        modelId: 'gpt-5',
        connectionMode: 'native-api',
        state,
      }).text,
    ).toBe(expected);
  });

  it.each([
    [
      { kind: 'approval_required', actionLabel: 'Publish release' },
      'approval_required',
      ['Certainly, sir', 'prepared and awaiting your authorisation', 'Publish release'],
    ],
    [{ kind: 'queued', actionLabel: 'Run tests' }, 'action_running', ['queued', 'Run tests']],
    [
      { kind: 'running', actionLabel: 'Build desktop app' },
      'action_running',
      ['running', 'Build desktop app'],
    ],
    [
      { kind: 'verifying', actionLabel: 'Create design' },
      'action_running',
      ['being verified', 'Create design'],
    ],
    [
      { kind: 'success', summary: '214 tests passed' },
      'action_success',
      ['Completed', '214 tests passed'],
    ],
    [
      {
        kind: 'partial',
        completedSummary: 'The page was created',
        remainingSummary: 'Publishing remains outstanding',
      },
      'action_partial',
      ['Partially completed', 'The page was created', 'Publishing remains outstanding'],
    ],
    [
      {
        kind: 'failure',
        actionLabel: 'Compile VoiceModal.tsx',
        reason: 'Type mismatch at line 418',
      },
      'action_failure',
      ['failed', 'Compile VoiceModal.tsx', 'Type mismatch at line 418'],
    ],
    [
      { kind: 'cancelled', actionLabel: 'Deploy preview' },
      'status',
      ['Jarvis was stopped', 'Deploy preview'],
    ],
    [
      {
        kind: 'unavailable_connector',
        connectorName: 'Canva',
        nextAction: 'Connect Canva in Settings',
      },
      'warning',
      ['Canva needs to be connected', 'Connect Canva in Settings'],
    ],
    [
      {
        kind: 'missing_permission',
        actionLabel: 'Send message',
        permissionLabel: 'Messaging write approval',
      },
      'approval_required',
      ['permission is required', 'Send message', 'Messaging write approval'],
    ],
    [
      {
        kind: 'stale_terminal',
        terminalLabel: 'Build pane',
        lastObservedAt: '2026-07-23T14:00:00Z',
      },
      'warning',
      ['stale', 'Build pane', '2026-07-23T14:00:00Z'],
    ],
    [
      { kind: 'model_switched', modelName: 'Gemini Pro' },
      'status',
      ['Model switched', 'Gemini Pro'],
    ],
    [
      {
        kind: 'model_switch_proposed',
        modelName: 'Gemini Pro',
        reason: 'Better suited to visual analysis',
      },
      'recommendation',
      ['Model switch proposed', 'Gemini Pro', 'Better suited to visual analysis'],
    ],
    [
      {
        kind: 'agent_delegated',
        agentName: 'Design reviewer',
        objective: 'Audit the landing page',
      },
      'status',
      ['Delegated', 'Design reviewer', 'Audit the landing page'],
    ],
    [
      {
        kind: 'agent_blocked',
        agentName: 'Release reviewer',
        reason: 'Signing credential unavailable',
      },
      'warning',
      ['blocked', 'Release reviewer', 'Signing credential unavailable'],
    ],
    [
      { kind: 'artifact_created', artifactLabel: 'Implementation plan' },
      'action_success',
      ['Artifact created', 'Implementation plan'],
    ],
    [
      {
        kind: 'artifact_link_returned',
        artifactLabel: 'Canva landing page',
        url: 'https://example.test/design?id=verified',
      },
      'action_success',
      ['Artifact link ready', 'Canva landing page', 'https://example.test/design?id=verified'],
    ],
    [
      {
        kind: 'no_result_returned',
        operationLabel: 'Search Drive',
        nextAction: 'Refine the file query',
      },
      'action_partial',
      ['No result was returned', 'Search Drive', 'Refine the file query'],
    ],
  ] as const satisfies readonly [JarvisVerifiedNarrationInput, string, readonly string[]][])(
    'formats verified $kind data without model-authored narration',
    (input, mode, values) => {
      const result = formatJarvisVerifiedNarration(input);

      expect(result.mode).toBe(mode);
      for (const value of values) expect(result.text).toContain(value);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.cadenceState)).toBe(true);
    },
  );

  it('uses the cadence helper without modifying verified result data', () => {
    const running = formatJarvisVerifiedNarration({
      kind: 'running',
      actionLabel: 'Run deterministic suite',
    });
    const success = formatJarvisVerifiedNarration({
      kind: 'success',
      summary: '214/214 tests passed at C:\\VibeSpace\\app',
    });

    expect(running.text).not.toMatch(/\bsir\b/i);
    expect(success.text.match(/\bsir\b/gi)).toHaveLength(1);
    expect(success.text).toContain('214/214 tests passed at C:\\VibeSpace\\app');
  });

  it.each([
    [
      {
        kind: 'agent_batch_started',
        agents: [
          { name: 'Scout', objective: 'Map the repository' },
          { name: 'Reviewer', objective: 'Check security risks' },
        ],
      },
      /assigned.*Scout.*Reviewer/i,
      /chain.of.thought|reasoning step/i,
    ],
    [
      {
        kind: 'agent_batch_blocked',
        blockedAgentName: 'Reviewer',
        reason: 'Test artifact unavailable',
        completedAgentNames: ['Scout'],
      },
      /Reviewer.*blocked.*Scout.*complete/i,
      /internal step|thought process/i,
    ],
    [
      {
        kind: 'agent_batch_completed',
        agentNames: ['Scout', 'Reviewer'],
        summary: 'Two security issues require attention; neither exposes credentials.',
      },
      /complete.*Two security issues require attention/i,
      /transcript|chain.of.thought/i,
    ],
  ] as const)(
    'reports verified agent lifecycle data concisely without internal reasoning',
    (input, required, forbidden) => {
      const result = formatJarvisVerifiedNarration(input);

      expect(result.text).toMatch(required);
      expect(result.text).not.toMatch(forbidden);
      expect(result.text.split(/[.!?](?:\s|$)/u).filter(Boolean).length).toBeLessThanOrEqual(4);
    },
  );

  it('is the execution-state source used by the existing facts template', () => {
    expect(verifiedResponseTemplate(facts('completed'))).toBe(
      formatJarvisVerifiedNarration({
        kind: 'success',
        summary: 'The action completed successfully.',
      }).text,
    );
  });
});
