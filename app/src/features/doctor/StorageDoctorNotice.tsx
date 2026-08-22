import * as React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storageDoctor, type StorageDoctor } from '@/lib/doctor/storageDoctor';

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
}: {
  readonly doctor?: StorageDoctor;
}) {
  const snapshot = useStorageDoctorSnapshot(doctor);
  const [retrying, setRetrying] = React.useState(false);

  if (snapshot.kind !== 'needs_user_repair' && snapshot.kind !== 'unexpected_failure') {
    return null;
  }

  const recognized = snapshot.kind === 'needs_user_repair';
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await doctor.run({ force: true });
    } finally {
      setRetrying(false);
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
