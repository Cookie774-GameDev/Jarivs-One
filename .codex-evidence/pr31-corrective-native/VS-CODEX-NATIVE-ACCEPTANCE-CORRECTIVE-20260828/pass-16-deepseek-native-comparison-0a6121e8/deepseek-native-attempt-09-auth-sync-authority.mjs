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

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function field(value, ...names) {
  for (const name of names) if (value?.[name] !== undefined) return value[name];
  return undefined;
}

function processShape(value) {
  return {
    name: String(field(value, 'Name', 'name') ?? ''),
    pid: Number(field(value, 'ProcessId', 'pid')),
    parentPid: Number(field(value, 'ParentProcessId', 'parentPid')),
    commandLine: String(field(value, 'CommandLine', 'commandLine') ?? ''),
  };
}

function listenerShape(value) {
  return {
    localAddress: String(field(value, 'LocalAddress', 'localAddress') ?? ''),
    localPort: Number(field(value, 'LocalPort', 'localPort')),
    owningProcess: Number(field(value, 'OwningProcess', 'owningProcess')),
  };
}

let attachment;
let recorder;
let packet;

try {
  const captureHead = git('rev-parse', 'HEAD');
  attachment = await attachOfficialNative({ chromium });
  recorder = createPageEventRecorder(attachment.page, { limit: 50 });
  packet = createEvidencePacket({
    taskId: 'PR31-DEEPSEEK-ATTEMPT-09-AUTH-SYNC-AUTHORITY',
    captureHead,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      observation: 'single synchronized read-only approval/auth/sync authority snapshot',
      clickCount: 0,
      reloadCount: 0,
      processActionCount: 0,
      modelDispatchCount: 0,
      mutationCount: 0,
      privateDataIncluded: false,
      rawIdentityIncluded: false,
      queuePayloadIncluded: false,
    },
  });

  const authority = await attachment.page.evaluate(
    async ({ targetCallIdSha256 }) => {
      const digest = async (value) => {
        const bytes = new TextEncoder().encode(String(value));
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      };
      const [
        { db },
        { getActiveAccountIdentity },
        { useAuthStore },
        { captureSyncQueueOwner, getCurrentSyncQueueAuthorityScope, LOCAL_UNBOUND_SYNC_SCOPE_NAME },
        { createJarvisKernelClient },
      ] = await Promise.all([
        import('/src/lib/db/index.ts'),
        import('/src/lib/accountIdentity.ts'),
        import('/src/stores/auth.ts'),
        import('/src/lib/cloudSyncQueueOwner.ts'),
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
          target = { approvalId };
        }
      }
      if (!target?.approvalId) throw new Error('target_approval_identity_unavailable');
      const approval = await db.jarvis_approvals.get(target.approvalId);
      if (!approval) throw new Error('target_approval_row_unavailable');
      const parent = await db.jarvis_runs.get(approval.run_id);
      if (!parent) throw new Error('target_parent_run_unavailable');
      const [events, approvals] = await Promise.all([
        db.jarvis_events.where('run_id').equals(approval.run_id).sortBy('seq'),
        db.jarvis_approvals.where('run_id').equals(approval.run_id).toArray(),
      ]);

      const observedDecisionAt = Date.now();
      const openApprovals = approvals.filter(
        (candidate) => candidate.status === 'pending' || candidate.status === 'approved',
      );
      const cancellationEvents = events.filter(
        (event) => event.status === 'cancellation_requested',
      );
      const eventTailSeq = events.at(-1)?.seq ?? 0;
      const attempts = Array.isArray(parent.transport_attempts) ? parent.transport_attempts : [];
      const providerStarts = events.filter((event) => {
        const source = event.producer_source_evidence;
        return (
          event.type === 'model' &&
          event.status === 'started' &&
          source?.producerKind === 'provider' &&
          source.phase === 'start' &&
          source.state === 'started' &&
          source.accountId === parent.account_id &&
          source.runId === parent.id
        );
      });
      const providerStart = providerStarts.length === 1 ? providerStarts[0] : null;
      const providerScope = providerStart?.producer_source_evidence ?? null;
      const providerResults = events.filter((event) => {
        const source = event.producer_source_evidence;
        return (
          event.run_id === parent.id &&
          source?.producerKind === 'provider' &&
          source.phase === 'result'
        );
      });
      const exactResponseCheckpoints = events.filter(
        (event) =>
          event.idempotency_key === `action-response-ready:${approval.id}` &&
          event.type === 'message' &&
          event.status === 'approval_required' &&
          event.producer_source_evidence?.producerKind === 'provider' &&
          event.producer_source_evidence.phase === 'result' &&
          event.producer_source_evidence.state === 'completed',
      );
      const responseCheckpoint =
        exactResponseCheckpoints.length === 1 ? exactResponseCheckpoints[0] : null;
      const matchedProviderResult = responseCheckpoint
        ? (providerResults.find((event) => event.seq === responseCheckpoint.seq) ?? null)
        : providerResults.length === 1
          ? providerResults[0]
          : null;
      const resultScope = matchedProviderResult?.producer_source_evidence ?? null;
      const pendingLifecycleCoherent =
        approval.status === 'pending' &&
        approval.decided_at === undefined &&
        approval.consumed_at === undefined;
      const requestAttemptMatch =
        Boolean(providerScope?.requestId) &&
        approval.request_id === providerScope.requestId &&
        approval.attempt_number === providerScope.attemptNumber;
      const legacyTransportAttemptAllowed =
        attempts.length === 0 && parent.source !== 'schedule' && approval.attempt_number === 1;
      const providerStartExactCorrelation =
        providerStarts.length === 1 &&
        providerScope?.producerKind === 'provider' &&
        providerScope.state === 'started' &&
        providerScope.accountId === parent.account_id &&
        providerScope.runId === parent.id &&
        providerScope.requestId === approval.request_id &&
        providerScope.attemptNumber === approval.attempt_number &&
        Number.isSafeInteger(providerScope.attemptNumber) &&
        providerScope.attemptNumber >= 1;
      const providerResultExactCorrelation =
        providerResults.length === 1 &&
        Boolean(matchedProviderResult) &&
        resultScope?.producerKind === 'provider' &&
        resultScope.state === 'completed' &&
        resultScope.accountId === parent.account_id &&
        resultScope.runId === parent.id &&
        resultScope.requestId === approval.request_id &&
        resultScope.attemptNumber === approval.attempt_number &&
        resultScope.producerIdentity?.providerId === providerScope?.producerIdentity?.providerId &&
        resultScope.producerIdentity?.modelId === providerScope?.producerIdentity?.modelId;
      const responseCheckpointExactCorrelation =
        exactResponseCheckpoints.length === 1 &&
        Boolean(responseCheckpoint) &&
        Boolean(matchedProviderResult) &&
        responseCheckpoint.seq === matchedProviderResult.seq;
      const denialPredicates = {
        evaluationBoundary:
          'read-only canonical rows with observed wall clock as proposed Deny time',
        approvalLifecycleCoherent: pendingLifecycleCoherent,
        requestAttemptMatch,
        decidedAtAtOrAfterApprovalCreated: observedDecisionAt >= approval.created_at,
        decidedAtAtOrAfterRunUpdated: observedDecisionAt >= parent.updated_at,
        openApprovalCount: openApprovals.length,
        openApprovalIsExactTarget:
          openApprovals.length === 1 && openApprovals[0]?.id === approval.id,
        runAwaitingApproval: parent.status === 'awaiting_approval',
        approvalPending: approval.status === 'pending',
        cancellationIntentCount: cancellationEvents.length,
        noCancellationIntent: cancellationEvents.length === 0,
        eventTailSeq,
        eventTailSafeInteger: Number.isSafeInteger(eventTailSeq) && eventTailSeq >= 0,
        transportAttemptCount: attempts.length,
        transportAttemptLegacyAllowance: legacyTransportAttemptAllowed,
        providerStartCheckpointCount: providerStarts.length,
        providerStartExactCorrelation,
        providerResultCheckpointCount: providerResults.length,
        providerResultExactCorrelation,
        responseCheckpointCount: exactResponseCheckpoints.length,
        responseCheckpointExactCorrelation,
      };
      denialPredicates.allObservedPredicatesPass = Object.entries(denialPredicates)
        .filter(([, value]) => typeof value === 'boolean')
        .every(([, value]) => value === true);

      const readAuthority = (capturedAt) => {
        const auth = useAuthStore.getState();
        const identity = getActiveAccountIdentity();
        const owner = captureSyncQueueOwner(capturedAt);
        const scope = getCurrentSyncQueueAuthorityScope();
        const expectedAccount =
          identity?.source === 'supabase'
            ? (auth.cloudSession?.user_id?.trim() ?? null)
            : identity?.source === 'local'
              ? (auth.localUserId?.trim() ?? null)
              : null;
        return {
          capturedAt,
          identity: {
            ready: Boolean(identity),
            source: identity?.source ?? null,
            cloudSessionPresent: Boolean(auth.cloudSession),
            localIdentityPresent: Boolean(auth.localUserId?.trim()),
            matchesDeclaredAuthSource:
              Boolean(identity?.accountId) && identity?.accountId === expectedAccount,
            matchesApprovalParentAccount:
              Boolean(identity?.accountId) && identity?.accountId === parent.account_id,
          },
          syncQueueOwner: {
            state: owner.state,
            capturedAt: owner.capturedAt,
            accountMatchesActiveIdentity:
              owner.state === 'cloud' && Boolean(identity?.accountId)
                ? owner.userId === identity.accountId
                : owner.state === 'unbound'
                  ? null
                  : false,
          },
          authorityScope: {
            state: scope.state,
            nameMode:
              scope.name === LOCAL_UNBOUND_SYNC_SCOPE_NAME
                ? 'local:unbound'
                : scope.name.startsWith('cloud:')
                  ? 'cloud:<account>'
                  : 'unknown',
            accountMatchesActiveIdentity:
              scope.state === 'cloud' && Boolean(identity?.accountId)
                ? scope.userId === identity.accountId
                : scope.state === 'unbound'
                  ? null
                  : false,
          },
          ownerMatchesAuthorityScope:
            owner.state === scope.state &&
            (owner.state === 'unbound' ||
              (scope.state === 'cloud' && owner.userId === scope.userId)),
        };
      };

      const before = readAuthority(Date.now());
      const identity = getActiveAccountIdentity();
      let approvalStatus = null;
      if (identity) {
        const client = createJarvisKernelClient();
        try {
          const response = await client.getApprovalStatus({
            accountId: identity.accountId,
            approvalId: approval.id,
          });
          approvalStatus = {
            kind: response.kind,
            status: response.kind === 'approval_state' ? response.status : null,
            accountMatchesActiveIdentity:
              response.kind === 'approval_state' ? response.accountId === identity.accountId : null,
            approvalMatchesTarget:
              response.kind === 'approval_state' ? response.approvalId === approval.id : null,
            unavailableReason: response.kind === 'unavailable' ? response.reason : null,
            unavailableRequestKind: response.kind === 'unavailable' ? response.requestKind : null,
          };
        } finally {
          client.dispose();
        }
      }
      const after = readAuthority(Date.now());
      return {
        beforeApprovalStatusRead: before,
        approvalStatus,
        afterApprovalStatusRead: after,
        denialPredicates,
        stableAcrossRead:
          JSON.stringify(before) ===
          JSON.stringify({
            ...after,
            capturedAt: before.capturedAt,
            syncQueueOwner: {
              ...after.syncQueueOwner,
              capturedAt: before.syncQueueOwner.capturedAt,
            },
          }),
        equalityBoundary: {
          noRawAccountIdReturned: true,
          noRawApprovalIdReturned: true,
          noTokenReturned: true,
          noQueuePayloadReturned: true,
        },
      };
    },
    { targetCallIdSha256: TARGET_CALL_ID_SHA256 },
  );

  const nativeState = await readWindowsNativeState();
  const finalSafety = assertZeroOllama(
    captureSafetySnapshot(nativeState, 'attempt09-auth-sync-authority:after'),
    'attempt09-auth-sync-authority:after',
  );
  packet.safety.push(finalSafety);
  const processes = nativeState.processes.map(processShape);
  const listeners = nativeState.listeners.map(listenerShape);
  const ownedOpenCode = processes.filter(
    (process) =>
      process.name.toLowerCase() === 'opencode.exe' &&
      process.parentPid === attachment.identity.jarvisPid,
  );
  if (ownedOpenCode.length !== 1) {
    throw new Error('owned_opencode_process_ambiguous');
  }
  const openCode = ownedOpenCode[0];
  const openCodePort = Number(openCode.commandLine.match(/--port\s+(\d+)/u)?.[1]);
  const openCodeListener = listeners.filter(
    (listener) =>
      listener.owningProcess === openCode.pid &&
      listener.localPort === openCodePort &&
      ['127.0.0.1', '::1'].includes(listener.localAddress),
  );
  if (openCodeListener.length !== 1) throw new Error('owned_opencode_listener_unavailable');

  packet.authority = authority;
  packet.processIdentity = {
    jarvisPid: attachment.identity.jarvisPid,
    webViewPid: attachment.identity.webViewPid,
    cdpPort: attachment.identity.cdpPort,
    cdpOwnerMatchesWebView:
      listeners.filter(
        (listener) =>
          listener.localPort === attachment.identity.cdpPort &&
          listener.owningProcess === attachment.identity.webViewPid,
      ).length === 1,
    openCodePid: openCode.pid,
    openCodeParentPid: openCode.parentPid,
    openCodeOwnedByJarvis: openCode.parentPid === attachment.identity.jarvisPid,
    openCodeLoopbackListener: true,
    openCodePort,
  };
  recordAssertion(
    packet,
    'active identity matches its declared auth source and approval parent',
    authority.beforeApprovalStatusRead.identity.matchesDeclaredAuthSource === true &&
      authority.beforeApprovalStatusRead.identity.matchesApprovalParentAccount === true,
    authority.beforeApprovalStatusRead.identity,
  );
  recordAssertion(
    packet,
    'sync queue owner and authority scope are equivalent at status read',
    authority.beforeApprovalStatusRead.ownerMatchesAuthorityScope === true &&
      authority.stableAcrossRead === true,
    {
      before: authority.beforeApprovalStatusRead,
      after: authority.afterApprovalStatusRead,
      stableAcrossRead: authority.stableAcrossRead,
    },
  );
  recordAssertion(
    packet,
    'approval status account matches the active identity',
    authority.approvalStatus?.accountMatchesActiveIdentity === true &&
      authority.approvalStatus?.approvalMatchesTarget === true,
    authority.approvalStatus,
  );
  recordAssertion(
    packet,
    'all canonical pre-commit Deny predicates pass at status read',
    authority.denialPredicates.allObservedPredicatesPass === true,
    authority.denialPredicates,
  );
  recordAssertion(
    packet,
    'official process ownership and safety are exact',
    packet.processIdentity.cdpOwnerMatchesWebView === true &&
      packet.processIdentity.openCodeOwnedByJarvis === true &&
      packet.processIdentity.openCodeLoopbackListener === true,
    packet.processIdentity,
  );
  recordAssertion(
    packet,
    'read-only authority snapshot emitted no page events',
    recorder.snapshot().length === 0,
    recorder.snapshot(),
  );
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder.snapshot(),
    safety: packet.safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'deepseek-native-auth-sync-authority-attempt-09.json',
    packet: finalized,
  });
  process.stdout.write(
    `${JSON.stringify({ status: finalized.status, captureHead, authSource: authority.beforeApprovalStatusRead.identity.source, identityMatchesSource: authority.beforeApprovalStatusRead.identity.matchesDeclaredAuthSource, identityMatchesParent: authority.beforeApprovalStatusRead.identity.matchesApprovalParentAccount, ownerState: authority.beforeApprovalStatusRead.syncQueueOwner.state, authorityScopeMode: authority.beforeApprovalStatusRead.authorityScope.nameMode, ownerScopeEquivalent: authority.beforeApprovalStatusRead.ownerMatchesAuthorityScope, stableAcrossStatusRead: authority.stableAcrossRead, approvalStatus: authority.approvalStatus?.status ?? null, denialPredicatesPass: authority.denialPredicates.allObservedPredicatesPass, jarvisPid: attachment.identity.jarvisPid, webViewPid: attachment.identity.webViewPid, openCodePid: openCode.pid, safety: finalSafety })}\n`,
  );
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-DEEPSEEK-ATTEMPT-09-AUTH-SYNC-AUTHORITY',
      captureHead: git('rev-parse', 'HEAD'),
      metadata: { observation: 'read-only authority snapshot failed' },
    });
  }
  recordFirstFailure(packet, error, 'auth_sync_authority');
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder?.snapshot() ?? [],
    safety: packet.safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'deepseek-native-auth-sync-authority-attempt-09-failure.json',
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
