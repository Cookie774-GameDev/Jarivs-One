import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Download, ExternalLink } from 'lucide-react';
import {
  checkForAppUpdate,
  getAutoUpdateEnabled,
  installPreparedAppUpdate,
  normalizeUpdateNotes,
  prepareAppUpdate,
  type UpdatePhase,
} from '@/lib/updates';
import { toast } from '@/components/ui/toast';
import { isTauri } from '@/lib/utils';
import { playUiSound } from '@/lib/sfx/playUiSound';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import './updates.sakura.css';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const NOTIFIED_VERSION_KEY = 'jarvis-update-notified-version';
type PresentationPhase = UpdatePhase | 'ready';

export function UpdateWarningHost({
  runtimeEffectsEnabled = true,
}: {
  runtimeEffectsEnabled?: boolean;
} = {}) {
  const [isOpen, setIsOpen] = useState(!runtimeEffectsEnabled);
  const [targetVersion, setTargetVersion] = useState(runtimeEffectsEnabled ? '' : '1.5.1');
  const [releaseNotes, setReleaseNotes] = useState(
    runtimeEffectsEnabled
      ? ''
      : 'A signed VibeSpace update with verified reliability and security improvements.',
  );
  const [notesUrl, setNotesUrl] = useState('');
  const [phase, setPhase] = useState<PresentationPhase>(
    runtimeEffectsEnabled ? 'idle' : 'available',
  );

  const preparedVersionRef = useRef('');
  const preparingVersionRef = useRef('');
  const installingRef = useRef(false);
  const closeRequestedRef = useRef(false);
  const dismissedVersionRef = useRef('');

  const installPrepared = useCallback(
    async (relaunch: boolean, persistenceAlreadyRequested = false) => {
      if (installingRef.current || !preparedVersionRef.current) return;
      installingRef.current = true;
      setPhase('installing');
      setIsOpen(true);
      try {
        await installPreparedAppUpdate({
          relaunch,
          ...(persistenceAlreadyRequested ? { persistenceAlreadyRequested: true } : {}),
        });
        setPhase('installed');
      } catch {
        installingRef.current = false;
        closeRequestedRef.current = false;
        setPhase('error');
        setIsOpen(true);
        toast.error('Update failed', 'The signed update could not be installed. Please try again.');
      }
    },
    [],
  );

  const prepareUpdate = useCallback(
    async (version: string): Promise<boolean> => {
      if (preparedVersionRef.current === version) return true;
      if (preparingVersionRef.current === version) return false;
      preparingVersionRef.current = version;
      setPhase('downloading');
      try {
        const result = await prepareAppUpdate({
          expectedVersion: version,
          onProgress: (progress) => setPhase(progress.phase),
        });
        if (!result.prepared || result.version !== version) {
          throw new Error('The signed update was not prepared.');
        }
        preparedVersionRef.current = version;
        setPhase('ready');
        if (closeRequestedRef.current) void installPrepared(false);
        return true;
      } catch {
        closeRequestedRef.current = false;
        setPhase('error');
        setIsOpen(true);
        toast.error(
          'Update download failed',
          'The signed update could not be downloaded. Please try again.',
        );
        return false;
      } finally {
        preparingVersionRef.current = '';
      }
    },
    [installPrepared],
  );

  const checkUpdates = useCallback(async () => {
    if (!isTauri || import.meta.env.DEV) return;
    try {
      const result = await checkForAppUpdate({ install: false });
      if (!result.available || !result.version) return;

      const version = result.version;
      const notes = normalizeUpdateNotes(result.notes, version);
      setTargetVersion(version);
      setReleaseNotes(notes);
      setNotesUrl(result.notesUrl ?? '');
      if (dismissedVersionRef.current !== version) setIsOpen(true);
      setPhase((current) => (current === 'idle' || current === 'none' ? 'available' : current));

      const alreadyNotified = window.localStorage.getItem(NOTIFIED_VERSION_KEY) === version;
      if (!alreadyNotified) {
        window.localStorage.setItem(NOTIFIED_VERSION_KEY, version);
        playUiSound('notification_complete');
        toast.info(
          `VibeSpace v${version} is available`,
          'Release notes are ready. Automatic updates install when you next close VibeSpace.',
        );
        window.dispatchEvent(
          new CustomEvent('jarvis:update-available', { detail: { version, notes } }),
        );
      }

      if (getAutoUpdateEnabled()) void prepareUpdate(version);
    } catch {
      console.warn('[updates] Background update check failed.');
    }
  }, [prepareUpdate]);

  useEffect(() => {
    if (!runtimeEffectsEnabled || !isTauri || import.meta.env.DEV) return;
    const initialCheck = window.setTimeout(() => void checkUpdates(), 5000);
    const interval = window.setInterval(() => void checkUpdates(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [checkUpdates, runtimeEffectsEnabled]);

  useEffect(() => {
    if (!runtimeEffectsEnabled || !isTauri || import.meta.env.DEV) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const releases = await Promise.all([
          listen('jarvis:before-hide', () => {
            closeRequestedRef.current = true;
            if (preparedVersionRef.current) void installPrepared(false);
          }),
          listen('jarvis:persist-now', () => {
            closeRequestedRef.current = true;
            if (preparedVersionRef.current) void installPrepared(false, true);
          }),
        ]);
        if (disposed) releases.forEach((release) => release());
        else unlisteners.push(...releases);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisteners.forEach((release) => release());
    };
  }, [installPrepared, runtimeEffectsEnabled]);

  const handleUpdateNow = async () => {
    if (!runtimeEffectsEnabled || !targetVersion || installingRef.current) return;
    const ready = await prepareUpdate(targetVersion);
    if (ready || preparedVersionRef.current === targetVersion) await installPrepared(true);
  };

  const handleClose = () => {
    if (phase === 'installing') return;
    dismissedVersionRef.current = targetVersion;
    setIsOpen(false);
  };

  const statusCopy =
    phase === 'downloading'
      ? 'Downloading the signed update in the background…'
      : phase === 'ready'
        ? 'Ready. It will install when you next close VibeSpace.'
        : phase === 'error'
          ? 'The update is not ready yet. Retry now or keep using VibeSpace.'
          : getAutoUpdateEnabled()
            ? 'It will download in the background and install when you next close VibeSpace.'
            : 'Automatic updates are off. You can download and install this update now.';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      {phase === 'installing' ? (
        <DialogContent
          data-monochrome-surface="update-warning-host"
          data-vibespace-owned-chrome="updates"
          data-update-appearance-state="updating"
          overlayProps={{
            'data-sakura-overlay': 'updates',
            'data-vibespace-owned-chrome': 'updates',
          }}
          className="flex max-w-sm flex-col items-center justify-center rounded-xl border border-border bg-panel p-6 text-center shadow-lg [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:bg-background [html[data-theme=monochrome]_&]:font-sans [html[data-theme=monochrome]_&]:shadow-none"
        >
          <DialogTitle className="sr-only">Installing VibeSpace update</DialogTitle>
          <DialogDescription className="sr-only">
            Installing the downloaded signed update.
          </DialogDescription>
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-accent-cyan/30 border-t-accent-cyan [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border [html[data-theme=monochrome]_&]:border-t-foreground [html[data-theme=monochrome]_&]:animate-none" />
          <h4 className="text-md text-ui-strong font-semibold text-foreground">
            Installing Update…
          </h4>
          <p className="mt-1.5 text-metadata text-muted-foreground">
            Applying VibeSpace v{targetVersion}. Your workspace was saved first.
          </p>
        </DialogContent>
      ) : (
        <DialogContent
          data-monochrome-surface="update-warning-host"
          data-vibespace-owned-chrome="updates"
          data-update-appearance-state="available"
          overlayProps={{
            'data-sakura-overlay': 'updates',
            'data-vibespace-owned-chrome': 'updates',
          }}
          className="max-w-md rounded-xl border border-border bg-panel p-6 shadow-lg [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:bg-background [html[data-theme=monochrome]_&]:font-sans [html[data-theme=monochrome]_&]:shadow-none"
        >
          <DialogTitle className="flex items-center gap-2 text-lg text-ui-strong text-foreground">
            <BellRing className="h-5 w-5 text-accent-amber [html[data-theme=monochrome]_&]:text-foreground" />
            VibeSpace v{targetVersion} is available
          </DialogTitle>
          <DialogDescription className="mt-2 text-secondary leading-relaxed text-muted-foreground">
            {statusCopy}
          </DialogDescription>

          <section
            aria-labelledby="update-release-notes-title"
            className="my-5 rounded-lg border border-border/60 bg-background/50 p-4 [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:bg-panel"
          >
            <h3
              id="update-release-notes-title"
              className="mb-2 text-metadata font-semibold uppercase tracking-wider text-accent-cyan [html[data-theme=monochrome]_&]:text-foreground"
            >
              What’s new in v{targetVersion}
            </h3>
            <p className="max-h-44 overflow-y-auto whitespace-pre-line text-secondary leading-relaxed text-muted-foreground">
              {releaseNotes}
            </p>
            {notesUrl ? (
              <a
                href={notesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-metadata font-medium text-accent-cyan hover:underline [html[data-theme=monochrome]_&]:text-foreground"
              >
                Full release page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </section>

          <p className="text-metadata text-muted-foreground">
            Running terminal processes cannot survive an installer exit. Saved layouts and recent
            output remain available after the next launch.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Remind Me Later
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => void handleUpdateNow()}
              disabled={phase === 'downloading'}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              {phase === 'downloading' ? 'Downloading…' : 'Update Now'}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
