export const CONTEXT_ACTIVITY_KINDS = [
  'map_created',
  'source_indexed',
  'source_changed',
  'github_snapshot_updated',
  'map_became_stale',
  'jarvis_retrieved_context',
  'terminal_activated_map',
  'skill_changed',
  'note_created',
  'link_created',
  'broken_link_detected',
  'index_repaired',
] as const;

export type ContextActivityKind = (typeof CONTEXT_ACTIVITY_KINDS)[number];

export const CONTEXT_ACTIVITY_REASON_CODES = [
  'manual',
  'automatic',
  'revision_changed',
  'source_changed',
  'permission_changed',
  'corruption_detected',
  'not_found',
  'retry_succeeded',
] as const;

export type ContextActivityReasonCode = (typeof CONTEXT_ACTIVITY_REASON_CODES)[number];

export interface ContextActivityInput {
  idempotencyKey: string;
  kind: ContextActivityKind;
  occurredAt: number;
  mapId?: string;
  sourceId?: string;
  path?: string;
  itemCount?: number;
  reasonCode?: ContextActivityReasonCode;
}

export interface ContextActivityEventInput {
  eventId: string;
  accountId: string;
  kind: ContextActivityKind;
  occurredAt: number;
  mapId?: string;
  sourceId?: string;
  path?: string;
  itemCount?: number;
  reasonCode?: ContextActivityReasonCode;
}

export interface ContextLocalActivityEvent {
  version: 1;
  eventId: string;
  accountId: string;
  kind: ContextActivityKind;
  occurredAt: number;
  mapId?: string;
  sourceId?: string;
  path?: string;
  itemCount?: number;
  reasonCode?: ContextActivityReasonCode;
}

export interface ContextCloudTelemetryEvent {
  version: 1;
  eventId: string;
  accountId: string;
  kind: ContextActivityKind;
  occurredAt: number;
  disposition: 'queued' | 'suppressed';
  itemCount?: number;
}

export interface ContextActivityPreferences {
  cloudTelemetryEnabled: boolean;
  includeLocalPaths: boolean;
}

export interface ContextActivityRecorderDependencies {
  accountId: string;
  eventIdHmacKey: CryptoKey;
  preferences(): Readonly<ContextActivityPreferences>;
  upsertLocalByEventId(
    event: Readonly<ContextLocalActivityEvent>,
  ): 'stored' | 'unchanged' | 'conflict';
  upsertLocalCloudDispositionByEventId(
    event: Readonly<ContextCloudTelemetryEvent>,
  ): 'stored' | 'unchanged' | 'conflict';
}

export class ContextActivityError extends Error {
  constructor(
    readonly code:
      | 'invalid_input'
      | 'invalid_preferences'
      | 'sink_failed'
      | 'identity_mismatch'
      | 'capacity_exceeded',
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextActivityError';
  }
}

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_PATH_CHARS = 4_096;
const MAX_ITEM_COUNT = 10_000_000;
const MAX_EVENT_STATES = 1_024;

async function issuedEventId(
  hmacKey: CryptoKey,
  accountId: string,
  idempotencyKey: string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('invalid_input', 'digest_unavailable');
  let digest: ArrayBuffer;
  try {
    digest = await subtle.sign(
      'HMAC',
      hmacKey,
      new TextEncoder().encode(`context_activity\u0000${accountId}\u0000${idempotencyKey}`),
    );
  } catch {
    return fail('invalid_input', 'hmac_key');
  }
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const INPUT_KEYS = Object.freeze([
  'version',
  'eventId',
  'accountId',
  'kind',
  'occurredAt',
  'mapId',
  'sourceId',
  'path',
  'itemCount',
  'reasonCode',
]);
const RECORD_KEYS = Object.freeze([
  'idempotencyKey',
  'kind',
  'occurredAt',
  'mapId',
  'sourceId',
  'path',
  'itemCount',
  'reasonCode',
]);

function fail(code: ContextActivityError['code'], detail?: string): never {
  throw new ContextActivityError(code, detail);
}

function dataRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_input');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return fail('invalid_input');
  }
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        !allowedKeys.includes(key) ||
        !descriptors[key]?.enumerable ||
        !Object.hasOwn(descriptors[key]!, 'value'),
    )
  ) {
    fail('invalid_input');
  }
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, descriptors[key as string]!.value])),
  );
}

function optionalId(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && OPAQUE_ID.test(value));
}

function safePath(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_PATH_CHARS &&
      !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value))
  );
}

export function createContextActivityEvent(
  input: Readonly<ContextActivityEventInput>,
): Readonly<ContextLocalActivityEvent> {
  const record = dataRecord(input, INPUT_KEYS);
  if (
    !Object.hasOwn(record, 'eventId') ||
    !Object.hasOwn(record, 'accountId') ||
    !Object.hasOwn(record, 'kind') ||
    !Object.hasOwn(record, 'occurredAt') ||
    (record.version !== undefined && record.version !== 1) ||
    typeof record.eventId !== 'string' ||
    !OPAQUE_ID.test(record.eventId) ||
    typeof record.accountId !== 'string' ||
    !OPAQUE_ID.test(record.accountId) ||
    !(CONTEXT_ACTIVITY_KINDS as readonly unknown[]).includes(record.kind) ||
    !Number.isSafeInteger(record.occurredAt) ||
    (record.occurredAt as number) < 0 ||
    (record.occurredAt as number) > MAX_TIMESTAMP ||
    !optionalId(record.mapId) ||
    !optionalId(record.sourceId) ||
    !safePath(record.path) ||
    (record.itemCount !== undefined &&
      (!Number.isSafeInteger(record.itemCount) ||
        (record.itemCount as number) < 0 ||
        (record.itemCount as number) > MAX_ITEM_COUNT)) ||
    (record.reasonCode !== undefined &&
      !(CONTEXT_ACTIVITY_REASON_CODES as readonly unknown[]).includes(record.reasonCode))
  ) {
    fail('invalid_input');
  }
  return Object.freeze({
    version: 1,
    eventId: record.eventId,
    accountId: record.accountId,
    kind: record.kind as ContextActivityKind,
    occurredAt: record.occurredAt as number,
    ...(record.mapId === undefined ? {} : { mapId: record.mapId }),
    ...(record.sourceId === undefined ? {} : { sourceId: record.sourceId }),
    ...(record.path === undefined ? {} : { path: record.path }),
    ...(record.itemCount === undefined ? {} : { itemCount: record.itemCount as number }),
    ...(record.reasonCode === undefined
      ? {}
      : { reasonCode: record.reasonCode as ContextActivityReasonCode }),
  });
}

function projectContextCloudTelemetry(
  event: Readonly<ContextLocalActivityEvent>,
  disposition: ContextCloudTelemetryEvent['disposition'],
): Readonly<ContextCloudTelemetryEvent> {
  if (disposition !== 'queued' && disposition !== 'suppressed') fail('invalid_input');
  const validated = createContextActivityEvent(event);
  return Object.freeze({
    version: 1,
    eventId: validated.eventId,
    accountId: validated.accountId,
    kind: validated.kind,
    occurredAt: validated.occurredAt,
    disposition,
    ...(validated.itemCount === undefined ? {} : { itemCount: validated.itemCount }),
  });
}

export function isContextCloudTelemetryExportable(
  event: Readonly<ContextCloudTelemetryEvent>,
): boolean {
  try {
    const record = dataRecord(event, [
      'version',
      'eventId',
      'accountId',
      'kind',
      'occurredAt',
      'disposition',
      'itemCount',
    ]);
    return (
      Reflect.ownKeys(record).length >= 6 &&
      record.version === 1 &&
      typeof record.eventId === 'string' &&
      OPAQUE_ID.test(record.eventId) &&
      typeof record.accountId === 'string' &&
      OPAQUE_ID.test(record.accountId) &&
      (CONTEXT_ACTIVITY_KINDS as readonly unknown[]).includes(record.kind) &&
      Number.isSafeInteger(record.occurredAt) &&
      (record.occurredAt as number) >= 0 &&
      (record.occurredAt as number) <= MAX_TIMESTAMP &&
      record.disposition === 'queued' &&
      (record.itemCount === undefined ||
        (Number.isSafeInteger(record.itemCount) &&
          (record.itemCount as number) >= 0 &&
          (record.itemCount as number) <= MAX_ITEM_COUNT))
    );
  } catch {
    return false;
  }
}

export function projectContextLocalActivity(
  event: Readonly<ContextLocalActivityEvent>,
  includePaths: boolean,
): Readonly<ContextLocalActivityEvent> {
  if (typeof includePaths !== 'boolean') fail('invalid_preferences');
  const validated = createContextActivityEvent(event);
  if (includePaths || validated.path === undefined) return validated;
  const { path: _path, ...withoutPath } = validated;
  return Object.freeze(withoutPath);
}

export function createContextActivityRecorder(
  dependencies: ContextActivityRecorderDependencies,
): Readonly<{
  record(input: Readonly<ContextActivityInput>): Promise<Readonly<ContextLocalActivityEvent>>;
}> {
  const boundary = dataRecord(dependencies, [
    'accountId',
    'eventIdHmacKey',
    'preferences',
    'upsertLocalByEventId',
    'upsertLocalCloudDispositionByEventId',
  ]);
  const hmacKey = boundary.eventIdHmacKey as CryptoKey | undefined;
  if (
    Reflect.ownKeys(boundary).length !== 5 ||
    typeof boundary.accountId !== 'string' ||
    !OPAQUE_ID.test(boundary.accountId) ||
    !hmacKey ||
    hmacKey.type !== 'secret' ||
    hmacKey.extractable ||
    hmacKey.algorithm.name !== 'HMAC' ||
    (hmacKey.algorithm as HmacKeyAlgorithm).hash?.name !== 'SHA-256' ||
    (hmacKey.algorithm as HmacKeyAlgorithm).length < 256 ||
    !hmacKey.usages.includes('sign') ||
    typeof boundary.preferences !== 'function' ||
    typeof boundary.upsertLocalByEventId !== 'function' ||
    typeof boundary.upsertLocalCloudDispositionByEventId !== 'function'
  ) {
    fail('invalid_input');
  }
  const accountId = boundary.accountId;
  const preferences = boundary.preferences as ContextActivityRecorderDependencies['preferences'];
  const upsertLocalByEventId =
    boundary.upsertLocalByEventId as ContextActivityRecorderDependencies['upsertLocalByEventId'];
  const upsertLocalCloudDispositionByEventId =
    boundary.upsertLocalCloudDispositionByEventId as ContextActivityRecorderDependencies['upsertLocalCloudDispositionByEventId'];
  const states = new Map<string, { fingerprint: string; localDone: boolean; cloudDone: boolean }>();
  return Object.freeze({
    async record(input) {
      const record = dataRecord(input, RECORD_KEYS);
      if (
        Reflect.ownKeys(record).length < 3 ||
        typeof record.idempotencyKey !== 'string' ||
        record.idempotencyKey.length < 1 ||
        record.idempotencyKey.length > 256 ||
        /[\u0000-\u001f\u007f-\u009f]/u.test(record.idempotencyKey)
      ) {
        fail('invalid_input');
      }
      const eventId = await issuedEventId(hmacKey, accountId, record.idempotencyKey);
      const { idempotencyKey: _idempotencyKey, ...eventFields } = record;
      const event = createContextActivityEvent({
        ...eventFields,
        eventId,
        accountId,
      } as unknown as ContextActivityEventInput);
      const preferenceRecord = dataRecord(preferences(), [
        'cloudTelemetryEnabled',
        'includeLocalPaths',
      ]);
      if (
        Reflect.ownKeys(preferenceRecord).length !== 2 ||
        typeof preferenceRecord.cloudTelemetryEnabled !== 'boolean' ||
        typeof preferenceRecord.includeLocalPaths !== 'boolean'
      ) {
        fail('invalid_preferences');
      }
      const cloudTelemetryEnabled = preferenceRecord.cloudTelemetryEnabled;
      const includeLocalPaths = preferenceRecord.includeLocalPaths;
      const local = projectContextLocalActivity(event, includeLocalPaths);
      const fingerprint = JSON.stringify(event);
      let state = states.get(event.eventId);
      if (state && state.fingerprint !== fingerprint) fail('invalid_input', 'event_id_reuse');
      if (!state) {
        if (states.size >= MAX_EVENT_STATES) {
          const completed = [...states].find(
            ([, value]) => value.localDone && value.cloudDone,
          )?.[0];
          if (completed === undefined) fail('capacity_exceeded');
          states.delete(completed);
        }
        state = { fingerprint, localDone: false, cloudDone: false };
        states.set(event.eventId, state);
      }
      try {
        if (!state.localDone) {
          const result = upsertLocalByEventId(local);
          if (result === 'conflict') fail('invalid_input', 'event_id_reuse');
          if (result !== 'stored' && result !== 'unchanged') fail('sink_failed');
          state.localDone = true;
        }
        if (!state.cloudDone) {
          const result = upsertLocalCloudDispositionByEventId(
            projectContextCloudTelemetry(event, cloudTelemetryEnabled ? 'queued' : 'suppressed'),
          );
          if (result === 'conflict') fail('invalid_input', 'event_id_reuse');
          if (result !== 'stored' && result !== 'unchanged') fail('sink_failed');
          state.cloudDone = true;
        }
      } catch (error) {
        if (error instanceof ContextActivityError) throw error;
        fail('sink_failed');
      }
      return local;
    },
  });
}
