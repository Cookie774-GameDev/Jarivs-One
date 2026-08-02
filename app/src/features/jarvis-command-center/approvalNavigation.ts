import type { JarvisEvent } from './types';
import { selectCurrentRun } from './selectors';
import type { JarvisCommandCenterDataPort } from './types';

export type JarvisApprovalNavigationIntent = Readonly<{
  accountId: string;
  chatId: string;
  runId: string;
  approvalId: string;
}>;

type ApprovalNavigationListener = (intent: JarvisApprovalNavigationIntent | undefined) => void;

let pendingIntent: JarvisApprovalNavigationIntent | undefined;
const listeners = new Set<ApprovalNavigationListener>();
let notificationInProgress = false;
let notificationQueued = false;

const MAX_NAVIGATION_IDENTIFIER_LENGTH = 256;
const CURRENT_APPROVAL_EVENT_LIMIT = 500;

export function isJarvisApprovalNavigationIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_NAVIGATION_IDENTIFIER_LENGTH &&
    value.trim() === value
  );
}

export function selectPendingJarvisApprovalId(
  runId: string,
  events: readonly JarvisEvent[],
): string | undefined {
  let latest: JarvisEvent | undefined;
  for (const event of events) {
    if (event.runId === runId && event.type === 'approval' && (!latest || event.seq > latest.seq)) {
      latest = event;
    }
  }
  if (latest?.status !== 'pending') return undefined;
  return isJarvisApprovalNavigationIdentifier(latest.idempotencyKey)
    ? latest.idempotencyKey
    : undefined;
}

export async function isCurrentJarvisApprovalNavigationTarget(
  dataPort: JarvisCommandCenterDataPort,
  intent: JarvisApprovalNavigationIntent,
): Promise<boolean> {
  const normalized = normalizeIntent(intent);
  if (!normalized) return false;
  const runs = await dataPort.getRunsForChat({
    accountId: normalized.accountId,
    chatId: normalized.chatId,
    limit: 1,
  });
  const currentRun = selectCurrentRun(runs, normalized.accountId, normalized.chatId);
  if (currentRun?.id !== normalized.runId || currentRun.status !== 'awaiting_approval') {
    return false;
  }
  const events = await dataPort.getEventsForRun({
    accountId: normalized.accountId,
    runId: normalized.runId,
    limit: CURRENT_APPROVAL_EVENT_LIMIT,
  });
  if (selectPendingJarvisApprovalId(normalized.runId, events) !== normalized.approvalId) {
    return false;
  }
  const revalidatedRuns = await dataPort.getRunsForChat({
    accountId: normalized.accountId,
    chatId: normalized.chatId,
    limit: 1,
  });
  const revalidatedRun = selectCurrentRun(revalidatedRuns, normalized.accountId, normalized.chatId);
  return revalidatedRun?.id === normalized.runId && revalidatedRun.status === 'awaiting_approval';
}

function normalizeIntent(
  input: JarvisApprovalNavigationIntent,
): JarvisApprovalNavigationIntent | undefined {
  if (!input || typeof input !== 'object') return undefined;
  if (
    !isJarvisApprovalNavigationIdentifier(input.accountId) ||
    !isJarvisApprovalNavigationIdentifier(input.chatId) ||
    !isJarvisApprovalNavigationIdentifier(input.runId) ||
    !isJarvisApprovalNavigationIdentifier(input.approvalId)
  ) {
    return undefined;
  }
  return Object.freeze({
    accountId: input.accountId,
    chatId: input.chatId,
    runId: input.runId,
    approvalId: input.approvalId,
  });
}

function isSameIntent(
  left: JarvisApprovalNavigationIntent,
  right: JarvisApprovalNavigationIntent,
): boolean {
  return (
    left.accountId === right.accountId &&
    left.chatId === right.chatId &&
    left.runId === right.runId &&
    left.approvalId === right.approvalId
  );
}

function notifyListeners(): void {
  if (notificationInProgress) {
    notificationQueued = true;
    return;
  }
  do {
    notificationQueued = false;
    notificationInProgress = true;
    const snapshot = pendingIntent;
    try {
      for (const listener of [...listeners]) listener(snapshot);
    } finally {
      notificationInProgress = false;
    }
  } while (notificationQueued);
}

export function requestJarvisApprovalNavigation(input: JarvisApprovalNavigationIntent): boolean {
  const normalized = normalizeIntent(input);
  if (!normalized) return false;
  pendingIntent = normalized;
  notifyListeners();
  return true;
}

export function readPendingJarvisApprovalNavigation(): JarvisApprovalNavigationIntent | undefined {
  return pendingIntent;
}

export function isPendingJarvisApprovalNavigation(input: JarvisApprovalNavigationIntent): boolean {
  const normalized = normalizeIntent(input);
  return Boolean(normalized && pendingIntent && isSameIntent(normalized, pendingIntent));
}

export function subscribeJarvisApprovalNavigation(
  listener: ApprovalNavigationListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function acknowledgeJarvisApprovalNavigation(
  input: JarvisApprovalNavigationIntent,
): boolean {
  const normalized = normalizeIntent(input);
  if (!normalized || !pendingIntent || !isSameIntent(normalized, pendingIntent)) return false;
  pendingIntent = undefined;
  notifyListeners();
  return true;
}

export function resetJarvisApprovalNavigationForTests(): void {
  pendingIntent = undefined;
  listeners.clear();
  notificationInProgress = false;
  notificationQueued = false;
}
