import type {
  ActionDef,
  ActionParam,
  ActionRunContext,
  ActionResult,
} from '@/lib/actions/types';

export type JarvisActionRisk =
  | 'read-only'
  | 'safe-write'
  | 'external-side-effect'
  | 'destructive'
  | 'credential-sensitive';

export type JarvisActionApproval =
  | 'never'
  | 'first-time'
  | 'always'
  | 'depends-on-input';

export type JarvisPlatform = 'windows' | 'macos' | 'linux';

export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema & { enum?: string[]; default?: unknown }>;
  required?: string[];
  additionalProperties?: boolean;
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
  handler: (
    params: Record<string, unknown>,
    context: ActionRunContext,
  ) => Promise<ActionResult>;
}

const ALL_PLATFORMS: JarvisPlatform[] = ['windows', 'macos', 'linux'];
const SECRET_FIELD_RE = /^(?:api[-_ ]?key|password|access[-_ ]?token|refresh[-_ ]?token|token|secret|credentials?|private[-_ ]?key|signing[-_ ]?key)$/i;

function schemaForParam(param: ActionParam): JsonSchema & { enum?: string[]; default?: unknown } {
  const type = param.type === 'number'
    ? 'number'
    : param.type === 'boolean'
      ? 'boolean'
      : 'string';
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
    properties: Object.fromEntries(action.params.map((param) => [param.key, schemaForParam(param)])),
    required: action.params.filter((param) => param.required).map((param) => param.key),
    additionalProperties: false,
  };
}

function inferRisk(action: ActionDef): JarvisActionRisk {
  if (/^(?:terminal\.(?!bulkClose)|shell\.|plugin\.(?:call|invoke|connect)|mcp\.(?:start|invoke)|notification\.send)/.test(action.id)) {
    return 'external-side-effect';
  }
  if (action.destructive) return 'destructive';
  if (/^(?:files?\.read|terminal\.(?:inspect|collect_output|wait_for_output)|schedule\.(?:list|history)|agent\.(?:wait|list)|plugin\.status|mcp\.(?:status|list)|context\.|report\.)/.test(action.id)) {
    return 'read-only';
  }
  if (/^(?:nav\.|settings\.|theme\.|chat\.(?:fullscreen|open)|inspector\.|tools\.open|actions\.openPalette|host\.open(?:Assistant|CommandPalette|Launcher))/.test(action.id)) {
    return 'safe-write';
  }
  if (/^(?:files?\.(?:create|edit|write)|chat\.(?:create|rename|send)|agent\.(?:create|run)|tool\.(?:create|run)|schedule\.|jarvis_action\.|preferences\.|voice\.)/.test(action.id)) {
    return 'safe-write';
  }
  return 'safe-write';
}

function inferApproval(action: ActionDef, risk: JarvisActionRisk): JarvisActionApproval {
  if (action.autoApprove || risk === 'read-only') return 'never';
  if (/^(?:nav\.|settings\.|theme\.|chat\.fullscreen|inspector\.|tools\.open|actions\.openPalette|host\.open(?:Assistant|CommandPalette|Launcher))/.test(action.id)) {
    return 'never';
  }
  if (risk === 'destructive' || risk === 'external-side-effect' || risk === 'credential-sensitive') {
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
      supportsRollback: /^(?:files?\.(?:create|edit)|chat\.rename|settings\.|theme\.)/.test(action.id),
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
      if (SECRET_FIELD_RE.test(key)) errors.push(`${action.id}: credential field "${key}" is model-visible`);
    }
  }
  return errors;
}
