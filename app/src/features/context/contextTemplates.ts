export const CONTEXT_TEMPLATE_VARIABLES = Object.freeze([
  'title',
  'date',
  'time',
  'project',
  'context_map',
  'active_file',
  'github_repository',
  'github_branch',
  'github_sha',
  'active_agent',
  'active_terminal',
] as const);

export const CONTEXT_TEMPLATE_DEFAULT_SLOTS = Object.freeze([
  'standard',
  'daily',
  'generated_overview',
] as const);

export type ContextTemplateVariable = (typeof CONTEXT_TEMPLATE_VARIABLES)[number];
export type ContextTemplateDefaultSlot = (typeof CONTEXT_TEMPLATE_DEFAULT_SLOTS)[number];
export type ContextTemplateVariables = Partial<Record<ContextTemplateVariable, string>>;

export interface BuiltinContextTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
  origin: 'builtin';
  status: 'active';
}

export interface UserContextTemplate {
  id: string;
  accountId: string;
  name: string;
  description: string;
  body: string;
  origin: 'user';
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface ContextTemplateLibrary {
  version: 1;
  accountId: string;
  updatedAt: number;
  userTemplates: ReadonlyArray<Readonly<UserContextTemplate>>;
  defaults: Readonly<Partial<Record<ContextTemplateDefaultSlot, string>>>;
}

export type ContextTemplateOperation =
  | {
      kind: 'create';
      id: string;
      name: string;
      description: string;
      body: string;
      now: number;
    }
  | {
      kind: 'edit';
      templateId: string;
      description: string;
      body: string;
      now: number;
    }
  | { kind: 'rename'; templateId: string; name: string; now: number }
  | {
      kind: 'duplicate';
      templateId: string;
      id: string;
      name: string;
      now: number;
    }
  | { kind: 'archive'; templateId: string; now: number }
  | {
      kind: 'set_default';
      slot: ContextTemplateDefaultSlot;
      templateId: string | null;
      now: number;
    };

export interface RenderedContextTemplate {
  content: string;
  usedVariables: ReadonlyArray<ContextTemplateVariable>;
  executable: false;
}

export interface ExportedContextTemplate {
  fileName: string;
  mimeType: 'text/markdown';
  content: string;
  executable: false;
}

const BUILTIN_DEFINITIONS = [
  {
    id: 'feature-specification',
    name: 'Feature Specification',
    description: 'Define a feature, its constraints, behavior, acceptance evidence, and rollout.',
    body: `# {{title}}

**Project:** {{project}}  
**Date:** {{date}}  
**Context Map:** {{context_map}}

## Problem

Describe the user problem, current limitation, and evidence that the work is needed.

## Proposed Behavior

State the user-visible behavior, boundaries, failure modes, and non-goals.

## Acceptance Criteria

- [ ] Primary behavior is implemented and connected.
- [ ] Security, persistence, and accessibility risks are covered.
- [ ] Focused tests and rollout evidence are recorded.
`,
  },
  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Capture a reproducible defect with impact, evidence, and verification.',
    body: `# {{title}}

**Project:** {{project}}  
**Observed:** {{date}} {{time}}  
**Active file:** {{active_file}}

## Impact

Describe who is affected, severity, frequency, and whether data or security is at risk.

## Reproduction

1. Record the exact starting state.
2. List the smallest reliable steps.
3. Record expected and actual behavior.

## Evidence and Fix Verification

Attach logs, screenshots, failing tests, root cause, corrected behavior, and regression checks.
`,
  },
  {
    id: 'security-finding',
    name: 'Security Finding',
    description: 'Document a scoped security issue without exposing sensitive material.',
    body: `# {{title}}

**Repository:** {{github_repository}}  
**Branch:** {{github_branch}}  
**Commit:** {{github_sha}}

## Finding

Describe the trust boundary, vulnerable behavior, realistic impact, and affected versions.

## Reproduction and Evidence

Use redacted, non-destructive evidence. Do not include credentials, private user data, or live exploit payloads.

## Remediation

Define the smallest safe correction, negative tests, migration implications, and disclosure or release steps.
`,
  },
  {
    id: 'architecture-decision-record',
    name: 'Architecture Decision Record',
    description: 'Record an architectural choice, alternatives, consequences, and review triggers.',
    body: `# {{title}}

**Status:** Proposed  
**Date:** {{date}}  
**Project:** {{project}}

## Context

Explain the forces, constraints, existing contracts, and decision deadline.

## Decision

State the selected architecture precisely, including ownership and dependency direction.

## Alternatives Considered

Record viable alternatives and why they were not selected.

## Consequences

List benefits, tradeoffs, migration work, observability needs, and conditions that should trigger review.
`,
  },
  {
    id: 'release-checklist',
    name: 'Release Checklist',
    description: 'Track release readiness, rollback evidence, communication, and follow-up.',
    body: `# {{title}}

**Repository:** {{github_repository}}  
**Branch:** {{github_branch}}  
**Candidate SHA:** {{github_sha}}  
**Date:** {{date}}

## Readiness

- [ ] Required tests, builds, security checks, and migrations pass.
- [ ] Versioning, artifacts, signatures, and release notes are correct.
- [ ] Rollback procedure and data compatibility are verified.

## Release

- [ ] Deployment authority is confirmed.
- [ ] Monitoring and user communication are ready.
- [ ] Post-release smoke checks and owners are assigned.
`,
  },
  {
    id: 'research-note',
    name: 'Research Note',
    description: 'Preserve a question, sources, observations, uncertainty, and next steps.',
    body: `# {{title}}

**Project:** {{project}}  
**Date:** {{date}}  
**Context Map:** {{context_map}}

## Question

State the decision or uncertainty this research should resolve.

## Sources and Observations

For each source, record provenance, date, relevant evidence, limitations, and contradictions.

## Synthesis

Separate verified facts from inference. Record confidence and unresolved questions.

## Next Steps

List the smallest experiments, decisions, or follow-up research needed.
`,
  },
  {
    id: 'meeting-note',
    name: 'Meeting Note',
    description: 'Capture agenda, decisions, actions, and unresolved questions.',
    body: `# {{title}}

**Date:** {{date}} {{time}}  
**Project:** {{project}}  
**Active agent:** {{active_agent}}

## Attendees and Agenda

List participants, roles, desired outcomes, and agenda items.

## Notes

Capture concise evidence and discussion without presenting speculation as a decision.

## Decisions

Record each decision, owner, rationale, and effective date.

## Actions

- [ ] Action, owner, due date, and verification evidence.

## Open Questions

List unresolved issues and the person responsible for follow-up.
`,
  },
  {
    id: 'terminal-investigation',
    name: 'Terminal Investigation',
    description: 'Document commands, observed output, hypotheses, and safe conclusions.',
    body: `# {{title}}

**Terminal:** {{active_terminal}}  
**Project:** {{project}}  
**Date:** {{date}} {{time}}

## Symptom

Describe the failure or behavior being investigated.

## Commands and Observations

Record commands as text and summarize relevant output. Redact credentials and private paths.

## Hypotheses

List hypotheses in priority order with evidence for and against each.

## Conclusion

Record the verified root cause, applied correction, focused checks, and remaining risk.
`,
  },
  {
    id: 'github-pr-review',
    name: 'GitHub PR Review',
    description: 'Review a pull request for correctness, security, tests, and integration risk.',
    body: `# GitHub PR Review: {{title}}

**Repository:** {{github_repository}}  
**Branch:** {{github_branch}}  
**SHA:** {{github_sha}}

## Scope

Summarize intended behavior, affected contracts, and files requiring close review.

## Findings

Classify each actionable finding by severity with exact evidence and a concrete correction.

## Verification

Record focused tests, security checks, migration review, and integration behavior.

## Decision

State ready, changes requested, or blocked, with remaining risks and owners.
`,
  },
  {
    id: 'model-comparison',
    name: 'Model Comparison',
    description: 'Compare models against the same task, evidence, cost, and quality criteria.',
    body: `# {{title}}

**Project:** {{project}}  
**Date:** {{date}}  
**Active agent:** {{active_agent}}

## Evaluation Contract

Define the exact prompt, context, tools, temperature, timeout, and scoring rubric.

## Results

Record correctness, instruction following, latency, token usage, cost, safety, and failure modes for each model.

## Analysis

Separate measured facts from subjective preference and identify statistically weak conclusions.

## Recommendation

Choose the best fit by workload and record fallback or routing conditions.
`,
  },
  {
    id: 'prompt-forge-goal',
    name: 'Prompt Forge Goal',
    description: 'Specify an authorized Prompt Forge objective and its acceptance evidence.',
    body: `# {{title}}

**Project:** {{project}}  
**Context Map:** {{context_map}}  
**Date:** {{date}}

## Objective

State the concrete user outcome, authorized scope, and source-of-truth documents.

## Requirements

List behavior, quality, security, compatibility, and documentation requirements.

## Exclusions and Hard Gates

Record actions that are out of scope or require explicit authority.

## Verification

Define focused development checks and the exhaustive final evidence required before completion.
`,
  },
  {
    id: 'daily-development-log',
    name: 'Daily Development Log',
    description: 'Summarize verified development progress and next actions for one local day.',
    body: `# Daily Development Log — {{date}}

**Project:** {{project}}  
**Context Map:** {{context_map}}  
**Active branch:** {{github_branch}}

## Completed

Record meaningful completed work with links to commits, tests, or other authoritative evidence.

## Decisions and Findings

Capture decisions, bugs, terminal findings, research, and release progress.

## Verification

List focused checks that passed and any deferred final checks.

## Next

Record the smallest unblocked next actions without claiming unfinished work is complete.
`,
  },
  {
    id: 'canvas-planning-note',
    name: 'Canvas Planning Note',
    description:
      'Plan a visual canvas with goals, nodes, connections, layout, and review criteria.',
    body: `# {{title}}

**Project:** {{project}}  
**Context Map:** {{context_map}}  
**Date:** {{date}}

## Canvas Goal

Describe the decision, workflow, or system the canvas should make easier to understand.

## Nodes

List required cards, artifacts, owners, states, and source references.

## Connections

Define relationship meaning, direction, and any grouping or swimlane rules.

## Layout and Interaction

Record hierarchy, navigation, accessibility, zoom, selection, and responsive behavior.

## Review Criteria

Define correctness, clarity, performance, and completion evidence.
`,
  },
] as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const SINGLE_LINE_FORBIDDEN =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const BODY_FORBIDDEN =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const TEMPLATE_TOKEN = /\{\{([^{}]*)\}\}/gu;
const MAX_BODY_CHARS = 100_000;
const MAX_RENDERED_CHARS = 250_000;
const MAX_USER_TEMPLATES = 500;
const MAX_BOUNDARY_DEPTH = 8;

function fail(reason: string): never {
  throw new Error(`Invalid Context template ${reason}.`);
}

function safeLine(value: unknown, reason: string, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    SINGLE_LINE_FORBIDDEN.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = safeLine(value, reason, 100);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function timestamp(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(reason);
  return value as number;
}

function safeBody(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_BODY_CHARS ||
    value.includes('\r') ||
    BODY_FORBIDDEN.test(value) ||
    value.includes('${') ||
    value.includes('<%')
  ) {
    fail('body');
  }
  const tokens = [...value.matchAll(TEMPLATE_TOKEN)];
  const braces = value.match(/\{\{|\}\}/gu) ?? [];
  if (braces.length !== tokens.length * 2) fail('variable syntax');
  for (const token of tokens) {
    if (!(CONTEXT_TEMPLATE_VARIABLES as readonly string[]).includes(token[1] ?? '')) {
      fail('variable');
    }
  }
  return value;
}

function freezeBuiltin(
  definition: (typeof BUILTIN_DEFINITIONS)[number],
): Readonly<BuiltinContextTemplate> {
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    body: definition.body,
    origin: 'builtin',
    status: 'active',
  });
}

export const BUILTIN_CONTEXT_TEMPLATES: ReadonlyArray<Readonly<BuiltinContextTemplate>> =
  Object.freeze(BUILTIN_DEFINITIONS.map(freezeBuiltin));

const BUILTIN_BY_ID = new Map(BUILTIN_CONTEXT_TEMPLATES.map((template) => [template.id, template]));

function assertClosedBoundary(value: unknown, reason: string, depth = 0): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return;
  if (typeof value === 'function' || depth > MAX_BOUNDARY_DEPTH) fail(reason);

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
    if (prototype !== Array.prototype || value.length > MAX_USER_TEMPLATES) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosedBoundary(descriptor.value, reason, depth + 1);
    }
    return;
  }

  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosedBoundary(descriptor.value, reason, depth + 1);
  }
}

function cloneBoundary<T>(value: T, reason: string): T {
  try {
    assertClosedBoundary(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function plainRecord(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], reason: string): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) fail(reason);
}

function parseTemplateVariables(raw: ContextTemplateVariables): Record<string, unknown> {
  assertClosedBoundary(raw, 'variables');
  const original = plainRecord(raw, 'variables');
  exactKeys(original, CONTEXT_TEMPLATE_VARIABLES, 'variables');
  for (const key of Object.keys(original) as ContextTemplateVariable[]) {
    const descriptor = Object.getOwnPropertyDescriptor(original, key);
    if (!descriptor || !('value' in descriptor)) fail('variables');
    safeLine(descriptor.value, key, 4_096);
  }
  return plainRecord(cloneBoundary(raw, 'variables'), 'variables');
}

function parseUserTemplate(value: unknown, accountId: string): Readonly<UserContextTemplate> {
  const record = plainRecord(value, 'user template');
  exactKeys(
    record,
    [
      'id',
      'accountId',
      'name',
      'description',
      'body',
      'origin',
      'status',
      'createdAt',
      'updatedAt',
    ],
    'user template',
  );
  if (record.accountId !== accountId || record.origin !== 'user') fail('account scope');
  if (record.status !== 'active' && record.status !== 'archived') fail('status');
  const createdAt = timestamp(record.createdAt, 'created time');
  const updatedAt = timestamp(record.updatedAt, 'updated time');
  if (updatedAt < createdAt) fail('updated time');
  return Object.freeze({
    id: stableId(record.id, 'ID'),
    accountId,
    name: safeLine(record.name, 'name', 120),
    description: safeLine(record.description, 'description', 500),
    body: safeBody(record.body),
    origin: 'user',
    status: record.status,
    createdAt,
    updatedAt,
  });
}

function parseLibrary(raw: ContextTemplateLibrary): ContextTemplateLibrary {
  const record = plainRecord(cloneBoundary(raw, 'library'), 'library');
  exactKeys(record, ['version', 'accountId', 'updatedAt', 'userTemplates', 'defaults'], 'library');
  if (record.version !== 1 || !Array.isArray(record.userTemplates)) fail('library');
  if (record.userTemplates.length > MAX_USER_TEMPLATES) fail('library');
  const accountId = stableId(record.accountId, 'account ID');
  const updatedAt = timestamp(record.updatedAt, 'library updated time');
  const userTemplates = record.userTemplates.map((template) =>
    parseUserTemplate(template, accountId),
  );
  const ids = new Set<string>();
  const names = new Set(
    BUILTIN_CONTEXT_TEMPLATES.map(({ name }) => name.toLocaleLowerCase('en-US')),
  );
  for (const template of userTemplates) {
    const name = template.name.toLocaleLowerCase('en-US');
    if (ids.has(template.id) || BUILTIN_BY_ID.has(template.id) || names.has(name)) {
      fail('duplicate template');
    }
    if (template.updatedAt > updatedAt) fail('library updated time');
    ids.add(template.id);
    names.add(name);
  }

  const rawDefaults = plainRecord(record.defaults, 'defaults');
  exactKeys(rawDefaults, CONTEXT_TEMPLATE_DEFAULT_SLOTS, 'defaults');
  const defaults: Partial<Record<ContextTemplateDefaultSlot, string>> = {};
  for (const slot of CONTEXT_TEMPLATE_DEFAULT_SLOTS) {
    if (rawDefaults[slot] === undefined) continue;
    const templateId = stableId(rawDefaults[slot], 'default template ID');
    const template =
      BUILTIN_BY_ID.get(templateId) ?? userTemplates.find(({ id }) => id === templateId);
    if (!template || template.status !== 'active') fail('default template');
    defaults[slot] = templateId;
  }
  return Object.freeze({
    version: 1,
    accountId,
    updatedAt,
    userTemplates: Object.freeze(userTemplates),
    defaults: Object.freeze(defaults),
  });
}

export function createContextTemplateLibrary(accountId: string): ContextTemplateLibrary {
  return parseLibrary({
    version: 1,
    accountId: stableId(accountId, 'account ID'),
    updatedAt: 0,
    userTemplates: [],
    defaults: {},
  });
}

function allTemplates(library: ContextTemplateLibrary) {
  return [...BUILTIN_CONTEXT_TEMPLATES, ...library.userTemplates];
}

function findTemplate(library: ContextTemplateLibrary, templateId: string) {
  const id = stableId(templateId, 'template ID');
  return allTemplates(library).find((template) => template.id === id);
}

function assertUnique(
  library: ContextTemplateLibrary,
  id: string,
  name: string,
  excludedId?: string,
): void {
  const normalizedName = name.toLocaleLowerCase('en-US');
  if (
    allTemplates(library).some(
      (template) =>
        template.id !== excludedId &&
        (template.id === id || template.name.toLocaleLowerCase('en-US') === normalizedName),
    )
  ) {
    fail('duplicate template');
  }
}

function freezeLibrary(
  library: ContextTemplateLibrary,
  templates: readonly UserContextTemplate[],
  defaults: Partial<Record<ContextTemplateDefaultSlot, string>> = library.defaults,
  updatedAt: number = library.updatedAt,
): ContextTemplateLibrary {
  return parseLibrary({
    version: 1,
    accountId: library.accountId,
    updatedAt,
    userTemplates: [...templates],
    defaults: { ...defaults },
  });
}

export function applyContextTemplateOperation(
  rawLibrary: ContextTemplateLibrary,
  rawOperation: ContextTemplateOperation,
): ContextTemplateLibrary {
  const library = parseLibrary(rawLibrary);
  const operation = plainRecord(cloneBoundary(rawOperation, 'operation'), 'operation');
  const now = timestamp(operation.now, 'operation time');
  if (now < library.updatedAt) fail('operation time');

  if (operation.kind === 'create') {
    exactKeys(operation, ['kind', 'id', 'name', 'description', 'body', 'now'], 'operation');
    const id = stableId(operation.id, 'ID');
    const name = safeLine(operation.name, 'name', 120);
    assertUnique(library, id, name);
    const template = parseUserTemplate(
      {
        id,
        accountId: library.accountId,
        name,
        description: safeLine(operation.description, 'description', 500),
        body: safeBody(operation.body),
        origin: 'user',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      library.accountId,
    );
    return freezeLibrary(library, [...library.userTemplates, template], library.defaults, now);
  }

  if (operation.kind === 'set_default') {
    exactKeys(operation, ['kind', 'slot', 'templateId', 'now'], 'operation');
    if (!(CONTEXT_TEMPLATE_DEFAULT_SLOTS as readonly unknown[]).includes(operation.slot)) {
      fail('default slot');
    }
    const slot = operation.slot as ContextTemplateDefaultSlot;
    const defaults = { ...library.defaults };
    if (operation.templateId === null) {
      delete defaults[slot];
    } else {
      const template = findTemplate(library, stableId(operation.templateId, 'template ID'));
      if (!template || template.status !== 'active') fail('default template');
      defaults[slot] = template.id;
    }
    return freezeLibrary(library, library.userTemplates, defaults, now);
  }

  const templateId = stableId(operation.templateId, 'template ID');
  const index = library.userTemplates.findIndex(({ id }) => id === templateId);
  const existing = library.userTemplates[index];

  if (operation.kind === 'duplicate') {
    exactKeys(operation, ['kind', 'templateId', 'id', 'name', 'now'], 'operation');
    const source = findTemplate(library, templateId);
    if (!source || source.status !== 'active') fail('source template');
    const id = stableId(operation.id, 'ID');
    const name = safeLine(operation.name, 'name', 120);
    assertUnique(library, id, name);
    const duplicate = parseUserTemplate(
      {
        id,
        accountId: library.accountId,
        name,
        description: source.description,
        body: source.body,
        origin: 'user',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      library.accountId,
    );
    return freezeLibrary(library, [...library.userTemplates, duplicate], library.defaults, now);
  }

  if (!existing || index < 0) fail('user template');
  if (existing.status !== 'active') fail('archived template');
  if (now < existing.updatedAt) fail('operation time');
  const templates = [...library.userTemplates];

  if (operation.kind === 'edit') {
    exactKeys(operation, ['kind', 'templateId', 'description', 'body', 'now'], 'operation');
    templates[index] = {
      ...existing,
      description: safeLine(operation.description, 'description', 500),
      body: safeBody(operation.body),
      updatedAt: now,
    };
  } else if (operation.kind === 'rename') {
    exactKeys(operation, ['kind', 'templateId', 'name', 'now'], 'operation');
    const name = safeLine(operation.name, 'name', 120);
    assertUnique(library, existing.id, name, existing.id);
    templates[index] = { ...existing, name, updatedAt: now };
  } else if (operation.kind === 'archive') {
    exactKeys(operation, ['kind', 'templateId', 'now'], 'operation');
    templates[index] = { ...existing, status: 'archived', updatedAt: now };
    const defaults = { ...library.defaults };
    for (const slot of CONTEXT_TEMPLATE_DEFAULT_SLOTS) {
      if (defaults[slot] === existing.id) delete defaults[slot];
    }
    return freezeLibrary(library, templates, defaults, now);
  } else {
    fail('operation');
  }
  return freezeLibrary(library, templates, library.defaults, now);
}

export function renderContextTemplate(
  rawBody: string,
  rawVariables: ContextTemplateVariables,
): Readonly<RenderedContextTemplate> {
  const body = safeBody(rawBody);
  const variables = parseTemplateVariables(rawVariables);
  const used: ContextTemplateVariable[] = [];
  const replacements = new Map<ContextTemplateVariable, string>();
  let projectedLength = body.length;
  for (const match of body.matchAll(TEMPLATE_TOKEN)) {
    const name = match[1] as ContextTemplateVariable;
    let value = replacements.get(name);
    if (value === undefined) {
      value = safeLine(variables[name], name, 4_096);
      replacements.set(name, value);
      used.push(name);
    }
    projectedLength += value.length - match[0].length;
    if (projectedLength > MAX_RENDERED_CHARS) fail('rendered body');
  }
  const content = body.replace(TEMPLATE_TOKEN, (_token, rawName: string) => {
    const name = rawName as ContextTemplateVariable;
    return replacements.get(name) ?? fail(name);
  });
  return Object.freeze({
    content,
    usedVariables: Object.freeze(used),
    executable: false,
  });
}

export function exportContextTemplate(
  rawLibrary: ContextTemplateLibrary,
  templateId: string,
): Readonly<ExportedContextTemplate> {
  const library = parseLibrary(rawLibrary);
  const template = findTemplate(library, templateId);
  if (!template) fail('template');
  if (template.status !== 'active') fail('archived template');
  return Object.freeze({
    fileName: `${template.id}.md`,
    mimeType: 'text/markdown',
    content: template.body,
    executable: false,
  });
}
