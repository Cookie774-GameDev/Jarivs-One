import type {
  ChatActivityCategory,
  ChatActivityEvent,
  ChatActivityKind,
  ChatActivitySemanticIntent,
  ChatActivityStatus,
} from '@/features/chat/activity/types';
import type { JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';

const MAX_PROJECTION_ITEMS = 500;

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_PROJECTION_ITEMS;
  return Math.max(1, Math.min(MAX_PROJECTION_ITEMS, Math.trunc(value)));
}

function activityKind(type: JarvisEvent['type']): ChatActivityKind {
  switch (type) {
    case 'artifact':
      return 'file';
    case 'retrieval':
      return 'url';
    case 'tool':
    case 'terminal':
    case 'approval':
    case 'warning':
    case 'error':
      return 'tool';
    default:
      return 'agent';
  }
}

function activityCategory(type: JarvisEvent['type']): ChatActivityCategory {
  switch (type) {
    case 'artifact':
      return 'file';
    case 'retrieval':
      return 'file';
    case 'tool':
    case 'terminal':
    case 'approval':
    case 'warning':
    case 'error':
      return 'thinking';
    case 'message':
      return 'response';
    case 'context':
      return 'context';
    case 'run_state':
    case 'model':
      return 'thinking';
  }
}

function activityTitle(type: JarvisEvent['type']): string {
  switch (type) {
    case 'run_state':
      return 'Jarvis status';
    case 'model':
      return 'Jarvis model activity';
    case 'context':
      return 'Jarvis context activity';
    case 'retrieval':
      return 'Jarvis retrieval activity';
    case 'tool':
      return 'Jarvis tool activity';
    case 'terminal':
      return 'Jarvis terminal activity';
    case 'approval':
      return 'Jarvis approval activity';
    case 'artifact':
      return 'Jarvis artifact activity';
    case 'message':
      return 'Jarvis message activity';
    case 'warning':
      return 'Jarvis warning';
    case 'error':
      return 'Jarvis error';
  }
}

function structuredOperation(event: JarvisEvent): string | undefined {
  if (event.type === 'terminal') return 'terminal';
  if (event.type !== 'tool') return undefined;
  const identity =
    event.producerSourceEvidence?.producerIdentity ?? event.liveEvidence?.producerIdentity;
  if (identity?.producerKind === 'mcp') return identity.toolName;
  if (identity?.producerKind === 'action' || identity?.producerKind === 'file_action') {
    return identity.actionId;
  }
  if (identity?.producerKind === 'plugin') {
    return event.liveEvidence?.operations[0] ?? identity.pluginId;
  }
  if (identity?.producerKind === 'terminal') return 'terminal';
  return event.liveEvidence?.operations[0];
}

function activityStatus(event: JarvisEvent, run: JarvisRun): ChatActivityStatus {
  if (event.type === 'error') return 'error';
  const status = event.status ?? run.status;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed' || status === 'timed_out') return 'error';
  if (status === 'queued' || status === 'compiling') return 'pending';
  if (status === 'running' || status === 'awaiting_approval') return 'running';
  return 'done';
}

function normalizedToolName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const MAIL_PLUGIN_IDS = new Set([
  'gmail',
  'google_mail',
  'microsoft_outlook',
  'outlook',
  'mailgun',
  'postmark',
  'resend',
  'sendgrid',
]);

function mailOperation(value: string): boolean {
  const operation = normalizedToolName(value);
  return (
    /^(?:send|draft|compose|reply|forward)_(?:email|mail)$/u.test(operation) ||
    /^(?:email|mail)_(?:send|draft|compose|reply|forward)$/u.test(operation)
  );
}

function shipOperation(value: string): boolean {
  const operation = normalizedToolName(value);
  return (
    /^(?:deploy|publish|release|ship)(?:_|$)/u.test(operation) ||
    /^launch_(?:app|application|site|website|release|update|pricing)(?:_|$)/u.test(operation)
  );
}

function structuredToolIntent(event: JarvisEvent): ChatActivitySemanticIntent | undefined {
  if (event.type !== 'tool') return undefined;
  const identity =
    event.producerSourceEvidence?.producerIdentity ?? event.liveEvidence?.producerIdentity;
  if (identity?.producerKind === 'mcp') {
    if (mailOperation(identity.toolName)) return 'mail';
    if (shipOperation(identity.toolName)) return 'ship';
  }
  if (identity?.producerKind === 'plugin' && event.liveEvidence?.producerKind === 'plugin') {
    const pluginId = normalizedToolName(identity.pluginId);
    if (MAIL_PLUGIN_IDS.has(pluginId) && event.liveEvidence.operations.some(mailOperation)) {
      return 'mail';
    }
    if (event.liveEvidence.operations.some(shipOperation)) return 'ship';
  }
  return undefined;
}

function internalKey(run: JarvisRun, event: JarvisEvent): string {
  const sources = event.sourceRefs
    .filter((source) => source.accountId === run.accountId)
    .map((source) => `source:${source.id}`)
    .sort();
  const artifacts = event.artifactIds.map((id) => `artifact:${id}`).sort();
  return [`run:${run.id}`, `event:${event.seq}`, ...sources, ...artifacts].join('|');
}

export function projectJarvisEventsForLegacyActivity(input: {
  run: JarvisRun;
  events: readonly JarvisEvent[];
  limit?: number;
}): readonly ChatActivityEvent[] {
  const limit = clampLimit(input.limit);
  const chatId = input.run.chatId ?? `jarvis-run:${input.run.id}`;
  const events = input.events
    .filter((event) => event.runId === input.run.id)
    .sort((left, right) => left.seq - right.seq || left.createdAt - right.createdAt)
    .slice(-limit)
    .map((event) => {
      const semanticIntent = structuredToolIntent(event);
      const operation = structuredOperation(event);
      return Object.freeze({
        id: internalKey(input.run, event),
        chatId,
        kind: activityKind(event.type),
        category: activityCategory(event.type),
        ...(semanticIntent ? { semanticIntent } : {}),
        status: activityStatus(event, input.run),
        title: activityTitle(event.type),
        ...(operation?.trim() ? { subtitle: operation.trim() } : {}),
        ...(event.safeSummary?.trim() ? { detail: event.safeSummary.trim() } : {}),
        ts: event.createdAt,
        ...(event.status === 'running' ? { startedAt: event.createdAt } : {}),
        ...(['completed', 'partial', 'failed', 'timed_out', 'cancelled'].includes(
          event.status ?? '',
        )
          ? { endedAt: event.createdAt }
          : {}),
      });
    });
  return Object.freeze(events);
}
