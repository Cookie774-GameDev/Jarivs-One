export interface JarvisStreamingPreview {
  accountId: string;
  runId: string;
  requestId: string;
  chatId: string;
  text: string;
  updatedAt: number;
}

const previews = new Map<string, Readonly<JarvisStreamingPreview>>();

function key(accountId: string, runId: string): string {
  return `${accountId.length}:${accountId}${runId}`;
}

function requireId(value: string, field: string): void {
  if (!value.trim()) throw new Error(`invalid_streaming_preview_${field}`);
}

export function setPreview(preview: JarvisStreamingPreview): void {
  requireId(preview.accountId, 'account_id');
  requireId(preview.runId, 'run_id');
  requireId(preview.requestId, 'request_id');
  requireId(preview.chatId, 'chat_id');
  if (!Number.isFinite(preview.updatedAt)) throw new Error('invalid_streaming_preview_updated_at');
  const detached = Object.freeze({ ...preview });
  previews.set(key(detached.accountId, detached.runId), detached);
}

export function getPreview(accountId: string, runId: string): JarvisStreamingPreview | null {
  return previews.get(key(accountId, runId)) ?? null;
}

export function clearPreview(accountId: string, runId: string): void {
  previews.delete(key(accountId, runId));
}

export function clearAccountPreviews(accountId: string): void {
  for (const [entryKey, preview] of previews) {
    if (preview.accountId === accountId) previews.delete(entryKey);
  }
}
