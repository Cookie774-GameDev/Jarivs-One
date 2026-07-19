import Dexie from 'dexie';

import type { Chat, Message } from '@/types';
import {
  fromJarvisEventRow,
  fromJarvisRunRow,
  toJarvisArtifactRow,
  toJarvisEventRow,
  toJarvisRunRow,
} from '@/lib/db/jarvisMappers';
import {
  enqueueLocalSyncInTransaction,
  type KernelTurnTransactionAuthority,
} from '@/lib/db/kernelTurnTransactionAuthority';
import type {
  JarvisArtifactV1,
  JarvisRunStatus,
  JarvisRunTransitionEventInput,
} from './contracts';
import type { JarvisKernelAccountBinding } from './kernelRuntime';

const KERNEL_TURN_TABLES = [
  'messages',
  'chats',
  'sync_queue',
  'settings',
  'jarvis_runs',
  'jarvis_events',
  'jarvis_artifacts',
] as const;

const TERMINAL_STATUSES = new Set<KernelTurnTerminalStatus>([
  'completed',
  'partial',
  'failed',
  'cancelled',
  'timed_out',
]);

export type KernelTurnTerminalStatus = Extract<
  JarvisRunStatus,
  'completed' | 'partial' | 'failed' | 'cancelled' | 'timed_out'
>;

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export type KernelTurnCommitInput = {
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  expectedStatus: JarvisRunStatus;
  accountBinding: JarvisKernelAccountBinding;
  terminal: {
    status: KernelTurnTerminalStatus;
    event: JarvisRunTransitionEventInput;
  };
  assistantMessage: Message;
  artifacts: readonly JarvisArtifactV1[];
  transportAttemptCompletion?: Readonly<{
    attemptNumber: number;
    requestId: string;
  }>;
};

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export type KernelTurnCommitResult =
  | {
      committed: true;
      run: ReturnType<typeof fromJarvisRunRow>;
      event: ReturnType<typeof fromJarvisEventRow>;
      message: Message;
      artifacts: readonly JarvisArtifactV1[];
    }
  | {
      committed: false;
      reason: 'status_conflict';
      actualStatus: JarvisRunStatus;
    }
  | {
      committed: false;
      reason: 'attempt_conflict';
      actualStatus: JarvisRunStatus;
    }
  | {
      committed: false;
      reason: 'account_authority_revoked';
    };

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export type JarvisKernelCommitPort = Readonly<{
  commitKernelTurn(input: KernelTurnCommitInput): Promise<KernelTurnCommitResult>;
}>;

type CommitDependencies = Readonly<{
  transactionAuthority: KernelTurnTransactionAuthority;
  assertIssuedAccountBinding(binding: JarvisKernelAccountBinding): void;
  consumeArtifactsForCommit(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    artifacts: readonly JarvisArtifactV1[];
  }): void;
}>;

function isStableIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function assertCommitInput(input: KernelTurnCommitInput): void {
  if (
    !isStableIdentifier(input.accountId) ||
    !isStableIdentifier(input.runId) ||
    !isStableIdentifier(input.requestId) ||
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1 ||
    !TERMINAL_STATUSES.has(input.terminal.status) ||
    input.assistantMessage.role !== 'assistant'
  ) {
    throw new TypeError('kernel_turn_commit_input_invalid');
  }
  const ids = new Set<string>();
  for (const artifact of input.artifacts) {
    if (
      artifact.runId !== input.runId ||
      artifact.requestId !== input.requestId ||
      artifact.attemptNumber !== input.attemptNumber ||
      ids.has(artifact.id)
    ) {
      throw new TypeError('kernel_turn_artifact_scope_mismatch');
    }
    ids.add(artifact.id);
  }
}

function bindingIsCurrent(
  dependencies: CommitDependencies,
  binding: JarvisKernelAccountBinding,
): boolean {
  try {
    dependencies.assertIssuedAccountBinding(binding);
    binding.assertCurrent();
    return true;
  } catch {
    return false;
  }
}

function attemptConflict(actualStatus: JarvisRunStatus): KernelTurnCommitResult {
  return { committed: false, reason: 'attempt_conflict', actualStatus };
}

/** @internal Bound only inside the closed artifact/kernel runtime composition. */
export function createKernelTurnCommit(
  dependencies: CommitDependencies,
): JarvisKernelCommitPort {
  return Object.freeze({
    async commitKernelTurn(input: KernelTurnCommitInput): Promise<KernelTurnCommitResult> {
      assertCommitInput(input);
      const artifactRows = input.artifacts.map(toJarvisArtifactRow);
      if (!bindingIsCurrent(dependencies, input.accountBinding)) {
        return { committed: false, reason: 'account_authority_revoked' };
      }
      if (input.accountBinding.identity.accountId !== input.accountId) {
        return { committed: false, reason: 'account_authority_revoked' };
      }
      const authoritySignal = input.accountBinding.revocationSignal;

      const transaction = await dependencies.transactionAuthority.transaction(
        KERNEL_TURN_TABLES,
        authoritySignal,
        async (context): Promise<KernelTurnCommitResult> => {
          if (!bindingIsCurrent(dependencies, input.accountBinding)) {
            return { committed: false, reason: 'account_authority_revoked' };
          }

          const runRow = await context.jarvis_runs.get(input.runId);
          if (!runRow || runRow.account_id !== input.accountId) {
            throw new TypeError('kernel_turn_run_scope_mismatch');
          }
          const current = fromJarvisRunRow(runRow);
          if (current.status !== input.expectedStatus) {
            return {
              committed: false,
              reason: 'status_conflict',
              actualStatus: current.status,
            };
          }

          let transportAttempts = current.transportAttempts;
          const completion = input.transportAttemptCompletion;
          if (!completion && current.source === 'schedule') {
            return attemptConflict(current.status);
          }
          if (completion) {
            if (
              completion.requestId !== input.requestId ||
              completion.attemptNumber !== input.attemptNumber
            ) {
              return attemptConflict(current.status);
            }
            const attempts = structuredClone([...(current.transportAttempts ?? [])]);
            const latest = attempts.at(-1);
            if (
              !latest ||
              latest.state !== 'provider_in_flight' ||
              latest.requestId !== input.requestId ||
              latest.attemptNumber !== input.attemptNumber ||
              latest.effectBarrier.state === 'sealed_for_retry'
            ) {
              return attemptConflict(current.status);
            }
            attempts[attempts.length - 1] = {
              ...latest,
              state: 'completed',
              updatedAt: input.terminal.event.createdAt,
            };
            transportAttempts = attempts;
          }

          if (
            current.chatId === undefined ||
            input.assistantMessage.chat_id !== current.chatId
          ) {
            throw new TypeError('kernel_turn_message_scope_mismatch');
          }
          const [chatRow, existingMessage, existingArtifacts, lastEvent] = await Promise.all([
            context.chats.get(input.assistantMessage.chat_id),
            context.messages.get(input.assistantMessage.id),
            context.jarvis_artifacts.bulkGet(artifactRows.map((row) => row.id)),
            context.jarvis_events
              .where('[run_id+seq]')
              .between(
                [input.runId, Dexie.minKey],
                [input.runId, Dexie.maxKey],
                true,
                true,
              )
              .last(),
          ]);
          if (!chatRow) throw new TypeError('kernel_turn_chat_missing');
          if (existingMessage) throw new TypeError('kernel_turn_message_conflict');
          if (existingArtifacts.some((row) => row !== undefined)) {
            throw new TypeError('kernel_turn_artifact_conflict');
          }

          const eventCreatedAt = input.terminal.event.createdAt;
          const nextSequence = (lastEvent?.seq ?? 0) + 1;
          const updatedRun = {
            ...current,
            status: input.terminal.status,
            updatedAt: eventCreatedAt,
            completedAt: eventCreatedAt,
            ...(transportAttempts === undefined ? {} : { transportAttempts }),
          };
          const updatedRunRow = toJarvisRunRow(updatedRun);
          const eventRow = toJarvisEventRow({
            ...input.terminal.event,
            runId: input.runId,
            seq: nextSequence,
            type: 'run_state',
            status: input.terminal.status,
            artifactIds: input.artifacts.map((artifact) => artifact.id),
          });
          const message = structuredClone(input.assistantMessage);
          const updatedChat: Chat = {
            ...structuredClone(chatRow),
            updated_at: Math.max(chatRow.updated_at, eventCreatedAt, message.updated_at),
          };

          if (!bindingIsCurrent(dependencies, input.accountBinding)) {
            return { committed: false, reason: 'account_authority_revoked' };
          }
          if (input.artifacts.length > 0) {
            dependencies.consumeArtifactsForCommit({
              accountId: input.accountId,
              runId: input.runId,
              requestId: input.requestId,
              attemptNumber: input.attemptNumber,
              artifacts: input.artifacts,
            });
          }

          await context.jarvis_runs.put(updatedRunRow);
          await context.jarvis_events.add(eventRow);
          await context.messages.add(message);
          await context.chats.put(updatedChat);
          await enqueueLocalSyncInTransaction(context, {
            op: 'insert',
            table: 'messages',
            row: message,
            createdAt: eventCreatedAt,
            ownerSnapshot: input.accountBinding.syncOwnerSnapshot,
          });
          await enqueueLocalSyncInTransaction(context, {
            op: 'update',
            table: 'chats',
            row: updatedChat,
            createdAt: eventCreatedAt,
            ownerSnapshot: input.accountBinding.syncOwnerSnapshot,
          });
          if (artifactRows.length > 0) await context.jarvis_artifacts.bulkAdd(artifactRows);

          return {
            committed: true,
            run: fromJarvisRunRow(updatedRunRow),
            event: fromJarvisEventRow(eventRow),
            message,
            artifacts: input.artifacts,
          };
        },
      );

      if (transaction.kind === 'cancelled') {
        return { committed: false, reason: 'account_authority_revoked' };
      }
      return transaction.value;
    },
  });
}
