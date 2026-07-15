import { invoke } from '@tauri-apps/api/core';
import { normalizePreviewUrl } from './previewUrl';

export interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewCommandError {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function asError(e: unknown): PreviewCommandError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    return e as PreviewCommandError;
  }
  return {
    code: 'unknown',
    message: e instanceof Error ? e.message : String(e),
    recoverable: true,
  };
}

/** Measure container in logical window coordinates for the child webview. */
export function measurePreviewBounds(el: HTMLElement): PreviewBounds {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

export async function previewCreate(url: string, bounds: PreviewBounds) {
  if (!isTauriRuntime()) {
    return { ok: false as const, error: { code: 'not_tauri', message: 'Native preview requires the desktop app.', recoverable: true } };
  }
  const norm = normalizePreviewUrl(url);
  if (!norm.ok) return { ok: false as const, error: { code: norm.code, message: norm.message, recoverable: true } };
  try {
    const status = await invoke('preview_create', { url: norm.url, bounds });
    return { ok: true as const, status };
  } catch (e) {
    return { ok: false as const, error: asError(e) };
  }
}

export async function previewSetBounds(bounds: PreviewBounds) {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('preview_set_bounds', { bounds });
  } catch {
    return false;
  }
}

export async function previewNavigate(url: string) {
  const norm = normalizePreviewUrl(url);
  if (!norm.ok) return { ok: false as const, error: { code: norm.code, message: norm.message, recoverable: true } };
  if (!isTauriRuntime()) return { ok: false as const, error: { code: 'not_tauri', message: 'Desktop shell required.', recoverable: true } };
  try {
    const status = await invoke('preview_navigate', { url: norm.url });
    return { ok: true as const, status, url: norm.url };
  } catch (e) {
    return { ok: false as const, error: asError(e) };
  }
}

export async function previewShow() {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('preview_show');
  } catch {
    return false;
  }
}

export async function previewHide() {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('preview_hide');
  } catch {
    return false;
  }
}

export async function previewReload(hard = false) {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('preview_reload', { hard });
  } catch {
    return false;
  }
}

export async function previewDestroy() {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('preview_destroy');
  } catch {
    return false;
  }
}

export async function previewProbeUrl(url: string) {
  const norm = normalizePreviewUrl(url);
  if (!norm.ok) return { ok: false as const, error: { code: norm.code, message: norm.message, recoverable: true } };
  if (!isTauriRuntime()) {
    // Browser fallback: try fetch (may CORS-fail for external)
    try {
      const res = await fetch(norm.url, { method: 'GET', mode: 'no-cors' });
      return { ok: true as const, status: res.type === 'opaque' ? 0 : res.status, url: norm.url };
    } catch (e) {
      return {
        ok: false as const,
        error: {
          code: 'connection_refused',
          message: e instanceof Error ? e.message : 'Probe failed',
          recoverable: true,
        },
      };
    }
  }
  try {
    const result = await invoke<Record<string, unknown>>('preview_probe_url', { url: norm.url });
    return { ok: true as const, ...result, url: norm.url };
  } catch (e) {
    return { ok: false as const, error: asError(e) };
  }
}

export async function startStaticServer(root: string) {
  if (!isTauriRuntime()) {
    return { ok: false as const, error: { code: 'not_tauri', message: 'Static preview needs the desktop app.', recoverable: true } };
  }
  try {
    const info = await invoke<{ port: number; root: string; url: string }>('preview_start_static_server', { root });
    return { ok: true as const, info };
  } catch (e) {
    return { ok: false as const, error: asError(e) };
  }
}

export async function stopStaticServer() {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('preview_stop_static_server');
  } catch {
    return false;
  }
}

export async function probeDevServers() {
  if (!isTauriRuntime()) return [] as Array<{ url: string; host: string; port: string }>;
  try {
    return await invoke<Array<{ url: string; host: string; port: string }>>('preview_probe_dev_servers');
  } catch {
    return [];
  }
}
