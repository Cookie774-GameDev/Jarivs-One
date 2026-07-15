import { invoke } from '@tauri-apps/api/core';
import type { BrowserRuntimeInfo } from './browserTypes';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function asErr(e: unknown): { code: string; message: string; recoverable: boolean } {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    return e as { code: string; message: string; recoverable: boolean };
  }
  return {
    code: 'unknown',
    message: e instanceof Error ? e.message : String(e),
    recoverable: true,
  };
}

export async function browserDetect() {
  if (!isTauriRuntime()) return [] as Array<{ name: string; path: string; kind: string }>;
  try {
    return await invoke<Array<{ name: string; path: string; kind: string }>>('browser_detect_installations');
  } catch {
    return [];
  }
}

export async function browserStatus(): Promise<BrowserRuntimeInfo> {
  if (!isTauriRuntime()) {
    return { running: false, last_error: 'Desktop shell required for Vibe Browser runtime.' };
  }
  try {
    return await invoke<BrowserRuntimeInfo>('browser_status');
  } catch (e) {
    return { running: false, last_error: asErr(e).message };
  }
}

export async function browserStart(executable?: string) {
  if (!isTauriRuntime()) {
    return { ok: false as const, error: { code: 'not_tauri', message: 'Desktop app required.', recoverable: true } };
  }
  try {
    const status = await invoke<BrowserRuntimeInfo>('browser_start', { executable: executable ?? null });
    return { ok: true as const, status };
  } catch (e) {
    return { ok: false as const, error: asErr(e) };
  }
}

export async function browserStop() {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('browser_stop');
  } catch {
    return false;
  }
}

export async function browserClearProfile() {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('browser_clear_profile');
  } catch {
    return false;
  }
}

/** Minimal CDP over WebSocket for page control + screencast frames. */
export class CdpSession {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private onFrame: ((base64: string) => void) | null = null;
  private onEvent: ((method: string, params: unknown) => void) | null = null;

  async connect(wsUrl: string): Promise<void> {
    await this.close();
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('CDP WebSocket failed'));
      ws.onmessage = (ev) => this.handleMessage(String(ev.data));
      ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  private handleMessage(raw: string) {
    let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? 'CDP error'));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Page.screencastFrame' && msg.params && typeof msg.params === 'object') {
      const params = msg.params as { data?: string; sessionId?: number };
      if (params.data) this.onFrame?.(params.data);
      if (params.sessionId != null) {
        void this.send('Page.screencastFrameAck', { sessionId: params.sessionId });
      }
    }
    if (msg.method) this.onEvent?.(msg.method, msg.params);
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP not connected'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params: params ?? {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20_000);
    });
  }

  onScreencast(cb: (base64: string) => void) {
    this.onFrame = cb;
  }

  onCdpEvent(cb: (method: string, params: unknown) => void) {
    this.onEvent = cb;
  }

  async startScreencast() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
    await this.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });
  }

  async navigate(url: string) {
    return this.send('Page.navigate', { url });
  }

  async reload(ignoreCache = false) {
    return this.send('Page.reload', { ignoreCache });
  }

  async evaluate(expression: string) {
    // Restricted: only used for read-only probes with fixed expressions from our code, never model JS.
    return this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
  }

  async inputClick(x: number, y: number) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async inputType(text: string) {
    await this.send('Input.insertText', { text });
  }

  async inputKey(key: string) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
  }

  async close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.pending.clear();
  }
}

export async function resolvePageWsUrl(browserWsUrl: string): Promise<string | null> {
  // browserWsUrl is often browser-level; list targets for a page.
  try {
    const u = new URL(browserWsUrl);
    const port = u.port;
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const list = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string; url?: string }>;
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    return page?.webSocketDebuggerUrl ?? browserWsUrl;
  } catch {
    return browserWsUrl;
  }
}
