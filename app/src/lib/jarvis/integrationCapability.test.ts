import { describe, expect, it } from 'vitest';
import {
  createJarvisIntegrationCapability,
  JARVIS_CONNECTOR_STATES,
  JARVIS_INTEGRATION_KINDS,
  JarvisIntegrationCapabilityError,
  type JarvisConnectorState,
  type JarvisIntegrationCapabilityInput,
  type JarvisIntegrationEvidenceKind,
  type JarvisIntegrationKind,
} from './integrationCapability';

const expectedKinds = [
  'built_in_action',
  'mcp_lite_tool',
  'external_mcp_server',
  'api_key_plugin',
  'oauth_plugin',
  'connector_metadata',
  'agent_tool',
  'custom_user_tool',
] as const satisfies readonly JarvisIntegrationKind[];

const expectedStates = [
  'Catalog only',
  'Configuration available',
  'Credentials missing',
  'Credentials saved',
  'Manual authorization required',
  'Connected',
  'Connection verified',
  'Tool available',
  'Tool unavailable',
  'Operation running',
  'Operation completed',
  'Operation failed',
] as const satisfies readonly JarvisConnectorState[];

const evidenceByState = {
  'Catalog only': 'catalog_metadata',
  'Configuration available': 'configuration_metadata',
  'Credentials missing': 'credential_status',
  'Credentials saved': 'credential_status',
  'Manual authorization required': 'authorization_status',
  Connected: 'connection_observation',
  'Connection verified': 'connection_verification',
  'Tool available': 'tool_discovery',
  'Tool unavailable': 'tool_discovery',
  'Operation running': 'operation_event',
  'Operation completed': 'operation_event',
  'Operation failed': 'operation_event',
} as const satisfies Record<JarvisConnectorState, JarvisIntegrationEvidenceKind>;

function stateFields(
  state: JarvisConnectorState,
): Pick<JarvisIntegrationCapabilityInput, 'operations' | 'toolId' | 'operation'> {
  if (state.startsWith('Operation ')) {
    return {
      operations: ['search'],
      toolId: 'drive.search',
      operation: { id: 'operation-1', name: 'search' },
    };
  }
  if (state.startsWith('Tool ')) {
    return { operations: ['search'], toolId: 'drive.search' };
  }
  return { operations: ['search'] };
}

function input(
  state: JarvisConnectorState,
  overrides: Partial<JarvisIntegrationCapabilityInput> = {},
): JarvisIntegrationCapabilityInput {
  return {
    id: 'drive',
    displayName: 'Google Drive',
    accountId: 'account-1',
    kind: 'external_mcp_server',
    state,
    ...stateFields(state),
    evidence: {
      kind: evidenceByState[state],
      ref: `evidence:${state}`,
      observedAt: 100,
    },
    ...overrides,
  };
}

describe('JARVIS integration capability taxonomy', () => {
  it('uses exactly the eight runtime kinds and twelve connector-state labels', () => {
    expect(JARVIS_INTEGRATION_KINDS).toEqual(expectedKinds);
    expect(JARVIS_CONNECTOR_STATES).toEqual(expectedStates);
    expect(new Set(JARVIS_INTEGRATION_KINDS).size).toBe(8);
    expect(new Set(JARVIS_CONNECTOR_STATES).size).toBe(12);
  });

  it.each(expectedStates)('accepts %s only with its matching evidence family', (state) => {
    const capability = createJarvisIntegrationCapability(input(state));

    expect(capability.state).toBe(state);
    expect(capability.evidence.kind).toBe(evidenceByState[state]);
  });

  it.each(expectedStates)('rejects mismatched evidence for %s', (state) => {
    const wrongKind: JarvisIntegrationEvidenceKind =
      evidenceByState[state] === 'catalog_metadata' ? 'operation_event' : 'catalog_metadata';

    expect(() =>
      createJarvisIntegrationCapability(
        input(state, {
          evidence: { kind: wrongKind, ref: 'wrong:evidence', observedAt: 100 },
        }),
      ),
    ).toThrowError(JarvisIntegrationCapabilityError);
  });

  it.each([
    ['built_in_action', 'Tool available', 'tool_discovery'],
    ['mcp_lite_tool', 'Tool available', 'tool_discovery'],
    ['external_mcp_server', 'Connected', 'connection_observation'],
    ['api_key_plugin', 'Credentials missing', 'credential_status'],
    ['oauth_plugin', 'Manual authorization required', 'authorization_status'],
    ['connector_metadata', 'Catalog only', 'catalog_metadata'],
    ['agent_tool', 'Tool available', 'tool_discovery'],
    ['custom_user_tool', 'Configuration available', 'configuration_metadata'],
  ] as const)('preserves the %s distinction without relabeling it', (kind, state, evidenceKind) => {
    const capability = createJarvisIntegrationCapability(
      input(state, {
        kind,
        ...stateFields(state),
        evidence: { kind: evidenceKind, ref: `evidence:${kind}`, observedAt: 100 },
      }),
    );

    expect(capability.kind).toBe(kind);
  });

  it('does not let connector metadata or an in-process action claim connection truth', () => {
    for (const kind of ['connector_metadata', 'built_in_action', 'mcp_lite_tool'] as const) {
      expect(() =>
        createJarvisIntegrationCapability(
          input('Connected', {
            kind,
            evidence: {
              kind: 'connection_observation',
              ref: `connection:${kind}`,
              observedAt: 100,
            },
          }),
        ),
      ).toThrowError(JarvisIntegrationCapabilityError);
    }
  });

  it('requires exact tool and operation identity for executable lifecycle states', () => {
    expect(() =>
      createJarvisIntegrationCapability(input('Tool available', { toolId: undefined })),
    ).toThrowError(JarvisIntegrationCapabilityError);
    expect(() =>
      createJarvisIntegrationCapability(input('Operation running', { operation: undefined })),
    ).toThrowError(JarvisIntegrationCapabilityError);
    expect(() =>
      createJarvisIntegrationCapability(
        input('Operation completed', {
          operations: ['read'],
          operation: { id: 'operation-1', name: 'write' },
        }),
      ),
    ).toThrowError(JarvisIntegrationCapabilityError);
  });

  it('returns a detached deeply frozen canonical record with bounded operations', () => {
    const caller = input('Tool available', {
      id: '  drive  ',
      displayName: '  Google Drive  ',
      operations: [' write ', 'read', 'write'],
      evidence: {
        kind: 'tool_discovery',
        ref: '  discovery:drive  ',
        observedAt: 100,
      },
    });
    const capability = createJarvisIntegrationCapability(caller);

    expect(capability).toMatchObject({
      id: 'drive',
      displayName: 'Google Drive',
      operations: ['read', 'write'],
      evidence: { ref: 'discovery:drive' },
    });
    caller.operations.push('delete');
    caller.evidence.ref = 'mutated';
    expect(capability.operations).toEqual(['read', 'write']);
    expect(capability.evidence.ref).toBe('discovery:drive');
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(capability.operations)).toBe(true);
    expect(Object.isFrozen(capability.evidence)).toBe(true);

    expect(() =>
      createJarvisIntegrationCapability(
        input('Configuration available', {
          operations: Array.from({ length: 65 }, (_, index) => `operation-${index}`),
        }),
      ),
    ).toThrowError(JarvisIntegrationCapabilityError);
  });

  it('copies only declared safe fields and never retains credential-like caller data', () => {
    const capability = createJarvisIntegrationCapability({
      ...input('Credentials saved'),
      credential: 'credential-material-that-must-not-survive',
      accessToken: 'bearer-sensitive-value',
    } as JarvisIntegrationCapabilityInput);

    expect(capability).not.toHaveProperty('credential');
    expect(capability).not.toHaveProperty('accessToken');
    expect(JSON.stringify(capability)).not.toMatch(/credential-material|bearer-sensitive/i);
  });
});
