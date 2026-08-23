import * as React from 'react';
import { devConsole, useDevConsoleStore } from '@/features/dev-console';
import {
  buildOpenCodeSystemTimeline,
  OPENCODE_SYSTEM_LOG_CAPACITY,
  OPENCODE_SYSTEM_LOG_OPEN_EVENT,
  OPENCODE_SYSTEM_LOG_REQUEST_EVENT,
  OPENCODE_SYSTEM_LOG_STORAGE_KEY,
  OPENCODE_SYSTEM_LOG_UPDATE_EVENT,
  OPENCODE_SYSTEM_LOG_WINDOW_LABEL,
  translateOpenCodeSystemEntry,
  type OpenCodeSystemStep,
  type OpenCodeSystemLogPayload,
} from './opencodeSystemLog';

const LOG_PATH = '/?view=opencode-system-log';

interface OpenCodeSystemLogWindowHandle {
  isVisible(): Promise<boolean>;
  show(): Promise<void>;
  unminimize(): Promise<void>;
  setFocus(): Promise<void>;
  destroy(): Promise<void>;
}

export async function revealExistingOpenCodeSystemLogWindow(
  existing: OpenCodeSystemLogWindowHandle,
): Promise<boolean> {
  try {
    await existing.isVisible();
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

export async function openOpenCodeSystemLog(): Promise<void> {
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    window.open(LOG_PATH, OPENCODE_SYSTEM_LOG_WINDOW_LABEL, 'width=1040,height=760');
    return;
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel(OPENCODE_SYSTEM_LOG_WINDOW_LABEL);
  if (existing && (await revealExistingOpenCodeSystemLogWindow(existing))) return;

  const child = new WebviewWindow(OPENCODE_SYSTEM_LOG_WINDOW_LABEL, {
    url: LOG_PATH,
    title: 'VibeSpace · OpenCode System Log',
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    center: true,
    resizable: true,
    focus: true,
    visible: true,
    decorations: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('OpenCode System Log window creation timed out.')),
      4_000,
    );
    void child.once('tauri://created', () => {
      window.clearTimeout(timeout);
      resolve();
    });
    void child.once('tauri://error', (event) => {
      window.clearTimeout(timeout);
      reject(new Error(String(event.payload)));
    });
  });
}

/** Mirrors only meaningful OpenCode/RLM/SiYuan milestones into the separate human log. */
export function OpenCodeSystemLogHost(): null {
  React.useEffect(() => {
    let timeline = buildOpenCodeSystemTimeline(useDevConsoleStore.getState().entries);
    let lastSeenId = useDevConsoleStore.getState().entries.at(-1)?.id ?? 0;
    publishTimeline(timeline);
    let stopNativeRequestListener: () => void = () => undefined;
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/event')
        .then(({ listen }) =>
          listen(OPENCODE_SYSTEM_LOG_REQUEST_EVENT, () => publishTimeline(timeline)),
        )
        .then((unlisten) => {
          stopNativeRequestListener = unlisten;
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
      window.removeEventListener(OPENCODE_SYSTEM_LOG_OPEN_EVENT, open);
    };
  }, []);

  return null;
}
