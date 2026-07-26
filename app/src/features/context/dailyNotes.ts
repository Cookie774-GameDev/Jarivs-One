export const DAILY_CONTEXT_ACTIVITY_KINDS = Object.freeze([
  'development_log',
  'decision',
  'bug',
  'terminal_finding',
  'completed_work',
  'meeting_note',
  'research',
  'release_progress',
] as const);

export const DAILY_CONTEXT_DATE_FORMATS = Object.freeze([
  'YYYY-MM-DD',
  'YYYY_MM_DD',
  'MM-DD-YYYY',
  'DD-MM-YYYY',
] as const);

export const DAILY_CONTEXT_AUTO_OPEN_MODES = Object.freeze([
  'never',
  'app_start',
  'project_open',
] as const);

export type DailyContextActivityKind = (typeof DAILY_CONTEXT_ACTIVITY_KINDS)[number];
export type DailyContextDateFormat = (typeof DAILY_CONTEXT_DATE_FORMATS)[number];
export type DailyContextAutoOpen = (typeof DAILY_CONTEXT_AUTO_OPEN_MODES)[number];
export type DailyContextProjectScope = { kind: 'project'; projectId: string } | { kind: 'account' };

export interface DailyContextSettings {
  accountId: string;
  mapId: string;
  folder: string;
  dateFormat: DailyContextDateFormat;
  templateId?: string;
  autoOpen: DailyContextAutoOpen;
  projectScope: DailyContextProjectScope;
}

export interface DailyContextPlanRequest {
  timestampMs: number;
  /** Minutes east of UTC, for example Chicago summer time is -300. */
  utcOffsetMinutes: number;
  projectId: string;
}

export interface DailyContextNotePlan {
  operation: 'open';
  accountId: string;
  mapId: string;
  projectId: string;
  dailyDate: string;
  title: string;
  relativePath: string;
  templateId?: string;
  autoOpen: DailyContextAutoOpen;
  writeAuthorized: false;
  executable: false;
}

export interface DailyContextChange {
  id: string;
  kind: DailyContextActivityKind;
  summary: string;
  projectId: string;
  occurredAt: number;
  source: {
    runId: string;
    eventSeq: number;
    eventIdempotencyKey: string;
    eventType: DailyContextActivityEvent['type'];
  };
}

export interface DailyContextChangeReference {
  runId: string;
  eventSeq: number;
}

export interface DailyContextActivityRun {
  id: string;
  accountId: string;
  projectId?: string;
  status: string;
  completedAt?: number;
}

export interface DailyContextActivityEvent {
  runId: string;
  seq: number;
  idempotencyKey: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  title: string;
  safeSummary?: string;
  createdAt: number;
}

/** Trusted production ports are the account-scoped JARVIS run/event repositories. */
export interface DailyContextActivityRepositories {
  run: {
    getById(accountId: string, runId: string): Promise<DailyContextActivityRun | undefined>;
  };
  event: {
    getBySeq(
      accountId: string,
      runId: string,
      seq: number,
    ): Promise<DailyContextActivityEvent | undefined>;
  };
}

export type DailyContextUserOperation =
  | {
      operation: 'open';
      source: 'terminal' | 'slash';
      executable: false;
    }
  | {
      operation: 'add';
      source: 'terminal' | 'slash';
      content: string;
      authorization: 'direct_user_action';
      executable: false;
    };

export interface DailyContextJarvisPlan {
  action: 'offer';
  accountId: string;
  mapId: string;
  projectId: string;
  dailyDate: string;
  relativePath: string;
  message: string;
  changes: ReadonlyArray<Readonly<DailyContextChange>>;
  writeAuthorized: false;
  requiresApproval: true;
  executable: false;
}

export const DAILY_CONTEXT_SLASH_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'open',
    operation: 'open',
    label: 'Open today’s Context Note',
    description: 'Create or open the Daily Context Note for the current local date.',
    requiresText: false,
  }),
  Object.freeze({
    id: 'add',
    operation: 'add',
    label: 'Add to today’s Context Note',
    description: 'Add explicitly supplied text to today’s Daily Context Note.',
    requiresText: true,
  }),
] as const);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const CONTROL_OR_DIRECTIONAL =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const WINDOWS_INVALID_PATH_CHARACTERS = /[<>:"|?*]/u;
const WINDOWS_RESERVED_PATH_SEGMENT =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu;
const MAX_ENTRY_CHARS = 4_000;
const MAX_CHANGES = 100;
const MAX_BOUNDARY_DEPTH = 8;
const DAILY_CONTEXT_EVENT_TYPES = new Set<DailyContextActivityEvent['type']>([
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
]);
const DAILY_CONTEXT_KIND_BY_EVENT_TYPE: Readonly<
  Partial<Record<DailyContextActivityEvent['type'], DailyContextActivityKind>>
> = Object.freeze({
  run_state: 'completed_work',
  context: 'research',
  retrieval: 'research',
  tool: 'development_log',
  terminal: 'terminal_finding',
  approval: 'decision',
  artifact: 'release_progress',
  message: 'meeting_note',
  warning: 'bug',
  error: 'bug',
});
const TERMINAL_ADD_PREFIX = 'vibespace daily add ';
const MAX_TERMINAL_COMMAND_CHARS = TERMINAL_ADD_PREFIX.length + 2 + MAX_ENTRY_CHARS * 6;

function fail(reason: string): never {
  throw new Error(`Invalid Daily Context ${reason}.`);
}

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
    if (prototype !== Array.prototype || value.length > MAX_CHANGES) fail(reason);
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

function boundaryClone<T>(value: T, reason: string): T {
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

function safeText(value: unknown, reason: string, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    CONTROL_OR_DIRECTIONAL.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = safeText(value, reason, 200);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function safeTimestamp(value: unknown, reason: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail(reason);
  }
  return value;
}

function safeOffset(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < -840 || (value as number) > 840) {
    fail('UTC offset');
  }
  return value as number;
}

function portableFolder(value: unknown): string {
  const folder = safeText(value, 'folder', 1_024);
  if (
    folder.includes('\\') ||
    folder.startsWith('/') ||
    /^[A-Za-z]:/u.test(folder) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(folder)
  ) {
    fail('folder');
  }
  const segments = folder.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        WINDOWS_INVALID_PATH_CHARACTERS.test(segment) ||
        /[. ]$/u.test(segment) ||
        WINDOWS_RESERVED_PATH_SEGMENT.test(segment),
    )
  ) {
    fail('folder');
  }
  return folder;
}

function validateRequest(raw: DailyContextPlanRequest): DailyContextPlanRequest {
  const request = plainRecord(boundaryClone(raw, 'request'), 'request');
  exactKeys(request, ['timestampMs', 'utcOffsetMinutes', 'projectId'], 'request');
  return {
    timestampMs: safeTimestamp(request.timestampMs, 'timestamp'),
    utcOffsetMinutes: safeOffset(request.utcOffsetMinutes),
    projectId: stableId(request.projectId, 'project ID'),
  };
}

function validateSettings(raw: DailyContextSettings): DailyContextSettings {
  const settings = plainRecord(boundaryClone(raw, 'settings'), 'settings');
  exactKeys(
    settings,
    ['accountId', 'mapId', 'folder', 'dateFormat', 'templateId', 'autoOpen', 'projectScope'],
    'settings',
  );
  if (!(DAILY_CONTEXT_DATE_FORMATS as readonly unknown[]).includes(settings.dateFormat)) {
    fail('date format');
  }
  if (!(DAILY_CONTEXT_AUTO_OPEN_MODES as readonly unknown[]).includes(settings.autoOpen)) {
    fail('auto-open setting');
  }

  const scope = plainRecord(settings.projectScope, 'project scope');
  if (scope.kind === 'project') {
    exactKeys(scope, ['kind', 'projectId'], 'project scope');
  } else if (scope.kind === 'account') {
    exactKeys(scope, ['kind'], 'project scope');
  } else {
    fail('project scope');
  }

  return {
    accountId: stableId(settings.accountId, 'account ID'),
    mapId: stableId(settings.mapId, 'map ID'),
    folder: portableFolder(settings.folder),
    dateFormat: settings.dateFormat as DailyContextDateFormat,
    ...(settings.templateId === undefined
      ? {}
      : { templateId: stableId(settings.templateId, 'template ID') }),
    autoOpen: settings.autoOpen as DailyContextAutoOpen,
    projectScope:
      scope.kind === 'project'
        ? { kind: 'project', projectId: stableId(scope.projectId, 'project scope') }
        : { kind: 'account' },
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function dailyContextLocalDate(timestampMs: number, utcOffsetMinutes: number): string {
  const timestamp = safeTimestamp(timestampMs, 'timestamp');
  const offset = safeOffset(utcOffsetMinutes);
  const shiftedTimestamp = safeTimestamp(timestamp + offset * 60_000, 'timestamp');
  const local = new Date(shiftedTimestamp);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}

export function dailyContextActivityKindForEventType(
  eventType: DailyContextActivityEvent['type'],
): DailyContextActivityKind | null {
  if (typeof eventType !== 'string' || !DAILY_CONTEXT_EVENT_TYPES.has(eventType)) return null;
  return DAILY_CONTEXT_KIND_BY_EVENT_TYPE[eventType] ?? null;
}

function formatDailyDate(date: string, format: DailyContextDateFormat): string {
  const [year, month, day] = date.split('-');
  switch (format) {
    case 'YYYY-MM-DD':
      return date;
    case 'YYYY_MM_DD':
      return `${year}_${month}_${day}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
  }
}

function assertScope(settings: DailyContextSettings, projectId: string): void {
  if (settings.projectScope.kind === 'project' && settings.projectScope.projectId !== projectId) {
    fail('project scope');
  }
}

export function buildDailyContextNotePlan(
  rawSettings: DailyContextSettings,
  rawRequest: DailyContextPlanRequest,
): Readonly<DailyContextNotePlan> {
  const settings = validateSettings(rawSettings);
  const request = validateRequest(rawRequest);
  assertScope(settings, request.projectId);
  const dailyDate = dailyContextLocalDate(request.timestampMs, request.utcOffsetMinutes);

  return Object.freeze({
    operation: 'open',
    accountId: settings.accountId,
    mapId: settings.mapId,
    projectId: request.projectId,
    dailyDate,
    title: `Daily Context — ${dailyDate}`,
    relativePath: `${settings.folder}/${formatDailyDate(dailyDate, settings.dateFormat)}.md`,
    ...(settings.templateId === undefined ? {} : { templateId: settings.templateId }),
    autoOpen: settings.autoOpen,
    writeAuthorized: false,
    executable: false,
  });
}

export function shouldAutoOpenDailyContext(
  rawSettings: DailyContextSettings,
  event: 'app_start' | 'project_open',
  rawProjectId: string,
): boolean {
  const settings = validateSettings(rawSettings);
  const projectId = stableId(rawProjectId, 'project ID');
  if (event !== 'app_start' && event !== 'project_open') fail('auto-open event');
  if (settings.projectScope.kind === 'project' && settings.projectScope.projectId !== projectId) {
    return false;
  }
  return settings.autoOpen === event;
}

function addOperation(
  source: 'terminal' | 'slash',
  content: unknown,
): Readonly<DailyContextUserOperation> {
  return Object.freeze({
    operation: 'add',
    source,
    content: safeText(content, 'entry text', MAX_ENTRY_CHARS),
    authorization: 'direct_user_action',
    executable: false,
  });
}

export function parseDailyContextTerminalCommand(
  input: string,
): Readonly<DailyContextUserOperation> | null {
  if (
    typeof input !== 'string' ||
    input.length > MAX_TERMINAL_COMMAND_CHARS ||
    input !== input.trim() ||
    CONTROL_OR_DIRECTIONAL.test(input)
  ) {
    return null;
  }
  const command = input;
  if (command === 'vibespace daily') {
    return Object.freeze({ operation: 'open', source: 'terminal', executable: false });
  }
  if (!command.startsWith(TERMINAL_ADD_PREFIX)) return null;
  const encoded = command.slice(TERMINAL_ADD_PREFIX.length);
  try {
    const content = JSON.parse(encoded) as unknown;
    return addOperation('terminal', content);
  } catch {
    return null;
  }
}

export function dailyContextSlashOperation(
  operation: 'open' | 'add',
  content?: string,
): Readonly<DailyContextUserOperation> {
  if (operation === 'open') {
    if (content !== undefined) fail('slash operation');
    return Object.freeze({ operation: 'open', source: 'slash', executable: false });
  }
  if (operation !== 'add') fail('slash operation');
  return addOperation('slash', content);
}

async function resolveChanges(
  rawReferences: readonly DailyContextChangeReference[],
  settings: DailyContextSettings,
  request: DailyContextPlanRequest,
  dailyDate: string,
  repositories: DailyContextActivityRepositories,
): Promise<ReadonlyArray<Readonly<DailyContextChange>>> {
  const references = boundaryClone(rawReferences, 'change references');
  if (!Array.isArray(references) || references.length > MAX_CHANGES) fail('change references');
  if (
    !repositories ||
    typeof repositories !== 'object' ||
    typeof repositories.run?.getById !== 'function' ||
    typeof repositories.event?.getBySeq !== 'function'
  ) {
    fail('activity repository');
  }
  const seen = new Set<string>();
  const seenSummaries = new Set<string>();
  const normalized: DailyContextChange[] = [];
  for (let index = 0; index < references.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(references, index)) fail('change references');
    const reference = plainRecord(references[index], 'change reference');
    exactKeys(reference, ['runId', 'eventSeq'], 'change reference');
    const runId = stableId(reference.runId, 'change run ID');
    if (
      !Number.isSafeInteger(reference.eventSeq) ||
      (reference.eventSeq as number) < 1 ||
      (reference.eventSeq as number) > 1_000_000_000
    ) {
      fail('change event sequence');
    }
    const eventSeq = reference.eventSeq as number;
    const sourceId = `${runId}:${eventSeq}`;
    if (seen.has(sourceId)) fail('duplicate change source');
    seen.add(sourceId);
    const [rawRun, rawEvent] = await Promise.all([
      repositories.run.getById(settings.accountId, runId),
      repositories.event.getBySeq(settings.accountId, runId, eventSeq),
    ]);
    const run =
      rawRun === undefined
        ? undefined
        : plainRecord(boundaryClone(rawRun, 'activity run'), 'activity run');
    const event =
      rawEvent === undefined
        ? undefined
        : plainRecord(boundaryClone(rawEvent, 'activity event'), 'activity event');
    if (run) {
      exactKeys(run, ['id', 'accountId', 'projectId', 'status', 'completedAt'], 'activity run');
    }
    if (event) {
      exactKeys(
        event,
        ['runId', 'seq', 'idempotencyKey', 'type', 'title', 'safeSummary', 'createdAt'],
        'activity event',
      );
    }
    if (
      !run ||
      run.id !== runId ||
      run.accountId !== settings.accountId ||
      run.status !== 'completed' ||
      run.projectId !== request.projectId ||
      run.completedAt === undefined
    ) {
      fail('project scope');
    }
    const completedAt = safeTimestamp(run.completedAt, 'run completion');
    if (!event || event.runId !== runId || event.seq !== eventSeq) {
      fail('authoritative change evidence');
    }
    const occurredAt = safeTimestamp(event.createdAt, 'change timestamp');
    if (occurredAt > completedAt) fail('authoritative change evidence');
    if (!DAILY_CONTEXT_EVENT_TYPES.has(event.type as DailyContextActivityEvent['type'])) {
      fail('change event type');
    }
    const kind = dailyContextActivityKindForEventType(
      event.type as DailyContextActivityEvent['type'],
    );
    if (kind === null) fail('ineligible change event type');
    if (occurredAt > request.timestampMs || completedAt > request.timestampMs) {
      fail('future change evidence');
    }
    if (dailyContextLocalDate(occurredAt, request.utcOffsetMinutes) !== dailyDate) {
      fail('change local date');
    }
    const summary = safeText(event.safeSummary, 'change summary', MAX_ENTRY_CHARS);
    const summaryKey = summary.toLocaleLowerCase('en-US');
    if (seenSummaries.has(summaryKey)) fail('duplicate change summary');
    seenSummaries.add(summaryKey);
    normalized.push(
      Object.freeze({
        id: sourceId,
        kind,
        summary,
        projectId: request.projectId,
        occurredAt,
        source: Object.freeze({
          runId,
          eventSeq,
          eventIdempotencyKey: stableId(event.idempotencyKey, 'change event idempotency key'),
          eventType: event.type as DailyContextActivityEvent['type'],
        }),
      }),
    );
  }
  return Object.freeze(normalized);
}

export async function planJarvisDailyContextChanges(
  rawSettings: DailyContextSettings,
  rawReferences: readonly DailyContextChangeReference[],
  rawRequest: DailyContextPlanRequest,
  repositories: DailyContextActivityRepositories,
): Promise<Readonly<DailyContextJarvisPlan> | null> {
  const settings = validateSettings(rawSettings);
  const request = validateRequest(rawRequest);
  assertScope(settings, request.projectId);
  const note = buildDailyContextNotePlan(settings, request);
  const changes = await resolveChanges(
    rawReferences,
    settings,
    request,
    note.dailyDate,
    repositories,
  );
  if (changes.length < 3) return null;
  return Object.freeze({
    action: 'offer',
    accountId: settings.accountId,
    mapId: settings.mapId,
    projectId: request.projectId,
    dailyDate: note.dailyDate,
    relativePath: note.relativePath,
    message:
      changes.length === 3
        ? 'Three meaningful changes were completed today, sir. Shall I add them to today’s Context Note?'
        : `${changes.length} meaningful changes were completed today. Shall I add them to today’s Context Note?`,
    changes,
    writeAuthorized: false,
    requiresApproval: true,
    executable: false,
  });
}
