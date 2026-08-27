import { applySecretPolicy } from '@/lib/security/secretDetector';
import type { Message } from '@/types';
import type { ChatActivityEvent, ChatActivityStatus } from '../activity/types';

export const MAX_LEDGER_RECEIPTS = 500;

export type LedgerReceiptKind =
  | 'read'
  | 'search'
  | 'command'
  | 'edit'
  | 'check'
  | 'subagent'
  | 'other';
export type UsageProvenance = 'exact' | 'estimated' | 'unavailable';

export type LedgerUsageValue = Readonly<{
  value: number | null;
  provenance: UsageProvenance;
  source: 'response-metadata' | 'provider-reported' | 'local-estimate' | 'unavailable';
}>;

export type AssistantActivityReceipt = Readonly<{
  id: string;
  kind: LedgerReceiptKind;
  label: string;
  status: ChatActivityStatus;
  ts: number;
  durationMs?: number;
  filePath?: string;
  fileLabel?: string;
  agentSlug?: string;
  countsAsAction: boolean;
}>;

export type AssistantActivityLedgerProjection = Readonly<{
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'error';
  currentOperation?: string;
  actionsTotal: number;
  readsTotal: number;
  searchesTotal: number;
  commandsTotal: number;
  editedFilesTotal: number;
  verifiedChecksTotal: number;
  failedChecksTotal: number;
  subagentsTotal: number;
  usage: Readonly<{ input: LedgerUsageValue; output: LedgerUsageValue }>;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  receipts: readonly AssistantActivityReceipt[];
  omittedReceipts: number;
}>;

const COMMAND_TOOL = /(?:^|[._:/-])(shell|terminal|command|exec|powershell|bash)(?:$|[._:/-])/i;
const READ_TOOL = /(?:^|[._:/-])(read|open|get_file|file_read)(?:$|[._:/-])/i;
const SEARCH_TOOL = /(?:^|[._:/-])(search|find|grep|glob|query)(?:$|[._:/-])/i;
const EDIT_TOOL = /(?:^|[._:/-])(edit|write|patch|apply_patch|replace)(?:$|[._:/-])/i;
const CHECK_TOOL = /(?:^|[._:/-])(test|verify|check|lint|build)(?:$|[._:/-])/i;
const SUBAGENT_TOOL = /(?:^|[._:/-])(subagent|agent_spawn|spawn_agent|delegate)(?:$|[._:/-])/i;

function safeText(value: string, max = 4096): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const redacted = applySecretPolicy(normalized, 'redact').text ?? '';
  return redacted.slice(0, max);
}

function safeFileLabel(filePath: string): string {
  const leaf = filePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? '';
  return safeText(leaf, 256) || 'File';
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function toolKind(tool: string): LedgerReceiptKind {
  if (SUBAGENT_TOOL.test(tool)) return 'subagent';
  if (COMMAND_TOOL.test(tool)) return 'command';
  if (READ_TOOL.test(tool)) return 'read';
  if (SEARCH_TOOL.test(tool)) return 'search';
  if (EDIT_TOOL.test(tool)) return 'edit';
  if (CHECK_TOOL.test(tool)) return 'check';
  return 'other';
}

function activityKind(event: ChatActivityEvent): LedgerReceiptKind {
  if (event.kind === 'diff') return 'edit';
  if (event.kind === 'url') return 'search';
  if (event.kind === 'subagent') return 'subagent';
  if (event.kind === 'file') return 'read';
  if (event.kind === 'tool' && event.category === 'file') return 'read';
  if (event.kind === 'tool' && event.category === 'writing') return 'edit';
  return 'other';
}

function receiptLabel(kind: LedgerReceiptKind, status: ChatActivityStatus): string {
  const lifecycle = <T extends string>(labels: Record<ChatActivityStatus, T>): T => labels[status];
  if (kind === 'command')
    return lifecycle({
      pending: 'Command queued',
      running: 'Running command',
      done: 'Ran command',
      cancelled: 'Command cancelled',
      error: 'Command failed',
    });
  if (kind === 'read')
    return lifecycle({
      pending: 'File read queued',
      running: 'Reading file',
      done: 'Read file',
      cancelled: 'File read cancelled',
      error: 'File read failed',
    });
  if (kind === 'search')
    return lifecycle({
      pending: 'Search queued',
      running: 'Searching',
      done: 'Searched',
      cancelled: 'Search cancelled',
      error: 'Search failed',
    });
  if (kind === 'edit')
    return lifecycle({
      pending: 'Edit queued',
      running: 'Editing file',
      done: 'Edited file',
      cancelled: 'Edit cancelled',
      error: 'Edit failed',
    });
  if (kind === 'check')
    return lifecycle({
      pending: 'Check queued',
      running: 'Checking',
      done: 'Verified check',
      cancelled: 'Check cancelled',
      error: 'Check failed',
    });
  if (kind === 'subagent')
    return lifecycle({
      pending: 'Subagent queued',
      running: 'Starting subagent',
      done: 'Subagent finished',
      cancelled: 'Subagent cancelled',
      error: 'Subagent failed',
    });
  return lifecycle({
    pending: 'Activity queued',
    running: 'Activity running',
    done: 'Completed activity',
    cancelled: 'Activity cancelled',
    error: 'Activity failed',
  });
}

function resultEvidence(result: unknown): { status: ChatActivityStatus; durationMs?: number } {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { status: 'done' };
  const record = result as Record<string, unknown>;
  const rawExitCode = record.exitCode ?? record.exit_code ?? record.code;
  const exitCode =
    typeof rawExitCode === 'number' && Number.isFinite(rawExitCode) ? rawExitCode : undefined;
  const durationMs = positive(record.durationMs ?? record.duration_ms ?? record.elapsed_ms);
  return {
    status: exitCode !== undefined && exitCode !== 0 ? 'error' : 'done',
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

function messageReceipts(message: Message): AssistantActivityReceipt[] {
  const seenCallIds = new Set<string>();
  const results = new Map(
    message.parts.flatMap((part) =>
      part.kind === 'tool_result' ? [[part.call_id, part] as const] : [],
    ),
  );
  return message.parts.flatMap((part, index) => {
    if (part.kind !== 'tool_call') return [];
    if (seenCallIds.has(part.call_id)) return [];
    seenCallIds.add(part.call_id);
    const kind = toolKind(part.tool);
    const result = results.get(part.call_id);
    const evidence = result
      ? result.error
        ? { status: 'error' as const }
        : resultEvidence(result.result)
      : { status: 'running' as const };
    return [
      {
        id: `message:${String(message.id)}:tool:${part.call_id}`,
        kind,
        label: receiptLabel(kind, evidence.status),
        status: evidence.status,
        ts: message.created_at + index / 1000,
        ...(evidence.durationMs === undefined ? {} : { durationMs: evidence.durationMs }),
        countsAsAction: true,
      },
    ];
  });
}

function eventReceipts(
  events: readonly ChatActivityEvent[],
  messageHasCommand: boolean,
): AssistantActivityReceipt[] {
  const latestById = new Map<string, ChatActivityEvent>();
  for (const event of events) {
    const current = latestById.get(event.id);
    if (!current || event.ts >= current.ts) latestById.set(event.id, event);
  }
  const receipts: AssistantActivityReceipt[] = [];
  for (const event of latestById.values()) {
    const kind = activityKind(event);
    if (kind === 'command' && messageHasCommand) continue;
    const durationMs =
      event.endedAt !== undefined
        ? Math.max(0, event.endedAt - (event.startedAt ?? event.ts))
        : undefined;
    receipts.push({
      id: `activity:${event.id}`,
      kind,
      label: receiptLabel(kind, event.status),
      status: event.status,
      ts: event.ts,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(event.filePath
        ? { filePath: event.filePath, fileLabel: safeFileLabel(event.filePath) }
        : {}),
      ...(event.agentSlug ? { agentSlug: safeText(event.agentSlug, 256) } : {}),
      countsAsAction: kind !== 'other',
    });
  }
  return receipts;
}

function usage(message: Message): AssistantActivityLedgerProjection['usage'] {
  const exactInput = positive(message.usage?.input_tokens);
  const exactOutput = positive(message.usage?.output_tokens);
  let estimatedInput: number | undefined;
  let reportedInput: number | undefined;
  let reportedOutput: number | undefined;
  for (const part of message.parts) {
    if (part.kind !== 'token_optimization_receipt') continue;
    estimatedInput = positive(part.receipt.estimatedInputTokensAfter) ?? estimatedInput;
    reportedInput = positive(part.usage?.actualInputTokens) ?? reportedInput;
    reportedOutput = positive(part.usage?.actualOutputTokens) ?? reportedOutput;
  }
  const inputValue = exactInput ?? reportedInput ?? estimatedInput;
  const outputValue = exactOutput ?? reportedOutput;
  return {
    input:
      inputValue === undefined
        ? { value: null, provenance: 'unavailable', source: 'unavailable' }
        : exactInput !== undefined
          ? { value: inputValue, provenance: 'exact', source: 'response-metadata' }
          : reportedInput !== undefined
            ? { value: inputValue, provenance: 'exact', source: 'provider-reported' }
            : { value: inputValue, provenance: 'estimated', source: 'local-estimate' },
    output:
      outputValue === undefined
        ? { value: null, provenance: 'unavailable', source: 'unavailable' }
        : exactOutput !== undefined
          ? { value: outputValue, provenance: 'exact', source: 'response-metadata' }
          : { value: outputValue, provenance: 'exact', source: 'provider-reported' },
  };
}

export function projectAssistantActivityLedger(
  message: Message,
  explicitlyCorrelatedEvents: readonly ChatActivityEvent[] = [],
): AssistantActivityLedgerProjection {
  if (message.role !== 'assistant') {
    return {
      status: 'idle',
      actionsTotal: 0,
      readsTotal: 0,
      searchesTotal: 0,
      commandsTotal: 0,
      editedFilesTotal: 0,
      verifiedChecksTotal: 0,
      failedChecksTotal: 0,
      subagentsTotal: 0,
      usage: {
        input: { value: null, provenance: 'unavailable', source: 'unavailable' },
        output: { value: null, provenance: 'unavailable', source: 'unavailable' },
      },
      startedAt: message.created_at,
      receipts: [],
      omittedReceipts: 0,
    };
  }
  const fromMessage = messageReceipts(message);
  const allReceipts = [
    ...fromMessage,
    ...eventReceipts(
      explicitlyCorrelatedEvents,
      fromMessage.some((receipt) => receipt.kind === 'command'),
    ),
  ].sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id));
  const editedFiles = new Set<string>();
  const subagents = new Set<string>();
  const completedReads = new Set<string>();
  let actionsTotal = 0;
  let searchesTotal = 0;
  let commandsTotal = 0;
  let verifiedChecksTotal = 0;
  let failedChecksTotal = 0;
  for (const receipt of allReceipts) {
    if (receipt.countsAsAction) actionsTotal += 1;
    if (receipt.kind === 'read' && receipt.status === 'done')
      completedReads.add(receipt.filePath ?? receipt.id);
    if (receipt.kind === 'search') searchesTotal += 1;
    if (receipt.kind === 'command') commandsTotal += 1;
    if (receipt.kind === 'edit' && receipt.filePath) editedFiles.add(receipt.filePath);
    if (receipt.kind === 'edit' && !receipt.filePath) editedFiles.add(receipt.id);
    if (receipt.kind === 'check' && receipt.status === 'done') verifiedChecksTotal += 1;
    if (receipt.kind === 'check' && receipt.status === 'error') failedChecksTotal += 1;
    if (receipt.kind === 'subagent' && (receipt.status === 'running' || receipt.status === 'done'))
      subagents.add(receipt.id);
  }
  const running = allReceipts
    .filter((receipt) => receipt.status === 'running' || receipt.status === 'pending')
    .at(-1);
  const hasError = allReceipts.some((receipt) => receipt.status === 'error');
  const hasCancelled = allReceipts.some((receipt) => receipt.status === 'cancelled');
  const hasAnswer = message.parts.some(
    (part) => part.kind === 'text' && part.text.trim().length > 0,
  );
  const status = running
    ? 'running'
    : hasError
      ? 'error'
      : hasCancelled
        ? 'cancelled'
        : hasAnswer || allReceipts.length
          ? 'done'
          : 'idle';
  const retained = allReceipts.slice(-MAX_LEDGER_RECEIPTS);
  const evidenceStarts = explicitlyCorrelatedEvents.map((event) => event.startedAt ?? event.ts);
  const startedAt = Math.min(message.created_at, ...evidenceStarts);
  const evidenceEnds = explicitlyCorrelatedEvents.flatMap((event) =>
    event.endedAt === undefined ? [] : [event.endedAt],
  );
  const terminal = status === 'done' || status === 'cancelled' || status === 'error';
  const terminalEndCandidates = [...(message.usage ? [message.updated_at] : []), ...evidenceEnds];
  const terminalEndedAt =
    terminal && terminalEndCandidates.length ? Math.max(...terminalEndCandidates) : undefined;
  return {
    status,
    ...(running ? { currentOperation: running.label } : {}),
    actionsTotal,
    readsTotal: completedReads.size,
    searchesTotal,
    commandsTotal,
    editedFilesTotal: editedFiles.size,
    verifiedChecksTotal,
    failedChecksTotal,
    subagentsTotal: subagents.size,
    usage: usage(message),
    startedAt,
    ...(terminalEndedAt === undefined
      ? {}
      : { endedAt: terminalEndedAt, durationMs: Math.max(0, terminalEndedAt - startedAt) }),
    receipts: retained,
    omittedReceipts: Math.max(0, allReceipts.length - retained.length),
  };
}
