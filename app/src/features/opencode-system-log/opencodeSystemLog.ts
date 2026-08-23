import type { DevLogEntry } from '@/features/dev-console';

export const OPENCODE_SYSTEM_LOG_STORAGE_KEY = 'vibespace.opencode-system-log.v1';
export const OPENCODE_SYSTEM_LOG_WINDOW_LABEL = 'opencode-system-log';
export const OPENCODE_SYSTEM_LOG_OPEN_EVENT = 'vibespace:open-opencode-system-log';
export const OPENCODE_SYSTEM_LOG_CAPACITY = 500;

export type OpenCodeSystemStepKind = 'request' | 'context' | 'siyuan' | 'model' | 'warning';
export type OpenCodeSystemStepStatus = 'working' | 'success' | 'warning' | 'error';

export interface OpenCodeSystemStep {
  id: number;
  ts: number;
  kind: OpenCodeSystemStepKind;
  title: string;
  summary: string;
  status: OpenCodeSystemStepStatus;
  durationMs?: number;
  repeatCount?: number;
}

function detailRecord(entry: DevLogEntry): Record<string, unknown> {
  return entry.detail && typeof entry.detail === 'object' && !Array.isArray(entry.detail)
    ? (entry.detail as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function step(
  entry: DevLogEntry,
  input: Omit<OpenCodeSystemStep, 'id' | 'ts' | 'durationMs'>,
): OpenCodeSystemStep {
  return {
    id: entry.id,
    ts: entry.ts,
    ...input,
    ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
  };
}

export function translateOpenCodeSystemEntry(entry: DevLogEntry): OpenCodeSystemStep | null {
  const message = entry.message;
  const lower = message.toLowerCase();
  const detail = detailRecord(entry);

  if (
    /(poll|heartbeat|health|runtime[_ -]?status|boot[_ -]?progress|listening|catalog refresh)/i.test(
      message,
    )
  ) {
    return null;
  }

  if (entry.channel === 'ai' && /^AI request|request accepted|provider dispatch/i.test(message)) {
    const provider = textValue(detail.provider) ?? textValue(detail.providerId) ?? 'OpenCode';
    const model = textValue(detail.model) ?? textValue(detail.modelId);
    return step(entry, {
      kind: 'request',
      title: 'OpenCode received your message',
      summary: model
        ? `${provider} · ${model}`
        : 'Preparing the selected model and project context',
      status: 'working',
    });
  }

  if (entry.channel === 'ai' && lower.startsWith('vibespace context route')) {
    const route = textValue(detail.route) ?? message.split('→').at(-1)?.trim() ?? 'context';
    const evidenceCount = numberValue(detail.evidenceCount) ?? 0;
    const candidateCount = numberValue(detail.candidateCount) ?? 0;
    return step(entry, {
      kind: 'context',
      title:
        route.toLowerCase() === 'rlm'
          ? 'RLM found useful project context'
          : 'Project context is ready',
      summary:
        evidenceCount > 0
          ? `${evidenceCount} trusted pieces selected from ${candidateCount || evidenceCount} candidates`
          : route.toLowerCase() === 'direct'
            ? 'The direct Context route answered without a recursive search'
            : `Context route: ${route}`,
      status: 'success',
    });
  }

  if (
    entry.channel === 'ai' &&
    /context\/rlm retrieval failed|context.*failed safely/i.test(message)
  ) {
    return step(entry, {
      kind: 'warning',
      title: 'Project context could not be added',
      summary:
        'The model was kept separate from unverified context. The engineering log has details.',
      status: 'warning',
    });
  }

  if (entry.channel === 'ai' && lower === 'siyuan context map synchronized') {
    const fileCount = numberValue(detail.fileCount) ?? 0;
    return step(entry, {
      kind: 'siyuan',
      title: detail.updated ? 'SiYuan refreshed the Context Map' : 'SiYuan added the Context Map',
      summary:
        fileCount > 0
          ? `${fileCount} ${fileCount === 1 ? 'file is' : 'files are'} ready in the local project vault.`
          : 'The map is ready in the local project vault.',
      status: 'success',
    });
  }

  if (/siyuan/i.test(message) && (entry.channel === 'invoke' || entry.channel === 'ai')) {
    const failed = entry.level === 'error' || /fail|error|reject|unavailable/i.test(message);
    const action = /search/i.test(message)
      ? 'searched the project vault'
      : /create|update|write|document/i.test(message)
        ? 'updated the project vault'
        : /start|ready|boot/i.test(message)
          ? 'made the project vault ready'
          : 'worked with the project vault';
    return step(entry, {
      kind: failed ? 'warning' : 'siyuan',
      title: failed ? 'SiYuan could not finish this step' : `SiYuan ${action}`,
      summary: failed
        ? 'No unverified vault result was used. The engineering log has the safe error code.'
        : 'The local SiYuan Context vault stayed inside this project.',
      status: failed ? 'error' : 'success',
    });
  }

  if (entry.channel === 'ai' && lower.startsWith('ai done')) {
    const provider = textValue(detail.provider) ?? 'OpenCode';
    const model = textValue(detail.model);
    return step(entry, {
      kind: 'model',
      title: 'OpenCode finished the answer',
      summary: model ? `${provider} · ${model}` : provider,
      status: 'success',
    });
  }

  if (entry.channel === 'ai' && /^AI error|setup failed|dispatch.*failed/i.test(message)) {
    return step(entry, {
      kind: 'warning',
      title: 'OpenCode could not finish the answer',
      summary:
        'The exact selected route was not substituted. Open the engineering log for the safe error.',
      status: 'error',
    });
  }

  return null;
}

export function buildOpenCodeSystemTimeline(entries: readonly DevLogEntry[]): OpenCodeSystemStep[] {
  const output: OpenCodeSystemStep[] = [];
  for (const entry of entries) {
    const translated = translateOpenCodeSystemEntry(entry);
    if (!translated) continue;
    const previous = output.at(-1);
    if (
      previous &&
      previous.kind === translated.kind &&
      previous.title === translated.title &&
      previous.summary === translated.summary &&
      translated.ts - previous.ts <= 5_000
    ) {
      previous.repeatCount = (previous.repeatCount ?? 1) + 1;
      previous.ts = translated.ts;
      previous.id = translated.id;
      previous.durationMs = translated.durationMs ?? previous.durationMs;
      continue;
    }
    output.push(translated);
  }
  return output.slice(-OPENCODE_SYSTEM_LOG_CAPACITY);
}
