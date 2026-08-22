import * as React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storageDoctor, type StorageDoctor } from '@/lib/doctor/storageDoctor';
import {
  listStorageRepairBackups,
  nativeStorageRepair,
  readStorageRepairFailure,
  type StorageRepairBackup,
  type StorageRepairFailure,
} from '@/lib/doctor/nativeStorageRepair';

export interface StorageDoctorRepairActions {
  readonly scheduleRepair: (options: { readonly confirmed: boolean }) => Promise<void>;
  readonly scheduleRestore: (options: {
    readonly confirmed: boolean;
    readonly backupId: string;
  }) => Promise<void>;
  readonly listBackups: () => Promise<readonly StorageRepairBackup[]>;
  readonly readFailure?: () => Promise<StorageRepairFailure | null>;
}

const defaultRepairActions: StorageDoctorRepairActions = {
  scheduleRepair: (options) => nativeStorageRepair.scheduleRepair(options),
  scheduleRestore: (options) => nativeStorageRepair.scheduleRestore(options),
  listBackups: () => listStorageRepairBackups(),
  readFailure: () => readStorageRepairFailure(),
};

export function useStorageDoctorSnapshot(doctor: StorageDoctor = storageDoctor) {
  return React.useSyncExternalStore(doctor.subscribe, doctor.getSnapshot, doctor.getSnapshot);
}

export function StorageDoctorHost({ doctor = storageDoctor }: { readonly doctor?: StorageDoctor }) {
  React.useEffect(() => {
    void doctor.run();
  }, [doctor]);
  return <StorageDoctorNotice doctor={doctor} />;
}

export function StorageDoctorNotice({
  doctor = storageDoctor,
  repairActions = defaultRepairActions,
}: {
  readonly doctor?: StorageDoctor;
  readonly repairActions?: StorageDoctorRepairActions;
}) {
  const snapshot = useStorageDoctorSnapshot(doctor);
  const [retrying, setRetrying] = React.useState(false);
  const [durableAction, setDurableAction] = React.useState<'repair' | 'restore' | null>(null);
  const [durableBusy, setDurableBusy] = React.useState(false);
  const [durableError, setDurableError] = React.useState<string | null>(null);
  const [backups, setBackups] = React.useState<readonly StorageRepairBackup[]>([]);
  const [priorFailure, setPriorFailure] = React.useState<StorageRepairFailure | null>(null);

  React.useEffect(() => {
    if (snapshot.kind !== 'needs_user_repair') return;
    let cancelled = false;
    void repairActions
      .listBackups()
      .then((found) => {
        if (!cancelled) setBackups(found);
      })
      .catch(() => {
        if (!cancelled) setBackups([]);
      });
    if (repairActions.readFailure) {
      void repairActions
        .readFailure()
        .then((failure) => {
          if (!cancelled) setPriorFailure(failure);
        })
        .catch(() => {
          if (!cancelled) setPriorFailure(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [repairActions, snapshot.kind]);

  if (snapshot.kind !== 'needs_user_repair' && snapshot.kind !== 'unexpected_failure') {
    return null;
  }

  const recognized = snapshot.kind === 'needs_user_repair';
  const newestBackup = backups[0];
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await doctor.run({ force: true });
    } finally {
      setRetrying(false);
    }
  };

  const runDurableAction = async () => {
    if (!durableAction || durableBusy) return;
    setDurableBusy(true);
    setDurableError(null);
    try {
      if (durableAction === 'repair') {
        await repairActions.scheduleRepair({ confirmed: true });
      } else if (newestBackup) {
        await repairActions.scheduleRestore({
          confirmed: true,
          backupId: newestBackup.backupId,
        });
      }
    } catch {
      setDurableError(
        durableAction === 'repair'
          ? 'VibeSpace could not schedule the backup-first repair. Try again.'
          : 'VibeSpace could not schedule the selected restore. The backup was not changed.',
      );
      setDurableBusy(false);
    }
  };

  return (
    <aside
      id="vibespace-storage-doctor-status"
      role="alert"
      aria-live="polite"
      className="fixed left-1/2 top-16 z-[90] flex w-[min(92vw,42rem)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-500/35 bg-background/95 p-4 text-foreground shadow-2xl backdrop-blur-xl"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">
          {recognized ? 'Local chat storage needs repair' : 'Local chat storage is unavailable'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {recognized
            ? 'VibeSpace could not safely open your saved local chats. Nothing has been erased.'
            : 'VibeSpace could not verify local chat storage. Nothing was changed or removed.'}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          Diagnostic: {snapshot.diagnosticCode}
        </p>
        {recognized && priorFailure ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Previous repair stopped safely ({priorFailure.diagnosticCode}). Your original and any
            completed backup were left intact.
          </p>
        ) : null}
        {durableAction ? (
          <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            <p className="text-xs text-muted-foreground">
              {durableAction === 'repair'
                ? 'VibeSpace will first create a local backup, restart, replace only the jarvis-v1 chat database, and verify storage before New Chat is enabled.'
                : 'VibeSpace will first preserve the current store, restart, verify this retained backup, and restore the VibeSpace IndexedDB snapshot—including adjacent app-local IndexedDB data—before any WebView opens.'}
            </p>
            {durableError ? <p className="mt-2 text-xs text-destructive">{durableError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={durableBusy}
                onClick={() => void runDurableAction()}
              >
                {durableAction === 'repair'
                  ? 'Back up and restart VibeSpace'
                  : 'Confirm restore and restart'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={durableBusy}
                onClick={() => setDurableAction(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {recognized && !durableAction ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDurableAction('repair')}
            >
              Repair local storage…
            </Button>
            {newestBackup ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDurableAction('restore')}
              >
                Restore retained backup…
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={retrying}
        onClick={() => void retry()}
      >
        <RotateCw className={`mr-2 h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Checking…' : 'Try again'}
      </Button>
    </aside>
  );
}
