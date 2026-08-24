import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

type OutputListener = (payload: TerminalOutputPayload) => void;
type AttachNativeListener = (listener: OutputListener) => Promise<UnlistenFn>;

export interface TerminalOutputSubscription {
  bind(sessionId: string): void;
  unsubscribe(): void;
}

/**
 * Index subscriptions by the only two routing states the native stream uses:
 * unbound startup listeners and listeners bound to one exact PTY session.
 * Candidate ids are returned in original subscription order so replacing the
 * former full-map scan does not change listener ordering.
 */
export function createTerminalOutputIndex() {
  const sessionById = new Map<number, string | undefined>();
  const unbound = new Set<number>();
  const bySession = new Map<string, Set<number>>();

  const removeFromBucket = (id: number, sessionId: string | undefined) => {
    if (sessionId === undefined) {
      unbound.delete(id);
      return;
    }
    const bucket = bySession.get(sessionId);
    bucket?.delete(id);
    if (bucket?.size === 0) bySession.delete(sessionId);
  };

  return {
    add(id: number) {
      sessionById.set(id, undefined);
      unbound.add(id);
    },
    bind(id: number, sessionId: string) {
      if (!sessionById.has(id)) return;
      removeFromBucket(id, sessionById.get(id));
      sessionById.set(id, sessionId);
      let bucket = bySession.get(sessionId);
      if (!bucket) {
        bucket = new Set<number>();
        bySession.set(sessionId, bucket);
      }
      bucket.add(id);
    },
    remove(id: number) {
      if (!sessionById.has(id)) return;
      removeFromBucket(id, sessionById.get(id));
      sessionById.delete(id);
    },
    targets(sessionId: string): number[] {
      const exact = bySession.get(sessionId);
      if (!exact?.size) return [...unbound];
      return [...unbound, ...exact].sort((left, right) => left - right);
    },
  };
}

export function createTerminalOutputRouter(attachNativeListener: AttachNativeListener) {
  let nextId = 1;
  let detachNative: UnlistenFn | undefined;
  let attachInFlight: Promise<void> | undefined;
  const subscriptions = new Map<
    number,
    { listener: OutputListener; sessionId: string | undefined }
  >();
  const outputIndex = createTerminalOutputIndex();

  const route = (payload: TerminalOutputPayload) => {
    for (const id of outputIndex.targets(payload.sessionId)) {
      const subscription = subscriptions.get(id);
      if (!subscription) continue;
      if (subscription.sessionId === undefined || subscription.sessionId === payload.sessionId) {
        try {
          subscription.listener(payload);
        } catch {
          // A failed pane must not prevent other terminals from receiving output.
          // Keep the warning content-free because terminal payloads can be sensitive.
          console.warn('[terminal-output-router] pane listener failed');
        }
      }
    }
  };

  const ensureAttached = async () => {
    if (detachNative) return;
    if (!attachInFlight) {
      attachInFlight = attachNativeListener(route)
        .then((detach) => {
          detachNative = detach;
        })
        .finally(() => {
          attachInFlight = undefined;
        });
    }
    await attachInFlight;
  };

  return {
    async subscribe(listener: OutputListener): Promise<TerminalOutputSubscription> {
      const id = nextId++;
      const subscription = { listener, sessionId: undefined as string | undefined };
      subscriptions.set(id, subscription);
      outputIndex.add(id);
      try {
        await ensureAttached();
      } catch (error) {
        subscriptions.delete(id);
        outputIndex.remove(id);
        throw error;
      }

      let active = true;
      return {
        bind(sessionId) {
          if (active) {
            subscription.sessionId = sessionId;
            outputIndex.bind(id, sessionId);
          }
        },
        unsubscribe() {
          if (!active) return;
          active = false;
          subscriptions.delete(id);
          outputIndex.remove(id);
          if (subscriptions.size === 0 && detachNative) {
            const detach = detachNative;
            detachNative = undefined;
            detach();
          }
        },
      };
    },
  };
}

const sharedTerminalOutputRouter = createTerminalOutputRouter(async (listener) =>
  listen<TerminalOutputPayload>('terminal://output', (event) => listener(event.payload)),
);

export const subscribeTerminalOutput = sharedTerminalOutputRouter.subscribe;
