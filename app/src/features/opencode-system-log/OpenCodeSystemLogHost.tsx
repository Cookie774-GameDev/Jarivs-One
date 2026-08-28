import * as React from 'react';
import { devConsole, useDevConsoleStore } from '@/features/dev-console';
import {
  buildOpenCodeSystemTimeline,
  OPENCODE_SYSTEM_LOG_CAPACITY,
  OPENCODE_SYSTEM_LOG_OPEN_EVENT,
  OPENCODE_SYSTEM_LOG_PING_EVENT,
  OPENCODE_SYSTEM_LOG_REQUEST_EVENT,
  OPENCODE_SYSTEM_LOG_READY_EVENT,
  OPENCODE_SYSTEM_LOG_STORAGE_KEY,
  OPENCODE_SYSTEM_LOG_UPDATE_EVENT,
  OPENCODE_SYSTEM_LOG_WINDOW_LABEL,
  translateOpenCodeSystemEntry,
  type OpenCodeSystemStep,
  type OpenCodeSystemLogPayload,
  type OpenCodeSystemLogReadyPayload,
} from './opencodeSystemLog';

const LOG_PATH = '/?view=opencode-system-log';

interface OpenCodeSystemLogWindowHandle {
  show(): Promise<void>;
  unminimize(): Promise<void>;
  setFocus(): Promise<void>;
  destroy(): Promise<void>;
}

export async function revealExistingOpenCodeSystemLogWindow(
  existing: OpenCodeSystemLogWindowHandle,
): Promise<boolean> {
  try {
    await existing.show();
    await existing.unminimize();
    await existing.setFocus();
    return true;
  } catch {
    // Tauri can retain a label briefly after its native window has gone away.
    // Remove only that stale log handle so a fresh live view can be created.
    await existing.destroy().catch(() => undefined);
    return false;
  }
}

function payloadFor(timeline: readonly OpenCodeSystemStep[]): OpenCodeSystemLogPayload {
  return { version: 1, updatedAt: Date.now(), steps: [...timeline] };
}

function publishTimeline(timeline: readonly OpenCodeSystemStep[]): void {
  const payload = payloadFor(timeline);
  try {
    window.localStorage.setItem(OPENCODE_SYSTEM_LOG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // The human timeline is observational and must never affect a chat run.
  }
  window.dispatchEvent(new CustomEvent(OPENCODE_SYSTEM_LOG_UPDATE_EVENT, { detail: payload }));
  if ('__TAURI_INTERNALS__' in window) {
    void import('@tauri-apps/api/event')
      .then(({ emitTo }) =>
        emitTo(OPENCODE_SYSTEM_LOG_WINDOW_LABEL, OPENCODE_SYSTEM_LOG_UPDATE_EVENT, payload),
      )
      .catch(() => undefined);
  }
}

function appendStep(
  timeline: readonly OpenCodeSystemStep[],
  next: OpenCodeSystemStep,
): OpenCodeSystemStep[] {
  const output = timeline.slice();
  const previous = output.at(-1);
  if (
    previous &&
    previous.kind === next.kind &&
    previous.title === next.title &&
    previous.summary === next.summary &&
    next.ts - previous.ts <= 5_000
  ) {
    output[output.length - 1] = {
      ...previous,
      id: next.id,
      ts: next.ts,
      durationMs: next.durationMs ?? previous.durationMs,
      repeatCount: (previous.repeatCount ?? 1) + 1,
    };
    return output;
  }
  output.push(next);
  return output.slice(-OPENCODE_SYSTEM_LOG_CAPACITY);
}

type SubscribeToRendererReady = (
  onReady: (payload: unknown) => void,
) => Promise<() => void>;

export async function waitForOpenCodeSystemLogRendererReady(
  subscribe: SubscribeToRendererReady,
  ping: () => Promise<void>,
  timeoutMs = 4_000,
): Promise<void> {
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const unlisten = await subscribe((payload) => {
    const candidate = payload as Partial<OpenCodeSystemLogReadyPayload> | null;
    if (candidate?.version !== 1 || typeof candidate.stepCount !== 'number') return;
    resolveReady();
  });
  const timeout = window.setTimeout(
    () => rejectReady(new Error('OpenCode System Log renderer did not become ready.')),
    timeoutMs,
  );
  try {
    await ping();
    await ready;
  } finally {
    window.clearTimeout(timeout);
    unlisten();
  }
}

export async function waitForOpenCodeSystemLogLabelRelease(
  getByLabel: () => Promise<unknown | null>,
  timeoutMs = 2_000,
  pollMs = 40,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (await getByLabel()) {
    if (Date.now() >= deadline) {
      throw new Error('OpenCode System Log window label was not released.');
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, pollMs));
  }
}

export async function openOpenCodeSystemLog(): Promise<void> {
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    window.open(LOG_PATH, OPENCODE_SYSTEM_LOG_WINDOW_LABEL, 'width=1040,height=760');
    return;
  }

  const [{ WebviewWindow }, { emitTo, listen }] = await Promise.all([
    import('@tauri-apps/api/webviewWindow'),
    import('@tauri-apps/api/event'),
  ]);
  const subscribeToReady: SubscribeToRendererReady = async (onReady) =>
    listen<OpenCodeSystemLogReadyPayload>(OPENCODE_SYSTEM_LOG_READY_EVENT, (event) =>
      onReady(event.payload),
    );
  const existing = await WebviewWindow.getByLabel(OPENCODE_SYSTEM_LOG_WINDOW_LABEL);
  if (existing && (await revealExistingOpenCodeSystemLogWindow(existing))) {
    try {
      await waitForOpenCodeSystemLogRendererReady(subscribeToReady, () =>
        emitTo(OPENCODE_SYSTEM_LOG_WINDOW_LABEL, OPENCODE_SYSTEM_LOG_PING_EVENT),
      );
      return;
    } catch {
      await existing.destroy().catch(() => undefined);
    }
  }
  if (existing) {
    await waitForOpenCodeSystemLogLabelRelease(() =>
      WebviewWindow.getByLabel(OPENCODE_SYSTEM_LOG_WINDOW_LABEL),
    );
  }

  let child: InstanceType<typeof WebviewWindow> | undefined;
  try {
    await waitForOpenCodeSystemLogRendererReady(subscribeToReady, async () => {
      child = new WebviewWindow(OPENCODE_SYSTEM_LOG_WINDOW_LABEL, {
        url: LOG_PATH,
        title: 'VibeSpace · OpenCode System Log',
        width: 1040,
        height: 760,
        minWidth: 720,
        minHeight: 560,
        center: true,
        resizable: true,
        focus: true,
        visible: false,
        decorations: true,
      });
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('OpenCode System Log window creation timed out.')),
          4_000,
        );
        void child?.once('tauri://created', () => {
          window.clearTimeout(timeout);
          resolve();
        });
        void child?.once('tauri://error', (event) => {
          window.clearTimeout(timeout);
          reject(new Error(String(event.payload)));
        });
      });
      await child.show();
      await child.setFocus();
      await emitTo(OPENCODE_SYSTEM_LOG_WINDOW_LABEL, OPENCODE_SYSTEM_LOG_PING_EVENT);
    });
  } catch (error) {
    await child?.destroy().catch(() => undefined);
    throw error;
  }
}

/** Mirrors only meaningful OpenCode/RLM/SiYuan milestones into the separate human log. */
export function OpenCodeSystemLogHost(): null {
  React.useEffect(() => {
    let timeline = buildOpenCodeSystemTimeline(useDevConsoleStore.getState().entries);
    let lastSeenId = useDevConsoleStore.getState().entries.at(-1)?.id ?? 0;
    publishTimeline(timeline);
    let stopNativeRequestListener: () => void = () => undefined;
    let stopNativeReadyListener: () => void = () => undefined;
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          stopNativeRequestListener = await listen(OPENCODE_SYSTEM_LOG_REQUEST_EVENT, () =>
            publishTimeline(timeline),
          );
          stopNativeReadyListener = await listen<{
            version?: unknown;
            updatedAt?: unknown;
            stepCount?: unknown;
          }>(OPENCODE_SYSTEM_LOG_READY_EVENT, (event) => {
            if (event.payload?.version !== 1 || typeof event.payload.stepCount !== 'number') return;
            devConsole.log({
              channel: 'app',
              level: 'info',
              message: 'OpenCode System Log renderer ready',
              detail: { stepCount: Math.max(0, Math.floor(event.payload.stepCount)) },
            });
          });
        })
        .catch(() => undefined);
    }

    const unsubscribe = useDevConsoleStore.subscribe((state) => {
      const unseen = state.entries.filter((entry) => entry.id > lastSeenId);
      if (unseen.length === 0) return;
      lastSeenId = unseen.at(-1)?.id ?? lastSeenId;
      let changed = false;
      for (const entry of unseen) {
        const translated = translateOpenCodeSystemEntry(entry);
        if (!translated) continue;
        timeline = appendStep(timeline, translated);
        changed = true;
      }
      if (changed) publishTimeline(timeline);
    });

    const open = () => {
      void openOpenCodeSystemLog().catch((error) => {
        devConsole.log({
          channel: 'app',
          level: 'error',
          message: 'OpenCode System Log window could not open',
          detail: { error: error instanceof Error ? error.message : String(error) },
        });
      });
    };
    window.addEventListener(OPENCODE_SYSTEM_LOG_OPEN_EVENT, open);
    return () => {
      unsubscribe();
      stopNativeRequestListener();
      stopNativeReadyListener();
      window.removeEventListener(OPENCODE_SYSTEM_LOG_OPEN_EVENT, open);
    };
  }, []);

  return null;
}
