import { redactForLog, safeStringify, type DevLogEntry } from './store';

export type DevLogLaneKind = 'request' | 'model' | 'rlm' | 'tool' | 'siyuan';

export interface DevLogEvidenceLane {
  id: string;
  kind: DevLogLaneKind;
  label: string;
  count: number;
  entryIds: number[];
}

export interface DevLogVirtualWindow {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

export interface DevLogArtifact {
  filename: string;
  mimeType: 'application/json;charset=utf-8' | 'text/html;charset=utf-8';
  content: string;
}

const CHANNEL_LABELS: Record<DevLogEntry['channel'], string> = {
  action: 'Jarvis action',
  ai: 'AI run',
  app: 'VibeSpace',
  console: 'Renderer console',
  event: 'App event',
  fetch: 'Network request',
  invoke: 'Native command',
  react: 'Interface error',
  route: 'Navigation',
  window: 'Runtime error',
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectScalars(
  value: unknown,
  target: Map<string, string | number | boolean>,
  depth = 0,
): void {
  if (depth > 4) return;
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 25)) collectScalars(child, target, depth + 1);
    return;
  }
  const record = recordOf(value);
  if (!record) return;
  for (const [rawKey, child] of Object.entries(record).slice(0, 50)) {
    const key = rawKey.replace(/[-_\s]/g, '').toLowerCase();
    if (
      (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') &&
      !target.has(key)
    ) {
      target.set(key, child);
    } else if (child && typeof child === 'object') {
      collectScalars(child, target, depth + 1);
    }
  }
}

function scalar(
  values: Map<string, string | number | boolean>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = values.get(key);
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function addLane(
  lanes: Map<string, DevLogEvidenceLane>,
  lane: Omit<DevLogEvidenceLane, 'count' | 'entryIds'>,
  entryId: number,
): void {
  const existing = lanes.get(lane.id);
  if (existing) {
    existing.count += 1;
    existing.entryIds.push(entryId);
    return;
  }
  lanes.set(lane.id, { ...lane, count: 1, entryIds: [entryId] });
}

/** Build only lanes justified by exact fields or explicit subsystem evidence. */
export function buildEvidenceLanes(entries: readonly DevLogEntry[]): DevLogEvidenceLane[] {
  const lanes = new Map<string, DevLogEvidenceLane>();
  for (const entry of entries) {
    const values = new Map<string, string | number | boolean>();
    collectScalars(entry.detail, values);
    const requestId = scalar(values, ['requestid', 'runid', 'operationid']);
    if (requestId) {
      addLane(
        lanes,
        { id: `request:${requestId}`, kind: 'request', label: `Request ${requestId}` },
        entry.id,
      );
    }

    const provider = scalar(values, ['providerid', 'provider']);
    const model = scalar(values, ['modelid', 'model']);
    if (provider || model) {
      const identity = [provider, model].filter(Boolean).join(' / ');
      const effort = scalar(values, ['runtimeeffort', 'effort', 'variant']);
      addLane(
        lanes,
        {
          id: `model:${provider ?? 'unknown'}:${model ?? 'unknown'}:${effort ?? ''}`,
          kind: 'model',
          label: `Model ${identity}${effort ? ` · ${effort}` : ''}`,
        },
        entry.id,
      );
    }

    const rlmValue = values.get('rlmenabled') ?? values.get('rlm');
    if (typeof rlmValue === 'boolean' || /\bRLM\b/u.test(entry.message)) {
      const label = typeof rlmValue === 'boolean' ? `RLM ${rlmValue ? 'on' : 'off'}` : 'RLM';
      addLane(lanes, { id: `rlm:${String(rlmValue)}`, kind: 'rlm', label }, entry.id);
    }

    const tool = scalar(values, ['toolname', 'tool']);
    if (tool) {
      addLane(lanes, { id: `tool:${tool}`, kind: 'tool', label: `Tool ${tool}` }, entry.id);
    }

    const hasSiYuanField = [...values.keys()].some((key) => key.startsWith('siyuan'));
    if (hasSiYuanField || /\bSiYuan\b/iu.test(entry.message)) {
      addLane(lanes, { id: 'siyuan', kind: 'siyuan', label: 'SiYuan' }, entry.id);
    }
  }
  return [...lanes.values()];
}

export function formatDevLogTimestamp(ts: number): string {
  const date = new Date(ts);
  const parts = [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) =>
    String(part).padStart(2, '0'),
  );
  return `${parts.join(':')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export function formatDuration(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return undefined;
  return `${Number.isInteger(durationMs) ? durationMs : durationMs.toFixed(2)} ms`;
}

export function humanizeEntry(entry: DevLogEntry): {
  eyebrow: string;
  title: string;
  duration?: string;
} {
  return {
    eyebrow: CHANNEL_LABELS[entry.channel],
    title: entry.message,
    ...(formatDuration(entry.durationMs) ? { duration: formatDuration(entry.durationMs) } : {}),
  };
}

export function calculateVirtualWindow(input: {
  count: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan?: number;
}): DevLogVirtualWindow {
  const count = Math.max(0, Math.floor(input.count));
  const rowHeight = Math.max(1, input.rowHeight);
  const overscan = Math.max(0, Math.floor(input.overscan ?? 6));
  const requestedFirst = Math.max(0, Math.floor(Math.max(0, input.scrollTop) / rowHeight));
  const firstVisible = count === 0 ? 0 : Math.min(count - 1, requestedFirst);
  const visibleCount = Math.max(1, Math.ceil(Math.max(0, input.viewportHeight) / rowHeight));
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + visibleCount + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight: count * rowHeight };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeEntries(entries: readonly DevLogEntry[]): DevLogEntry[] {
  return entries.slice(-10_000).map((entry) => ({
    ...entry,
    message: String(redactForLog(entry.message)),
    ...(entry.detail === undefined ? {} : { detail: redactForLog(entry.detail) }),
  }));
}

export function exportDevLog(
  entries: readonly DevLogEntry[],
  format: 'json' | 'html',
  generatedAt = Date.now(),
): DevLogArtifact {
  const sanitized = safeEntries(entries);
  const iso = new Date(generatedAt).toISOString();
  const stamp = iso.replace(/[:.]/g, '-');
  if (format === 'json') {
    return {
      filename: `vibespace-full-dev-log-${stamp}.json`,
      mimeType: 'application/json;charset=utf-8',
      content: safeStringify({ schemaVersion: 1, generatedAt: iso, entries: sanitized }),
    };
  }
  const rows = sanitized
    .map((entry) => {
      const detail = entry.detail === undefined ? '' : safeStringify(entry.detail, 0);
      return `<tr><td>${escapeHtml(formatDevLogTimestamp(entry.ts))}</td><td>${escapeHtml(entry.level)}</td><td>${escapeHtml(entry.channel)}</td><td>${escapeHtml(entry.message)}</td><td>${escapeHtml(formatDuration(entry.durationMs) ?? '')}</td><td><pre>${escapeHtml(detail)}</pre></td></tr>`;
    })
    .join('');
  return {
    filename: `vibespace-full-dev-log-${stamp}.html`,
    mimeType: 'text/html;charset=utf-8',
    content: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width"><title>VibeSpace Full Dev Log</title><style>body{margin:0;padding:24px;background:#f5ead9;color:#3c3028;font:14px system-ui,sans-serif}h1{font:600 24px Georgia,serif;margin:0 0 4px}p{color:#756457;margin:0 0 20px}table{width:100%;border-collapse:collapse;background:#fffaf2cc;border:1px solid #d9c4aa}th,td{padding:8px;border-bottom:1px solid #e5d6c4;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#efe0cc}td:first-child,td:nth-child(2),td:nth-child(3),td:nth-child(5){white-space:nowrap;font-family:ui-monospace,monospace}pre{max-width:50vw;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:12px ui-monospace,monospace}</style></head><body><h1>VibeSpace Full Dev Log</h1><p>${escapeHtml(iso)} · ${sanitized.length} sanitized entries</p><table><thead><tr><th>Time</th><th>Level</th><th>Channel</th><th>Event</th><th>Duration</th><th>Sanitized detail</th></tr></thead><tbody>${rows}</tbody></table></body></html>`,
  };
}
