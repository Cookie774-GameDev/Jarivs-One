export interface DetachedWorkbenchResult {
  ok: boolean;
  reason?: string;
}

export async function openDetachedWorkbench(): Promise<DetachedWorkbenchResult> {
  const url = '/?workbench=1';
  const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!tauri) {
    const opened = window.open(url, 'vibespace-workbench', 'popup,width=1480,height=920,noopener,noreferrer');
    return opened ? { ok: true } : { ok: false, reason: 'The browser blocked the new window.' };
  }

  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = `workbench-${Date.now().toString(36)}`;
    const child = new WebviewWindow(label, {
      url,
      title: 'VibeSpace Workbench',
      width: 1480,
      height: 920,
      minWidth: 920,
      minHeight: 640,
      center: true,
      resizable: true,
      focus: true,
    });
    return await new Promise<DetachedWorkbenchResult>((resolve) => {
      const timeout = window.setTimeout(() => resolve({ ok: true }), 1600);
      void child.once('tauri://created', () => {
        window.clearTimeout(timeout);
        resolve({ ok: true });
      });
      void child.once('tauri://error', (event) => {
        window.clearTimeout(timeout);
        resolve({ ok: false, reason: String(event.payload ?? 'Native window creation failed.') });
      });
    });
  } catch (cause) {
    return {
      ok: false,
      reason: cause instanceof Error ? cause.message : 'Native window creation failed.',
    };
  }
}
