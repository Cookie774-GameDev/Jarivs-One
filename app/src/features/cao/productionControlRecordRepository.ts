import type { JarvisDexie } from '@/lib/db/database';
import type { CaoControlRecordRow } from '@/lib/db/schema';
import type { CaoControlRecord, CaoControlRuntimeDeps } from './controlRuntime';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_ERROR = /^cao_control_[a-z0-9_]+$/u;
const ACTIONS = new Set([
  'supervise',
  'diagnose',
  'restart',
  'verify',
  'grade',
  'force-check',
  'cancel',
]);
const STATUSES = new Set([
  'queued',
  'awaiting_approval',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
const REQUIRED_KEYS = new Set([
  'schemaVersion',
  'revision',
  'requestId',
  'runId',
  'accountId',
  'workspaceId',
  'projectId',
  'command',
  'targets',
  'status',
  'updatedAt',
]);
const OPTIONAL_KEYS = new Set(['approvalId', 'leaseId', 'receiptId', 'errorCode']);

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    [...REQUIRED_KEYS].every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => REQUIRED_KEYS.has(key) || OPTIONAL_KEYS.has(key))
  );
}

function safeTitle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function validRecord(value: unknown): value is CaoControlRecordRow {
  const row = recordOf(value);
  if (
    !row ||
    !exactKeys(row) ||
    row.schemaVersion !== 1 ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 1 ||
    !SAFE_ID.test(String(row.requestId ?? '')) ||
    !SAFE_ID.test(String(row.runId ?? '')) ||
    !SAFE_ID.test(String(row.accountId ?? '')) ||
    !SAFE_ID.test(String(row.workspaceId ?? '')) ||
    !SAFE_ID.test(String(row.projectId ?? '')) ||
    !STATUSES.has(String(row.status ?? '')) ||
    !Number.isSafeInteger(row.updatedAt) ||
    Number(row.updatedAt) < 0
  ) {
    return false;
  }
  for (const key of OPTIONAL_KEYS) {
    const candidate = row[key];
    if (candidate === undefined) continue;
    if (typeof candidate !== 'string') return false;
    if (key === 'errorCode' ? !SAFE_ERROR.test(candidate) : !SAFE_ID.test(candidate)) return false;
  }
  const command = recordOf(row.command);
  if (
    !command ||
    Object.keys(command).length !== 3 ||
    !ACTIONS.has(String(command.action ?? '')) ||
    (command.source !== 'natural-language' && command.source !== 'catalog-reference') ||
    !Array.isArray(command.selectors) ||
    command.selectors.length < 1 ||
    command.selectors.length > 32 ||
    !Array.isArray(row.targets) ||
    row.targets.length !== command.selectors.length
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (let index = 0; index < row.targets.length; index += 1) {
    const selector = recordOf(command.selectors[index]);
    const target = recordOf(row.targets[index]);
    if (
      !selector ||
      Object.keys(selector).length !== 3 ||
      !target ||
      Object.keys(target).length !== 3 ||
      (selector.kind !== 'chat' && selector.kind !== 'terminal') ||
      (target.kind !== 'chat' && target.kind !== 'terminal') ||
      selector.kind !== target.kind ||
      (selector.by !== 'id' && selector.by !== 'title') ||
      !(selector.by === 'id'
        ? SAFE_ID.test(String(selector.selector ?? ''))
        : safeTitle(selector.selector)) ||
      !SAFE_ID.test(String(target.targetId ?? '')) ||
      !Number.isSafeInteger(target.revision) ||
      Number(target.revision) < 0
    ) {
      return false;
    }
    const identity = `${target.kind}\0${target.targetId}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
  }
  return true;
}

function immutable(record: CaoControlRecordRow): CaoControlRecord {
  const clone = structuredClone(record) as CaoControlRecord;
  for (const selector of clone.command.selectors) Object.freeze(selector);
  for (const target of clone.targets) Object.freeze(target);
  Object.freeze(clone.command.selectors);
  Object.freeze(clone.command);
  Object.freeze(clone.targets);
  return Object.freeze(clone);
}

function sameEnvelope(left: CaoControlRecordRow, right: CaoControlRecordRow): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.requestId === right.requestId &&
    left.runId === right.runId &&
    left.accountId === right.accountId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    JSON.stringify(left.command) === JSON.stringify(right.command) &&
    JSON.stringify(left.targets) === JSON.stringify(right.targets)
  );
}

export function createProductionCaoControlRecordRepository(
  database: JarvisDexie,
): CaoControlRuntimeDeps['store'] {
  if (!database || typeof database.transaction !== 'function' || !database.cao_control_records) {
    throw new Error('cao_control_record_repository_unavailable');
  }
  return Object.freeze({
    async load(requestId: string) {
      if (!SAFE_ID.test(requestId)) throw new Error('cao_control_record_invalid');
      const row = await database.cao_control_records.get(requestId);
      if (row === undefined) return undefined;
      if (!validRecord(row)) throw new Error('cao_control_record_invalid');
      return immutable(row);
    },
    async save(expectedRevision: number, record: CaoControlRecord) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !validRecord(record)) {
        throw new Error('cao_control_record_invalid');
      }
      return database.transaction('rw', database.cao_control_records, async () => {
        const current = await database.cao_control_records.get(record.requestId);
        if (expectedRevision === 0) {
          if (current || record.revision !== 1) return false;
          await database.cao_control_records.add(structuredClone(record) as CaoControlRecordRow);
          return true;
        }
        if (
          !current ||
          !validRecord(current) ||
          current.revision !== expectedRevision ||
          record.revision !== expectedRevision + 1 ||
          !sameEnvelope(current, record)
        ) {
          return false;
        }
        await database.cao_control_records.put(structuredClone(record) as CaoControlRecordRow);
        return true;
      });
    },
  });
}
