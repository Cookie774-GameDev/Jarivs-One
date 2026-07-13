import { useUIStore } from '@/stores/ui';
import { JARVIS_CREATOR_START_EVENT, type JarvisCreatorStartDetail } from './contracts';

export { JARVIS_CREATOR_START_EVENT } from './contracts';

let pendingStart: JarvisCreatorStartDetail | null = null;

/**
 * Open the right-hand Inspector on the Jarvis tab and start the creator
 * question flow. If the Inspector is not mounted yet, the start is queued
 * until it mounts; if Jarvis is still loading, callers can re-queue via
 * `requeueJarvisCreatorStart`.
 */
export function startJarvisCreator(detail: JarvisCreatorStartDetail): void {
  const wasOpen = useUIStore.getState().inspectorOpen;
  // Always open the right panel first.
  useUIStore.setState({ inspectorOpen: true });
  // Ask any mounted Inspector to switch to the Jarvis chat tab.
  window.dispatchEvent(
    new CustomEvent('jarvis:inspector:tab', { detail: { tab: 'jarvis' } }),
  );

  if (!wasOpen) {
    // Inspector will mount and consume this on first effect.
    pendingStart = detail;
    return;
  }

  pendingStart = null;
  window.dispatchEvent(new CustomEvent(JARVIS_CREATOR_START_EVENT, { detail }));
}

/** Keep a start request until workspace + Jarvis agent are ready. */
export function requeueJarvisCreatorStart(detail: JarvisCreatorStartDetail): void {
  pendingStart = detail;
}

export function consumePendingJarvisCreatorStart(): JarvisCreatorStartDetail | null {
  const detail = pendingStart;
  pendingStart = null;
  return detail;
}
