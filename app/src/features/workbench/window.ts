import { resolveWorkbenchName, workbenchWindowTitle } from './workbenchName';

/**
 * Must match Tauri capability pattern `workbench-*` in
 * `app/src-tauri/capabilities/workbench.json`.
 */
export const WORKBENCH_WINDOW_LABEL = 'workbench-main';
export const WORKBENCH_QUERY = 'workbench=1';
/** Detached Workbench is always a typed kernel client and never an authority host. */
export const WORKBENCH_KERNEL_AUTHORITY = 'client-only' as const;

/**
 * Relative app path for Tauri webviews (same pattern as dictation window).
 * Absolute URLs are only used for browser `window.open`.
 */
export const WORKBENCH_APP_PATH = '/?workbench=1';

/**
 * Browser features for same-origin Workbench.
 * Do NOT include `noopener` / `noreferrer` — those make window.open return null.
 */
export const WORKBENCH_BROWSER_WINDOW_FEATURES = 'width=1480,height=920';

export interface DetachedWorkbenchResult {
  ok: boolean;
  reason?: string;
  focusedExisting?: boolean;
}

export function isWorkbenchDetachedSearch(search?: string): boolean {
  const value = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  return new URLSearchParams(value).get('workbench') === '1';
}

/** Detached Workbench is always a typed kernel client; native code remains authoritative. */
export function isWorkbenchKernelClientSurface(search?: string): boolean {
  return isWorkbenchDetachedSearch(search);
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Absolute URL for browser popups/tabs. */
export function buildWorkbenchWindowUrl(origin?: string): string {
  if (typeof window !== 'undefined') {
    const url = new URL(WORKBENCH_APP_PATH, origin ?? window.location.origin);
    return url.toString();
  }
  const base = origin ?? 'http://localhost/';
  return new URL(WORKBENCH_APP_PATH, base).toString();
}

/**
 * Open or focus the Workbench surface as a separate native/browser window.
 * Callers should still route the main window to `workbench` when they need a
 * guaranteed visible fallback (detached create can fail under Tauri policies).
 */
export async function openOrFocusWorkbenchWindow(options?: {
  name?: string;
}): Promise<DetachedWorkbenchResult> {
  const title = workbenchWindowTitle(resolveWorkbenchName(options?.name ?? 'My Workbench'));

  if (!isTauriRuntime()) {
    const absoluteUrl = buildWorkbenchWindowUrl();
    try {
      let opened = window.open(
        absoluteUrl,
        WORKBENCH_WINDOW_LABEL,
        WORKBENCH_BROWSER_WINDOW_FEATURES,
      );
      if (!opened) {
        opened = window.open(absoluteUrl, WORKBENCH_WINDOW_LABEL);
      }
      if (!opened) {
        return {
          ok: false,
          reason:
            'The browser blocked the Workbench window. Allow popups, or use the in-app Workbench view.',
        };
      }
      try {
        opened.focus();
      } catch {
        // ignore focus errors
      }
      return { ok: true };
    } catch (cause) {
      return {
        ok: false,
        reason:
          cause instanceof Error ? cause.message : 'Could not open a Workbench browser window.',
      };
    }
  }

  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    const existing = await WebviewWindow.getByLabel(WORKBENCH_WINDOW_LABEL);
    if (existing) {
      try {
        await existing.show();
      } catch {
        // ignore
      }
      try {
        await existing.unminimize();
      } catch {
        // ignore
      }
      try {
        await existing.setFocus();
      } catch {
        // ignore
      }
      try {
        await existing.setTitle(title);
      } catch {
        // ignore
      }
      return { ok: true, focusedExisting: true };
    }

    // Relative path — matches tauri.conf dictation window style and loads via devUrl/frontendDist.
    const child = new WebviewWindow(WORKBENCH_WINDOW_LABEL, {
      url: WORKBENCH_APP_PATH,
      title,
      width: 1480,
      height: 920,
      minWidth: 920,
      minHeight: 640,
      center: true,
      resizable: true,
      focus: true,
      visible: true,
      decorations: true,
    });

    return await new Promise<DetachedWorkbenchResult>((resolve) => {
      let settled = false;
      const finish = (result: DetachedWorkbenchResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // Never claim success without a created event — that prevented the in-app fallback.
      const timeout = window.setTimeout(() => {
        finish({
          ok: false,
          reason:
            'Workbench window creation timed out. Opening Workbench in the main window instead.',
        });
      }, 4000);

      void child.once('tauri://created', () => {
        window.clearTimeout(timeout);
        void (async () => {
          try {
            await child.show();
            await child.setFocus();
            try {
              await child.maximize();
            } catch {
              // maximize is optional
            }
            try {
              await child.setTitle(title);
            } catch {
              // ignore
            }
            finish({ ok: true });
          } catch (cause) {
            finish({
              ok: false,
              reason:
                cause instanceof Error
                  ? cause.message
                  : 'Workbench window was created but could not be shown.',
            });
          }
        })();
      });

      void child.once('tauri://error', (event) => {
        window.clearTimeout(timeout);
        finish({
          ok: false,
          reason: String(event.payload ?? 'Native Workbench window creation failed.'),
        });
      });
    });
  } catch (cause) {
    return {
      ok: false,
      reason: cause instanceof Error ? cause.message : 'Native Workbench window creation failed.',
    };
  }
}

/** @deprecated Prefer openOrFocusWorkbenchWindow */
export async function openDetachedWorkbench(options?: {
  name?: string;
}): Promise<DetachedWorkbenchResult> {
  return openOrFocusWorkbenchWindow(options);
}

export async function setWorkbenchNativeWindowTitle(name: string): Promise<void> {
  if (!isTauriRuntime() || !isWorkbenchDetachedSearch()) return;
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().setTitle(workbenchWindowTitle(name));
  } catch {
    // ignore
  }
}
