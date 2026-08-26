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
type Filter = 'all' | LedgerReceiptKind | 'usage';

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

function receiptIcon(kind: LedgerReceiptKind) {
  if (kind === 'read' || kind === 'edit') return <FileText aria-hidden="true" />;
  if (kind === 'search') return <Search aria-hidden="true" />;
  if (kind === 'command') return <TerminalSquare aria-hidden="true" />;
  if (kind === 'subagent') return <Users aria-hidden="true" />;
  return <Wrench aria-hidden="true" />;
}

function filterLabel(filter: Filter, count?: number): string {
  const label =
    filter === 'all'
      ? 'All'
      : filter === 'read'
        ? 'Reads'
        : filter === 'search'
          ? 'Searches'
          : filter === 'command'
            ? 'Commands'
            : filter === 'edit'
              ? 'Edits'
              : filter === 'check'
                ? 'Checks'
                : filter === 'subagent'
                  ? 'Subagents'
                  : filter === 'usage'
                    ? 'Usage'
                    : 'Other';
  return count === undefined ? label : `${label} ${formatCount(count)}`;
}

export function AssistantActivityLedger({
  message,
  correlatedEvents = [],
  projectRoot,
  compact = false,
  active = false,
}: {
  message: Message;
  correlatedEvents?: readonly ChatActivityEvent[];
  projectRoot?: string;
  compact?: boolean;
  /** Persisted message evidence is historical unless a caller owns live turn correlation. */
  active?: boolean;
}) {
  const ledger = React.useMemo(
    () => projectAssistantActivityLedger(message, correlatedEvents),
    [message, correlatedEvents],
  );
  const [expanded, setExpanded] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [visibleCount, setVisibleCount] = React.useState(DETAIL_PAGE_SIZE);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [inspectorHeight, setInspectorHeight] = React.useState<number | undefined>();
  const controlLabelId = React.useId();
  const titleId = React.useId();
  const metricsId = React.useId();
  const resizeHelpId = React.useId();
  const hasUsage = ledger.usage.input.value !== null || ledger.usage.output.value !== null;
  if (ledger.actionsTotal === 0 && !hasUsage) return null;

  const filters: readonly Filter[] = [
    'all',
    'read',
    'search',
    'command',
    'edit',
    'check',
    'subagent',
    'usage',
  ];
  const filtered =
    filter === 'all' || filter === 'usage'
      ? filter === 'usage'
        ? []
        : ledger.receipts
      : ledger.receipts.filter((receipt) => receipt.kind === filter);
  const visible = filtered.slice(0, visibleCount);
  const remaining = Math.max(0, filtered.length - visible.length);
  const counts: Record<Exclude<Filter, 'usage'>, number> = {
    all: ledger.receipts.length,
    read: ledger.receipts.filter((receipt) => receipt.kind === 'read').length,
    search: ledger.receipts.filter((receipt) => receipt.kind === 'search').length,
    command: ledger.receipts.filter((receipt) => receipt.kind === 'command').length,
    edit: ledger.receipts.filter((receipt) => receipt.kind === 'edit').length,
    check: ledger.receipts.filter((receipt) => receipt.kind === 'check').length,
    subagent: ledger.receipts.filter((receipt) => receipt.kind === 'subagent').length,
    other: ledger.receipts.filter((receipt) => receipt.kind === 'other').length,
  };
  const runningReceipt = [...ledger.receipts]
    .reverse()
    .find((receipt) => receipt.status === 'running' || receipt.status === 'pending');
  const live = active;
  const continuousResponseTitle = live
    ? `${ledger.currentOperation ?? 'Working'} · ${actionLabel(ledger.actionsTotal)}`
    : ledger.durationMs !== undefined
      ? `Worked for ${formatDuration(ledger.durationMs)} · ${actionLabel(ledger.actionsTotal)}`
      : `Activity · ${actionLabel(ledger.actionsTotal)}`;
  const motion = resolveAgentMotion({
    status: live ? 'running' : 'done',
    activityKind:
      runningReceipt?.kind === 'subagent'
        ? 'subagent'
        : runningReceipt?.kind === 'read' || runningReceipt?.kind === 'edit'
          ? 'file'
          : 'tool',
  });

  return (
    <section
      className={cn('assistant-activity-ledger', compact && 'is-compact')}
      data-assistant-activity-ledger="true"
    >
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
        <ChevronDown
          className={cn('assistant-activity-ledger__chevron', expanded && 'is-open')}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div
          className="assistant-activity-ledger__inspector"
          role="region"
          aria-label="Assistant activity details"
          style={inspectorHeight === undefined ? undefined : { height: inspectorHeight }}
        >
          <div className="assistant-activity-ledger__tabs" aria-label="Activity filters">
            {filters.map((item) => (
              <button
                type="button"
                aria-pressed={filter === item}
                key={item}
                onClick={() => {
                  setFilter(item);
                  setVisibleCount(DETAIL_PAGE_SIZE);
                }}
              >
                {filterLabel(item, item === 'usage' ? undefined : counts[item])}
              </button>
            ))}
          </div>
          {filter === 'usage' ? (
            <div className="assistant-activity-ledger__usage">
              <UsageLine label="Input" usage={ledger.usage.input} />
              <UsageLine label="Output" usage={ledger.usage.output} />
            </div>
          ) : (
            <div className="assistant-activity-ledger__receipts">
              {ledger.omittedReceipts > 0 && filter === 'all' ? (
                <p className="assistant-activity-ledger__notice">
                  {formatCount(ledger.omittedReceipts)} older receipts are summarized in the totals.
                </p>
              ) : null}
              {visible.map((receipt) => (
                <ReceiptRow
                  key={receipt.id}
                  receipt={receipt}
                  canPreview={Boolean(projectRoot && receipt.filePath)}
                  onPreview={() => receipt.filePath && setPreviewPath(receipt.filePath)}
                />
              ))}
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
            </div>
          )}
          {previewPath && projectRoot ? (
            <FileAttachmentPreview
              path={previewPath}
              projectRoot={projectRoot}
              onClose={() => setPreviewPath(null)}
            />
          ) : null}
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize activity details"
            aria-orientation="horizontal"
            aria-valuemin={128}
            aria-valuemax={560}
            aria-valuenow={inspectorHeight ?? 320}
            aria-describedby={resizeHelpId}
            className="assistant-activity-ledger__resize-handle"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              const direction = event.key === 'ArrowUp' ? -24 : 24;
              setInspectorHeight((height) =>
                Math.min(560, Math.max(128, (height ?? 320) + direction)),
              );
            }}
          />
          <span id={resizeHelpId} className="sr-only">
            Use the Up and Down Arrow keys to resize the activity details panel.
          </span>
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
      <span className={cn('assistant-activity-ledger__status', `is-${receipt.status}`)}>
        {receipt.status}
      </span>
    </>
  );
  return canPreview ? (
    <button
      type="button"
      data-testid="activity-ledger-receipt"
      className="assistant-activity-ledger__receipt"
      onClick={onPreview}
    >
      {content}
    </button>
  ) : (
    <div data-testid="activity-ledger-receipt" className="assistant-activity-ledger__receipt">
      {content}
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
