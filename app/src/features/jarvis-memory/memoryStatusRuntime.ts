export type JarvisMemoryStatusState = 'updating' | 'updated' | 'recovered' | 'error';

export interface JarvisMemoryStatusDetail {
  chatId?: string;
  state: JarvisMemoryStatusState;
}

interface BufferedStatus {
  detail: JarvisMemoryStatusDetail;
  expiresAt: number;
}

const REPLAY_MS = 2_000;
let buffered: BufferedStatus | null = null;

export function publishJarvisMemoryStatus(detail: JarvisMemoryStatusDetail): void {
  const safeDetail = { chatId: detail.chatId, state: detail.state };
  buffered = { detail: safeDetail, expiresAt: Date.now() + REPLAY_MS };
  window.dispatchEvent(new CustomEvent('jarvis:memory-status', { detail: safeDetail }));
}

export function readJarvisMemoryStatus(chatId: string): JarvisMemoryStatusDetail | null {
  if (!buffered || buffered.expiresAt <= Date.now()) {
    buffered = null;
    return null;
  }
  if (buffered.detail.chatId && buffered.detail.chatId !== chatId) return null;
  return { ...buffered.detail };
}

export function clearJarvisMemoryStatus(): void {
  buffered = null;
}
