/**
 * DevConsole store + log primitives.
 *
 * The user wanted a "detailed console for you to read where ever
 * command, page, AI, API connection is" — i.e. a single in-app feed
 * that surfaces every cross-boundary event so a debugger (LLM or
 * human) can spot which step actually failed when something goes
 * wrong.
 *
 * Sources we capture:
 *   - `console.log/info/warn/error/debug` (patched, but originals
 *     still fire so devtools is unaffected).
 *   - `window.fetch` — every HTTP request + status + duration.
 *   - Tauri `invoke` — IPC commands going to the Rust backend.
 *   - `window.dispatchEvent` for `jarvis:*` custom events (route
 *     changes, AI runtime requests, action proposals, etc.).
 *   - `window.addEventListener('error', …)` and
 *     `window.addEventListener('unhandledrejection', …)` —
 *     uncaught errors from event handlers and rejected promises.
 *   - Manual logs from anywhere in the codebase via
 *     `devConsole.log({...})`.
 *
 * Storage is a bounded ring buffer (most recent N entries) so the UI
 * never has to render thousands of rows. Subscribers re-render on
 * every push, so the list stays live while open.
 *
 * Keeping the patcher install opt-in (called from boot, not at module
 * load time) means tests can opt out by simply not calling
 * `installPatchers`, and there's a single place to disable patching
 * if any of it ever fights another piece of the codebase.
 */

import { create } from 'zustand';

/**
 * Hard cap for the Full Dev Log. Ten thousand events is enough to retain a
 * long native debugging session while keeping memory and export size bounded.
 */
export const DEV_LOG_CAPACITY = 10_000;
const MAX_DETAIL_DEPTH = 5;
const MAX_OBJECT_KEYS = 40;
const MAX_ARRAY_ITEMS = 25;
const MAX_DETAIL_STRING = 4000;
const MAX_SERIALIZED_DETAIL = 24_000;
const REDACTED = '[redacted]';
const CONTENT_OMITTED = '[content omitted]';

const SENSITIVE_KEY_RE =
  /(authorization|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token|jwt|api[_-]?key|apikey|password|secret|client[_-]?secret|service[_-]?role)/i;
const SENSITIVE_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password|client[-_ ]?secret|private[-_ ]?key|secret)\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    `$1$2${REDACTED}`,
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9_]{8,}\b/g, REDACTED],
  [/\bwhsec_[A-Za-z0-9_]{8,}\b/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, REDACTED],
  [/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
];

const PRIVATE_CONTENT_KEYS = new Set([
  'args',
  'body',
  'completion',
  'content',
  'input',
  'instruction',
  'instructions',
  'filecontent',
  'message',
  'messagecontent',
  'messages',
  'output',
  'preview',
  'prompt',
  'query',
  'raw',
  'requestbody',
  'responsebody',
  'response',
  'result',
  'snippet',
  'source',
  'sourcecontent',
  'text',
  'transcript',
  'usertext',
]);

function isPrivateContentKey(key: string): boolean {
  return PRIVATE_CONTENT_KEYS.has(key.replace(/[-_\s]/g, '').toLowerCase());
}

function truncateString(value: string, max = MAX_DETAIL_STRING): string {
  return value.length > max
    ? `${value.slice(0, max)}…[truncated ${value.length - max} chars]`
    : value;
}

function redactString(value: string, max = MAX_DETAIL_STRING): string {
  let out = value;
  for (const [pattern, replacement] of SENSITIVE_VALUE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  out = out
    .replace(
      /([?&])(key|apikey|api_key|api-key|token|access_token|auth|authorization|signature|sig|secret|client_secret|password)=([^&#\s]*)/gi,
      (_match, delimiter: string, key: string) => `${delimiter}${key}=${REDACTED}`,
    )
    .replace(/\b[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gi, '%USERPROFILE%')
    .replace(/\b\/Users\/[^/\s"']+/g, '~')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]');
  return truncateString(out, max);
}

export function redactForLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return '[Function]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, 1000),
      stack: value.stack ? redactString(value.stack, 3000) : undefined,
    };
  }
  if (typeof value !== 'object') return redactString(String(value));
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DETAIL_DEPTH) return '[MaxDepth]';
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactForLog(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS)
      items.push(`[Truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
    return items;
  }

  const out: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries.slice(0, MAX_OBJECT_KEYS)) {
    out[key] = SENSITIVE_KEY_RE.test(key)
      ? REDACTED
      : isPrivateContentKey(key)
        ? CONTENT_OMITTED
        : redactForLog(child, depth + 1, seen);
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    out.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
  }
  return out;
}

function sanitizeDetail(value: unknown): unknown {
  const redacted = redactForLog(value);
  const serialized = safeStringify(redacted, 0);
  if (serialized.length <= MAX_SERIALIZED_DETAIL) return redacted;
  return {
    notice: '[detail bounded]',
    originalCharacters: serialized.length,
    preview: truncateString(serialized, 12_000),
  };
}

/** Channels group entries by source so the UI can filter quickly. */
export type DevLogChannel =
  | 'console' // patched console.* output
  | 'fetch' // window.fetch calls
  | 'invoke' // Tauri invoke calls
  | 'event' // window CustomEvent dispatches
  | 'route' // app route changes (lib/router style if/when it lands)
  | 'ai' // AI runtime lifecycle (request, chunk, done, error)
  | 'action' // action runner lifecycle
  | 'react' // React error boundary catches
  | 'window' // uncaught window errors / unhandled rejections
  | 'app'; // generic app-level breadcrumbs

export type DevLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DevLogViewMode = 'human' | 'deep';

/** A single feed entry. Immutable once pushed. */
export interface DevLogEntry {
  /** Stable monotonic id (used as React key). */
  id: number;
  /** When the event happened (ms epoch). */
  ts: number;
  /** Source channel. */
  channel: DevLogChannel;
  /** Severity. */
  level: DevLogLevel;
  /** Human-readable headline (one line). */
  message: string;
  /**
   * Optional structured payload. Anything JSON-stringifiable is fine.
   * We don't pre-serialise here so consumers can render rich previews
   * (status badges, durations, JSON tree) before falling back to
   * `JSON.stringify`.
   */
  detail?: unknown;
  /**
   * Optional duration in ms. Set on `fetch` / `invoke` entries that
   * record start + end so the UI can show "POST /v1/chat/completions
   * — 412 ms".
   */
  durationMs?: number;
}

interface DevConsoleState {
  entries: DevLogEntry[];
  open: boolean;
  /** Channels that are currently visible. Empty = all. */
  channels: Set<DevLogChannel>;
  /** Levels that are currently visible. Empty = all. */
  levels: Set<DevLogLevel>;
  /** Free-text search filter applied to message + JSON-stringified detail. */
  query: string;
  /** Human-readable timeline or exact sanitized trace rows. */
  viewMode: DevLogViewMode;

  /** Append a new entry. Truncates the head when the capacity is exceeded. */
  log: (e: Omit<DevLogEntry, 'id' | 'ts'> & { ts?: number }) => DevLogEntry;
  /** Drop every entry. */
  clear: () => void;

  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  setQuery: (q: string) => void;
  setViewMode: (mode: DevLogViewMode) => void;
  toggleChannel: (c: DevLogChannel) => void;
  toggleLevel: (l: DevLogLevel) => void;
  /** Reset all filters back to "show everything". */
  resetFilters: () => void;
}

let nextId = 1;

export const useDevConsoleStore = create<DevConsoleState>((set, get) => ({
  entries: [],
  open: false,
  channels: new Set<DevLogChannel>(),
  levels: new Set<DevLogLevel>(),
  query: '',
  viewMode: 'human',

  log: (e) => {
    const entry: DevLogEntry = {
      id: nextId++,
      ts: e.ts ?? Date.now(),
      level: e.level,
      channel: e.channel,
      message: redactString(e.message, 500),
      detail: e.detail === undefined ? undefined : sanitizeDetail(e.detail),
      durationMs:
        e.durationMs !== undefined && Number.isFinite(e.durationMs) && e.durationMs >= 0
          ? Math.round(Math.min(e.durationMs, 86_400_000) * 100) / 100
          : undefined,
    };
    set((s) => {
      const next = s.entries.concat(entry);
      // Trim from the front when over the cap. Splice would mutate
      // the array; we slice so React's reference-equality check fires
      // and subscribers re-render.
      const trimmed =
        next.length > DEV_LOG_CAPACITY ? next.slice(next.length - DEV_LOG_CAPACITY) : next;
      return { entries: trimmed };
    });
    return entry;
  },

  clear: () => set({ entries: [] }),

  setOpen: (v) => set({ open: v }),
  toggleOpen: () => set({ open: !get().open }),
  setQuery: (q) => set({ query: q }),
  setViewMode: (viewMode) => set({ viewMode }),

  toggleChannel: (c) =>
    set((s) => {
      const next = new Set(s.channels);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { channels: next };
    }),
  toggleLevel: (l) =>
    set((s) => {
      const next = new Set(s.levels);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return { levels: next };
    }),
  resetFilters: () =>
    set({
      channels: new Set<DevLogChannel>(),
      levels: new Set<DevLogLevel>(),
      query: '',
    }),
}));

/**
 * Imperative facade so non-React code (the AI runtime, action runner,
 * fetch patcher, error boundary) can push entries without a React
 * subscription. The store getter is cheap; we deliberately don't
 * cache the reference because Zustand allows the store to be reset
 * in tests.
 */
export const devConsole = {
  log: (e: Omit<DevLogEntry, 'id' | 'ts'> & { ts?: number }) =>
    useDevConsoleStore.getState().log(e),
  clear: () => useDevConsoleStore.getState().clear(),
  setOpen: (v: boolean) => useDevConsoleStore.getState().setOpen(v),
  toggleOpen: () => useDevConsoleStore.getState().toggleOpen(),
};

/* -------------------------------------------------------------------------- */
/*  Filter helper                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Apply the store's current filter set to an entry list. Pulled out
 * so the UI can re-use the same logic for the live feed and the
 * "copy filtered" action.
 */
export function filterEntries(
  entries: DevLogEntry[],
  filters: {
    channels: Set<DevLogChannel>;
    levels: Set<DevLogLevel>;
    query: string;
  },
): DevLogEntry[] {
  const { channels, levels, query } = filters;
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (channels.size > 0 && !channels.has(e.channel)) return false;
    if (levels.size > 0 && !levels.has(e.level)) return false;
    if (q.length > 0) {
      const haystack = `${e.message}\n${
        e.detail !== undefined ? safeStringify(e.detail) : ''
      }`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * `JSON.stringify` that won't throw on circular references — the
 * fetch / invoke patchers occasionally pass through objects that
 * embed Headers or Response which are non-serialisable.
 */
export function safeStringify(value: unknown, space = 2): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === 'bigint') return `${v}n`;
        if (v instanceof Error) {
          return { name: v.name, message: v.message, stack: v.stack };
        }
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v as object)) return '[Circular]';
          seen.add(v as object);
        }
        return v as unknown;
      },
      space,
    );
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserialisable]';
    }
  }
}
