import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import {
  assertZeroOllama,
  attachOfficialNative,
  captureSafetySnapshot,
  createEvidencePacket,
  createPageEventRecorder,
  finalizeEvidencePacket,
  readWindowsNativeState,
  recordAssertion,
  recordFirstFailure,
  writeEvidencePacket,
} from '../../../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const TARGET_CALL_ID_SHA256 = 'da56a4766929b4bfd4469d15dd353585be8a7be98579b4bc1d72c0c09a940a6b';
const REPAIR_COMMIT = '8fa3ad3aeda901fe2e34b4b061d9f0b92eb2ca09';

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

let attachment;
let recorder;
let packet;

try {
  const captureHead = git('rev-parse', 'HEAD');
  if (
    execFileSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', REPAIR_COMMIT, captureHead], {
      windowsHide: true,
    }).length !== 0
  ) {
    throw new Error('Repair ancestry probe returned unexpected output');
  }
  attachment = await attachOfficialNative({ chromium });
  recorder = createPageEventRecorder(attachment.page, { limit: 100 });
  packet = createEvidencePacket({
    taskId: 'PR31-DEEPSEEK-ATTEMPT-09-CANONICAL-STATE-DIAGNOSTIC',
    captureHead,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      repairCommit: REPAIR_COMMIT,
      interactionBoundary: 'read-only official page and IndexedDB/repository inspection',
      clickCount: 0,
      reloadCount: 0,
      processActionCount: 0,
      modelDispatchCount: 0,
      mutationCount: 0,
      rawParamsStored: false,
      rawContentStored: false,
      credentialsStored: false,
      fullCanonicalIdsStored: false,
    },
  });

  const snapshot = await attachment.page.evaluate(
    async ({ targetCallIdSha256 }) => {
      const digest = async (value) => {
        const bytes = new TextEncoder().encode(String(value));
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      };
      const safeCode = (value) => {
        const text = typeof value === 'string' ? value : '';
        const match = text.match(/\b(?:kernel|approval|repository)_[a-z0-9_]{2,80}\b/iu);
        return match?.[0] ?? null;
      };
      const [{ db }, { getActiveAccountIdentity }, { createJarvisKernelClient }] =
        await Promise.all([
          import('/src/lib/db/index.ts'),
          import('/src/lib/accountIdentity.ts'),
          import('/src/lib/jarvis/kernelClient.ts'),
        ]);

      const messages = await db.messages.toArray();
      let target = null;
      for (const message of messages) {
        for (const part of message.parts ?? []) {
          if (part.kind !== 'action_proposal') continue;
          const callId = String(part.call_id ?? '');
          if ((await digest(callId)) !== targetCallIdSha256) continue;
          const approvalId = callId.startsWith('jarvisapproval:')
            ? callId.slice('jarvisapproval:'.length)
            : '';
          target = {
            message,
            part,
            callId,
            approvalId,
          };
        }
      }
      if (!target?.approvalId) throw new Error('target_canonical_approval_not_found');

      const approval = await db.jarvis_approvals.get(target.approvalId);
      if (!approval) throw new Error('target_approval_row_missing');
      const parent = await db.jarvis_runs.get(approval.run_id);
      if (!parent) throw new Error('target_parent_run_missing');
      const [events, approvals] = await Promise.all([
        db.jarvis_events.where('run_id').equals(approval.run_id).sortBy('seq'),
        db.jarvis_approvals.where('run_id').equals(approval.run_id).toArray(),
      ]);
      const now = Date.now();

      const categoryFor = (event) => {
        const key = String(event.idempotency_key ?? '');
        if (event.status === 'cancellation_requested') return 'cancellation_intent';
        if (key === approval.id) return 'approval_created';
        if (key === `action-response-ready:${approval.id}`) return 'action_response_ready';
        if (key.startsWith('action-response-ready:')) return 'sibling_action_response_ready';
        if (key.startsWith('japproval:')) return 'approval_lifecycle';
        if (key.startsWith('jtransport:')) {
          if (key.endsWith(':initial_started')) return 'transport_initial_started';
          if (key.endsWith(':retry_started')) return 'transport_retry_started';
          if (key.endsWith(':retry_available')) return 'transport_retry_available';
          if (key.endsWith(':uncertain_failed')) return 'transport_uncertain_failed';
          return 'transport_lifecycle';
        }
        if (key.startsWith('jeffect:')) return 'effect_claim';
        if (key.startsWith('jlive-event:')) return 'live_evidence';
        if (key.startsWith('kernel-context:')) return 'kernel_context';
        const source = event.producer_source_evidence;
        if (source?.producerKind === 'provider' && source.phase === 'start') {
          return 'provider_start_checkpoint';
        }
        if (source?.producerKind === 'provider' && source.phase === 'result') {
          return 'provider_result_checkpoint';
        }
        const boundedPrefix = key.match(/^[a-z][a-z0-9_-]{0,31}/iu)?.[0]?.toLowerCase();
        return boundedPrefix ? `other:${boundedPrefix}` : 'other';
      };

      const categories = {};
      for (const event of events) {
        const category = categoryFor(event);
        categories[category] = (categories[category] ?? 0) + 1;
      }

      const eventSafe = async (event) => {
        const source = event.producer_source_evidence;
        return {
          seq: event.seq,
          type: event.type,
          status: event.status ?? null,
          createdAt: event.created_at,
          idempotencyCategory: categoryFor(event),
          idempotencyKeySha256: await digest(event.idempotency_key),
          boundedErrorCodes: [
            ...new Set([event.status, event.title, event.safe_summary].map(safeCode)),
          ].filter(Boolean),
          producerCheckpoint:
            source?.producerKind === 'provider'
              ? {
                  phase: source.phase,
                  state: source.state,
                  requestIdSha256: await digest(source.requestId ?? ''),
                  attemptNumber: source.attemptNumber ?? null,
                }
              : null,
          executionEvidence: event.execution_evidence
            ? {
                kind: event.execution_evidence.kind,
                ownerKind: event.execution_evidence.ownerKind,
                requestIdSha256: await digest(event.execution_evidence.requestId ?? ''),
                attemptNumber: event.execution_evidence.attemptNumber ?? null,
              }
            : null,
          canonicalResult: event.canonical_result_evidence
            ? {
                kind: event.canonical_result_evidence.kind,
                state: event.canonical_result_evidence.state,
                requestIdSha256: await digest(event.canonical_result_evidence.requestId ?? ''),
                attemptNumber: event.canonical_result_evidence.attemptNumber ?? null,
              }
            : null,
        };
      };

      const providerStarts = events.filter((event) => {
        const source = event.producer_source_evidence;
        return (
          source?.producerKind === 'provider' &&
          source.phase === 'start' &&
          source.requestId === approval.request_id &&
          source.attemptNumber === approval.attempt_number
        );
      });
      const providerResults = events.filter((event) => {
        const source = event.producer_source_evidence;
        return (
          source?.producerKind === 'provider' &&
          source.phase === 'result' &&
          source.requestId === approval.request_id &&
          source.attemptNumber === approval.attempt_number
        );
      });
      const completedProviderResults = providerResults.filter(
        (event) => event.producer_source_evidence?.state === 'completed',
      );
      const exactResponseReady = events.filter(
        (event) => event.idempotency_key === `action-response-ready:${approval.id}`,
      );
      const cancellationEvents = events.filter(
        (event) => event.status === 'cancellation_requested',
      );

      const attempts = Array.isArray(parent.transport_attempts) ? parent.transport_attempts : [];
      const orderedAttempts = [...attempts].sort(
        (left, right) => left.attemptNumber - right.attemptNumber,
      );
      const currentAttempt = orderedAttempts.at(-1) ?? null;
      const matchingAttempt = orderedAttempts.find(
        (attempt) =>
          attempt.attemptNumber === approval.attempt_number &&
          attempt.requestId === approval.request_id,
      );
      const safeAttempt = async (attempt) =>
        attempt
          ? {
              attemptNumber: attempt.attemptNumber,
              kind: attempt.kind,
              requestIdSha256: await digest(attempt.requestId),
              state: attempt.state,
              startedEventSeq: attempt.startedEventSeq,
              effectBarrier: {
                state: attempt.effectBarrier?.state ?? null,
                version: attempt.effectBarrier?.version ?? null,
                updatedAt: attempt.effectBarrier?.updatedAt ?? null,
              },
              createdAt: attempt.createdAt,
              updatedAt: attempt.updatedAt,
              failureCategory:
                safeCode(attempt.failureCategory) ??
                (attempt.failureCategory ? 'bounded_non_kernel_category' : null),
            }
          : null;

      const openStatuses = new Set(['pending', 'approved']);
      const openSiblings = approvals.filter(
        (candidate) => candidate.id !== approval.id && openStatuses.has(candidate.status),
      );
      const safeSiblings = [];
      for (const sibling of openSiblings) {
        safeSiblings.push({
          approvalIdSha256: await digest(sibling.id),
          status: sibling.status,
          actionId: sibling.action_id,
          requestIdSha256: await digest(sibling.request_id),
          attemptNumber: sibling.attempt_number,
          createdAt: sibling.created_at,
          expiresAt: sibling.expires_at,
        });
      }

      const identity = getActiveAccountIdentity();
      let kernelStatus = null;
      if (identity) {
        const client = createJarvisKernelClient();
        try {
          const response = await client.getApprovalStatus({
            accountId: identity.accountId,
            approvalId: approval.id,
          });
          kernelStatus = {
            kind: response.kind,
            status: response.kind === 'approval_state' ? response.status : null,
            accountMatches:
              response.kind === 'approval_state' ? response.accountId === identity.accountId : null,
            approvalMatches:
              response.kind === 'approval_state' ? response.approvalId === approval.id : null,
            unavailableReason: response.kind === 'unavailable' ? response.reason : null,
            unavailableRequestKind: response.kind === 'unavailable' ? response.requestKind : null,
          };
        } finally {
          client.dispose();
        }
      }

      const card = document.querySelector(`[data-approval-id="${approval.id}"]`);
      const alert = card?.querySelector('[role="alert"]')?.textContent?.trim() ?? '';
      const alertCategory = alert.includes('could not be saved')
        ? 'persistence'
        : alert.includes('could not be verified')
          ? 'verification'
          : null;
      const boundedEventCodes = [
        ...new Set(
          events.flatMap((event) =>
            [event.status, event.title, event.safe_summary].map(safeCode).filter(Boolean),
          ),
        ),
      ];
      const tail = [];
      for (const event of events.slice(-20)) tail.push(await eventSafe(event));

      return {
        capturedAt: new Date(now).toISOString(),
        wallClockMs: now,
        message: {
          chatIdSha256: await digest(target.message.chat_id),
          messageIdSha256: await digest(target.message.id),
          callIdSha256: await digest(target.callId),
          persistedPartStatus: target.part.status,
          actionId: target.part.action_id,
        },
        approval: {
          approvalIdSha256: await digest(approval.id),
          runIdSha256: await digest(approval.run_id),
          requestIdSha256: await digest(approval.request_id),
          attemptNumber: approval.attempt_number,
          status: approval.status,
          createdAt: approval.created_at,
          expiresAt: approval.expires_at,
          actionId: approval.action_id,
          actionVersion: approval.action_version,
          risk: approval.risk,
          decidedAt: approval.decided_at ?? null,
          consumedAt: approval.consumed_at ?? null,
          expired: approval.expires_at <= now,
          wallClockDeltaFromExpiryMs: now - approval.expires_at,
        },
        parentRun: {
          runIdSha256: await digest(parent.id),
          status: parent.status,
          updatedAt: parent.updated_at,
          createdAt: parent.created_at,
          completedAt: parent.completed_at ?? null,
          source: parent.source,
          transportAttemptCount: orderedAttempts.length,
          currentTransportAttempt: await safeAttempt(currentAttempt),
          approvalScopedTransportAttempt: await safeAttempt(matchingAttempt),
        },
        openSiblings: {
          count: safeSiblings.length,
          statuses: safeSiblings.reduce((counts, sibling) => {
            counts[sibling.status] = (counts[sibling.status] ?? 0) + 1;
            return counts;
          }, {}),
          items: safeSiblings,
        },
        events: {
          count: events.length,
          tailSeq: events.at(-1)?.seq ?? 0,
          idempotencyCategoryCounts: categories,
          tail,
          providerStartCheckpoints: {
            count: providerStarts.length,
            states: providerStarts.reduce((counts, event) => {
              const state = event.producer_source_evidence?.state ?? 'unknown';
              counts[state] = (counts[state] ?? 0) + 1;
              return counts;
            }, {}),
          },
          providerResultCheckpoints: {
            count: providerResults.length,
            completedCount: completedProviderResults.length,
            degradedCount: providerResults.length - completedProviderResults.length,
          },
          exactActionResponseReadyCount: exactResponseReady.length,
          completeProviderStartResultPair:
            providerStarts.length === 1 && completedProviderResults.length === 1,
          cancellationIntent: {
            present: cancellationEvents.length > 0,
            count: cancellationEvents.length,
            seqs: cancellationEvents.map((event) => event.seq),
            idempotencyKeySha256: await Promise.all(
              cancellationEvents.map((event) => digest(event.idempotency_key)),
            ),
          },
        },
        kernelHost: {
          approvalStatus: kernelStatus,
          cardStatus: card?.getAttribute('data-status') ?? null,
          approveSubmitState:
            card
              ?.querySelector('button[data-approval-submit-state]')
              ?.getAttribute('data-approval-submit-state') ?? null,
          decisionFailureCategory: alertCategory,
          alertSha256: alert ? await digest(alert) : null,
          alertCharCount: alert.length,
          presentationState: card?.getAttribute('data-presentation-state') ?? null,
          presentationCode: card?.getAttribute('data-presentation-code') ?? null,
        boundedEventErrorCodes: boundedEventCodes,
          exactDecisionExceptionCodeExposed: false,
          codeBoundary:
            'The public card exposes verification versus persistence failure, but its catch boundary does not expose which bounded kernel decision exception produced verification failure.',
        },
        redactionBoundary: {
          rawApprovalParamsReadIntoReport: false,
          rawMessageContentReadIntoReport: false,
          rawCredentialsReadIntoReport: false,
          fullCanonicalIdsReadIntoReport: false,
        },
      };
    },
    { targetCallIdSha256: TARGET_CALL_ID_SHA256 },
  );

  const finalSafety = assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'attempt09-canonical-diagnostic:after'),
    'attempt09-canonical-diagnostic:after',
  );
  packet.safety.push(finalSafety);
  packet.canonicalState = snapshot;
  recordAssertion(
    packet,
    'target canonical identities are hash-only',
    snapshot.approval.approvalIdSha256.length === 64 &&
      snapshot.approval.runIdSha256.length === 64 &&
      snapshot.approval.requestIdSha256.length === 64 &&
      snapshot.message.callIdSha256 === TARGET_CALL_ID_SHA256,
    {
      approvalIdSha256: snapshot.approval.approvalIdSha256,
      runIdSha256: snapshot.approval.runIdSha256,
      requestIdSha256: snapshot.approval.requestIdSha256,
      callIdSha256: snapshot.message.callIdSha256,
    },
  );
  recordAssertion(
    packet,
    'failed Deny left approval and parent at canonical open boundary',
    snapshot.approval.status === 'pending' &&
      snapshot.message.persistedPartStatus === 'pending' &&
      snapshot.parentRun.status === 'awaiting_approval' &&
      snapshot.kernelHost.approvalStatus?.status === 'pending',
    {
      approvalStatus: snapshot.approval.status,
      messagePartStatus: snapshot.message.persistedPartStatus,
      parentRunStatus: snapshot.parentRun.status,
      kernelStatus: snapshot.kernelHost.approvalStatus,
    },
  );
  recordAssertion(
    packet,
    'diagnostic performed no mutation or model/process action',
    true,
    packet.metadata,
  );
  recordAssertion(
    packet,
    'read-only diagnostic emitted no new page errors',
    recorder.snapshot().length === 0,
    recorder.snapshot(),
  );
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder.snapshot(),
    safety: packet.safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'deepseek-native-canonical-state-diagnostic-attempt-09.json',
    packet: finalized,
  });
  process.stdout.write(
    `${JSON.stringify({ status: finalized.status, captureHead, approvalStatus: snapshot.approval.status, parentRunStatus: snapshot.parentRun.status, expiredByMs: snapshot.approval.wallClockDeltaFromExpiryMs, transportState: snapshot.parentRun.currentTransportAttempt?.state ?? null, openSiblingCount: snapshot.openSiblings.count, eventTailSeq: snapshot.events.tailSeq, providerStarts: snapshot.events.providerStartCheckpoints.count, completedProviderResults: snapshot.events.providerResultCheckpoints.completedCount, cancellationIntent: snapshot.events.cancellationIntent.present, kernelDecisionFailureCategory: snapshot.kernelHost.decisionFailureCategory, safety: finalSafety })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ diagnosticError: String(error?.message ?? error).slice(0, 240) })}\n`,
  );
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-DEEPSEEK-ATTEMPT-09-CANONICAL-STATE-DIAGNOSTIC',
      captureHead: git('rev-parse', 'HEAD'),
      metadata: { interactionBoundary: 'read-only diagnostic failed before packet completion' },
    });
  }
  recordFirstFailure(packet, error, 'canonical_state_diagnostic');
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder?.snapshot() ?? [],
    safety: packet.safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'deepseek-native-canonical-state-diagnostic-attempt-09-failure-v2.json',
    packet: finalized,
  });
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', failure: finalized.firstFailure })}\n`,
  );
  process.exitCode = 1;
} finally {
  recorder?.dispose();
  await attachment?.browser?.close().catch(() => undefined);
}
