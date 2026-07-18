import type { JarvisCapabilitySnapshot, JarvisModelSnapshot } from './capability';
import type { JarvisApproval, JarvisArtifact, JarvisEvent, JarvisRun } from './execution';
import type { CompiledJarvisPrompt } from './prompt';
import type { JarvisRequestEnvelope } from './request';
import type { JarvisResponseEnvelope } from './response';
import type { JarvisContextPack, JarvisSourceRef } from './source';

export type JarvisContractValidationErrorCode =
  | 'missing_field'
  | 'invalid_type'
  | 'unknown_field'
  | 'unknown_enum'
  | 'non_finite_number'
  | 'invalid_identifier'
  | 'non_json_safe';

export interface JarvisContractValidationError {
  code: JarvisContractValidationErrorCode;
  path: readonly (string | number)[];
  message: string;
}

export type JarvisContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly JarvisContractValidationError[] };

type ValidationPath = readonly (string | number)[];
type ValidationErrors = JarvisContractValidationError[];
type RecordValue = Record<string, unknown>;
type ValueValidator = (value: unknown, path: ValidationPath, errors: ValidationErrors) => void;

const REQUEST_SURFACES = [
  'typed_chat',
  'voice',
  'schedule',
  'hive_final',
  'phone',
  'browser_chat',
] as const;

const INTERACTION_MODES = ['ask', 'plan', 'agent'] as const;

const RESPONSE_MODES = [
  'acknowledgement',
  'direct_answer',
  'status',
  'warning',
  'approval_required',
  'action_running',
  'action_success',
  'action_partial',
  'action_failure',
  'clarification',
  'recommendation',
  'long_form_delivery',
  'sensitive',
] as const;

const PROMPT_AUTHORITIES = [
  'immutable_security',
  'immutable_identity',
  'capability_policy',
  'user_approved_preference',
  'turn_policy',
  'untrusted_context',
  'output_contract',
] as const;

const SOURCE_KINDS = [
  'user_message',
  'chat',
  'project',
  'project_file',
  'context_node',
  'memory',
  'terminal',
  'tool_result',
  'plugin',
  'mcp',
  'web',
  'schedule',
  'artifact',
  'agent_output',
] as const;

const SOURCE_TRUST_VALUES = ['user_direct', 'app_verified', 'external_untrusted'] as const;
const SOURCE_SENSITIVITIES = ['public', 'private', 'restricted', 'secret'] as const;
const CONTEXT_PURPOSES = [
  'answer',
  'execution',
  'preference',
  'history',
  'capability',
  'citation',
] as const;

const CAPABILITY_STATES = [
  'available',
  'connected',
  'authenticated',
  'degraded',
  'unavailable',
  'planned',
] as const;

const ENTITLEMENT_SOURCES = ['server', 'local_development', 'unavailable'] as const;
const CONNECTION_MODES = ['native-api', 'external-cli', 'local'] as const;
const VOICE_DELIVERY_VALUES = ['none', 'validated_stream', 'final_summary'] as const;
const EXECUTION_VERIFIERS = ['journal', 'executor', 'provider'] as const;

const RUN_STATUSES = [
  'queued',
  'compiling',
  'running',
  'awaiting_approval',
  'partial',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
] as const;

const EVENT_TYPES = [
  'run_state',
  'model',
  'context',
  'retrieval',
  'tool',
  'terminal',
  'approval',
  'artifact',
  'message',
  'warning',
  'error',
] as const;

const APPROVAL_RISKS = ['safe', 'confirm', 'dangerous'] as const;
const APPROVAL_STATUSES = ['pending', 'approved', 'denied', 'expired', 'consumed'] as const;
const ARTIFACT_KINDS = [
  'file',
  'link',
  'text',
  'image',
  'document',
  'code',
  'terminal_output',
  'provider_result',
] as const;

const PROFILE_MEMORY_SCOPES = ['none', 'profile', 'shared_selected'] as const;
const LLM_ROLES = ['system', 'user', 'assistant'] as const;
const LLM_CONTENT_PART_TYPES = ['text', 'image'] as const;

const ERROR_MESSAGES: Record<JarvisContractValidationErrorCode, string> = {
  missing_field: 'Required field is missing.',
  invalid_type: 'Value does not match the expected schema type.',
  unknown_field: 'Field is not part of the version 1 schema.',
  unknown_enum: 'Value is not a recognized enum member.',
  non_finite_number: 'A finite number is required.',
  invalid_identifier: 'A non-empty identifier is required.',
  non_json_safe: 'A JSON-safe value is required.',
};

function addError(
  errors: ValidationErrors,
  code: JarvisContractValidationErrorCode,
  path: ValidationPath,
): void {
  errors.push({
    code,
    path: [...path],
    message: ERROR_MESSAGES[code],
  });
}

function childPath(path: ValidationPath, segment: string | number): ValidationPath {
  return [...path, segment];
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

interface JsonSafetyPathNode {
  readonly parent: JsonSafetyPathNode | undefined;
  readonly segment: string | number;
  readonly depth: number;
}

type JsonSafetyFrame =
  | {
      readonly kind: 'visit';
      readonly value: unknown;
      readonly path: JsonSafetyPathNode | undefined;
    }
  | {
      readonly kind: 'leave';
      readonly value: object;
    };

function appendJsonSafetyPath(
  parent: JsonSafetyPathNode | undefined,
  segment: string | number,
): JsonSafetyPathNode {
  return {
    parent,
    segment,
    depth: (parent?.depth ?? 0) + 1,
  };
}

function materializeJsonSafetyPath(path: JsonSafetyPathNode | undefined): ValidationPath {
  if (!path) return [];
  const result = new Array<string | number>(path.depth);
  let current: JsonSafetyPathNode | undefined = path;
  for (let index = path.depth - 1; index >= 0 && current; index -= 1) {
    result[index] = current.segment;
    current = current.parent;
  }
  return result;
}

function addJsonSafetyError(
  errors: ValidationErrors,
  code: Extract<JarvisContractValidationErrorCode, 'non_finite_number' | 'non_json_safe'>,
  path: JsonSafetyPathNode | undefined,
): void {
  addError(errors, code, materializeJsonSafetyPath(path));
}

function validateJsonSafety(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
  active: WeakSet<object>,
): void {
  let rootPath: JsonSafetyPathNode | undefined;
  for (const segment of path) rootPath = appendJsonSafetyPath(rootPath, segment);

  const stack: JsonSafetyFrame[] = [{ kind: 'visit', value, path: rootPath }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === 'leave') {
      active.delete(frame.value);
      continue;
    }

    const current = frame.value;
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;

    if (typeof current === 'number') {
      if (!Number.isFinite(current)) addJsonSafetyError(errors, 'non_finite_number', frame.path);
      continue;
    }

    if (typeof current !== 'object') {
      addJsonSafetyError(errors, 'non_json_safe', frame.path);
      continue;
    }

    if (active.has(current)) {
      addJsonSafetyError(errors, 'non_json_safe', frame.path);
      continue;
    }

    let prototype: object | null;
    let ownKeys: readonly PropertyKey[];
    let isArray: boolean;
    try {
      prototype = Object.getPrototypeOf(current) as object | null;
      ownKeys = Reflect.ownKeys(current);
      isArray = Array.isArray(current);
    } catch {
      addJsonSafetyError(errors, 'non_json_safe', frame.path);
      continue;
    }

    let arrayLength = 0;
    if (isArray) {
      if (prototype !== Array.prototype) {
        addJsonSafetyError(errors, 'non_json_safe', frame.path);
        continue;
      }
      try {
        arrayLength = (current as unknown[]).length;
      } catch {
        addJsonSafetyError(errors, 'non_json_safe', frame.path);
        continue;
      }
    } else if (prototype !== Object.prototype && prototype !== null) {
      addJsonSafetyError(errors, 'non_json_safe', frame.path);
      continue;
    }

    active.add(current);
    stack.push({ kind: 'leave', value: current });
    const children: Extract<JsonSafetyFrame, { kind: 'visit' }>[] = [];

    if (isArray) {
      const indexedKeys = new Set<string>();
      for (const key of ownKeys) {
        if (typeof key !== 'string') {
          addJsonSafetyError(errors, 'non_json_safe', frame.path);
          continue;
        }
        if (key === 'length') continue;

        if (!isCanonicalArrayIndex(key, arrayLength)) {
          addJsonSafetyError(errors, 'non_json_safe', appendJsonSafetyPath(frame.path, key));
          continue;
        }

        indexedKeys.add(key);
        const indexPath = appendJsonSafetyPath(frame.path, Number(key));
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(current, key);
        } catch {
          addJsonSafetyError(errors, 'non_json_safe', indexPath);
          continue;
        }

        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          addJsonSafetyError(errors, 'non_json_safe', indexPath);
          continue;
        }

        children.push({ kind: 'visit', value: descriptor.value, path: indexPath });
      }

      for (let index = 0; index < arrayLength; index += 1) {
        if (!indexedKeys.has(String(index))) {
          addJsonSafetyError(errors, 'non_json_safe', appendJsonSafetyPath(frame.path, index));
          break;
        }
      }
    } else {
      for (const key of ownKeys) {
        if (typeof key !== 'string') {
          addJsonSafetyError(errors, 'non_json_safe', frame.path);
          continue;
        }

        const keyPath = appendJsonSafetyPath(frame.path, key);
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(current, key);
        } catch {
          addJsonSafetyError(errors, 'non_json_safe', keyPath);
          continue;
        }

        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          addJsonSafetyError(errors, 'non_json_safe', keyPath);
          continue;
        }

        children.push({ kind: 'visit', value: descriptor.value, path: keyPath });
      }
    }

    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]!);
  }
}

function isRecordValue(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

type OwnFieldInspection =
  | { kind: 'missing' }
  | { kind: 'accessor' }
  | { kind: 'data'; value: unknown };

function inspectOwnField(record: RecordValue, key: string): OwnFieldInspection {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return { kind: 'missing' };
  if (!('value' in descriptor)) return { kind: 'accessor' };
  return { kind: 'data', value: descriptor.value };
}

function validateUnknownKeys(
  record: RecordValue,
  allowedKeys: readonly string[],
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key === 'string' && !allowed.has(key)) {
      addError(errors, 'unknown_field', childPath(path, key));
    }
  }
}

function validateRecord(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): RecordValue | undefined {
  if (!isRecordValue(value)) {
    addError(errors, 'invalid_type', path);
    return undefined;
  }
  return value;
}

function validateClosedRecord(
  value: unknown,
  allowedKeys: readonly string[],
  path: ValidationPath,
  errors: ValidationErrors,
): RecordValue | undefined {
  const record = validateRecord(value, path, errors);
  if (!record) return undefined;
  validateUnknownKeys(record, allowedKeys, path, errors);
  return record;
}

function validateRequiredField(
  record: RecordValue,
  key: string,
  path: ValidationPath,
  errors: ValidationErrors,
  validator: ValueValidator,
): void {
  const valuePath = childPath(path, key);
  const field = inspectOwnField(record, key);
  if (field.kind === 'missing') {
    addError(errors, 'missing_field', valuePath);
    return;
  }
  if (field.kind === 'data') validator(field.value, valuePath, errors);
}

function validateOptionalField(
  record: RecordValue,
  key: string,
  path: ValidationPath,
  errors: ValidationErrors,
  validator: ValueValidator,
): void {
  const field = inspectOwnField(record, key);
  if (field.kind === 'data') validator(field.value, childPath(path, key), errors);
}

function requireField(
  record: RecordValue,
  key: string,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  if (!hasOwn(record, key)) addError(errors, 'missing_field', childPath(path, key));
}

function validateString(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  if (typeof value !== 'string') addError(errors, 'invalid_type', path);
}

function validateIdentifier(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  if (typeof value !== 'string') {
    addError(errors, 'invalid_type', path);
    return;
  }
  if (value.trim().length === 0) addError(errors, 'invalid_identifier', path);
}

function validateBoolean(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  if (typeof value !== 'boolean') addError(errors, 'invalid_type', path);
}

function validateFiniteNumber(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  if (typeof value !== 'number') {
    addError(errors, 'invalid_type', path);
    return;
  }
  if (!Number.isFinite(value)) addError(errors, 'non_finite_number', path);
}

function validateSequence(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  if (typeof value !== 'number') {
    addError(errors, 'invalid_type', path);
    return;
  }
  if (!Number.isFinite(value)) {
    addError(errors, 'non_finite_number', path);
    return;
  }
  if (!Number.isInteger(value) || value < 0) addError(errors, 'invalid_type', path);
}

function validateLiteral(
  value: unknown,
  literal: 1 | true,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  if (value !== literal) addError(errors, 'invalid_type', path);
}

function validateEnum(
  value: unknown,
  members: readonly string[],
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  if (typeof value !== 'string') {
    addError(errors, 'invalid_type', path);
    return;
  }
  if (!members.includes(value)) addError(errors, 'unknown_enum', path);
}

function validateArray(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
  elementValidator: ValueValidator,
): void {
  if (!Array.isArray(value)) {
    addError(errors, 'invalid_type', path);
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    elementValidator(value[index], childPath(path, index), errors);
  }
}

function validateStringArray(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  validateArray(value, path, errors, validateString);
}

function validateIdentifierArray(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  validateArray(value, path, errors, validateIdentifier);
}

function validateSourceRefShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'id',
      'kind',
      'label',
      'uri',
      'accountId',
      'projectId',
      'trust',
      'sensitivity',
      'observedAt',
      'contentHash',
    ],
    path,
    errors,
  );
  if (!record) return;

  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'kind', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, SOURCE_KINDS, entryPath, entryErrors),
  );
  validateRequiredField(record, 'label', path, errors, validateString);
  validateOptionalField(record, 'uri', path, errors, validateString);
  validateRequiredField(record, 'accountId', path, errors, validateIdentifier);
  validateOptionalField(record, 'projectId', path, errors, validateIdentifier);
  validateRequiredField(record, 'trust', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, SOURCE_TRUST_VALUES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'sensitivity', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, SOURCE_SENSITIVITIES, entryPath, entryErrors),
  );
  validateOptionalField(record, 'observedAt', path, errors, validateFiniteNumber);
  validateOptionalField(record, 'contentHash', path, errors, validateIdentifier);
}

function validateSourceRefArray(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  validateArray(value, path, errors, validateSourceRefShape);
}

function validateContextItemShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['source', 'purpose', 'excerpt', 'score', 'truncated'],
    path,
    errors,
  );
  if (!record) return;

  validateRequiredField(record, 'source', path, errors, validateSourceRefShape);
  validateRequiredField(record, 'purpose', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, CONTEXT_PURPOSES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'excerpt', path, errors, validateString);
  validateOptionalField(record, 'score', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'truncated', path, errors, validateBoolean);
}

function validateContextBudgetShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(value, ['maxChars', 'usedChars'], path, errors);
  if (!record) return;
  validateRequiredField(record, 'maxChars', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'usedChars', path, errors, validateFiniteNumber);
}

function validateContextExclusionShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(value, ['source', 'reason'], path, errors);
  if (!record) return;
  validateRequiredField(record, 'source', path, errors, validateSourceRefShape);
  validateRequiredField(record, 'reason', path, errors, validateString);
}

function validateContextPackShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(value, ['items', 'budget', 'exclusions'], path, errors);
  if (!record) return;
  validateRequiredField(record, 'items', path, errors, (entry, entryPath, entryErrors) =>
    validateArray(entry, entryPath, entryErrors, validateContextItemShape),
  );
  validateRequiredField(record, 'budget', path, errors, validateContextBudgetShape);
  validateRequiredField(record, 'exclusions', path, errors, (entry, entryPath, entryErrors) =>
    validateArray(entry, entryPath, entryErrors, validateContextExclusionShape),
  );
}

function validateCapabilityRefShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['id', 'state', 'operations', 'evidenceRef', 'lastVerifiedAt'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'state', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, CAPABILITY_STATES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'operations', path, errors, validateIdentifierArray);
  validateOptionalField(record, 'evidenceRef', path, errors, validateIdentifier);
  validateOptionalField(record, 'lastVerifiedAt', path, errors, validateFiniteNumber);
}

function validateEntitlementShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['source', 'planId', 'capabilities', 'verifiedAt', 'expiresAt'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'source', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, ENTITLEMENT_SOURCES, entryPath, entryErrors),
  );
  validateOptionalField(record, 'planId', path, errors, validateIdentifier);
  validateRequiredField(record, 'capabilities', path, errors, validateIdentifierArray);
  validateOptionalField(record, 'verifiedAt', path, errors, validateFiniteNumber);
  validateOptionalField(record, 'expiresAt', path, errors, validateFiniteNumber);
}

function validateCapabilitySnapshotShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['capturedAt', 'tools', 'plugins', 'mcps', 'terminals', 'agents', 'entitlements'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'capturedAt', path, errors, validateFiniteNumber);
  for (const key of ['tools', 'plugins', 'mcps', 'terminals', 'agents']) {
    validateRequiredField(record, key, path, errors, (entry, entryPath, entryErrors) =>
      validateArray(entry, entryPath, entryErrors, validateCapabilityRefShape),
    );
  }
  validateRequiredField(record, 'entitlements', path, errors, validateEntitlementShape);
}

function validateModelCapabilities(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateRecord(value, path, errors);
  if (!record) return;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string') continue;
    const field = inspectOwnField(record, key);
    if (field.kind !== 'data') continue;
    validateIdentifier(key, childPath(path, key), errors);
    validateBoolean(field.value, childPath(path, key), errors);
  }
}

function validateModelSnapshotShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'connectionId',
      'providerId',
      'modelId',
      'connectionMode',
      'capabilities',
      'effectiveTemperature',
      'capturedAt',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateOptionalField(record, 'connectionId', path, errors, validateIdentifier);
  validateRequiredField(record, 'providerId', path, errors, validateIdentifier);
  validateRequiredField(record, 'modelId', path, errors, validateIdentifier);
  validateRequiredField(record, 'connectionMode', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, CONNECTION_MODES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'capabilities', path, errors, validateModelCapabilities);
  validateOptionalField(record, 'effectiveTemperature', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'capturedAt', path, errors, validateFiniteNumber);
}

function validateIdentityShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['identityVersion', 'coreHash', 'responseContractHash'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'identityVersion', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'coreHash', path, errors, validateIdentifier);
  validateRequiredField(record, 'responseContractHash', path, errors, validateIdentifier);
}

function validateProfileShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['profileId', 'revisionId', 'soulRevisionId', 'customInstructions', 'memoryScope'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'profileId', path, errors, validateIdentifier);
  validateRequiredField(record, 'revisionId', path, errors, validateIdentifier);
  validateOptionalField(record, 'soulRevisionId', path, errors, validateIdentifier);
  validateRequiredField(record, 'customInstructions', path, errors, validateString);
  validateRequiredField(record, 'memoryScope', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, PROFILE_MEMORY_SCOPES, entryPath, entryErrors),
  );
}

function validateLlmContentPart(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateRecord(value, path, errors);
  if (!record) return;

  const typePath = childPath(path, 'type');
  const typeField = inspectOwnField(record, 'type');
  if (typeField.kind === 'missing') {
    addError(errors, 'missing_field', typePath);
    validateUnknownKeys(record, ['type', 'text', 'data', 'mimeType', 'name'], path, errors);
    return;
  }
  if (typeField.kind === 'accessor') {
    validateUnknownKeys(record, ['type', 'text', 'data', 'mimeType', 'name'], path, errors);
    return;
  }

  validateEnum(typeField.value, LLM_CONTENT_PART_TYPES, typePath, errors);
  if (typeField.value === 'text') {
    validateUnknownKeys(record, ['type', 'text'], path, errors);
    validateRequiredField(record, 'text', path, errors, validateString);
    return;
  }

  if (typeField.value === 'image') {
    validateUnknownKeys(record, ['type', 'data', 'mimeType', 'name'], path, errors);
    validateRequiredField(record, 'data', path, errors, validateString);
    validateRequiredField(record, 'mimeType', path, errors, validateString);
    validateOptionalField(record, 'name', path, errors, validateString);
    return;
  }

  validateUnknownKeys(record, ['type', 'text', 'data', 'mimeType', 'name'], path, errors);
}

function validateLlmContent(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  if (typeof value === 'string') return;
  if (!Array.isArray(value)) {
    addError(errors, 'invalid_type', path);
    return;
  }
  validateArray(value, path, errors, validateLlmContentPart);
}

function validateLlmMessage(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  const record = validateClosedRecord(value, ['role', 'content'], path, errors);
  if (!record) return;
  validateRequiredField(record, 'role', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, LLM_ROLES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'content', path, errors, validateLlmContent);
}

function validateOutputContractShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'preserveStructuredBlocks',
      'allowActionBlocks',
      'allowPlanBlocks',
      'allowQuestionBlocks',
      'allowPermissionBlocks',
      'voiceDelivery',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(
    record,
    'preserveStructuredBlocks',
    path,
    errors,
    (entry, entryPath, entryErrors) => validateLiteral(entry, true, entryPath, entryErrors),
  );
  validateRequiredField(record, 'allowActionBlocks', path, errors, validateBoolean);
  validateRequiredField(record, 'allowPlanBlocks', path, errors, validateBoolean);
  validateRequiredField(record, 'allowQuestionBlocks', path, errors, validateBoolean);
  validateRequiredField(record, 'allowPermissionBlocks', path, errors, validateBoolean);
  validateRequiredField(record, 'voiceDelivery', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, VOICE_DELIVERY_VALUES, entryPath, entryErrors),
  );
}

function validateRequestAgentShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(value, ['id', 'slug', 'builtin'], path, errors);
  if (!record) return;
  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'slug', path, errors, validateIdentifier);
  validateRequiredField(record, 'builtin', path, errors, validateBoolean);
}

function validateRequestEnvelopeShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'schemaVersion',
      'requestId',
      'runId',
      'accountId',
      'workspaceId',
      'projectId',
      'chatId',
      'parentRunId',
      'agent',
      'surface',
      'interactionMode',
      'responseModeHint',
      'userText',
      'messageHistory',
      'identity',
      'profile',
      'capabilities',
      'model',
      'context',
      'outputContract',
      'createdAt',
    ],
    path,
    errors,
  );
  if (!record) return;

  validateRequiredField(record, 'schemaVersion', path, errors, (entry, entryPath, entryErrors) =>
    validateLiteral(entry, 1, entryPath, entryErrors),
  );
  validateRequiredField(record, 'requestId', path, errors, validateIdentifier);
  validateRequiredField(record, 'runId', path, errors, validateIdentifier);
  validateRequiredField(record, 'accountId', path, errors, validateIdentifier);
  for (const key of ['workspaceId', 'projectId', 'chatId', 'parentRunId']) {
    validateOptionalField(record, key, path, errors, validateIdentifier);
  }
  validateRequiredField(record, 'agent', path, errors, validateRequestAgentShape);
  validateRequiredField(record, 'surface', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, REQUEST_SURFACES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'interactionMode', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, INTERACTION_MODES, entryPath, entryErrors),
  );
  validateOptionalField(record, 'responseModeHint', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, RESPONSE_MODES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'userText', path, errors, validateString);
  validateRequiredField(record, 'messageHistory', path, errors, (entry, entryPath, entryErrors) =>
    validateArray(entry, entryPath, entryErrors, validateLlmMessage),
  );
  validateRequiredField(record, 'identity', path, errors, validateIdentityShape);
  validateRequiredField(record, 'profile', path, errors, validateProfileShape);
  validateRequiredField(record, 'capabilities', path, errors, validateCapabilitySnapshotShape);
  validateRequiredField(record, 'model', path, errors, validateModelSnapshotShape);
  validateRequiredField(record, 'context', path, errors, validateContextPackShape);
  validateRequiredField(record, 'outputContract', path, errors, validateOutputContractShape);
  validateRequiredField(record, 'createdAt', path, errors, validateFiniteNumber);
}

function validateCompiledPromptLayerShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['id', 'authority', 'sourceRefs', 'content', 'contentHash', 'charCount', 'truncated'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'authority', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, PROMPT_AUTHORITIES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'sourceRefs', path, errors, validateSourceRefArray);
  validateRequiredField(record, 'content', path, errors, validateString);
  validateRequiredField(record, 'contentHash', path, errors, validateIdentifier);
  validateRequiredField(record, 'charCount', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'truncated', path, errors, validateBoolean);
}

function validatePromptDiagnosticsShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['totalChars', 'omittedSourceRefs', 'warnings'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'totalChars', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'omittedSourceRefs', path, errors, validateSourceRefArray);
  validateRequiredField(record, 'warnings', path, errors, validateStringArray);
}

function validateCompiledPromptShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'schemaVersion',
      'layers',
      'systemText',
      'providerPrompt',
      'promptHash',
      'identityVersion',
      'profileRevisionId',
      'diagnostics',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'schemaVersion', path, errors, (entry, entryPath, entryErrors) =>
    validateLiteral(entry, 1, entryPath, entryErrors),
  );
  validateRequiredField(record, 'layers', path, errors, (entry, entryPath, entryErrors) =>
    validateArray(entry, entryPath, entryErrors, validateCompiledPromptLayerShape),
  );
  validateRequiredField(record, 'systemText', path, errors, validateString);
  validateOptionalField(record, 'providerPrompt', path, errors, validateString);
  validateRequiredField(record, 'promptHash', path, errors, validateIdentifier);
  validateRequiredField(record, 'identityVersion', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'profileRevisionId', path, errors, validateIdentifier);
  validateRequiredField(record, 'diagnostics', path, errors, validatePromptDiagnosticsShape);
}

function validateExecutionStateShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['status', 'verifiedBy', 'lastEventSeq'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'status', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, RUN_STATUSES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'verifiedBy', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, EXECUTION_VERIFIERS, entryPath, entryErrors),
  );
  validateRequiredField(record, 'lastEventSeq', path, errors, validateSequence);
}

function validateResponsePart(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateRecord(value, path, errors);
  if (!record) return;
  validateRequiredField(record, 'kind', path, errors, validateString);
}

function validateEnforcementShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['linted', 'violations', 'repairAttempted', 'repairSucceeded', 'fallbackUsed'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'linted', path, errors, validateBoolean);
  validateRequiredField(record, 'violations', path, errors, validateStringArray);
  validateRequiredField(record, 'repairAttempted', path, errors, validateBoolean);
  validateRequiredField(record, 'repairSucceeded', path, errors, validateBoolean);
  validateRequiredField(record, 'fallbackUsed', path, errors, validateBoolean);
}

function validateResponseEnvelopeShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'schemaVersion',
      'requestId',
      'runId',
      'mode',
      'displayText',
      'spokenText',
      'parts',
      'artifactIds',
      'sourceRefs',
      'executionState',
      'provider',
      'enforcement',
      'completedAt',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'schemaVersion', path, errors, (entry, entryPath, entryErrors) =>
    validateLiteral(entry, 1, entryPath, entryErrors),
  );
  validateRequiredField(record, 'requestId', path, errors, validateIdentifier);
  validateRequiredField(record, 'runId', path, errors, validateIdentifier);
  validateRequiredField(record, 'mode', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, RESPONSE_MODES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'displayText', path, errors, validateString);
  validateOptionalField(record, 'spokenText', path, errors, validateString);
  validateRequiredField(record, 'parts', path, errors, (entry, entryPath, entryErrors) =>
    validateArray(entry, entryPath, entryErrors, validateResponsePart),
  );
  validateRequiredField(record, 'artifactIds', path, errors, validateIdentifierArray);
  validateRequiredField(record, 'sourceRefs', path, errors, validateSourceRefArray);
  validateOptionalField(record, 'executionState', path, errors, validateExecutionStateShape);
  validateRequiredField(record, 'provider', path, errors, validateModelSnapshotShape);
  validateRequiredField(record, 'enforcement', path, errors, validateEnforcementShape);
  validateRequiredField(record, 'completedAt', path, errors, validateFiniteNumber);
}

function validateRunShape(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  const record = validateClosedRecord(
    value,
    [
      'id',
      'accountId',
      'workspaceId',
      'projectId',
      'chatId',
      'parentRunId',
      'source',
      'status',
      'agentId',
      'identityVersion',
      'profileRevisionId',
      'model',
      'createdAt',
      'updatedAt',
      'completedAt',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'accountId', path, errors, validateIdentifier);
  for (const key of ['workspaceId', 'projectId', 'chatId', 'parentRunId']) {
    validateOptionalField(record, key, path, errors, validateIdentifier);
  }
  validateRequiredField(record, 'source', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, REQUEST_SURFACES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'status', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, RUN_STATUSES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'agentId', path, errors, validateIdentifier);
  validateRequiredField(record, 'identityVersion', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'profileRevisionId', path, errors, validateIdentifier);
  validateRequiredField(record, 'model', path, errors, validateModelSnapshotShape);
  validateRequiredField(record, 'createdAt', path, errors, validateFiniteNumber);
  validateRequiredField(record, 'updatedAt', path, errors, validateFiniteNumber);
  validateOptionalField(record, 'completedAt', path, errors, validateFiniteNumber);
}

function validateEventShape(value: unknown, path: ValidationPath, errors: ValidationErrors): void {
  const record = validateClosedRecord(
    value,
    [
      'runId',
      'seq',
      'idempotencyKey',
      'type',
      'status',
      'title',
      'safeSummary',
      'sourceRefs',
      'artifactIds',
      'createdAt',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'runId', path, errors, validateIdentifier);
  validateRequiredField(record, 'seq', path, errors, validateSequence);
  validateRequiredField(record, 'idempotencyKey', path, errors, validateIdentifier);
  validateRequiredField(record, 'type', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, EVENT_TYPES, entryPath, entryErrors),
  );
  validateOptionalField(record, 'status', path, errors, validateString);
  validateRequiredField(record, 'title', path, errors, validateString);
  validateOptionalField(record, 'safeSummary', path, errors, validateString);
  validateRequiredField(record, 'sourceRefs', path, errors, validateSourceRefArray);
  validateRequiredField(record, 'artifactIds', path, errors, validateIdentifierArray);
  validateRequiredField(record, 'createdAt', path, errors, validateFiniteNumber);
}

function validateSecretHandleShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(value, ['field', 'handleId'], path, errors);
  if (!record) return;
  validateRequiredField(record, 'field', path, errors, validateIdentifier);
  validateRequiredField(record, 'handleId', path, errors, validateIdentifier);
}

function validateApprovalShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    [
      'id',
      'runId',
      'actionId',
      'actionVersion',
      'params',
      'secretHandleRefs',
      'paramsHash',
      'targetSnapshot',
      'risk',
      'status',
      'createdAt',
      'decidedAt',
      'consumedAt',
    ],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'runId', path, errors, validateIdentifier);
  validateRequiredField(record, 'actionId', path, errors, validateIdentifier);
  validateRequiredField(record, 'actionVersion', path, errors, validateFiniteNumber);
  requireField(record, 'params', path, errors);
  validateOptionalField(record, 'secretHandleRefs', path, errors, (entry, entryPath, entryErrors) =>
    validateArray(entry, entryPath, entryErrors, validateSecretHandleShape),
  );
  validateRequiredField(record, 'paramsHash', path, errors, validateIdentifier);
  validateRequiredField(record, 'risk', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, APPROVAL_RISKS, entryPath, entryErrors),
  );
  validateRequiredField(record, 'status', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, APPROVAL_STATUSES, entryPath, entryErrors),
  );
  validateRequiredField(record, 'createdAt', path, errors, validateFiniteNumber);
  validateOptionalField(record, 'decidedAt', path, errors, validateFiniteNumber);
  validateOptionalField(record, 'consumedAt', path, errors, validateFiniteNumber);
}

function validateArtifactShape(
  value: unknown,
  path: ValidationPath,
  errors: ValidationErrors,
): void {
  const record = validateClosedRecord(
    value,
    ['id', 'runId', 'kind', 'title', 'uri', 'mimeType', 'safeSummary', 'sourceRefs', 'createdAt'],
    path,
    errors,
  );
  if (!record) return;
  validateRequiredField(record, 'id', path, errors, validateIdentifier);
  validateRequiredField(record, 'runId', path, errors, validateIdentifier);
  validateRequiredField(record, 'kind', path, errors, (entry, entryPath, entryErrors) =>
    validateEnum(entry, ARTIFACT_KINDS, entryPath, entryErrors),
  );
  validateRequiredField(record, 'title', path, errors, validateString);
  validateOptionalField(record, 'uri', path, errors, validateString);
  validateOptionalField(record, 'mimeType', path, errors, validateString);
  validateOptionalField(record, 'safeSummary', path, errors, validateString);
  validateRequiredField(record, 'sourceRefs', path, errors, validateSourceRefArray);
  validateRequiredField(record, 'createdAt', path, errors, validateFiniteNumber);
}

function validateContract<T>(
  input: unknown,
  shapeValidator: ValueValidator,
): JarvisContractValidationResult<T> {
  const errors: ValidationErrors = [];
  try {
    shapeValidator(input, [], errors);
  } catch {
    addError(errors, 'non_json_safe', []);
  }

  try {
    validateJsonSafety(input, [], errors, new WeakSet<object>());
  } catch {
    addError(errors, 'non_json_safe', []);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as T };
}

export function validateJarvisRequestEnvelope(
  input: unknown,
): JarvisContractValidationResult<JarvisRequestEnvelope> {
  return validateContract(input, validateRequestEnvelopeShape);
}

export function validateCompiledJarvisPrompt(
  input: unknown,
): JarvisContractValidationResult<CompiledJarvisPrompt> {
  return validateContract(input, validateCompiledPromptShape);
}

export function validateJarvisSourceRef(
  input: unknown,
): JarvisContractValidationResult<JarvisSourceRef> {
  return validateContract(input, validateSourceRefShape);
}

export function validateJarvisContextPack(
  input: unknown,
): JarvisContractValidationResult<JarvisContextPack> {
  return validateContract(input, validateContextPackShape);
}

export function validateJarvisCapabilitySnapshot(
  input: unknown,
): JarvisContractValidationResult<JarvisCapabilitySnapshot> {
  return validateContract(input, validateCapabilitySnapshotShape);
}

export function validateJarvisModelSnapshot(
  input: unknown,
): JarvisContractValidationResult<JarvisModelSnapshot> {
  return validateContract(input, validateModelSnapshotShape);
}

export function validateJarvisResponseEnvelope(
  input: unknown,
): JarvisContractValidationResult<JarvisResponseEnvelope> {
  return validateContract(input, validateResponseEnvelopeShape);
}

export function validateJarvisRun(input: unknown): JarvisContractValidationResult<JarvisRun> {
  return validateContract(input, validateRunShape);
}

export function validateJarvisEvent(input: unknown): JarvisContractValidationResult<JarvisEvent> {
  return validateContract(input, validateEventShape);
}

export function validateJarvisApproval(
  input: unknown,
): JarvisContractValidationResult<JarvisApproval> {
  return validateContract(input, validateApprovalShape);
}

export function validateJarvisArtifact(
  input: unknown,
): JarvisContractValidationResult<JarvisArtifact> {
  return validateContract(input, validateArtifactShape);
}
