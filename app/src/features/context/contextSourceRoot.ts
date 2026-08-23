export const CONTEXT_SOURCE_ROOT_PREFIX = 'jarvis-context-source-root-v1';

function contextSourceRootKey(accountId: string | null, projectId: string | null): string {
  return `${CONTEXT_SOURCE_ROOT_PREFIX}:${accountId ?? '__guest__'}:${projectId ?? '__unbound__'}`;
}

export function getStoredContextSourceRoot(
  accountId: string | null,
  projectId: string | null,
): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(contextSourceRootKey(accountId, projectId)) ?? '';
}

export function setStoredContextSourceRoot(
  accountId: string | null,
  projectId: string | null,
  path: string,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(contextSourceRootKey(accountId, projectId), path);
}
