import { describe, expect, it, vi } from 'vitest';
import type { CanonicalMcpToolDescriptor } from '@/lib/mcp/serverManager';
import type { NormalizedExternalMcpToolResult } from '@/lib/mcp/toolResult';
import {
  runZapierTool,
  testZapierConnection,
  type ZapierGateway,
  type ZapierGatewayFactory,
} from './zapierProvider';

const CONNECTION_TOKEN = 'zapier-connection-token-for-tests';

const SLACK_ACTION: CanonicalMcpToolDescriptor = Object.freeze({
  name: 'slack_send_channel_message',
  title: 'Slack: Send Channel Message',
  description: 'Sends a message to the selected Slack channel.',
  inputSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: Object.freeze({
      channel: Object.freeze({ type: 'string' }),
      message: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['channel', 'message']),
  }),
});

const GMAIL_ACTION: CanonicalMcpToolDescriptor = Object.freeze({
  name: 'gmail_send_email',
  title: 'Gmail: Send Email',
  description: 'Sends an email through the configured Gmail account.',
  inputSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: Object.freeze({
      to: Object.freeze({ type: 'string' }),
      subject: Object.freeze({ type: 'string' }),
    }),
  }),
});

const UNKNOWN_APP_ACTION: CanonicalMcpToolDescriptor = Object.freeze({
  name: 'send_message',
  title: 'Send Message',
  description: 'Provider did not identify the downstream application.',
  inputSchema: Object.freeze({ type: 'object' }),
});

const NORMALIZED_RESULT: NormalizedExternalMcpToolResult = Object.freeze({
  ok: true,
  contentTrust: 'external_untrusted',
  safeSummary: 'The configured action completed.',
  textExcerpts: Object.freeze(['Message sent.']),
  sourceRefs: Object.freeze([]),
  artifacts: Object.freeze([]),
  suggestedNextActions: Object.freeze([]),
  structuredData: Object.freeze({ status: 'sent' }),
  omitted: Object.freeze({
    inlineMedia: 0,
    unsafeReferences: 0,
    truncatedValues: 0,
  }),
});

function gatewayHarness(
  tools: readonly CanonicalMcpToolDescriptor[] = [SLACK_ACTION, GMAIL_ACTION],
): {
  factory: ZapierGatewayFactory;
  listTools: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const listTools = vi.fn(async () => tools);
  const invoke = vi.fn(async () => NORMALIZED_RESULT);
  const close = vi.fn(async () => undefined);
  const factory = vi.fn((connectionToken: string): ZapierGateway => {
    expect(connectionToken).toBe(CONNECTION_TOKEN);
    return Object.freeze({ listTools, invoke, close });
  });
  return { factory, listTools, invoke, close };
}

async function discoverSlack(factory: ZapierGatewayFactory) {
  const result = await runZapierTool({
    toolName: 'actions_discover',
    params: { query: 'slack', maxResults: 5 },
    values: { connection_token: CONNECTION_TOKEN },
    signal: new AbortController().signal,
    gatewayFactory: factory,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  const data = result.data as {
    actions: Array<{
      actionId: string;
      actionTitle: string;
      downstreamApp?: string;
      schemaFingerprint: string;
      invocationSupported: boolean;
    }>;
  };
  return data.actions[0]!;
}

describe('Zapier MCP provider', () => {
  it('tests the connection by discovering only currently exposed actions without returning secrets', async () => {
    const harness = gatewayHarness();

    const result = await testZapierConnection({
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: harness.factory,
    });

    expect(result).toEqual({
      ok: true,
      accountLabel: 'Zapier MCP · 2 exposed actions',
    });
    expect(JSON.stringify(result)).not.toContain(CONNECTION_TOKEN);
    expect(harness.listTools).toHaveBeenCalledOnce();
    expect(harness.invoke).not.toHaveBeenCalled();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('discovers bounded configured actions with exact identity and no app-count guarantee', async () => {
    const harness = gatewayHarness([SLACK_ACTION, GMAIL_ACTION, UNKNOWN_APP_ACTION]);

    const result = await runZapierTool({
      toolName: 'actions_discover',
      params: { query: 'send', maxResults: 2 },
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: harness.factory,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.summary).toBe('2 currently exposed Zapier actions found.');
    expect(result.data).toMatchObject({
      source: 'currently_configured_zapier_actions',
      contentTrust: 'external_untrusted',
      actions: [
        {
          actionId: 'slack_send_channel_message',
          actionTitle: 'Slack: Send Channel Message',
          downstreamApp: 'Slack',
          untrustedDescription: 'Sends a message to the selected Slack channel.',
          invocationSupported: true,
        },
        {
          actionId: 'gmail_send_email',
          actionTitle: 'Gmail: Send Email',
          downstreamApp: 'Gmail',
          invocationSupported: true,
        },
      ],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/9,?000|thousands of apps/i);
    expect(serialized).not.toContain(CONNECTION_TOKEN);
    const actions = (result.data as { actions: Array<{ schemaFingerprint: string }> }).actions;
    expect(
      actions.every(({ schemaFingerprint }) => /^sha256:[a-f0-9]{64}$/.test(schemaFingerprint)),
    ).toBe(true);
    expect(harness.invoke).not.toHaveBeenCalled();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('does not fabricate a downstream app when the provider identity is ambiguous', async () => {
    const harness = gatewayHarness([UNKNOWN_APP_ACTION]);

    const result = await runZapierTool({
      toolName: 'actions_discover',
      params: {},
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: harness.factory,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      actions: [
        {
          actionId: 'send_message',
          actionTitle: 'Send Message',
          invocationSupported: false,
        },
      ],
    });
    expect(
      (result.data as { actions: Array<Record<string, unknown>> }).actions[0],
    ).not.toHaveProperty('downstreamApp');
  });

  it('refuses invocation when provider title and stable action-name app identities disagree', async () => {
    const harness = gatewayHarness([
      Object.freeze({
        ...GMAIL_ACTION,
        title: 'Slack: Send Channel Message',
      }),
    ]);

    const result = await runZapierTool({
      toolName: 'actions_discover',
      params: {},
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: harness.factory,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      actions: [
        {
          actionId: 'gmail_send_email',
          actionTitle: 'Slack: Send Channel Message',
          invocationSupported: false,
        },
      ],
    });
    expect(
      (result.data as { actions: Array<Record<string, unknown>> }).actions[0],
    ).not.toHaveProperty('downstreamApp');
  });

  it('rejects duplicate exposed action identifiers before discovery or invocation', async () => {
    const approved = await discoverSlack(gatewayHarness().factory);
    const harness = gatewayHarness([
      SLACK_ACTION,
      Object.freeze({
        ...SLACK_ACTION,
        title: 'Discord: Send Channel Message',
      }),
    ]);

    await expect(
      runZapierTool({
        toolName: 'actions_discover',
        params: {},
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/duplicate_action_identity/i);
    await expect(
      runZapierTool({
        toolName: 'action_invoke',
        params: {
          actionId: approved.actionId,
          actionTitle: approved.actionTitle,
          downstreamApp: approved.downstreamApp,
          schemaFingerprint: approved.schemaFingerprint,
          inputJson: '{"channel":"C123","message":"Approved"}',
        },
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/duplicate_action_identity/i);
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it('re-discovers and invokes exactly the action identity approved by the user once', async () => {
    const harness = gatewayHarness();
    const approved = await discoverSlack(harness.factory);
    harness.listTools.mockClear();
    harness.close.mockClear();

    const result = await runZapierTool({
      toolName: 'action_invoke',
      params: {
        actionId: approved.actionId,
        actionTitle: approved.actionTitle,
        downstreamApp: approved.downstreamApp,
        schemaFingerprint: approved.schemaFingerprint,
        inputJson: JSON.stringify({ channel: 'C123', message: 'Hello' }),
      },
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: harness.factory,
    });

    expect(result).toEqual({
      ok: true,
      summary: 'Zapier action “Slack: Send Channel Message” completed through Slack.',
      data: {
        actionId: 'slack_send_channel_message',
        actionTitle: 'Slack: Send Channel Message',
        downstreamApp: 'Slack',
        schemaFingerprint: approved.schemaFingerprint,
        contentTrust: 'external_untrusted',
        result: NORMALIZED_RESULT,
      },
    });
    expect(harness.listTools).toHaveBeenCalledOnce();
    expect(harness.invoke).toHaveBeenCalledOnce();
    expect(harness.invoke).toHaveBeenCalledWith(
      'slack_send_channel_message',
      { channel: 'C123', message: 'Hello' },
      expect.any(AbortSignal),
    );
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['actionTitle', 'Slack: Changed Action'],
    ['downstreamApp', 'Discord'],
    ['schemaFingerprint', `sha256:${'0'.repeat(64)}`],
  ] as const)('fails closed when the approved %s is stale', async (field, value) => {
    const harness = gatewayHarness();
    const approved = await discoverSlack(harness.factory);
    harness.invoke.mockClear();

    await expect(
      runZapierTool({
        toolName: 'action_invoke',
        params: {
          actionId: approved.actionId,
          actionTitle: approved.actionTitle,
          downstreamApp: approved.downstreamApp,
          schemaFingerprint: approved.schemaFingerprint,
          inputJson: '{}',
          [field]: value,
        },
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/approved_action_changed/i);
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it('rejects unknown and ambiguous actions before invocation', async () => {
    const harness = gatewayHarness([UNKNOWN_APP_ACTION]);

    await expect(
      runZapierTool({
        toolName: 'action_invoke',
        params: {
          actionId: 'missing_action',
          actionTitle: 'Missing: Action',
          downstreamApp: 'Missing',
          schemaFingerprint: `sha256:${'0'.repeat(64)}`,
          inputJson: '{}',
        },
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/approved_action_unavailable/i);

    const ambiguous = await runZapierTool({
      toolName: 'actions_discover',
      params: {},
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: harness.factory,
    });
    if (!ambiguous.ok) throw new Error(ambiguous.error);
    const action = (
      ambiguous.data as {
        actions: Array<{
          actionId: string;
          actionTitle: string;
          schemaFingerprint: string;
        }>;
      }
    ).actions[0]!;
    harness.invoke.mockClear();

    await expect(
      runZapierTool({
        toolName: 'action_invoke',
        params: {
          actionId: action.actionId,
          actionTitle: action.actionTitle,
          downstreamApp: 'Unknown',
          schemaFingerprint: action.schemaFingerprint,
          inputJson: '{}',
        },
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/downstream_app_unavailable/i);
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials, parameters, and JSON before opening or invoking the gateway', async () => {
    const harness = gatewayHarness();

    await expect(
      testZapierConnection({
        values: { connection_token: 'contains whitespace' },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/connection_token_invalid/i);
    await expect(
      runZapierTool({
        toolName: 'actions_discover',
        params: { extra: true },
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: harness.factory,
      }),
    ).rejects.toThrow(/discovery_parameters_invalid/i);
    expect(harness.factory).not.toHaveBeenCalled();

    const invocationHarness = gatewayHarness();
    const approved = await discoverSlack(invocationHarness.factory);
    invocationHarness.invoke.mockClear();
    await expect(
      runZapierTool({
        toolName: 'action_invoke',
        params: {
          actionId: approved.actionId,
          actionTitle: approved.actionTitle,
          downstreamApp: approved.downstreamApp,
          schemaFingerprint: approved.schemaFingerprint,
          inputJson: '[]',
        },
        values: { connection_token: CONNECTION_TOKEN },
        signal: new AbortController().signal,
        gatewayFactory: invocationHarness.factory,
      }),
    ).rejects.toThrow(/input_json_invalid/i);
    expect(invocationHarness.invoke).not.toHaveBeenCalled();
  });

  it('preserves a normalized downstream failure instead of claiming completion', async () => {
    const discoveryHarness = gatewayHarness();
    const approved = await discoverSlack(discoveryHarness.factory);
    const failedResult: NormalizedExternalMcpToolResult = Object.freeze({
      ...NORMALIZED_RESULT,
      ok: false,
      safeSummary: 'The external tool reported an error.',
    });
    const invoke = vi.fn(async () => failedResult);
    const failingFactory: ZapierGatewayFactory = () =>
      Object.freeze({
        listTools: async () => [SLACK_ACTION],
        invoke,
        close: async () => undefined,
      });

    const result = await runZapierTool({
      toolName: 'action_invoke',
      params: {
        actionId: approved.actionId,
        actionTitle: approved.actionTitle,
        downstreamApp: approved.downstreamApp,
        schemaFingerprint: approved.schemaFingerprint,
        inputJson: '{"channel":"C123","message":"Hello"}',
      },
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: failingFactory,
    });

    expect(result).toEqual({
      ok: false,
      error:
        'Zapier action “Slack: Send Channel Message” reported a downstream failure through Slack.',
    });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('propagates cancellation and redacts gateway failures', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled by caller.', 'AbortError'));
    const cancelledHarness = gatewayHarness();

    await expect(
      runZapierTool({
        toolName: 'actions_discover',
        params: {},
        values: { connection_token: CONNECTION_TOKEN },
        signal: controller.signal,
        gatewayFactory: cancelledHarness.factory,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelledHarness.factory).not.toHaveBeenCalled();

    const close = vi.fn(async () => undefined);
    const failingFactory: ZapierGatewayFactory = () =>
      Object.freeze({
        listTools: vi.fn(async () => {
          throw new Error(`provider leaked ${CONNECTION_TOKEN}`);
        }),
        invoke: vi.fn(async () => NORMALIZED_RESULT),
        close,
      });

    const error = await testZapierConnection({
      values: { connection_token: CONNECTION_TOKEN },
      signal: new AbortController().signal,
      gatewayFactory: failingFactory,
    }).catch((caught: unknown) => caught);
    expect(String(error)).toMatch(/gateway_operation_failed/i);
    expect(String(error)).not.toContain(CONNECTION_TOKEN);
    expect(close).toHaveBeenCalledOnce();
  });
});
