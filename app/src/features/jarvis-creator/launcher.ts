import { useUIStore } from '@/stores/ui';
import { JARVIS_CREATOR_START_EVENT, type JarvisCreatorStartDetail } from './contracts';

export { JARVIS_CREATOR_START_EVENT } from './contracts';

let pendingStart: JarvisCreatorStartDetail | null = null;

export function startJarvisCreator(detail: JarvisCreatorStartDetail): void {
  const inspectorOpen = useUIStore.getState().inspectorOpen;
  if (!inspectorOpen) {
    pendingStart = detail;
    useUIStore.setState({ inspectorOpen: true });
    return;
  }
  pendingStart = null;
  window.dispatchEvent(new CustomEvent(JARVIS_CREATOR_START_EVENT, { detail }));
}

export function consumePendingJarvisCreatorStart(): JarvisCreatorStartDetail | null {
  const detail = pendingStart;
  pendingStart = null;
  return detail;
}
