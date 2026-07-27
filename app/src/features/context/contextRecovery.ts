import type { JarvisDexie } from '@/lib/db';
import type { ContextQuarantineRow } from '@/lib/db/schema';
import type { ContextV1MigrationResult } from './migration';

export type ContextRecoveryOptionId = ContextQuarantineRow['recoveryOptions'][number];

export type ContextRecoveryOption = Readonly<{
  id: ContextRecoveryOptionId;
  label: string;
  description: string;
}>;

export type ContextRecoverySummary = Readonly<{
  issueCount: number;
  options: readonly ContextRecoveryOption[];
}>;

const RECOVERY_OPTIONS: Readonly<Record<ContextRecoveryOptionId, ContextRecoveryOption>> =
  Object.freeze({
    retry: Object.freeze({
      id: 'retry',
      label: 'Retry recovery',
      description: 'Validate the preserved source again and retry the migration.',
    }),
    restore_backup: Object.freeze({
      id: 'restore_backup',
      label: 'Restore backup',
      description: 'Restore the preserved pre-migration backup.',
    }),
    export_then_discard: Object.freeze({
      id: 'export_then_discard',
      label: 'Export then discard',
      description: 'Export quarantined records before discarding their local copies.',
    }),
  });

const OPTION_ORDER: readonly ContextRecoveryOptionId[] = Object.freeze([
  'retry',
  'restore_backup',
  'export_then_discard',
]);

function migrationQuarantinePrefix(backupId: string | undefined): string | null {
  if (!backupId?.startsWith('ctxmig_')) return null;
  return `ctxq_${backupId.slice('ctxmig_'.length, 'ctxmig_'.length + 32)}_`;
}

export async function loadContextRecoverySummary(
  database: JarvisDexie,
  accountId: string,
  projectId: string | null,
  migration: ContextV1MigrationResult,
): Promise<ContextRecoverySummary | null> {
  const [accountMaps, accountQuarantine] = await Promise.all([
    database.context_maps.where('accountId').equals(accountId).toArray(),
    database.context_quarantine.where('accountId').equals(accountId).toArray(),
  ]);
  const scopedMapIds = new Set(
    accountMaps.filter((map) => map.projectId === projectId).map((map) => map.id),
  );
  const migrationPrefix =
    migration.accountId === accountId && migration.projectId === projectId
      ? migrationQuarantinePrefix(migration.backupId)
      : null;
  const quarantined = accountQuarantine.filter(
    (row) =>
      (row.mapId !== undefined && scopedMapIds.has(row.mapId)) ||
      (migrationPrefix !== null && row.id.startsWith(migrationPrefix)),
  );
  if (quarantined.length === 0) return null;

  const available = new Set(quarantined.flatMap((row) => row.recoveryOptions));
  return Object.freeze({
    issueCount: quarantined.length,
    options: Object.freeze(
      OPTION_ORDER.filter((id) => available.has(id)).map((id) => RECOVERY_OPTIONS[id]),
    ),
  });
}
