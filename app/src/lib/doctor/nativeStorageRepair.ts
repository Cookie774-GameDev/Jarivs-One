import { appLocalDataDir } from '@tauri-apps/api/path';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  createDirectory,
  deleteProjectFile,
  listDirectory,
  readTextFile,
  writeTextFile,
} from '@/lib/fs';

const DATABASE_NAME = 'jarvis-v1';
const REQUEST_NAME = 'storage-repair-request-v1.json';
const RECEIPT_NAME = 'storage-repair-ready-v1.json';
const COMPLETED_NAME = 'storage-repair-completed-v1.json';
const FAILURE_NAME = 'storage-repair-failed-v1.json';
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const BACKUP_ID =
  /^(?:pre-restore-)?\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONFIRMATION_TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function child(root: string, ...parts: string[]): string {
  return `${root.replace(/[\\/]+$/u, '')}/${parts.join('/')}`;
}

export interface NativeStorageRepairDependencies {
  readonly now: () => number;
  readonly nonce: () => string;
  readonly origin: () => string;
  readonly localDataDir: () => Promise<string>;
  readonly ensureDirectory: (path: string) => Promise<void>;
  readonly write: (path: string, content: string) => Promise<void>;
  readonly read: (path: string) => Promise<string | null>;
  readonly remove: (path: string) => Promise<void>;
  readonly listDirectories: (path: string) => Promise<readonly string[]>;
  readonly relaunch: () => Promise<void>;
}

export interface StorageRepairBackup {
  readonly backupId: string;
  readonly createdAtMs: number;
}

export interface StorageRepairFailure {
  readonly diagnosticCode: string;
  readonly failedAtMs: number;
}

interface RepairReceipt {
  readonly version: 1;
  readonly operation: 'repair';
  readonly databaseName: typeof DATABASE_NAME;
  readonly origin: string;
  readonly backupId: string;
  readonly backupBytes: number;
  readonly backupSha256: `sha256:${string}`;
  readonly completedAtMs: number;
}

export interface PendingStorageRepair extends RepairReceipt {
  readonly apply: (deleteDatabase: (databaseName: string) => Promise<void>) => Promise<void>;
  readonly complete: () => Promise<void>;
}

function parseReceipt(raw: string, currentOrigin: string): RepairReceipt {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      'backupBytes,backupId,backupSha256,completedAtMs,databaseName,operation,origin,version' ||
    value.version !== 1 ||
    value.operation !== 'repair' ||
    value.databaseName !== DATABASE_NAME ||
    value.origin !== currentOrigin ||
    typeof value.backupId !== 'string' ||
    !BACKUP_ID.test(value.backupId) ||
    !Number.isSafeInteger(value.backupBytes) ||
    (value.backupBytes as number) < 0 ||
    typeof value.backupSha256 !== 'string' ||
    !SHA256.test(value.backupSha256) ||
    !Number.isSafeInteger(value.completedAtMs) ||
    (value.completedAtMs as number) < 0
  ) {
    throw new Error('storage_repair_receipt_invalid');
  }
  return value as unknown as RepairReceipt;
}

function completionMatches(raw: string, receipt: RepairReceipt): boolean {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !==
        'backupBytes,backupId,backupSha256,completedAtMs,databaseName,operation,origin,verifiedAtMs,version' ||
      !Number.isSafeInteger(value.verifiedAtMs) ||
      (value.verifiedAtMs as number) < receipt.completedAtMs
    ) {
      return false;
    }
    const { verifiedAtMs: _verifiedAtMs, ...receiptFields } = value;
    return JSON.stringify(receiptFields) === JSON.stringify(receipt);
  } catch {
    return false;
  }
}

function requestPayload(
  dependencies: NativeStorageRepairDependencies,
  operation: 'repair' | 'restore',
  backupId?: string,
) {
  const confirmationToken = dependencies.nonce();
  if (!CONFIRMATION_TOKEN.test(confirmationToken)) {
    throw new Error('storage_repair_confirmation_token_invalid');
  }
  return {
    version: 1,
    operation,
    databaseName: DATABASE_NAME,
    origin: dependencies.origin(),
    requestedAtMs: dependencies.now(),
    confirmationToken,
    ...(backupId ? { backupId } : {}),
  } as const;
}

export function createNativeStorageRepair(dependencies: NativeStorageRepairDependencies) {
  const schedule = async (
    operation: 'repair' | 'restore',
    confirmed: boolean,
    backupId?: string,
  ) => {
    if (!confirmed) throw new Error('storage_repair_confirmation_required');
    if (operation === 'restore' && (!backupId || !BACKUP_ID.test(backupId))) {
      throw new Error('storage_restore_backup_invalid');
    }
    const root = await dependencies.localDataDir();
    const doctor = child(root, 'doctor');
    await dependencies.ensureDirectory(doctor);
    await dependencies.write(
      child(doctor, REQUEST_NAME),
      `${JSON.stringify(requestPayload(dependencies, operation, backupId))}\n`,
    );
    await dependencies.relaunch();
  };

  return {
    scheduleRepair(options: { readonly confirmed: boolean }) {
      return schedule('repair', options.confirmed);
    },
    scheduleRestore(options: { readonly confirmed: boolean; readonly backupId: string }) {
      return schedule('restore', options.confirmed, options.backupId);
    },
  };
}

export async function consumePendingStorageRepair(
  dependencies: NativeStorageRepairDependencies,
): Promise<PendingStorageRepair | null> {
  const root = await dependencies.localDataDir();
  const doctor = child(root, 'doctor');
  const receiptPath = child(doctor, RECEIPT_NAME);
  const raw = await dependencies.read(receiptPath);
  if (raw == null) return null;
  const receipt = parseReceipt(raw, dependencies.origin());
  const completed = await dependencies.read(child(doctor, COMPLETED_NAME));
  if (completed != null && completionMatches(completed, receipt)) {
    await dependencies.remove(receiptPath);
    return null;
  }
  let applied = false;
  return {
    ...receipt,
    async apply(deleteDatabase) {
      if (applied) return;
      await deleteDatabase(DATABASE_NAME);
      applied = true;
    },
    async complete() {
      if (!applied) throw new Error('storage_repair_not_applied');
      await dependencies.write(
        child(doctor, COMPLETED_NAME),
        `${JSON.stringify({ ...receipt, verifiedAtMs: dependencies.now() })}\n`,
      );
      await dependencies.remove(receiptPath);
    },
  };
}

async function realRead(path: string): Promise<string | null> {
  const result = await readTextFile(path);
  if (result.ok) return result.content;
  if (result.error.code === 'not_found' || result.error.code === 'unavailable') return null;
  throw new Error(`storage_repair_read_failed:${result.error.code}`);
}

export const nativeStorageRepairDependencies: NativeStorageRepairDependencies = {
  now: Date.now,
  nonce: () => crypto.randomUUID(),
  origin: () => window.location.origin,
  localDataDir: appLocalDataDir,
  async ensureDirectory(path) {
    const result = await createDirectory(path);
    if (!result.ok) throw new Error(`storage_repair_directory_failed:${result.error.code}`);
  },
  async write(path, content) {
    const result = await writeTextFile(path, content);
    if (!result.ok) throw new Error(`storage_repair_write_failed:${result.error.code}`);
  },
  read: realRead,
  async remove(path) {
    const result = await deleteProjectFile(path);
    if (!result.ok) throw new Error(`storage_repair_remove_failed:${result.error.code}`);
  },
  async listDirectories(path) {
    const result = await listDirectory(path);
    if (!result.ok) {
      if (result.error.code === 'not_found') return [];
      throw new Error(`storage_repair_list_failed:${result.error.code}`);
    }
    return result.entries.filter((entry) => entry.isDir).map((entry) => entry.name);
  },
  relaunch,
};

export const nativeStorageRepair = createNativeStorageRepair(nativeStorageRepairDependencies);

export async function listStorageRepairBackups(
  dependencies: NativeStorageRepairDependencies = nativeStorageRepairDependencies,
): Promise<readonly StorageRepairBackup[]> {
  const root = await dependencies.localDataDir();
  const names = await dependencies.listDirectories(child(root, 'doctor', 'backups'));
  return names
    .filter((name) => BACKUP_ID.test(name))
    .map((backupId) => ({
      backupId,
      createdAtMs: Number(backupId.replace(/^pre-restore-/u, '').slice(0, 13)),
    }))
    .filter((backup) => Number.isSafeInteger(backup.createdAtMs))
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
}

export async function readStorageRepairFailure(
  dependencies: NativeStorageRepairDependencies = nativeStorageRepairDependencies,
): Promise<StorageRepairFailure | null> {
  const root = await dependencies.localDataDir();
  const raw = await dependencies.read(child(root, 'doctor', FAILURE_NAME));
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'diagnosticCode,failedAtMs,version' ||
      value.version !== 1 ||
      typeof value.diagnosticCode !== 'string' ||
      !/^storage_(?:repair|restore)_[a-z_]{1,80}$/u.test(value.diagnosticCode) ||
      !Number.isSafeInteger(value.failedAtMs) ||
      (value.failedAtMs as number) < 0
    ) {
      return null;
    }
    return {
      diagnosticCode: value.diagnosticCode,
      failedAtMs: value.failedAtMs as number,
    };
  } catch {
    return null;
  }
}
