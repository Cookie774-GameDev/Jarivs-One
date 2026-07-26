import {
  CODE_INTELLIGENCE_LANGUAGES,
  CODE_INTELLIGENCE_PARSER_REGISTRY,
  resolveCodeIntelligenceLanguage,
  type CodeIntelligenceLanguage,
} from './codeIntelligenceLanguages';

export const CODE_INTELLIGENCE_ENTITY_KINDS = Object.freeze([
  'module',
  'import',
  'export',
  'function',
  'class',
  'method',
  'react_component',
  'route',
  'api_handler',
  'database_migration',
  'test',
  'configuration',
  'script',
  'dependency',
] as const);

export const CODE_INTELLIGENCE_RELATIONSHIP_KINDS = Object.freeze([
  'imports',
  'exports',
  'calls',
  'component_composition',
  'route_to_handler',
  'handler_to_service',
  'service_to_database',
  'source_to_test',
  'config_to_feature',
  'migration_to_table',
  'script_to_command',
] as const);

export type CodeIntelligenceEntityKind = (typeof CODE_INTELLIGENCE_ENTITY_KINDS)[number];
export type CodeIntelligenceRelationshipKind =
  (typeof CODE_INTELLIGENCE_RELATIONSHIP_KINDS)[number];
export type CodeIntelligenceRelationshipEvidence =
  | 'ast'
  | 'type_checker'
  | 'framework'
  | 'heuristic';

export interface CodeIntelligenceParserEvidence {
  name: string;
  astDigest: string;
  parserBacked: true;
  regexOnlySymbolExtraction: false;
}

export interface CodeIntelligenceFile {
  filePath: string;
  language: CodeIntelligenceLanguage;
  sourceRevision: string;
  parser: CodeIntelligenceParserEvidence;
}

export interface CodeIntelligenceEntity {
  id: string;
  kind: CodeIntelligenceEntityKind;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface CodeIntelligenceRelationship {
  id: string;
  kind: CodeIntelligenceRelationshipKind;
  fromEntityId: string;
  toEntityId: string;
  evidence: CodeIntelligenceRelationshipEvidence;
  confidence: number;
}

export interface CodeIntelligenceGraphInput {
  files: readonly CodeIntelligenceFile[];
  entities: readonly CodeIntelligenceEntity[];
  relationships: readonly CodeIntelligenceRelationship[];
}

export interface CodeIntelligenceParserAuthority {
  verifyParserEvidence(file: Readonly<CodeIntelligenceFile>): boolean;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/u;
const SHA = /^[a-fA-F0-9]{40}$/u;
const SHA256 = /^[a-fA-F0-9]{64}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_ITEMS = 100_000;
const MAX_NODES = 500_000;
const MAX_CHARS = 20_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid code-intelligence graph ${reason}.`);
}

function text(value: unknown, reason: string, maximum = 1_000): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = text(value, reason, 500);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function filePath(value: unknown): string {
  const result = text(value, 'file path', 2_048).replaceAll('\\', '/');
  const firstSegment = result.split('/', 1)[0];
  if (
    result.startsWith('/') ||
    result.endsWith('/') ||
    result.includes('//') ||
    firstSegment.includes(':') ||
    result.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('file path');
  }
  return result;
}

function digest(value: unknown, reason: string, pattern: RegExp, maximum: number): string {
  const result = text(value, reason, maximum);
  if (!pattern.test(result)) fail(reason);
  return result.toLowerCase();
}

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 7) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 10_000) fail(reason);
    budget.chars += value.length;
    if (budget.chars > MAX_CHARS) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > MAX_ITEMS) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 8) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosed(descriptor.value, reason, depth + 1, budget);
  }
}

function clone<T>(value: T, reason: string): T {
  try {
    assertClosed(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateParser(
  rawParser: CodeIntelligenceParserEvidence,
): Readonly<CodeIntelligenceParserEvidence> {
  const parser = record(rawParser, 'parser evidence');
  exact(
    parser,
    ['name', 'astDigest', 'parserBacked', 'regexOnlySymbolExtraction'],
    ['name', 'astDigest', 'parserBacked', 'regexOnlySymbolExtraction'],
    'parser evidence',
  );
  if (parser.parserBacked !== true || parser.regexOnlySymbolExtraction !== false) {
    fail('parser evidence');
  }
  return Object.freeze({
    name: stableId(parser.name, 'parser name'),
    astDigest: digest(parser.astDigest, 'AST digest', SHA256, 64),
    parserBacked: true,
    regexOnlySymbolExtraction: false,
  });
}

function validateFile(
  rawFile: CodeIntelligenceFile,
  authority: CodeIntelligenceParserAuthority,
): Readonly<CodeIntelligenceFile> {
  const file = record(rawFile, 'file');
  exact(
    file,
    ['filePath', 'language', 'sourceRevision', 'parser'],
    ['filePath', 'language', 'sourceRevision', 'parser'],
    'file',
  );
  if (!(CODE_INTELLIGENCE_LANGUAGES as readonly unknown[]).includes(file.language)) {
    fail('language');
  }
  const normalizedPath = filePath(file.filePath);
  const language = file.language as CodeIntelligenceLanguage;
  if (resolveCodeIntelligenceLanguage(normalizedPath) !== language) {
    fail('file language');
  }
  const parser = validateParser(file.parser as CodeIntelligenceParserEvidence);
  const registered = CODE_INTELLIGENCE_PARSER_REGISTRY[language];
  if (parser.name !== registered.primaryParser && parser.name !== registered.fallbackParser) {
    fail('registered parser');
  }
  const result = Object.freeze({
    filePath: normalizedPath,
    language,
    sourceRevision: digest(file.sourceRevision, 'source revision', SHA, 40),
    parser,
  });
  if (!authority || typeof authority.verifyParserEvidence !== 'function') {
    fail('parser authority');
  }
  if (authority.verifyParserEvidence(result) !== true) fail('parser attestation');
  return result;
}

function validateEntity(
  rawEntity: CodeIntelligenceEntity,
  filePaths: ReadonlySet<string>,
): Readonly<CodeIntelligenceEntity> {
  const entity = record(rawEntity, 'entity');
  exact(
    entity,
    ['id', 'kind', 'name', 'filePath', 'startLine', 'endLine'],
    ['id', 'kind', 'name', 'filePath', 'startLine', 'endLine'],
    'entity',
  );
  if (!(CODE_INTELLIGENCE_ENTITY_KINDS as readonly unknown[]).includes(entity.kind)) {
    fail('entity kind');
  }
  const entityPath = filePath(entity.filePath);
  if (!filePaths.has(entityPath)) fail('entity file');
  if (
    !Number.isSafeInteger(entity.startLine) ||
    !Number.isSafeInteger(entity.endLine) ||
    (entity.startLine as number) < 1 ||
    (entity.endLine as number) < (entity.startLine as number)
  ) {
    fail('entity span');
  }
  return Object.freeze({
    id: stableId(entity.id, 'entity ID'),
    kind: entity.kind as CodeIntelligenceEntityKind,
    name: text(entity.name, 'entity name', 1_000),
    filePath: entityPath,
    startLine: entity.startLine as number,
    endLine: entity.endLine as number,
  });
}

function validateRelationship(
  rawRelationship: CodeIntelligenceRelationship,
  entityIds: ReadonlySet<string>,
): Readonly<CodeIntelligenceRelationship & { heuristic: boolean }> {
  const relationship = record(rawRelationship, 'relationship');
  exact(
    relationship,
    ['id', 'kind', 'fromEntityId', 'toEntityId', 'evidence', 'confidence'],
    ['id', 'kind', 'fromEntityId', 'toEntityId', 'evidence', 'confidence'],
    'relationship',
  );
  if (!(CODE_INTELLIGENCE_RELATIONSHIP_KINDS as readonly unknown[]).includes(relationship.kind)) {
    fail('relationship kind');
  }
  if (
    !['ast', 'type_checker', 'framework', 'heuristic'].includes(relationship.evidence as string)
  ) {
    fail('relationship evidence');
  }
  const fromEntityId = stableId(relationship.fromEntityId, 'source entity ID');
  const toEntityId = stableId(relationship.toEntityId, 'target entity ID');
  if (!entityIds.has(fromEntityId) || !entityIds.has(toEntityId)) {
    fail('relationship endpoint');
  }
  if (
    typeof relationship.confidence !== 'number' ||
    !Number.isFinite(relationship.confidence) ||
    relationship.confidence <= 0 ||
    relationship.confidence > 1
  ) {
    fail('relationship confidence');
  }
  const evidence = relationship.evidence as CodeIntelligenceRelationshipEvidence;
  if (evidence === 'heuristic' && relationship.confidence >= 1) {
    fail('heuristic confidence');
  }
  if (relationship.kind === 'calls' && evidence !== 'ast' && evidence !== 'type_checker') {
    fail('call inference');
  }
  if (relationship.kind === 'calls' && relationship.confidence < 0.9) {
    fail('call confidence');
  }
  return Object.freeze({
    id: stableId(relationship.id, 'relationship ID'),
    kind: relationship.kind as CodeIntelligenceRelationshipKind,
    fromEntityId,
    toEntityId,
    evidence,
    confidence: relationship.confidence,
    heuristic: evidence === 'heuristic',
  });
}

export function buildCodeIntelligenceGraph(
  rawInput: CodeIntelligenceGraphInput,
  authority: CodeIntelligenceParserAuthority,
) {
  const input = record(clone(rawInput, 'input'), 'input');
  exact(
    input,
    ['files', 'entities', 'relationships'],
    ['files', 'entities', 'relationships'],
    'input',
  );
  if (
    !Array.isArray(input.files) ||
    !Array.isArray(input.entities) ||
    !Array.isArray(input.relationships)
  ) {
    fail('collections');
  }
  const files = (input.files as CodeIntelligenceFile[]).map((file) =>
    validateFile(file, authority),
  );
  const filePaths = new Set(files.map((file) => file.filePath));
  if (filePaths.size !== files.length) fail('duplicate file');
  const entities = (input.entities as CodeIntelligenceEntity[]).map((entity) =>
    validateEntity(entity, filePaths),
  );
  const entityIds = new Set(entities.map((entity) => entity.id));
  if (entityIds.size !== entities.length) fail('duplicate entity');
  const relationships = (input.relationships as CodeIntelligenceRelationship[]).map(
    (relationship) => validateRelationship(relationship, entityIds),
  );
  if (new Set(relationships.map((relationship) => relationship.id)).size !== relationships.length) {
    fail('duplicate relationship');
  }
  return Object.freeze({
    files: Object.freeze(files),
    entities: Object.freeze(entities),
    relationships: Object.freeze(relationships),
    parserBacked: true as const,
    regexOnlySymbolExtraction: false as const,
    executable: false as const,
  });
}
