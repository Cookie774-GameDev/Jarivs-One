import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';

export const JARVIS_INTEGRATION_KINDS = Object.freeze([
  'built_in_action',
  'mcp_lite_tool',
  'external_mcp_server',
  'api_key_plugin',
  'oauth_plugin',
  'connector_metadata',
  'agent_tool',
  'custom_user_tool',
] as const);

export type JarvisIntegrationKind = (typeof JARVIS_INTEGRATION_KINDS)[number];

export const JARVIS_CONNECTOR_STATES = Object.freeze([
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
] as const);

export type JarvisConnectorState = (typeof JARVIS_CONNECTOR_STATES)[number];

export const JARVIS_INTEGRATION_EVIDENCE_KINDS = Object.freeze([
  'catalog_metadata',
  'configuration_metadata',
  'credential_status',
  'authorization_status',
  'connection_observation',
  'connection_verification',
  'tool_discovery',
  'operation_event',
] as const);

export type JarvisIntegrationEvidenceKind = (typeof JARVIS_INTEGRATION_EVIDENCE_KINDS)[number];

export interface JarvisIntegrationEvidenceInput {
  kind: JarvisIntegrationEvidenceKind;
  ref: string;
  observedAt: number;
}

export interface JarvisIntegrationOperationInput {
  id: string;
  name: string;
  resultRef?: string;
}

export interface JarvisIntegrationCapabilityInput {
  id: string;
  displayName: string;
  accountId: string;
  projectId?: string;
  kind: JarvisIntegrationKind;
  state: JarvisConnectorState;
  operations: string[];
  evidence: JarvisIntegrationEvidenceInput;
  toolId?: string;
  operation?: JarvisIntegrationOperationInput;
}

export interface JarvisIntegrationCapability {
  readonly id: string;
  readonly displayName: string;
  readonly accountId: string;
  readonly projectId?: string;
  readonly kind: JarvisIntegrationKind;
  readonly state: JarvisConnectorState;
  readonly operations: readonly string[];
  readonly evidence: Readonly<JarvisIntegrationEvidenceInput>;
  readonly toolId?: string;
  readonly operation?: Readonly<JarvisIntegrationOperationInput>;
}

export class JarvisIntegrationCapabilityError extends Error {
  readonly code = 'invalid_jarvis_integration_capability' as const;

  constructor(readonly reason: string) {
    super(`Invalid JARVIS integration capability: ${reason}.`);
    this.name = 'JarvisIntegrationCapabilityError';
  }
}

const MAX_ID_CHARS = 160;
const MAX_LABEL_CHARS = 240;
const MAX_EVIDENCE_REF_CHARS = 512;
const MAX_OPERATIONS = 64;
const MAX_OPERATION_CHARS = 160;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

const REQUIRED_EVIDENCE_BY_STATE: Readonly<
  Record<JarvisConnectorState, JarvisIntegrationEvidenceKind>
> = Object.freeze({
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
});

const NON_CONNECTABLE_STATES = new Set<JarvisConnectorState>([
  'Catalog only',
  'Configuration available',
  'Tool available',
  'Tool unavailable',
  'Operation running',
  'Operation completed',
  'Operation failed',
]);

const CONNECTOR_METADATA_STATES = new Set<JarvisConnectorState>([
  'Catalog only',
  'Configuration available',
]);

const NON_CONNECTABLE_KINDS = new Set<JarvisIntegrationKind>([
  'built_in_action',
  'mcp_lite_tool',
  'agent_tool',
  'custom_user_tool',
]);

function fail(reason: string): never {
  throw new JarvisIntegrationCapabilityError(reason);
}

function safeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== 'string') fail(`${field}_required`);
  const normalized = value.trim();
  if (!normalized) fail(`${field}_required`);
  if (normalized.length > maxChars) fail(`${field}_too_long`);
  if (CONTROL_CHARACTERS.test(normalized)) fail(`${field}_contains_control_characters`);
  return normalized;
}

function identifier(value: unknown, field: string): string {
  const normalized = safeText(value, field, MAX_ID_CHARS);
  if (/\s/u.test(normalized)) fail(`${field}_contains_whitespace`);
  return normalized;
}

function canonicalOperations(operations: unknown): string[] {
  if (!Array.isArray(operations)) fail('operations_required');
  if (operations.length > MAX_OPERATIONS) fail('too_many_operations');
  const canonical = operations.map((operation) =>
    safeText(operation, 'operation_name', MAX_OPERATION_CHARS),
  );
  return [...new Set(canonical)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function assertKnownKind(kind: unknown): asserts kind is JarvisIntegrationKind {
  if (!JARVIS_INTEGRATION_KINDS.includes(kind as JarvisIntegrationKind)) {
    fail('unknown_kind');
  }
}

function assertKnownState(state: unknown): asserts state is JarvisConnectorState {
  if (!JARVIS_CONNECTOR_STATES.includes(state as JarvisConnectorState)) {
    fail('unknown_state');
  }
}

function assertStateAllowedForKind(kind: JarvisIntegrationKind, state: JarvisConnectorState): void {
  if (kind === 'connector_metadata' && !CONNECTOR_METADATA_STATES.has(state)) {
    fail('connector_metadata_cannot_claim_runtime_state');
  }
  if (NON_CONNECTABLE_KINDS.has(kind) && !NON_CONNECTABLE_STATES.has(state)) {
    fail('non_connectable_kind_cannot_claim_connection_state');
  }
}

function copyEvidence(
  evidence: JarvisIntegrationEvidenceInput,
  state: JarvisConnectorState,
): JarvisIntegrationEvidenceInput {
  if (!evidence || typeof evidence !== 'object') fail('evidence_required');
  const requiredKind = REQUIRED_EVIDENCE_BY_STATE[state];
  if (evidence.kind !== requiredKind) fail('evidence_kind_mismatch');
  if (!Number.isFinite(evidence.observedAt) || evidence.observedAt < 0) {
    fail('evidence_observed_at_invalid');
  }
  return {
    kind: requiredKind,
    ref: safeText(evidence.ref, 'evidence_ref', MAX_EVIDENCE_REF_CHARS),
    observedAt: evidence.observedAt,
  };
}

function copyOperation(
  operation: JarvisIntegrationOperationInput | undefined,
  state: JarvisConnectorState,
  operations: readonly string[],
): JarvisIntegrationOperationInput | undefined {
  const operationState = state.startsWith('Operation ');
  if (!operationState) {
    if (operation !== undefined) fail('operation_not_allowed_for_state');
    return undefined;
  }
  if (!operation || typeof operation !== 'object') fail('operation_required');
  const name = safeText(operation.name, 'active_operation_name', MAX_OPERATION_CHARS);
  if (!operations.includes(name)) fail('active_operation_not_declared');
  return {
    id: identifier(operation.id, 'active_operation_id'),
    name,
    ...(operation.resultRef === undefined
      ? {}
      : {
          resultRef: safeText(
            operation.resultRef,
            'active_operation_result_ref',
            MAX_EVIDENCE_REF_CHARS,
          ),
        }),
  };
}

export function createJarvisIntegrationCapability(
  input: JarvisIntegrationCapabilityInput,
): Readonly<JarvisIntegrationCapability> {
  if (!input || typeof input !== 'object') fail('input_required');
  assertKnownKind(input.kind);
  assertKnownState(input.state);
  assertStateAllowedForKind(input.kind, input.state);

  const operations = canonicalOperations(input.operations);
  const toolState = input.state.startsWith('Tool ') || input.state.startsWith('Operation ');
  const toolId = toolState ? identifier(input.toolId, 'tool_id') : undefined;
  if (!toolState && input.toolId !== undefined) fail('tool_id_not_allowed_for_state');
  if (input.state === 'Tool available' && operations.length === 0) {
    fail('available_tool_requires_operation');
  }
  const operation = copyOperation(input.operation, input.state, operations);

  const capability: JarvisIntegrationCapability = {
    id: identifier(input.id, 'id'),
    displayName: safeText(input.displayName, 'display_name', MAX_LABEL_CHARS),
    accountId: identifier(input.accountId, 'account_id'),
    ...(input.projectId === undefined
      ? {}
      : { projectId: identifier(input.projectId, 'project_id') }),
    kind: input.kind,
    state: input.state,
    operations,
    evidence: copyEvidence(input.evidence, input.state),
    ...(toolId === undefined ? {} : { toolId }),
    ...(operation === undefined ? {} : { operation }),
  };

  return deepFreezeJarvisCopy(capability);
}
