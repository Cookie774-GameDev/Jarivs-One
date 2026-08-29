import * as React from 'react';
import { ChevronDown, Clock3, FileText, Search, TerminalSquare, Users, Wrench } from 'lucide-react';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';
import { FileAttachmentPreview } from '../FileAttachmentPreview';
import type { ChatActivityEvent } from '../activity/types';
import {
  PerceptibleAgentMotionIndicator,
  resolveAgentMotion,
} from '../agentic-console/AgentMotionIndicator';
import {
  projectAssistantActivityLedger,
  type AssistantActivityReceipt,
  type LedgerReceiptKind,
  type LedgerUsageValue,
} from './ledgerProjection';
import './activity-ledger.css';

export const DETAIL_PAGE_SIZE = 40;

function formatCount(value: number): string {
  return value.toLocaleString();
}

function usageText(label: 'In' | 'Out', usage: LedgerUsageValue): string {
  if (usage.value === null) return '';
  return `${label} ${usage.provenance === 'estimated' ? '≈' : ''}${formatCount(usage.value)}`;
}

function usageTitle(usage: LedgerUsageValue): string {
  if (usage.source === 'provider-reported') return 'Exact provider usage';
  if (usage.source === 'response-metadata') return 'Exact response metadata';
  if (usage.provenance === 'estimated') return 'Estimated locally';
  return 'Usage unavailable';
}

function metric(label: string, value: number): string {
  return `${label} ${formatCount(value)}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs > 0 && durationMs < 1_000) return '<1s';
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

function actionLabel(value: number): string {
  return `${formatCount(value)} ${value === 1 ? 'action' : 'actions'}`;
}

function commandMetric(value: number): string {
  return `Ran ${formatCount(value)} ${value === 1 ? 'command' : 'commands'}`;
}

function joinedPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases.at(-1)}`;
}

function phaseSummary(
  ledger: ReturnType<typeof projectAssistantActivityLedger>,
  active: boolean,
): string {
  const running = [...ledger.receipts]
    .reverse()
    .find((receipt) => receipt.status === 'running' || receipt.status === 'pending');
  if (active && running) {
    const target = running.fileLabel ? ` ${running.fileLabel}` : '';
    const action =
      running.kind === 'read'
        ? `reading${target}`
        : running.kind === 'edit'
          ? `editing${target}`
          : running.kind === 'search'
            ? 'searching'
            : running.kind === 'command'
              ? 'running a command'
              : running.kind === 'check'
                ? 'verifying a check'
                : running.kind === 'subagent'
                  ? 'coordinating a subagent'
                  : 'working on the current action';
    return `I’m ${action} now. No next action is recorded yet.`;
  }

  if (active) {
    return `I recorded ${actionLabel(ledger.actionsTotal)} in this active response. No current or next action is recorded yet.`;
  }
  if (ledger.status === 'cancelled') {
    return `I recorded ${actionLabel(ledger.actionsTotal)} before this response was cancelled. No next action is recorded for this response.`;
  }
  if (ledger.status === 'error') {
    return `I recorded ${actionLabel(ledger.actionsTotal)} before this response encountered an error. No next action is recorded for this response.`;
  }
  const phrases = [
    ledger.readsTotal > 0
      ? `read ${formatCount(ledger.readsTotal)} ${ledger.readsTotal === 1 ? 'file' : 'files'}`
      : '',
    ledger.searchesTotal > 0
      ? `completed ${formatCount(ledger.searchesTotal)} ${ledger.searchesTotal === 1 ? 'search' : 'searches'}`
      : '',
    ledger.commandsTotal > 0
      ? `ran ${formatCount(ledger.commandsTotal)} ${ledger.commandsTotal === 1 ? 'command' : 'commands'}`
      : '',
    ledger.editedFilesTotal > 0
      ? `edited ${formatCount(ledger.editedFilesTotal)} ${ledger.editedFilesTotal === 1 ? 'file' : 'files'}`
      : '',
    ledger.verifiedChecksTotal > 0
      ? `verified ${formatCount(ledger.verifiedChecksTotal)} ${ledger.verifiedChecksTotal === 1 ? 'check' : 'checks'}`
      : '',
  ].filter(Boolean);
  return `I completed ${formatCount(ledger.actionsTotal)} recorded ${ledger.actionsTotal === 1 ? 'action' : 'actions'}${phrases.length ? `: ${joinedPhrases(phrases)}` : ''}. No next action is recorded for this response.`;
}

function receiptIcon(kind: LedgerReceiptKind) {
  if (kind === 'read' || kind === 'edit') return <FileText aria-hidden="true" />;
  if (kind === 'search') return <Search aria-hidden="true" />;
  if (kind === 'command') return <TerminalSquare aria-hidden="true" />;
  if (kind === 'subagent') return <Users aria-hidden="true" />;
  return <Wrench aria-hidden="true" />;
}

export function AssistantActivityLedger({
  message,
  correlatedEvents = [],
  projectRoot,
  compact = false,
  active = false,
  authoritativeDurationMs,
}: {
  message: Message;
  correlatedEvents?: readonly ChatActivityEvent[];
  projectRoot?: string;
  compact?: boolean;
  /** Persisted message evidence is historical unless a caller owns live turn correlation. */
  active?: boolean;
  /** Stable duration supplied by the owning canonical run/session projection. */
  authoritativeDurationMs?: number;
}) {
  const ledger = React.useMemo(
    () => projectAssistantActivityLedger(message, correlatedEvents),
    [message, correlatedEvents],
  );
  const [expanded, setExpanded] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(DETAIL_PAGE_SIZE);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const controlLabelId = React.useId();
  const titleId = React.useId();
  const metricsId = React.useId();
  const hasUsage = ledger.usage.input.value !== null || ledger.usage.output.value !== null;
  if (ledger.actionsTotal === 0 && !hasUsage) return null;

  const visible = ledger.receipts.slice(0, visibleCount);
  const remaining = Math.max(0, ledger.receipts.length - visible.length);
  const runningReceipt = [...ledger.receipts]
    .reverse()
    .find((receipt) => receipt.status === 'running' || receipt.status === 'pending');
  const runningEvent = [...correlatedEvents]
    .reverse()
    .find((event) => event.status === 'running' || event.status === 'pending');
  const live = active;
  const durationMs =
    ledger.durationMs !== undefined && ledger.durationMs > 0
      ? ledger.durationMs
      : typeof authoritativeDurationMs === 'number' &&
          Number.isFinite(authoritativeDurationMs) &&
          authoritativeDurationMs >= 0
        ? authoritativeDurationMs
        : ledger.durationMs;
  const continuousResponseTitle = live
    ? `${ledger.currentOperation ?? 'Working'} · ${actionLabel(ledger.actionsTotal)}`
    : durationMs !== undefined
      ? `Worked for ${formatDuration(durationMs)} · ${actionLabel(ledger.actionsTotal)}`
      : `Activity · ${actionLabel(ledger.actionsTotal)}`;
  const motion = resolveAgentMotion(
    runningEvent
      ? {
          status: runningEvent.status,
          activityCategory: runningEvent.category,
          activityKind: runningEvent.kind,
          semanticIntent: runningEvent.semanticIntent,
          title: runningEvent.title,
          detail: runningEvent.detail,
          filePath: runningEvent.filePath,
        }
      : {
          status: live ? 'running' : 'done',
          activityKind:
            runningReceipt?.kind === 'subagent'
              ? 'subagent'
              : runningReceipt?.kind === 'read' || runningReceipt?.kind === 'edit'
                ? 'file'
                : 'tool',
        },
  );
  return (
    <section
      className={cn('assistant-activity-ledger', compact && 'is-compact')}
      data-assistant-activity-ledger="true"
      data-ledger-active={active ? 'true' : 'false'}
    >
      <p className="assistant-activity-ledger__phase-summary" aria-live={active ? 'polite' : 'off'}>
        {phaseSummary(ledger, active)}
      </p>
      <button
        type="button"
        className="assistant-activity-ledger__disclosure"
        aria-expanded={expanded}
        aria-labelledby={`${controlLabelId} ${titleId}`}
        aria-describedby={metricsId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span id={controlLabelId} className="sr-only">
          {expanded ? 'Hide activity details' : 'Show activity details'}
        </span>
        <ChevronDown
          className={cn('assistant-activity-ledger__chevron', expanded && 'is-open')}
          aria-hidden="true"
        />
        <PerceptibleAgentMotionIndicator motion={motion} compact />
        <span id={titleId} className="assistant-activity-ledger__title">
          {continuousResponseTitle}
        </span>
        <span id={metricsId} className="assistant-activity-ledger__metrics">
          {ledger.readsTotal > 0 ? <span>{metric('Read', ledger.readsTotal)}</span> : null}
          {ledger.searchesTotal > 0 ? (
            <span>{metric('Searched', ledger.searchesTotal)}</span>
          ) : null}
          {ledger.commandsTotal > 0 ? <span>{commandMetric(ledger.commandsTotal)}</span> : null}
          {ledger.editedFilesTotal > 0 ? (
            <span>{metric('Edited', ledger.editedFilesTotal)}</span>
          ) : null}
          {ledger.verifiedChecksTotal > 0 ? (
            <span>{metric('Verified', ledger.verifiedChecksTotal)}</span>
          ) : null}
          {ledger.subagentsTotal > 0 ? (
            <span>{metric('Subagents', ledger.subagentsTotal)}</span>
          ) : null}
          {ledger.usage.input.value !== null ? (
            <span title={usageTitle(ledger.usage.input)}>
              {usageText('In', ledger.usage.input)}
            </span>
          ) : null}
          {ledger.usage.output.value !== null ? (
            <span title={usageTitle(ledger.usage.output)}>
              {usageText('Out', ledger.usage.output)}
            </span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <div
          className="assistant-activity-ledger__inspector"
          role="region"
          aria-label="Assistant activity details"
        >
          {ledger.omittedReceipts > 0 ? (
            <p className="assistant-activity-ledger__notice">
              {formatCount(ledger.omittedReceipts)} older receipts are summarized in the totals.
            </p>
          ) : null}
          <div
            className="assistant-activity-ledger__receipts"
            role="list"
            aria-label="Activity receipts"
          >
            {visible.map((receipt) => (
              <ReceiptRow
                key={receipt.id}
                receipt={receipt}
                canPreview={Boolean(projectRoot && receipt.filePath)}
                onPreview={() => receipt.filePath && setPreviewPath(receipt.filePath)}
              />
            ))}
          </div>
          {remaining > 0 ? (
            <button
              type="button"
              className="assistant-activity-ledger__more"
              onClick={() => setVisibleCount((count) => count + DETAIL_PAGE_SIZE)}
              aria-label={`Show ${Math.min(DETAIL_PAGE_SIZE, remaining)} more activity receipts`}
            >
              Show {Math.min(DETAIL_PAGE_SIZE, remaining)} more
            </button>
          ) : null}
          {hasUsage ? (
            <div className="assistant-activity-ledger__usage" aria-label="Usage">
              <UsageLine label="Input" usage={ledger.usage.input} />
              <UsageLine label="Output" usage={ledger.usage.output} />
            </div>
          ) : null}
          {previewPath && projectRoot ? (
            <FileAttachmentPreview
              path={previewPath}
              projectRoot={projectRoot}
              onClose={() => setPreviewPath(null)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ReceiptRow({
  receipt,
  canPreview,
  onPreview,
}: {
  receipt: AssistantActivityReceipt;
  canPreview: boolean;
  onPreview: () => void;
}) {
  const content = (
    <>
      <span className="assistant-activity-ledger__receipt-icon">{receiptIcon(receipt.kind)}</span>
      <span className="assistant-activity-ledger__receipt-label">{receipt.label}</span>
      {receipt.fileLabel ? (
        <span className="assistant-activity-ledger__path">{receipt.fileLabel}</span>
      ) : null}
      {receipt.durationMs !== undefined ? (
        <span className="assistant-activity-ledger__duration">
          <Clock3 aria-hidden="true" />
          {receipt.durationMs}ms
        </span>
      ) : null}
      {receipt.status === 'done' ? null : (
        <span className={cn('assistant-activity-ledger__status', `is-${receipt.status}`)}>
          {receipt.status}
        </span>
      )}
    </>
  );
  return (
    <div role="listitem" data-testid="activity-ledger-receipt">
      {canPreview ? (
        <button type="button" className="assistant-activity-ledger__receipt" onClick={onPreview}>
          {content}
        </button>
      ) : (
        <div className="assistant-activity-ledger__receipt">{content}</div>
      )}
    </div>
  );
}

function UsageLine({ label, usage }: { label: 'Input' | 'Output'; usage: LedgerUsageValue }) {
  if (usage.value === null) return <p>{label} usage unavailable</p>;
  return (
    <p>
      <strong>{label}</strong> {usage.provenance === 'estimated' ? '≈' : ''}
      {formatCount(usage.value)}
      <span>{usageTitle(usage)}</span>
    </p>
  );
}
