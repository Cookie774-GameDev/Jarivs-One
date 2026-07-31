export interface SakuraDocumentTarget extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
  hasFocus(): boolean;
}

export type SakuraWindowTarget = EventTarget;

export interface SakuraVisibilityEnvironment {
  documentTarget: SakuraDocumentTarget;
  windowTarget: SakuraWindowTarget;
}

export interface SakuraVisibilitySnapshot {
  documentVisible: boolean;
  windowFocused: boolean;
  paused: boolean;
}

export function readSakuraVisibility(
  environment: SakuraVisibilityEnvironment,
): SakuraVisibilitySnapshot {
  const documentVisible = environment.documentTarget.visibilityState === 'visible';
  const windowFocused = environment.documentTarget.hasFocus();
  return {
    documentVisible,
    windowFocused,
    paused: !documentVisible || !windowFocused,
  };
}

export function subscribeToSakuraVisibility(
  environment: SakuraVisibilityEnvironment,
  listener: (snapshot: SakuraVisibilitySnapshot) => void,
): () => void {
  let pageHidden = false;
  const publish = () => {
    const snapshot = readSakuraVisibility(environment);
    listener(
      pageHidden
        ? {
            documentVisible: false,
            windowFocused: snapshot.windowFocused,
            paused: true,
          }
        : snapshot,
    );
  };
  const onPageHide = () => {
    pageHidden = true;
    publish();
  };
  const onPageShow = () => {
    pageHidden = false;
    publish();
  };

  environment.documentTarget.addEventListener('visibilitychange', publish);
  environment.windowTarget.addEventListener('focus', publish);
  environment.windowTarget.addEventListener('blur', publish);
  environment.windowTarget.addEventListener('pagehide', onPageHide);
  environment.windowTarget.addEventListener('pageshow', onPageShow);
  publish();

  return () => {
    environment.documentTarget.removeEventListener('visibilitychange', publish);
    environment.windowTarget.removeEventListener('focus', publish);
    environment.windowTarget.removeEventListener('blur', publish);
    environment.windowTarget.removeEventListener('pagehide', onPageHide);
    environment.windowTarget.removeEventListener('pageshow', onPageShow);
  };
}

export function getBrowserSakuraVisibilityEnvironment(): SakuraVisibilityEnvironment | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return {
    documentTarget: document,
    windowTarget: window,
  };
}
