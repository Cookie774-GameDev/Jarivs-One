import type { DeepReadonly } from './contracts';

export const CONTEXT_PROPERTY_TYPES = [
  'text',
  'list',
  'number',
  'checkbox',
  'date',
  'date_time',
  'tags',
  'internal_link',
  'url',
  'status',
  'select',
  'multi_select',
  'file_reference',
  'agent_reference',
  'context_entity_reference',
] as const;

export type ContextPropertyType = (typeof CONTEXT_PROPERTY_TYPES)[number];
export type ContextPropertyValue = string | number | boolean | string[];

export interface ContextPropertyDefinitionV1 {
  name: string;
  type: ContextPropertyType;
  required?: boolean;
  options?: string[];
  defaultValue?: ContextPropertyValue;
  templateDefined?: boolean;
}

export interface ContextPropertyRegistryV1 {
  version: 1;
  mapId: string;
  definitions: ContextPropertyDefinitionV1[];
}

export type ContextPropertyRegistryResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextPropertyRegistryV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'property_registry_invalid'
        | 'property_definition_invalid'
        | 'property_definition_duplicate'
        | 'property_default_invalid';
      detail?: string;
    }>;

export interface ContextNotePropertyDocumentV1 {
  version: 1;
  properties: Record<string, ContextPropertyValue>;
  body: string;
  lineEnding: '\n' | '\r\n' | '\r';
  frontmatterComments: string[];
}

export type ContextNotePropertyParseFailureReason =
  | 'property_input_invalid'
  | 'frontmatter_unterminated'
  | 'frontmatter_too_large'
  | 'frontmatter_yaml_unsafe'
  | 'frontmatter_yaml_unsupported'
  | 'frontmatter_property_duplicate'
  | 'frontmatter_property_unknown'
  | 'frontmatter_property_invalid';

export type ContextNotePropertyParseResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextNotePropertyDocumentV1> }>
  | Readonly<{
      ok: false;
      reason: ContextNotePropertyParseFailureReason;
      detail?: string;
    }>;

export interface ContextPropertyEditDocumentV1 {
  noteId: string;
  changed: boolean;
  previewMarkdown: string;
}

export interface ContextPropertyEditPlanV1 {
  version: 1;
  requiresExplicitApply: true;
  documents: ContextPropertyEditDocumentV1[];
}

export type ContextPropertyEditPlanResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextPropertyEditPlanV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'property_edit_input_invalid'
        | 'property_edit_note_missing'
        | 'property_edit_property_unknown'
        | 'property_edit_value_invalid'
        | 'property_edit_rename_invalid'
        | 'property_edit_generated_forbidden'
        | 'property_edit_input_too_large'
        | ContextNotePropertyParseFailureReason;
      detail?: string;
    }>;

export const CONTEXT_DERIVED_PROPERTY_NAMES = [
  'source_kind',
  'source_path',
  'github_repository',
  'branch',
  'sha',
  'language',
  'last_indexed',
  'link_count',
  'backlink_count',
  'test_relationship',
  'freshness',
] as const;

export type ContextDerivedPropertyName = (typeof CONTEXT_DERIVED_PROPERTY_NAMES)[number];
export type ContextDerivedPropertiesV1 = Record<ContextDerivedPropertyName, string | number>;

const MAX_MARKDOWN_CHARACTERS = 1_048_576;
const MAX_FRONTMATTER_CHARACTERS = 65_536;
const MAX_FRONTMATTER_LINES = 200;
const MAX_DEFINITIONS = 256;
const MAX_OPTIONS = 128;
const MAX_LIST_VALUES = 128;
const MAX_DOCUMENTS = 1_000;
const MAX_EDITS = 1_000;
const MAX_PROPERTIES_PER_EDIT = 256;
const MAX_EDIT_OPERATIONS = 100_000;
const MAX_TOTAL_MARKDOWN_CHARACTERS = 64 * 1024 * 1024;
const MAX_PROPERTY_PREVIEW_CHARACTERS = 16 * 1024 * 1024;
const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DERIVED_NAMES = new Set<string>(CONTEXT_DERIVED_PROPERTY_NAMES);
const TYPE_NAMES = new Set<string>(CONTEXT_PROPERTY_TYPES);
const OPTION_TYPES = new Set<ContextPropertyType>(['status', 'select', 'multi_select']);
const UNSAFE_PROPERTY_NAMES = new Set(
  [...Object.getOwnPropertyNames(Object.prototype), '__proto__'].map((name) =>
    name.toLocaleLowerCase('en-US'),
  ),
);

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = deepFreeze(entry);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeText(value: unknown, maximum = 1_000): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function folded(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function safePropertyName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    PROPERTY_NAME.test(value) &&
    !UNSAFE_PROPERTY_NAMES.has(folded(value))
  );
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function portableRelativePath(value: unknown): value is string {
  if (
    !safeText(value, 4_096) ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  ) {
    return false;
  }
  return value.split('/').every((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }
    return (
      Boolean(segment) &&
      segment !== '.' &&
      segment !== '..' &&
      decoded !== '.' &&
      decoded !== '..' &&
      !decoded.includes('/') &&
      !decoded.includes('\\') &&
      !CONTROL_CHARACTERS.test(decoded) &&
      !/[<>:"|?*]/u.test(decoded) &&
      !/[ .]$/u.test(decoded) &&
      !/^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(
        decoded,
      )
    );
  });
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match || !validDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return (
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    !Number.isNaN(Date.parse(value))
  );
}

function validUrl(value: unknown): value is string {
  if (!safeText(value, 2_048)) return false;
  try {
    const parsed = new URL(value);
    return (
      ['http:', 'https:', 'mailto:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function validInternalLink(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\[\[[^\]\r\n|]{1,500}\]\]$/u.test(value) &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function uniqueStringList(value: unknown, maximum = MAX_LIST_VALUES): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!safeText(item, 500)) return null;
    const key = folded(item);
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function validatePropertyValue(
  definition: DeepReadonly<ContextPropertyDefinitionV1>,
  value: unknown,
): ContextPropertyValue | null {
  switch (definition.type) {
    case 'text':
      return safeText(value, 4_096) ? value : null;
    case 'list':
    case 'tags': {
      return uniqueStringList(value);
    }
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    case 'checkbox':
      return typeof value === 'boolean' ? value : null;
    case 'date':
      return validDate(value) ? value : null;
    case 'date_time':
      return validDateTime(value) ? value : null;
    case 'internal_link':
      return validInternalLink(value) ? value : null;
    case 'url':
      return validUrl(value) ? value : null;
    case 'status':
    case 'select':
      return typeof value === 'string' &&
        definition.options?.some((option) => folded(option) === folded(value))
        ? value
        : null;
    case 'multi_select': {
      const values = uniqueStringList(value);
      return values &&
        values.every((item) =>
          definition.options?.some((option) => folded(option) === folded(item)),
        )
        ? values
        : null;
    }
    case 'file_reference':
      return portableRelativePath(value) ? value : null;
    case 'agent_reference':
    case 'context_entity_reference':
      return safeId(value) ? value : null;
  }
}

function canonicalDerivedName(value: string): ContextDerivedPropertyName | undefined {
  return CONTEXT_DERIVED_PROPERTY_NAMES.find((name) => folded(name) === folded(value));
}

function validGithubRepository(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u.test(value);
}

function validDerivedPropertyValue(
  name: ContextDerivedPropertyName,
  value: unknown,
): value is string | number {
  switch (name) {
    case 'source_kind':
      return safeText(value, 100);
    case 'source_path':
      return portableRelativePath(value);
    case 'github_repository':
      return validGithubRepository(value);
    case 'branch':
      return safeText(value, 500);
    case 'sha':
      return typeof value === 'string' && SHA.test(value);
    case 'language':
      return safeText(value, 100);
    case 'last_indexed':
    case 'link_count':
    case 'backlink_count':
      return Number.isSafeInteger(value) && (value as number) >= 0;
    case 'test_relationship':
    case 'freshness':
      return safeText(value, 100);
  }
}

function parseDefinition(
  value: unknown,
):
  | Readonly<{ ok: true; value: ContextPropertyDefinitionV1 }>
  | Readonly<{
      ok: false;
      reason: 'property_definition_invalid' | 'property_default_invalid';
      detail?: string;
    }> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'name',
      'type',
      'required',
      'options',
      'defaultValue',
      'templateDefined',
    ]) ||
    !safePropertyName(value.name) ||
    typeof value.type !== 'string' ||
    !TYPE_NAMES.has(value.type) ||
    (value.required !== undefined && typeof value.required !== 'boolean') ||
    (value.templateDefined !== undefined && typeof value.templateDefined !== 'boolean')
  ) {
    return Object.freeze({
      ok: false,
      reason: 'property_definition_invalid',
      ...(isRecord(value) && typeof value.name === 'string' ? { detail: value.name } : {}),
    });
  }
  const type = value.type as ContextPropertyType;
  let options: string[] | undefined;
  if (value.options !== undefined) {
    options = uniqueStringList(value.options, MAX_OPTIONS) ?? undefined;
    if (!options || !OPTION_TYPES.has(type) || options.length === 0) {
      return Object.freeze({
        ok: false,
        reason: 'property_definition_invalid',
        detail: value.name,
      });
    }
  } else if (OPTION_TYPES.has(type)) {
    return Object.freeze({
      ok: false,
      reason: 'property_definition_invalid',
      detail: value.name,
    });
  }
  const definition: ContextPropertyDefinitionV1 = {
    name: value.name,
    type,
    ...(value.required === true ? { required: true } : {}),
    ...(options ? { options } : {}),
    ...(value.templateDefined === true ? { templateDefined: true } : {}),
  };
  if (value.defaultValue !== undefined) {
    const parsedDefault = validatePropertyValue(definition, value.defaultValue);
    if (parsedDefault === null) {
      return Object.freeze({
        ok: false,
        reason: 'property_default_invalid',
        detail: value.name,
      });
    }
    definition.defaultValue = parsedDefault;
  }
  return Object.freeze({ ok: true, value: definition });
}

export function parseContextPropertyRegistry(value: unknown): ContextPropertyRegistryResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['version', 'mapId', 'definitions']) ||
    value.version !== 1 ||
    !safeId(value.mapId) ||
    !Array.isArray(value.definitions) ||
    value.definitions.length > MAX_DEFINITIONS
  ) {
    return Object.freeze({ ok: false, reason: 'property_registry_invalid' });
  }
  const definitions: ContextPropertyDefinitionV1[] = [];
  const names = new Set<string>();
  for (const rawDefinition of value.definitions) {
    const parsed = parseDefinition(rawDefinition);
    if (!parsed.ok) return parsed;
    const key = folded(parsed.value.name);
    if (names.has(key) || DERIVED_NAMES.has(key)) {
      return Object.freeze({
        ok: false,
        reason: 'property_definition_duplicate',
        detail: parsed.value.name,
      });
    }
    names.add(key);
    definitions.push(parsed.value);
  }
  return Object.freeze({
    ok: true,
    value: deepFreeze({ version: 1 as const, mapId: value.mapId, definitions }),
  });
}

function unquoteYamlScalar(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"')) {
    if (!trimmed.endsWith('"')) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'")) return null;
    return trimmed.slice(1, -1).replace(/''/gu, "'");
  }
  return trimmed;
}

function splitInlineYamlList(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1);
  if (!inner.trim()) return [];
  const result: string[] = [];
  let buffer = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const character of inner) {
    if (escaped) {
      buffer += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      buffer += character;
      escaped = true;
      continue;
    }
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character;
      buffer += character;
      continue;
    }
    if (character === ',' && !quote) {
      const parsed = unquoteYamlScalar(buffer);
      if (parsed === null) return null;
      result.push(parsed);
      buffer = '';
      continue;
    }
    if (
      (character === '[' || character === ']' || character === '{' || character === '}') &&
      !quote
    ) {
      return null;
    }
    buffer += character;
  }
  if (quote) return null;
  const parsed = unquoteYamlScalar(buffer);
  if (parsed === null) return null;
  result.push(parsed);
  return result;
}

function unsafeYamlScalar(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[&*!]/u.test(trimmed) || /^<<\s*:/u.test(trimmed) || /(?:^|\s)!!?[A-Za-z]/u.test(trimmed)
  );
}

function scalarFromYaml(value: string): ContextPropertyValue | null {
  const trimmed = value.trim();
  if (unsafeYamlScalar(trimmed)) return null;
  const list = splitInlineYamlList(trimmed);
  if (list) return list;
  const text = unquoteYamlScalar(trimmed);
  if (text === null || CONTROL_CHARACTERS.test(text)) return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(trimmed)) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }
  return text;
}

function registryDefinitionsByName(
  registry: DeepReadonly<ContextPropertyRegistryV1>,
): ReadonlyMap<string, DeepReadonly<ContextPropertyDefinitionV1>> {
  return new Map(registry.definitions.map((definition) => [folded(definition.name), definition]));
}

function contentAfterLines(value: string, lineCount: number): string {
  let offset = 0;
  for (let line = 0; line < lineCount; line += 1) {
    while (offset < value.length && value[offset] !== '\r' && value[offset] !== '\n') {
      offset += 1;
    }
    if (offset >= value.length) return '';
    if (value[offset] === '\r' && value[offset + 1] === '\n') offset += 2;
    else offset += 1;
  }
  return value.slice(offset);
}

function parseFrontmatterProperties(
  markdown: string,
  registry: DeepReadonly<ContextPropertyRegistryV1>,
  applyDefaults: boolean,
): ContextNotePropertyParseResult {
  const normalized = markdown.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  const definitions = registryDefinitionsByName(registry);
  const properties: Record<string, ContextPropertyValue> = {};
  const frontmatterComments: string[] = [];
  let body = markdown;
  const lineEnding: '\n' | '\r\n' | '\r' = markdown.includes('\r\n')
    ? '\r\n'
    : markdown.includes('\r')
      ? '\r'
      : '\n';

  if (lines[0]?.trim() === '---') {
    const searchEnd = Math.min(lines.length, MAX_FRONTMATTER_LINES + 1);
    let close = -1;
    for (let index = 1; index < searchEnd; index += 1) {
      if (lines[index]?.trim() === '---') {
        close = index;
        break;
      }
    }
    if (close < 0) {
      return Object.freeze({
        ok: false,
        reason:
          lines.slice(0, searchEnd).join('\n').length > MAX_FRONTMATTER_CHARACTERS ||
          lines.length > MAX_FRONTMATTER_LINES
            ? 'frontmatter_too_large'
            : 'frontmatter_unterminated',
      });
    }
    if (lines.slice(0, close + 1).join('\n').length > MAX_FRONTMATTER_CHARACTERS) {
      return Object.freeze({ ok: false, reason: 'frontmatter_too_large' });
    }

    const seen = new Set<string>();
    for (let index = 1; index < close; index += 1) {
      const line = lines[index] ?? '';
      if (!line.trim()) continue;
      if (line.trimStart().startsWith('#')) {
        frontmatterComments.push(line);
        continue;
      }
      if (/^\s/u.test(line)) {
        return Object.freeze({ ok: false, reason: 'frontmatter_yaml_unsupported' });
      }
      const match = /^([A-Za-z_][A-Za-z0-9_-]{0,63})\s*:\s*(.*)$/u.exec(line);
      if (!match?.[1]) {
        return Object.freeze({ ok: false, reason: 'frontmatter_yaml_unsafe' });
      }
      const name = match[1];
      const key = folded(name);
      if (seen.has(key)) {
        return Object.freeze({
          ok: false,
          reason: 'frontmatter_property_duplicate',
          detail: name,
        });
      }
      const definition = definitions.get(key);
      const derivedName = canonicalDerivedName(name);
      if (!definition && !derivedName) {
        return Object.freeze({
          ok: false,
          reason: 'frontmatter_property_unknown',
          detail: name,
        });
      }
      seen.add(key);
      const raw = match[2] ?? '';
      let rawValue: ContextPropertyValue | null;
      if (!raw) {
        const items: string[] = [];
        while (index + 1 < close) {
          const next = lines[index + 1] ?? '';
          const item = /^ {2}-\s+(.+?)\s*$/u.exec(next);
          if (!item?.[1]) {
            if (/^\s/u.test(next)) {
              return Object.freeze({
                ok: false,
                reason: 'frontmatter_yaml_unsupported',
                detail: name,
              });
            }
            break;
          }
          if (unsafeYamlScalar(item[1])) {
            return Object.freeze({
              ok: false,
              reason: 'frontmatter_yaml_unsafe',
              detail: name,
            });
          }
          const parsed = unquoteYamlScalar(item[1]);
          if (parsed === null) {
            return Object.freeze({
              ok: false,
              reason: 'frontmatter_yaml_unsupported',
              detail: name,
            });
          }
          items.push(parsed);
          index += 1;
        }
        rawValue = items.length > 0 ? items : null;
      } else {
        if (unsafeYamlScalar(raw)) {
          return Object.freeze({
            ok: false,
            reason: 'frontmatter_yaml_unsafe',
            detail: name,
          });
        }
        rawValue = scalarFromYaml(raw);
      }
      if (rawValue === null) {
        return Object.freeze({
          ok: false,
          reason: 'frontmatter_yaml_unsupported',
          detail: name,
        });
      }
      if (derivedName) {
        if (!validDerivedPropertyValue(derivedName, rawValue)) {
          return Object.freeze({
            ok: false,
            reason: 'frontmatter_property_invalid',
            detail: name,
          });
        }
        properties[derivedName] = rawValue;
        continue;
      }
      if (!definition) {
        return Object.freeze({
          ok: false,
          reason: 'frontmatter_property_unknown',
          detail: name,
        });
      }
      const parsedValue = validatePropertyValue(definition, rawValue);
      if (parsedValue === null) {
        return Object.freeze({
          ok: false,
          reason: 'frontmatter_property_invalid',
          detail: name,
        });
      }
      properties[definition.name] = parsedValue;
    }
    body = contentAfterLines(markdown, close + 1);
  }

  if (applyDefaults) {
    for (const definition of registry.definitions) {
      if (properties[definition.name] === undefined && definition.defaultValue !== undefined) {
        properties[definition.name] = deepFreeze(definition.defaultValue) as ContextPropertyValue;
      }
    }
  }
  return Object.freeze({
    ok: true,
    value: deepFreeze({
      version: 1 as const,
      properties,
      body,
      lineEnding,
      frontmatterComments,
    }),
  });
}

export function parseContextNoteProperties(input: {
  registry: DeepReadonly<ContextPropertyRegistryV1>;
  markdown: unknown;
  applyDefaults?: boolean;
}): ContextNotePropertyParseResult {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['registry', 'markdown', 'applyDefaults']) ||
    typeof input.markdown !== 'string' ||
    input.markdown.length > MAX_MARKDOWN_CHARACTERS ||
    CONTROL_CHARACTERS.test(input.markdown) ||
    (input.applyDefaults !== undefined && typeof input.applyDefaults !== 'boolean')
  ) {
    return Object.freeze({ ok: false, reason: 'property_input_invalid' });
  }
  const registry = parseContextPropertyRegistry(input.registry);
  if (!registry.ok) {
    return Object.freeze({ ok: false, reason: 'property_input_invalid' });
  }
  return parseFrontmatterProperties(input.markdown, registry.value, input.applyDefaults === true);
}

function yamlString(value: string): string {
  if (
    /^[A-Za-z0-9][A-Za-z0-9._/@:+-]*(?: [A-Za-z0-9._/@:+-]+)*$/u.test(value) &&
    value !== 'true' &&
    value !== 'false' &&
    value !== 'null' &&
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlValue(value: ContextPropertyValue): string {
  if (Array.isArray(value)) return `[${value.map((item) => yamlString(item)).join(', ')}]`;
  if (typeof value === 'string') return yamlString(value);
  return String(value);
}

function propertyValueCharacters(value: unknown): number | null {
  if (
    !(
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
    )
  ) {
    return null;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
}

function serializeProperties(
  properties: Readonly<Record<string, ContextPropertyValue>>,
  definitions: readonly DeepReadonly<ContextPropertyDefinitionV1>[],
  body: string,
  lineEnding: '\n' | '\r\n' | '\r',
  frontmatterComments: readonly string[],
  includeDerived: boolean,
): string {
  const order = [
    ...definitions.map(({ name }) => name),
    ...(includeDerived ? CONTEXT_DERIVED_PROPERTY_NAMES : []),
  ];
  const lines: string[] = [...frontmatterComments];
  const emitted = new Set<string>();
  for (const name of order) {
    const value = properties[name];
    if (value === undefined || emitted.has(name)) continue;
    emitted.add(name);
    lines.push(`${name}: ${yamlValue(value)}`);
  }
  for (const name of Object.keys(properties).sort((left, right) => left.localeCompare(right))) {
    if (emitted.has(name)) continue;
    lines.push(`${name}: ${yamlValue(properties[name]!)}`);
  }
  if (lines.length === 0) return body;
  return `---${lineEnding}${lines.join(lineEnding)}${lineEnding}---${lineEnding}${body}`;
}

function derivedProperties(value: unknown): DeepReadonly<ContextDerivedPropertiesV1> | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, CONTEXT_DERIVED_PROPERTY_NAMES) ||
    Object.keys(value).length !== CONTEXT_DERIVED_PROPERTY_NAMES.length
  ) {
    return null;
  }
  for (const name of CONTEXT_DERIVED_PROPERTY_NAMES) {
    if (!validDerivedPropertyValue(name, value[name])) return null;
  }
  return deepFreeze(value as unknown as ContextDerivedPropertiesV1);
}

export function buildContextDerivedProperties(input: {
  sourceKind: string;
  sourcePath: string;
  githubRepository: string;
  branch: string;
  sha: string;
  language: string;
  lastIndexedAt: number;
  linkCount: number;
  backlinkCount: number;
  testRelationship: string;
  freshness: string;
}):
  | Readonly<{ ok: true; value: DeepReadonly<ContextDerivedPropertiesV1> }>
  | Readonly<{ ok: false; reason: 'derived_property_input_invalid'; detail?: string }> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'sourceKind',
      'sourcePath',
      'githubRepository',
      'branch',
      'sha',
      'language',
      'lastIndexedAt',
      'linkCount',
      'backlinkCount',
      'testRelationship',
      'freshness',
    ]) ||
    !safeText(input.sourceKind, 100) ||
    !portableRelativePath(input.sourcePath) ||
    !validGithubRepository(input.githubRepository) ||
    !safeText(input.branch, 500) ||
    !SHA.test(input.sha) ||
    !safeText(input.language, 100) ||
    !Number.isSafeInteger(input.lastIndexedAt) ||
    input.lastIndexedAt < 0 ||
    !Number.isSafeInteger(input.linkCount) ||
    input.linkCount < 0 ||
    !Number.isSafeInteger(input.backlinkCount) ||
    input.backlinkCount < 0 ||
    !safeText(input.testRelationship, 100) ||
    !safeText(input.freshness, 100)
  ) {
    return Object.freeze({ ok: false, reason: 'derived_property_input_invalid' });
  }
  return Object.freeze({
    ok: true,
    value: deepFreeze({
      source_kind: input.sourceKind,
      source_path: input.sourcePath,
      github_repository: input.githubRepository,
      branch: input.branch,
      sha: input.sha,
      language: input.language,
      last_indexed: input.lastIndexedAt,
      link_count: input.linkCount,
      backlink_count: input.backlinkCount,
      test_relationship: input.testRelationship,
      freshness: input.freshness,
    }),
  });
}

export function planContextPropertyEdits(input: {
  registry: DeepReadonly<ContextPropertyRegistryV1>;
  documents: readonly Readonly<{ noteId: string; markdown: string }>[];
  edits: readonly Readonly<{
    noteIds: readonly string[];
    set?: Readonly<Record<string, ContextPropertyValue>>;
    remove?: readonly string[];
    applyDefaults?: boolean;
  }>[];
  rename?: Readonly<{ from: string; to: string }>;
  derivedProperties?: DeepReadonly<ContextDerivedPropertiesV1>;
  includeDerivedProperties?: boolean;
}): ContextPropertyEditPlanResult {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'registry',
      'documents',
      'edits',
      'rename',
      'derivedProperties',
      'includeDerivedProperties',
    ]) ||
    !Array.isArray(input.documents) ||
    input.documents.length > MAX_DOCUMENTS ||
    !Array.isArray(input.edits) ||
    input.edits.length > MAX_EDITS ||
    (input.includeDerivedProperties !== undefined &&
      typeof input.includeDerivedProperties !== 'boolean')
  ) {
    return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
  }
  const registry = parseContextPropertyRegistry(input.registry);
  if (!registry.ok) {
    return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
  }
  const definitions = registryDefinitionsByName(registry.value);
  const documents = new Map<
    string,
    {
      markdown: string;
      properties: Record<string, ContextPropertyValue>;
      body: string;
      lineEnding: '\n' | '\r\n' | '\r';
      frontmatterComments: string[];
    }
  >();
  let totalMarkdownCharacters = 0;
  for (const document of input.documents) {
    totalMarkdownCharacters +=
      isRecord(document) && typeof document.markdown === 'string' ? document.markdown.length : 0;
    if (
      !isRecord(document) ||
      !hasOnlyKeys(document, ['noteId', 'markdown']) ||
      !safeId(document.noteId) ||
      typeof document.markdown !== 'string' ||
      document.markdown.length > MAX_MARKDOWN_CHARACTERS ||
      totalMarkdownCharacters > MAX_TOTAL_MARKDOWN_CHARACTERS ||
      documents.has(document.noteId)
    ) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
    }
    const parsed = parseContextNoteProperties({
      registry: registry.value,
      markdown: document.markdown,
    });
    if (!parsed.ok) return parsed;
    documents.set(document.noteId, {
      markdown: document.markdown,
      properties: { ...parsed.value.properties } as Record<string, ContextPropertyValue>,
      body: parsed.value.body,
      lineEnding: parsed.value.lineEnding,
      frontmatterComments: [...parsed.value.frontmatterComments],
    });
  }

  let renamedDefinitions = [...registry.value.definitions];
  if (input.rename !== undefined) {
    if (
      !isRecord(input.rename) ||
      !hasOnlyKeys(input.rename, ['from', 'to']) ||
      !safePropertyName(input.rename.from) ||
      !safePropertyName(input.rename.to) ||
      DERIVED_NAMES.has(folded(input.rename.from)) ||
      DERIVED_NAMES.has(folded(input.rename.to))
    ) {
      return Object.freeze({ ok: false, reason: 'property_edit_rename_invalid' });
    }
    const sourceDefinition = definitions.get(folded(input.rename.from));
    if (
      !sourceDefinition ||
      (folded(input.rename.from) !== folded(input.rename.to) &&
        definitions.has(folded(input.rename.to)))
    ) {
      return Object.freeze({
        ok: false,
        reason: 'property_edit_rename_invalid',
        detail: input.rename.to,
      });
    }
    renamedDefinitions = registry.value.definitions.map((definition) =>
      folded(definition.name) === folded(input.rename!.from)
        ? ({ ...definition, name: input.rename!.to } as ContextPropertyDefinitionV1)
        : (definition as ContextPropertyDefinitionV1),
    );
  }

  let editOperations = 0;
  let projectedPreviewCharacters = 0;
  for (const edit of input.edits) {
    if (
      !isRecord(edit) ||
      !hasOnlyKeys(edit, ['noteIds', 'set', 'remove', 'applyDefaults']) ||
      !Array.isArray(edit.noteIds) ||
      edit.noteIds.length > MAX_DOCUMENTS ||
      (edit.applyDefaults !== undefined && typeof edit.applyDefaults !== 'boolean') ||
      (edit.set !== undefined && !isRecord(edit.set)) ||
      (edit.remove !== undefined && !Array.isArray(edit.remove)) ||
      (isRecord(edit.set) && Object.keys(edit.set).length > MAX_PROPERTIES_PER_EDIT) ||
      (Array.isArray(edit.remove) && edit.remove.length > MAX_PROPERTIES_PER_EDIT) ||
      new Set(edit.noteIds).size !== edit.noteIds.length
    ) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
    }
    editOperations +=
      edit.noteIds.length *
      (Object.keys(edit.set ?? {}).length +
        (edit.remove?.length ?? 0) +
        (edit.applyDefaults === true ? registry.value.definitions.length : 0));
    if (editOperations > MAX_EDIT_OPERATIONS) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
    }
    let setCharacters = 0;
    for (const [name, rawValue] of Object.entries(edit.set ?? {})) {
      if (DERIVED_NAMES.has(folded(name))) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_generated_forbidden',
          detail: name,
        });
      }
      const definition = definitions.get(folded(name));
      if (!definition) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_property_unknown',
          detail: name,
        });
      }
      const value = validatePropertyValue(definition, rawValue);
      if (value === null) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_value_invalid',
          detail: name,
        });
      }
      const valueCharacters = propertyValueCharacters(value);
      if (valueCharacters === null) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_value_invalid',
          detail: name,
        });
      }
      setCharacters += name.length + valueCharacters + 4;
    }
    const defaultCharacters =
      edit.applyDefaults === true
        ? registry.value.definitions.reduce(
            (total, definition) =>
              total +
              (definition.defaultValue === undefined
                ? 0
                : definition.name.length +
                  (propertyValueCharacters(definition.defaultValue) ?? 0) +
                  4),
            0,
          )
        : 0;
    projectedPreviewCharacters += edit.noteIds.length * (setCharacters + defaultCharacters);
    if (projectedPreviewCharacters > MAX_PROPERTY_PREVIEW_CHARACTERS) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_too_large' });
    }
    for (const noteId of edit.noteIds) {
      if (!safeId(noteId) || !documents.has(noteId)) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_note_missing',
          ...(typeof noteId === 'string' ? { detail: noteId } : {}),
        });
      }
    }
    for (const [name, rawValue] of Object.entries(edit.set ?? {})) {
      if (DERIVED_NAMES.has(folded(name))) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_generated_forbidden',
          detail: name,
        });
      }
      const definition = definitions.get(folded(name));
      if (!definition) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_property_unknown',
          detail: name,
        });
      }
      const value = validatePropertyValue(definition, rawValue);
      if (value === null) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_value_invalid',
          detail: name,
        });
      }
      for (const noteId of edit.noteIds) documents.get(noteId)!.properties[definition.name] = value;
    }
    for (const rawName of edit.remove ?? []) {
      if (!safePropertyName(rawName)) {
        return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
      }
      if (DERIVED_NAMES.has(folded(rawName))) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_generated_forbidden',
          detail: rawName,
        });
      }
      const definition = definitions.get(folded(rawName));
      if (!definition) {
        return Object.freeze({
          ok: false,
          reason: 'property_edit_property_unknown',
          detail: rawName,
        });
      }
      for (const noteId of edit.noteIds) delete documents.get(noteId)!.properties[definition.name];
    }
    if (edit.applyDefaults === true) {
      for (const noteId of edit.noteIds) {
        const properties = documents.get(noteId)!.properties;
        for (const definition of registry.value.definitions) {
          if (properties[definition.name] === undefined && definition.defaultValue !== undefined) {
            properties[definition.name] = deepFreeze(
              definition.defaultValue,
            ) as ContextPropertyValue;
          }
        }
      }
    }
  }

  const renamedNoteIds = new Set<string>();
  if (input.rename !== undefined) {
    for (const [noteId, document] of documents) {
      const existingName = Object.keys(document.properties).find(
        (name) => folded(name) === folded(input.rename!.from),
      );
      if (existingName && existingName !== input.rename.to) {
        document.properties[input.rename.to] = document.properties[existingName]!;
        delete document.properties[existingName];
        renamedNoteIds.add(noteId);
      }
    }
  }

  let derived: DeepReadonly<ContextDerivedPropertiesV1> | undefined;
  if (input.derivedProperties !== undefined) {
    derived = derivedProperties(input.derivedProperties) ?? undefined;
    if (!derived) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
    }
  }
  if (input.includeDerivedProperties === true && !derived) {
    return Object.freeze({ ok: false, reason: 'property_edit_input_invalid' });
  }
  if (input.includeDerivedProperties === true && derived) {
    const derivedCharacters = Object.entries(derived).reduce(
      (total, [name, value]) => total + name.length + (propertyValueCharacters(value) ?? 0) + 4,
      0,
    );
    projectedPreviewCharacters += documents.size * derivedCharacters;
    if (projectedPreviewCharacters > MAX_PROPERTY_PREVIEW_CHARACTERS) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_too_large' });
    }
  }

  const output: ContextPropertyEditDocumentV1[] = [];
  let materializedPreviewCharacters = 0;
  for (const [noteId, document] of documents) {
    if (input.includeDerivedProperties === true && derived) {
      Object.assign(document.properties, derived);
    }
    const shouldSerialize =
      renamedNoteIds.has(noteId) ||
      input.edits.some((edit) => edit.noteIds.includes(noteId)) ||
      input.includeDerivedProperties === true;
    const previewMarkdown = shouldSerialize
      ? serializeProperties(
          document.properties,
          renamedDefinitions,
          document.body,
          document.lineEnding,
          document.frontmatterComments,
          input.includeDerivedProperties === true,
        )
      : document.markdown;
    materializedPreviewCharacters += previewMarkdown.length;
    if (materializedPreviewCharacters > MAX_PROPERTY_PREVIEW_CHARACTERS) {
      return Object.freeze({ ok: false, reason: 'property_edit_input_too_large' });
    }
    output.push({
      noteId,
      changed: previewMarkdown !== document.markdown,
      previewMarkdown,
    });
  }
  return Object.freeze({
    ok: true,
    value: deepFreeze({
      version: 1 as const,
      requiresExplicitApply: true as const,
      documents: output,
    }),
  });
}

export function analyzeContextPropertyRegistryChange(input: {
  registry: DeepReadonly<ContextPropertyRegistryV1>;
  propertyName: string;
  nextType: ContextPropertyType;
  documents: readonly Readonly<{ noteId: string; markdown: string }>[];
}):
  | Readonly<{
      ok: true;
      value: DeepReadonly<{
        propertyName: string;
        currentType: ContextPropertyType;
        nextType: ContextPropertyType;
        usageCount: number;
        compatible: boolean;
        warning?: 'incompatible_type_change';
      }>;
    }>
  | Readonly<{ ok: false; reason: string; detail?: string }> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['registry', 'propertyName', 'nextType', 'documents']) ||
    !safePropertyName(input.propertyName) ||
    typeof input.nextType !== 'string' ||
    !TYPE_NAMES.has(input.nextType) ||
    !Array.isArray(input.documents) ||
    input.documents.length > MAX_DOCUMENTS
  ) {
    return Object.freeze({ ok: false, reason: 'property_change_input_invalid' });
  }
  const registry = parseContextPropertyRegistry(input.registry);
  if (!registry.ok) {
    return Object.freeze({ ok: false, reason: 'property_change_input_invalid' });
  }
  const definition = registryDefinitionsByName(registry.value).get(folded(input.propertyName));
  if (!definition) {
    return Object.freeze({
      ok: false,
      reason: 'property_change_property_unknown',
      detail: input.propertyName,
    });
  }
  let usageCount = 0;
  const noteIds = new Set<string>();
  let totalMarkdownCharacters = 0;
  for (const document of input.documents) {
    totalMarkdownCharacters +=
      isRecord(document) && typeof document.markdown === 'string' ? document.markdown.length : 0;
    if (
      !isRecord(document) ||
      !hasOnlyKeys(document, ['noteId', 'markdown']) ||
      !safeId(document.noteId) ||
      typeof document.markdown !== 'string' ||
      document.markdown.length > MAX_MARKDOWN_CHARACTERS ||
      totalMarkdownCharacters > MAX_TOTAL_MARKDOWN_CHARACTERS ||
      noteIds.has(document.noteId)
    ) {
      return Object.freeze({ ok: false, reason: 'property_change_input_invalid' });
    }
    noteIds.add(document.noteId);
    const parsed = parseContextNoteProperties({
      registry: registry.value,
      markdown: document.markdown,
    });
    if (!parsed.ok) return parsed;
    if (parsed.value.properties[definition.name] !== undefined) usageCount += 1;
  }
  const compatible = definition.type === input.nextType || usageCount === 0;
  return Object.freeze({
    ok: true,
    value: deepFreeze({
      propertyName: definition.name,
      currentType: definition.type,
      nextType: input.nextType as ContextPropertyType,
      usageCount,
      compatible,
      ...(!compatible ? { warning: 'incompatible_type_change' as const } : {}),
    }),
  });
}
