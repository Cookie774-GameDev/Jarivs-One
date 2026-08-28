import * as React from 'react';
import {
  OPENCODE_SYSTEM_LOG_REQUEST_EVENT,
  OPENCODE_SYSTEM_LOG_PING_EVENT,
  OPENCODE_SYSTEM_LOG_READY_EVENT,
  OPENCODE_SYSTEM_LOG_STORAGE_KEY,
  OPENCODE_SYSTEM_LOG_UPDATE_EVENT,
  readOpenCodeSystemLogPayload,
  type OpenCodeSystemLogPayload,
  type OpenCodeSystemStepKind,
} from './opencodeSystemLog';
import './opencodeSystemLog.css';

const ICONS: Record<OpenCodeSystemStepKind, string> = {
  request: '↗',
  context: '⌁',
  siyuan: '◎',
  model: '✦',
  warning: '!',
};

function duration(value: number): string {
  return value < 1_000
    ? `${Math.round(value)} ms`
    : `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

export function OpenCodeSystemLogWindow() {
  const [payload, setPayload] = React.useState<OpenCodeSystemLogPayload>(() =>
    readOpenCodeSystemLogPayload(window.localStorage),
  );

  React.useEffect(() => {
    const onUpdate = (event: Event) => {
      const next = (event as CustomEvent<OpenCodeSystemLogPayload>).detail;
      if (next?.version === 1 && Array.isArray(next.steps)) setPayload(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === OPENCODE_SYSTEM_LOG_STORAGE_KEY) {
        setPayload(readOpenCodeSystemLogPayload(window.localStorage));
      }
    };
    window.addEventListener(OPENCODE_SYSTEM_LOG_UPDATE_EVENT, onUpdate);
    window.addEventListener('storage', onStorage);
    let stopNativeUpdate: () => void = () => undefined;
    let stopNativePing: () => void = () => undefined;
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/event')
        .then(async ({ emitTo, listen }) => {
          const emitReady = () =>
            emitTo('main', OPENCODE_SYSTEM_LOG_READY_EVENT, {
              version: 1,
              updatedAt: Date.now(),
              stepCount: payload.steps.length,
            });
          stopNativeUpdate = await listen<OpenCodeSystemLogPayload>(
            OPENCODE_SYSTEM_LOG_UPDATE_EVENT,
            (event) => setPayload(event.payload),
          );
          stopNativePing = await listen(OPENCODE_SYSTEM_LOG_PING_EVENT, () => {
            void emitReady();
          });
          await emitTo('main', OPENCODE_SYSTEM_LOG_REQUEST_EVENT);
          await emitReady();
        })
        .catch(() => undefined);
    }
    return () => {
      stopNativeUpdate();
      stopNativePing();
      window.removeEventListener(OPENCODE_SYSTEM_LOG_UPDATE_EVENT, onUpdate);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const clear = () => {
    window.localStorage.removeItem(OPENCODE_SYSTEM_LOG_STORAGE_KEY);
    setPayload({ version: 1, updatedAt: Date.now(), steps: [] });
  };

  return (
    <main className="opencode-system-log">
      <header>
        <div className="eyebrow">Plain-language live trace</div>
        <h1>OpenCode system log</h1>
        <p>
          The important OpenCode, RLM, and SiYuan steps from this VibeSpace session. Private prompts
          and noisy background checks stay out of this view.
        </p>
        <div className="statusbar">
          <span className="pill">
            {payload.steps.length
              ? `${payload.steps.length} meaningful steps · live`
              : 'Waiting for activity'}
          </span>
          <button type="button" onClick={clear}>
            Clear this view
          </button>
        </div>
      </header>
      <section className="timeline" aria-live="polite">
        {payload.steps.length ? (
          [...payload.steps].reverse().map((item) => (
            <article
              key={`${item.id}-${item.ts}`}
              className="step"
              data-kind={item.kind}
              data-status={item.status}
            >
              <div className="icon" aria-hidden="true">
                {ICONS[item.kind]}
              </div>
              <div>
                <h2>
                  {item.title}
                  {(item.repeatCount ?? 0) > 1 ? <small> ×{item.repeatCount}</small> : null}
                </h2>
                <p>{item.summary}</p>
              </div>
              <div className="when">
                {new Intl.DateTimeFormat(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                }).format(new Date(item.ts))}
                {typeof item.durationMs === 'number' ? (
                  <span className="duration">{duration(item.durationMs)}</span>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="empty">
            <strong>No OpenCode activity yet</strong>Send a message or create a SiYuan Context Map.
            The important steps will appear here automatically.
          </div>
        )}
      </section>
    </main>
  );
}
