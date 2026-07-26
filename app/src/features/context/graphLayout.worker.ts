/// <reference lib="webworker" />

import { layoutGraph, type ContextGraphLayoutRequest } from './graphPerformance';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  try {
    self.postMessage(layoutGraph(event.data as ContextGraphLayoutRequest));
  } catch {
    const requestId =
      event.data &&
      typeof event.data === 'object' &&
      Number.isSafeInteger((event.data as { requestId?: unknown }).requestId)
        ? ((event.data as { requestId: number }).requestId ?? 0)
        : 0;
    self.postMessage({ version: 1, requestId, nodes: [] });
  }
});
