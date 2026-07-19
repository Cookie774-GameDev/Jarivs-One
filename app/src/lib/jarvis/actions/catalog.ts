import type { ActionDef, ActionParam, ActionRunContext, ActionResult } from '@/lib/actions/types';
import type { ExistingPluginCredentialLocator } from '@/features/plugins/credentialAuthorization';

export type JarvisActionRisk =
  | 'read-only'
  | 'safe-write'
  | 'external-side-effect'
  | 'destructive'
  | 'credential-sensitive';

export type JarvisActionApproval = 'never' | 'first-time' | 'always' | 'depends-on-input';

export type JarvisPlatform = 'windows' | 'macos' | 'linux';

export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema & { enum?: string[]; default?: unknown }>;
  required?: string[];
  additionalProperties?: boolean;
}

export type JarvisCanonicalActionTarget =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'app_resource'; namespace: string; resourceId: string }>
  | Readonly<{ kind: 'external_resource'; service: string; resourceId: string }>
  | Readonly<{
      kind: 'plugin_tool';
      accountId: string;
      pluginId: string;
      toolName: string;
      resourceId: string;
    }>;

export type JarvisActionCredentialBinding = Readonly<{
  field: string;
  locator: ExistingPluginCredentialLocator;
}>;

export type JarvisRegisteredActionExecutor =
  | Readonly<{ kind: 'builtin'; registryActionId: string }>
  | Readonly<{ kind: 'plugin_tool'; pluginId: string; toolName: string }>;

export interface JarvisRegisteredActionDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<JsonSchema>;
  readonly outputSchema: Readonly<JsonSchema>;
  readonly requiredCapabilities: readonly [string];
  readonly requiredEntitlements: readonly string[];
  readonly risk: JarvisActionRisk;
  readonly approval: JarvisActionApproval;
  readonly expectedEffect: string;
  readonly exposeToAI: boolean;
  readonly executor: JarvisRegisteredActionExecutor;
  readonly credentialBindings: readonly JarvisActionCredentialBinding[];
  validateParameters(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  deriveTarget(input: {
    accountId: string;
    params: Readonly<Record<string, unknown>>;
  }): JarvisCanonicalActionTarget;
}

export interface JarvisActionCatalog {
  resolve(actionId: string): Readonly<JarvisRegisteredActionDefinition> | undefined;
  listExposed(): readonly Readonly<JarvisRegisteredActionDefinition>[];
}

export interface JarvisActionDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  category: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredCapabilities: string[];
  requiredPermissions: string[];
  supportedPlatforms: JarvisPlatform[];
  risk: JarvisActionRisk;
  approval: JarvisActionApproval;
  supportsProgress: boolean;
  supportsCancellation: boolean;
  supportsRollback: boolean;
  preconditions: string[];
  possibleNextActions: string[];
  exposeToAI: boolean;
  handler: (params: Record<string, unknown>, context: ActionRunContext) => Promise<ActionResult>;
}

const ALL_PLATFORMS: JarvisPlatform[] = ['windows', 'macos', 'linux'];
const SECRET_FIELD_RE =
  /^(?:api[-_ ]?key|password|access[-_ ]?token|refresh[-_ ]?token|token|secret|credentials?|private[-_ ]?key|signing[-_ ]?key)$/i;
const GENERIC_PLUGIN_ACTION_IDS = new Set(['plugin.call', 'plugin.invoke']);
const canonicalPluginExecutors = new WeakSet<object>();

function catalogError(message: string): never {
  throw new TypeError(`Invalid JARVIS action registration: ${message}`);
}

function nonblank(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) catalogError(`${label} must be nonblank`);
  return value;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return catalogError(`${label} must be a plain record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return catalogError(`${label} must be a plain record`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: object, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedSet.has(key))
      catalogError(`${label} has unknown fields`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor))
      catalogError(`${label} has mutable/unknown fields`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function cloneSchema(value: Readonly<JsonSchema>, label: string): JsonSchema {
  const record = plainRecord(value, label);
  assertExactKeys(
    record,
    ['type', 'description', 'properties', 'required', 'additionalProperties'],
    label,
  );
  if (!['object', 'string', 'number', 'boolean', 'array'].includes(String(record.type))) {
    catalogError(`${label}.type is invalid`);
  }
  const clone: JsonSchema = { type: record.type as JsonSchema['type'] };
  if (record.description !== undefined)
    clone.description = nonblank(record.description, `${label}.description`);
  if (record.additionalProperties !== undefined) {
    if (typeof record.additionalProperties !== 'boolean')
      catalogError(`${label}.additionalProperties is invalid`);
    clone.additionalProperties = record.additionalProperties;
  }
  if (record.required !== undefined) {
    if (
      !Array.isArray(record.required) ||
      record.required.some((item) => typeof item !== 'string')
    ) {
      catalogError(`${label}.required is invalid`);
    }
    clone.required = [...record.required] as string[];
  }
  if (record.properties !== undefined) {
    const properties = plainRecord(record.properties, `${label}.properties`);
    clone.properties = {};
    for (const [key, property] of Object.entries(properties)) {
      const propertyRecord = plainRecord(property, `${label}.properties.${key}`);
      assertExactKeys(
        propertyRecord,
        [
          'type',
          'description',
          'properties',
          'required',
          'additionalProperties',
          'enum',
          'default',
        ],
        `${label}.properties.${key}`,
      );
      const { enum: enumValue, default: defaultValue, ...schemaValue } = propertyRecord;
      const cloned = cloneSchema(
        schemaValue as unknown as JsonSchema,
        `${label}.properties.${key}`,
      ) as JsonSchema & { enum?: string[]; default?: unknown };
      if (enumValue !== undefined) {
        if (!Array.isArray(enumValue) || enumValue.some((item) => typeof item !== 'string')) {
          catalogError(`${label}.properties.${key}.enum is invalid`);
        }
        cloned.enum = [...enumValue] as string[];
      }
      if (defaultValue !== undefined) cloned.default = structuredClone(defaultValue);
      clone.properties[key] = cloned;
    }
  }
  return clone;
}

function schemaHasForbiddenField(
  schema: Readonly<JsonSchema>,
  forbidden: ReadonlySet<string>,
): string | undefined {
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    if (SECRET_FIELD_RE.test(key) || forbidden.has(key)) return key;
    const nested = schemaHasForbiddenField(child, forbidden);
    if (nested) return nested;
  }
  return undefined;
}

function cloneExecutor(value: JarvisRegisteredActionExecutor): JarvisRegisteredActionExecutor {
  const record = plainRecord(value, 'executor');
  if (record.kind === 'builtin') {
    assertExactKeys(record, ['kind', 'registryActionId'], 'executor');
    return {
      kind: 'builtin',
      registryActionId: nonblank(record.registryActionId, 'registryActionId'),
    };
  }
  if (record.kind === 'plugin_tool') {
    assertExactKeys(record, ['kind', 'pluginId', 'toolName'], 'executor');
    return {
      kind: 'plugin_tool',
      pluginId: nonblank(record.pluginId, 'pluginId'),
      toolName: nonblank(record.toolName, 'toolName'),
    };
  }
  return catalogError('executor kind is invalid');
}

function validateTarget(
  value: JarvisCanonicalActionTarget,
  executor: JarvisRegisteredActionExecutor,
  expectedAccountId: string,
): JarvisCanonicalActionTarget {
  const record = plainRecord(value, 'target');
  if (record.kind === 'none') assertExactKeys(record, ['kind'], 'target');
  else if (record.kind === 'app_resource') {
    assertExactKeys(record, ['kind', 'namespace', 'resourceId'], 'target');
    nonblank(record.namespace, 'target namespace');
    nonblank(record.resourceId, 'target resourceId');
  } else if (record.kind === 'external_resource') {
    assertExactKeys(record, ['kind', 'service', 'resourceId'], 'target');
    nonblank(record.service, 'target service');
    nonblank(record.resourceId, 'target resourceId');
  } else if (record.kind === 'plugin_tool') {
    assertExactKeys(record, ['kind', 'accountId', 'pluginId', 'toolName', 'resourceId'], 'target');
    nonblank(record.accountId, 'target accountId');
    nonblank(record.pluginId, 'target pluginId');
    nonblank(record.toolName, 'target toolName');
    nonblank(record.resourceId, 'target resourceId');
  } else catalogError('target kind is invalid');

  if (executor.kind === 'plugin_tool') {
    if (
      record.kind !== 'plugin_tool' ||
      record.accountId !== expectedAccountId ||
      record.pluginId !== executor.pluginId ||
      record.toolName !== executor.toolName
    ) {
      catalogError('target does not match plugin executor');
    }
  } else if (record.kind === 'plugin_tool') catalogError('target does not match builtin executor');
  return deepFreeze(structuredClone(value));
}

export function isRegisteredPluginToolExecutor(
  value: unknown,
): value is Extract<JarvisRegisteredActionExecutor, { kind: 'plugin_tool' }> {
  return typeof value === 'object' && value !== null && canonicalPluginExecutors.has(value);
}

export function createJarvisActionCatalog(
  registrations: readonly JarvisRegisteredActionDefinition[],
): JarvisActionCatalog {
  if (!Array.isArray(registrations)) catalogError('registrations must be an array');
  const byId = new Map<string, Readonly<JarvisRegisteredActionDefinition>>();
  for (const source of registrations) {
    const sourceRecord = plainRecord(source, 'registration');
    assertExactKeys(
      sourceRecord,
      [
        'id',
        'version',
        'title',
        'description',
        'inputSchema',
        'outputSchema',
        'requiredCapabilities',
        'requiredEntitlements',
        'risk',
        'approval',
        'expectedEffect',
        'exposeToAI',
        'executor',
        'credentialBindings',
        'validateParameters',
        'deriveTarget',
      ],
      'registration',
    );
    const id = nonblank(source.id, 'action id');
    if (!/^[a-z][a-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/.test(id)) catalogError('action id is invalid');
    if (GENERIC_PLUGIN_ACTION_IDS.has(id)) catalogError('generic plugin action ids are forbidden');
    if (byId.has(id)) catalogError(`duplicate action id ${id}`);
    if (!Number.isSafeInteger(source.version) || source.version < 1)
      catalogError('version is invalid');
    if (!Array.isArray(source.requiredCapabilities) || source.requiredCapabilities.length !== 1) {
      catalogError('exactly one primary capability is required');
    }
    const requiredCapability = nonblank(source.requiredCapabilities[0], 'capability');
    if (!Array.isArray(source.requiredEntitlements)) catalogError('entitlements must be an array');
    const requiredEntitlements = source.requiredEntitlements.map((entry: string) =>
      nonblank(entry, 'entitlement'),
    );
    if (new Set(requiredEntitlements).size !== requiredEntitlements.length)
      catalogError('duplicate entitlement');
    if (
      ![
        'read-only',
        'safe-write',
        'external-side-effect',
        'destructive',
        'credential-sensitive',
      ].includes(source.risk)
    ) {
      catalogError('risk is invalid');
    }
    if (!['never', 'first-time', 'always', 'depends-on-input'].includes(source.approval)) {
      catalogError('approval is invalid');
    }
    if (typeof source.exposeToAI !== 'boolean') catalogError('exposeToAI must be boolean');
    if (
      typeof source.validateParameters !== 'function' ||
      typeof source.deriveTarget !== 'function'
    ) {
      catalogError('parameter and target functions are required');
    }
    const inputSchema = cloneSchema(source.inputSchema, 'inputSchema');
    const outputSchema = cloneSchema(source.outputSchema, 'outputSchema');
    const executor = deepFreeze(cloneExecutor(source.executor));
    if (!Array.isArray(source.credentialBindings))
      catalogError('credentialBindings must be an array');
    const fields = new Set<string>();
    const locators = new Set<string>();
    const credentialBindings = source.credentialBindings.map(
      (binding: JarvisActionCredentialBinding) => {
        const record = plainRecord(binding, 'credential binding');
        assertExactKeys(record, ['field', 'locator'], 'credential binding');
        const field = nonblank(binding.field, 'credential field');
        const locatorRecord = plainRecord(binding.locator, 'credential locator');
        assertExactKeys(locatorRecord, ['pluginId', 'fieldId'], 'credential locator');
        const locator = {
          pluginId: nonblank(binding.locator.pluginId, 'credential locator pluginId'),
          fieldId: nonblank(binding.locator.fieldId, 'credential locator fieldId'),
        };
        const locatorKey = `${locator.pluginId}\u0000${locator.fieldId}`;
        if (fields.has(field) || locators.has(locatorKey))
          catalogError('duplicate credential binding');
        fields.add(field);
        locators.add(locatorKey);
        if (executor.kind !== 'plugin_tool' || locator.pluginId !== executor.pluginId) {
          catalogError('credential locator does not match plugin executor');
        }
        return deepFreeze({ field, locator: deepFreeze(locator) });
      },
    );
    const forbidden = new Set(['pluginId', 'toolName', ...fields]);
    const forbiddenField = schemaHasForbiddenField(inputSchema, forbidden);
    if (forbiddenField) catalogError(`model-visible field ${forbiddenField} is forbidden`);
    if (executor.kind === 'builtin' && credentialBindings.length) {
      catalogError('builtin executors cannot bind plugin credentials');
    }
    const validateParameters = (input: Readonly<Record<string, unknown>>) => {
      const validated = source.validateParameters(input);
      return deepFreeze(structuredClone(plainRecord(validated, 'validated parameters')));
    };
    const deriveTarget = (input: {
      accountId: string;
      params: Readonly<Record<string, unknown>>;
    }) => {
      const accountId = nonblank(input.accountId, 'accountId');
      return validateTarget(
        source.deriveTarget({ accountId, params: input.params }),
        executor,
        accountId,
      );
    };
    deriveTarget({ accountId: 'catalog-validation-account', params: {} });
    const canonical = deepFreeze({
      id,
      version: source.version,
      title: nonblank(source.title, 'title'),
      description: nonblank(source.description, 'description'),
      inputSchema: deepFreeze(inputSchema),
      outputSchema: deepFreeze(outputSchema),
      requiredCapabilities: deepFreeze([requiredCapability] as [string]),
      requiredEntitlements: deepFreeze(requiredEntitlements),
      risk: source.risk,
      approval: source.approval,
      expectedEffect: nonblank(source.expectedEffect, 'expectedEffect'),
      exposeToAI: source.exposeToAI,
      executor,
      credentialBindings: deepFreeze(credentialBindings),
      validateParameters,
      deriveTarget,
    } satisfies JarvisRegisteredActionDefinition);
    if (canonical.executor.kind === 'plugin_tool') canonicalPluginExecutors.add(canonical.executor);
    byId.set(id, canonical);
  }
  const exposed = deepFreeze([...byId.values()].filter((entry) => entry.exposeToAI));
  return Object.freeze({
    resolve: (actionId: string) => byId.get(actionId),
    listExposed: () => exposed,
  });
}

const NO_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
};

export const DEFAULT_JARVIS_ACTION_REGISTRATIONS = deepFreeze([
  {
    id: 'file.search',
    version: 1,
    title: 'Search files',
    description: 'Search the canonical app file index.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, maxResults: { type: 'number' } },
      required: ['query'],
      additionalProperties: false,
    },
    outputSchema: NO_OUTPUT_SCHEMA,
    requiredCapabilities: ['files.read'],
    requiredEntitlements: [],
    risk: 'read-only',
    approval: 'never',
    expectedEffect: 'Reads matching file metadata without modifying files.',
    exposeToAI: true,
    executor: { kind: 'builtin', registryActionId: 'file.search' },
    credentialBindings: [],
    validateParameters: (input: Readonly<Record<string, unknown>>) => ({ ...input }),
    deriveTarget: () => ({ kind: 'app_resource', namespace: 'files', resourceId: 'search-index' }),
  },
  {
    id: 'terminal.create',
    version: 1,
    title: 'Create terminal',
    description: 'Create one terminal through the registered host action.',
    inputSchema: { type: 'object', additionalProperties: false },
    outputSchema: NO_OUTPUT_SCHEMA,
    requiredCapabilities: ['terminal.execute'],
    requiredEntitlements: [],
    risk: 'external-side-effect',
    approval: 'always',
    expectedEffect: 'Creates one terminal process owned by the active account.',
    exposeToAI: true,
    executor: { kind: 'builtin', registryActionId: 'terminal.create' },
    credentialBindings: [],
    validateParameters: (input: Readonly<Record<string, unknown>>) => ({ ...input }),
    deriveTarget: () => ({ kind: 'external_resource', service: 'terminal', resourceId: 'new' }),
  },
  {
    id: 'task.cancel',
    version: 1,
    title: 'Cancel task',
    description: 'Request cancellation of the current registered task.',
    inputSchema: { type: 'object', additionalProperties: false },
    outputSchema: NO_OUTPUT_SCHEMA,
    requiredCapabilities: ['tasks.cancel'],
    requiredEntitlements: [],
    risk: 'destructive',
    approval: 'always',
    expectedEffect: 'Requests cancellation of the selected task.',
    exposeToAI: true,
    executor: { kind: 'builtin', registryActionId: 'task.cancel' },
    credentialBindings: [],
    validateParameters: (input: Readonly<Record<string, unknown>>) => ({ ...input }),
    deriveTarget: () => ({ kind: 'app_resource', namespace: 'tasks', resourceId: 'selected' }),
  },
] satisfies readonly JarvisRegisteredActionDefinition[]);

function schemaForParam(param: ActionParam): JsonSchema & { enum?: string[]; default?: unknown } {
  const type = param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : 'string';
  return {
    type,
    description: param.help || param.label,
    ...(param.options?.length ? { enum: param.options.map((option) => option.value) } : {}),
    ...(param.default !== undefined ? { default: param.default } : {}),
  };
}

function inputSchema(action: ActionDef): JsonSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      action.params.map((param) => [param.key, schemaForParam(param)]),
    ),
    required: action.params.filter((param) => param.required).map((param) => param.key),
    additionalProperties: false,
  };
}

function inferRisk(action: ActionDef): JarvisActionRisk {
  if (
    /^(?:terminal\.(?!bulkClose)|shell\.|plugin\.(?:call|invoke|connect)|mcp\.(?:start|invoke)|notification\.send)/.test(
      action.id,
    )
  ) {
    return 'external-side-effect';
  }
  if (action.destructive) return 'destructive';
  if (
    /^(?:files?\.read|terminal\.(?:inspect|collect_output|wait_for_output)|schedule\.(?:list|history)|agent\.(?:wait|list)|plugin\.status|mcp\.(?:status|list)|context\.|report\.)/.test(
      action.id,
    )
  ) {
    return 'read-only';
  }
  if (
    /^(?:nav\.|settings\.|theme\.|chat\.(?:fullscreen|open)|inspector\.|tools\.open|actions\.openPalette|host\.open(?:Assistant|CommandPalette|Launcher))/.test(
      action.id,
    )
  ) {
    return 'safe-write';
  }
  if (
    /^(?:files?\.(?:create|edit|write)|chat\.(?:create|rename|send)|agent\.(?:create|run)|tool\.(?:create|run)|schedule\.|jarvis_action\.|preferences\.|voice\.)/.test(
      action.id,
    )
  ) {
    return 'safe-write';
  }
  return 'safe-write';
}

function inferApproval(action: ActionDef, risk: JarvisActionRisk): JarvisActionApproval {
  if (action.autoApprove || risk === 'read-only') return 'never';
  if (
    /^(?:nav\.|settings\.|theme\.|chat\.fullscreen|inspector\.|tools\.open|actions\.openPalette|host\.open(?:Assistant|CommandPalette|Launcher))/.test(
      action.id,
    )
  ) {
    return 'never';
  }
  if (
    risk === 'destructive' ||
    risk === 'external-side-effect' ||
    risk === 'credential-sensitive'
  ) {
    return 'always';
  }
  if (/^(?:files?\.|schedule\.delete|settings\.update)/.test(action.id)) return 'depends-on-input';
  return 'first-time';
}

function capabilityFor(action: ActionDef): string[] {
  const category = action.category === 'custom' ? 'tool' : action.category;
  return [`${category}.actions`];
}

function permissionsFor(risk: JarvisActionRisk): string[] {
  switch (risk) {
    case 'read-only':
      return ['app.read'];
    case 'safe-write':
      return ['app.write'];
    case 'external-side-effect':
      return ['external.execute'];
    case 'destructive':
      return ['app.destructive'];
    case 'credential-sensitive':
      return ['credentials.use-without-disclosure'];
  }
}

export function buildJarvisActionCatalog(actions: readonly ActionDef[]): JarvisActionDefinition[] {
  return actions.map((action) => {
    const risk = inferRisk(action);
    return {
      id: action.id,
      version: 1,
      title: action.label,
      description: action.description,
      category: action.category,
      inputSchema: inputSchema(action),
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
        },
        required: ['ok'],
        additionalProperties: true,
      },
      requiredCapabilities: capabilityFor(action),
      requiredPermissions: permissionsFor(risk),
      supportedPlatforms: [...ALL_PLATFORMS],
      risk,
      approval: inferApproval(action, risk),
      supportsProgress: /^(?:terminal\.|workflow\.|agent\.run|mcp\.)/.test(action.id),
      supportsCancellation: /^(?:terminal\.|workflow\.|agent\.run|mcp\.)/.test(action.id),
      supportsRollback: /^(?:files?\.(?:create|edit)|chat\.rename|settings\.|theme\.)/.test(
        action.id,
      ),
      preconditions: ['handler-registered'],
      possibleNextActions: [],
      exposeToAI: action.exposeToAI !== false,
      handler: action.run,
    };
  });
}

export function validateJarvisActionCatalog(catalog: readonly JarvisActionDefinition[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const action of catalog) {
    if (!/^[a-z][a-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/.test(action.id)) {
      errors.push(`${action.id || '<missing-id>'}: invalid stable action id`);
    }
    if (ids.has(action.id)) errors.push(`${action.id}: duplicate action id`);
    ids.add(action.id);
    if (action.version < 1 || !Number.isInteger(action.version)) {
      errors.push(`${action.id}: invalid version`);
    }
    if (!action.title.trim() || !action.description.trim()) {
      errors.push(`${action.id}: missing title or description`);
    }
    if (typeof action.handler !== 'function') errors.push(`${action.id}: missing handler`);
    for (const key of Object.keys(action.inputSchema.properties ?? {})) {
      if (SECRET_FIELD_RE.test(key))
        errors.push(`${action.id}: credential field "${key}" is model-visible`);
    }
  }
  return errors;
}
