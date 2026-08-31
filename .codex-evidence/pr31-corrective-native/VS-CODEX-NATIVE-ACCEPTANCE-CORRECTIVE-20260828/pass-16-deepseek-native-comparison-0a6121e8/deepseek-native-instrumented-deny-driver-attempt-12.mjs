import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import sharp from 'sharp';

import {
  assertZeroOllama,
  attachOfficialNative,
  captureOfficialIdentity,
  captureSafetySnapshot,
  captureScreenshot,
  createEvidencePacket,
  createPageEventRecorder,
  finalizeEvidencePacket,
  readWindowsNativeState,
  recordAssertion,
  recordFirstFailure,
  sha256,
  waitForSemantic,
  waitForSemanticLocator,
  writeEvidencePacket,
} from '../../../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const TARGET_CALL_ID_SHA256 = 'da56a4766929b4bfd4469d15dd353585be8a7be98579b4bc1d72c0c09a940a6b';
const TARGET_PATH = '\\\\?\\C:\\Users\\viper\\Documents\\Codex\\2026-08-21\\output.txt';
const WRONG_PATH =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\jarvis-note.txt';
const REPORT_NAME = 'deepseek-native-instrumented-deny-attempt-12.json';
const SCREENSHOT_NAME = '16-stale-wrong-approval-instrumented-deny-attempt-12.png';
const SAFE_REQUEST_KIND = /^[a-z][a-z0-9_]{1,63}$/u;
const SAFE_FAILURE_CODE =
  /^(?:kernel|approval|account|parent|run|event|live|transport|attempt|profile|artifact|invalid)_[a-z0-9_]{2,95}$/u;

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function valueOf(raw, ...names) {
  for (const name of names) if (raw?.[name] !== undefined) return raw[name];
  return undefined;
}

function processShape(raw) {
  return {
    name: String(valueOf(raw, 'Name', 'name') ?? ''),
    pid: Number(valueOf(raw, 'ProcessId', 'pid')),
    parentPid: Number(valueOf(raw, 'ParentProcessId', 'parentPid')),
    executablePath: String(valueOf(raw, 'ExecutablePath', 'executablePath') ?? ''),
    commandLine: String(valueOf(raw, 'CommandLine', 'commandLine') ?? ''),
  };
}

function listenerShape(raw) {
  return {
    localAddress: String(valueOf(raw, 'LocalAddress', 'localAddress') ?? ''),
    localPort: Number(valueOf(raw, 'LocalPort', 'localPort')),
    owningProcess: Number(valueOf(raw, 'OwningProcess', 'owningProcess')),
  };
}

async function pathState(path) {
  try {
    const bytes = await readFile(path);
    return {
      exists: true,
      byteCount: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, byteCount: 0, sha256: null };
    throw error;
  }
}

async function knownNativeLogBoundary(processSnapshot) {
  const knownDirectories = [
    'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\logs',
    'C:\\Users\\viper\\AppData\\Local\\ai.jarvis.desktop\\logs',
  ];
  const directoryPresence = [];
  for (const directory of knownDirectories) {
    let present = true;
    try {
      await access(directory);
    } catch {
      present = false;
    }
    directoryPresence.push(present);
  }
  return {
    rendererConsoleCaptured: true,
    knownNativeLogDirectoryPresent: directoryPresence.some(Boolean),
    directNativeStdoutRetrievable: processSnapshot.jarvisParentAlive,
    boundary:
      'The detached official jarvis process exposes no known native log directory or retrievable stdout sink; renderer host failures are captured from the official WebView console.',
  };
}

async function boundedProcessSnapshot(label, expectedIdentity, safety) {
  const state = await readWindowsNativeState();
  const safetyEntry = assertZeroOllama(captureSafetySnapshot(state, label), label);
  safety.push(safetyEntry);
  const identity = captureOfficialIdentity(state, {
    localAppData: process.env.LOCALAPPDATA,
    cdpPort: expectedIdentity.cdpPort,
    jarvisPid: expectedIdentity.jarvisPid,
  });
  const processes = state.processes.map(processShape);
  const listeners = state.listeners.map(listenerShape);
  const jarvis = processes.find((process) => process.pid === identity.jarvisPid);
  const webView = processes.find((process) => process.pid === identity.webViewPid);
  const openCode = processes.filter(
    (process) =>
      process.name.toLowerCase() === 'opencode.exe' && process.parentPid === identity.jarvisPid,
  );
  if (!jarvis || !webView || openCode.length !== 1) {
    throw new Error('official_process_tree_not_exact');
  }
  const openCodePort = Number(openCode[0].commandLine.match(/--port\s+(\d+)/u)?.[1]);
  const cdpListeners = listeners.filter(
    (listener) =>
      listener.localPort === identity.cdpPort && listener.owningProcess === identity.webViewPid,
  );
  const openCodeListeners = listeners.filter(
    (listener) =>
      listener.localPort === openCodePort &&
      listener.owningProcess === openCode[0].pid &&
      ['127.0.0.1', '::1'].includes(listener.localAddress),
  );
  return {
    label,
    capturedAt: state.capturedAt,
    jarvisPid: jarvis.pid,
    jarvisParentPid: jarvis.parentPid,
    jarvisParentAlive: processes.some((process) => process.pid === jarvis.parentPid),
    webViewPid: webView.pid,
    webViewParentPid: webView.parentPid,
    webViewOwnedByJarvis: webView.parentPid === jarvis.pid,
    cdpPort: identity.cdpPort,
    cdpOwnerExact: cdpListeners.length === 1,
    openCodePid: openCode[0].pid,
    openCodeParentPid: openCode[0].parentPid,
    openCodeOwnedByJarvis: openCode[0].parentPid === jarvis.pid,
    openCodeLoopbackPort: openCodePort,
    openCodeLoopbackExact: openCodeListeners.length === 1,
    ollamaProcessCount: safetyEntry.ollamaProcessCount,
    listener11434Count: safetyEntry.listener11434Count,
  };
}

async function moduleProbe(page) {
  return page.evaluate(async () => {
    const digestText = async (text) => {
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const [kernelResponse, approvalResponse] = await Promise.all([
      fetch('/src/lib/jarvis/kernelHost.ts', { cache: 'no-store' }),
      fetch('/src/lib/jarvis/approvalEngine.ts', { cache: 'no-store' }),
    ]);
    const [kernelText, approvalText] = await Promise.all([
      kernelResponse.text(),
      approvalResponse.text(),
    ]);
    const kernelDigest = await digestText(kernelText);
    const approvalDigest = await digestText(approvalText);
    return {
      ok: kernelResponse.ok && approvalResponse.ok,
      digest: await digestText(`${kernelDigest}:${approvalDigest}`),
      kernelHost: {
        digest: kernelDigest,
        hasSanitizer: kernelText.includes('sanitizeKernelHostFailureCode'),
        hasDiagnostic: kernelText.includes('[jarvis-kernel] request failed'),
        hasApprovalConflictCode: kernelText.includes('approval_status_conflict'),
        hasStageCodes: [
          'kernel_action_decide_scope_failed',
          'kernel_action_decide_checkpoint_failed',
          'kernel_action_decide_decision_failed',
          'kernel_action_decide_finalize_failed',
        ].every((marker) => kernelText.includes(marker)),
      },
      approvalEngine: {
        digest: approvalDigest,
        hasAllowExpiredOption:
          approvalText.includes('allowExpired') && approvalText.includes('options.allowExpired'),
        hasDecisionSpecificDenial:
          approvalText.includes('decideInput.decision') &&
          (approvalText.includes('\"deny\"') || approvalText.includes("'deny'")),
      },
    };
  });
}

async function waitForStableKernelModule(page, description) {
  let lastDigest = null;
  let stableObservations = 0;
  return waitForSemantic({
    description,
    timeoutMs: 20_000,
    intervalMs: 100,
    observe: async () => {
      const probe = await moduleProbe(page);
      if (probe.digest === lastDigest) stableObservations += 1;
      else {
        lastDigest = probe.digest;
        stableObservations = 1;
      }
      return { ...probe, stableObservations };
    },
    accept: (probe) =>
      probe.ok &&
      probe.kernelHost.hasSanitizer &&
      probe.kernelHost.hasDiagnostic &&
      probe.kernelHost.hasApprovalConflictCode &&
      probe.kernelHost.hasStageCodes &&
      probe.approvalEngine.hasAllowExpiredOption &&
      probe.approvalEngine.hasDecisionSpecificDenial &&
      probe.stableObservations >= 2,
  });
}
async function findTarget(page) {
  return page.evaluate(async (targetCallIdSha256) => {
    const digest = async (value) => {
      const bytes = new TextEncoder().encode(String(value));
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const { db } = await import('/src/lib/db/index.ts');
    const matches = [];
    for (const message of await db.messages.toArray()) {
      for (const part of message.parts ?? []) {
        if (part.kind !== 'action_proposal') continue;
        if ((await digest(part.call_id)) !== targetCallIdSha256) continue;
        const callId = String(part.call_id);
        matches.push({
          chatId: String(message.chat_id),
          messageId: String(message.id),
          callId,
          approvalId: callId.startsWith('jarvisapproval:')
            ? callId.slice('jarvisapproval:'.length)
            : '',
        });
      }
    }
    if (matches.length !== 1 || !matches[0].approvalId) {
      throw new Error('target_stale_approval_not_exact');
    }
    return matches[0];
  }, TARGET_CALL_ID_SHA256);
}

async function canonicalSnapshot(page, target) {
  return page.evaluate(async ({ approvalId, messageId, callId }) => {
    const digest = async (value) => {
      const bytes = new TextEncoder().encode(String(value));
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const [{ db }, { getActiveAccountIdentity }, { createJarvisKernelClient }] = await Promise.all([
      import('/src/lib/db/index.ts'),
      import('/src/lib/accountIdentity.ts'),
      import('/src/lib/jarvis/kernelClient.ts'),
    ]);
    const approval = await db.jarvis_approvals.get(approvalId);
    if (!approval) throw new Error('canonical_approval_missing');
    const [run, message, approvals, events] = await Promise.all([
      db.jarvis_runs.get(approval.run_id),
      db.messages.get(messageId),
      db.jarvis_approvals.where('run_id').equals(approval.run_id).toArray(),
      db.jarvis_events.where('run_id').equals(approval.run_id).sortBy('seq'),
    ]);
    if (!run || !message) throw new Error('canonical_parent_or_message_missing');
    const part = message.parts?.find(
      (candidate) => candidate.kind === 'action_proposal' && candidate.call_id === callId,
    );
    if (!part || part.kind !== 'action_proposal') throw new Error('canonical_message_part_missing');
    const identity = getActiveAccountIdentity();
    let kernelStatus = identity
      ? { kind: 'read_pending', status: null, accountMatches: null, approvalMatches: null }
      : { kind: 'identity_unavailable', status: null, accountMatches: null, approvalMatches: null };
    let client = null;
    if (identity) {
      try {
        client = createJarvisKernelClient();
        const response = await client.getApprovalStatus({
          accountId: identity.accountId,
          approvalId,
        });
        kernelStatus = {
          kind: response.kind,
          status: response.kind === 'approval_state' ? response.status : null,
          accountMatches:
            response.kind === 'approval_state' ? response.accountId === identity.accountId : null,
          approvalMatches:
            response.kind === 'approval_state' ? response.approvalId === approvalId : null,
          unavailableReason: response.kind === 'unavailable' ? response.reason : null,
          unavailableRequestKind: response.kind === 'unavailable' ? response.requestKind : null,
        };
      } catch (error) {
        const rawCode = String(error?.code ?? error?.name ?? 'read_failed');
        kernelStatus = {
          kind: 'read_failed',
          status: null,
          accountMatches: null,
          approvalMatches: null,
          errorCode: /^[a-z][a-z0-9_]{1,95}$/u.test(rawCode) ? rawCode : 'unclassified',
        };
      } finally {
        try {
          client?.dispose();
        } catch {
          // A read-only status client disposal failure cannot erase canonical UI/DB evidence.
        }
      }
    }
    const card = document.querySelector(`[data-approval-id="${CSS.escape(approvalId)}"]`);
    const alert = card?.querySelector('[role="alert"]')?.textContent?.trim() ?? '';
    const decisionResponseCategory = alert.includes('could not be saved')
      ? 'persistence_failure'
      : alert.includes('could not be verified')
        ? 'verification_failure'
        : null;
    const open = approvals.filter(
      (candidate) => candidate.status === 'pending' || candidate.status === 'approved',
    );
    return {
      capturedAt: new Date().toISOString(),
      identity: {
        ready: Boolean(identity),
        source: identity?.source ?? null,
        matchesRunAccount: Boolean(identity) && identity.accountId === run.account_id,
      },
      target: {
        approvalIdSha256: await digest(approval.id),
        runIdSha256: await digest(run.id),
        requestIdSha256: await digest(approval.request_id),
        messageIdSha256: await digest(message.id),
        callIdSha256: await digest(callId),
        actionId: approval.action_id,
        attemptNumber: approval.attempt_number,
      },
      approval: {
        status: approval.status,
        createdAt: approval.created_at,
        expiresAt: approval.expires_at,
        decidedAt: approval.decided_at ?? null,
        consumedAt: approval.consumed_at ?? null,
      },
      run: {
        status: run.status,
        source: run.source,
        updatedAt: run.updated_at,
        transportAttemptCount: Array.isArray(run.transport_attempts)
          ? run.transport_attempts.length
          : 0,
      },
      messagePart: { status: part.status, actionId: part.action_id },
      card: {
        present: Boolean(card),
        status: card?.getAttribute('data-status') ?? null,
        submitState:
          card
            ?.querySelector('button[data-approval-submit-state]')
            ?.getAttribute('data-approval-submit-state') ?? null,
        approveControlCount: [...(card?.querySelectorAll('button') ?? [])].filter(
          (button) => button.textContent?.trim() === 'Approve fixed action',
        ).length,
        denyControlCount: [...(card?.querySelectorAll('button') ?? [])].filter(
          (button) => button.textContent?.trim() === 'Deny action',
        ).length,
        alertSha256: alert ? await digest(alert) : null,
        alertCharCount: alert.length,
        decisionResponseCategory,
      },
      openApprovalCount: open.length,
      exactTargetIsOnlyOpen: open.length === 1 && open[0]?.id === approvalId,
      eventTailSeq: events.at(-1)?.seq ?? 0,
      kernelStatus,
    };
  }, target);
}

async function routeToExactTarget(page, target) {
  const ambient = page.getByRole('dialog', { name: /Ambient mode/u });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await waitForSemanticLocator(ambient, {
      state: 'hidden',
      description: 'ambient mode dismissed',
    });
  }
  const chatButton = page.getByRole('button', { name: 'Chat', exact: true }).first();
  await waitForSemanticLocator(chatButton, {
    state: 'enabled',
    description: 'public Chat control',
  });
  await chatButton.click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'chat', { timeout: 20_000 });
  await waitForSemanticLocator(page.getByRole('textbox', { name: 'Message' }), {
    state: 'visible',
    description: 'Chat message composer',
    timeoutMs: 20_000,
  });
  await page.evaluate(async (chatId) => {
    const { useUIStore } = await import('/src/stores/ui.ts');
    const ui = useUIStore.getState();
    ui.setActiveChat(chatId);
    ui.setChatMode('chat');
  }, target.chatId);
  const card = page.locator(`[data-approval-id="${target.approvalId}"]`);
  await waitForSemanticLocator(card, {
    state: 'visible',
    description: 'exact stale approval card',
    timeoutMs: 20_000,
  });
  return card;
}

async function remountAndReadBack(page, target) {
  const scheduleButton = page.getByRole('button', { name: 'Schedule', exact: true }).first();
  await waitForSemanticLocator(scheduleButton, {
    state: 'enabled',
    description: 'Schedule remount route',
  });
  await scheduleButton.click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'schedule', {
    timeout: 20_000,
  });
  await routeToExactTarget(page, target);
  return canonicalSnapshot(page, target);
}

let attachment;
let recorder;
let packet;
let screenshotArtifact = null;
const safety = [];
const kernelDiagnostics = [];
const consoleTasks = [];
let viteConnectedObserved = false;
let denialClickCount = 0;
let reloadCount = 0;
let targetEvidence = null;
let beforeDecisionEvidence = null;
let lastCanonicalEvidence = null;
let filesBeforeEvidence = null;
let filesAfterEvidence = null;
let processBeforeEvidence = null;
let processAfterReloadEvidence = null;
let processAfterDecisionEvidence = null;

try {
  const captureHead = git('rev-parse', 'HEAD');
  if (captureHead !== 'eb52d15ebb534a38695f57de6c91798f8cf8857c') {
    throw new Error('capture_head_not_authorized_descendant_commit');
  }
  const fixCommit = '13c0b4249feb167b75f2c72edf09269092d6f813';
  const captureParent = git('rev-parse', `${captureHead}^`);
  const approvalEngineDiffFromFix = execFileSync(
    'git',
    [
      '-C',
      ROOT,
      'diff',
      '--name-only',
      fixCommit,
      captureHead,
      '--',
      'app/src/lib/jarvis/approvalEngine.ts',
      'app/src/lib/jarvis/approvalEngine.test.ts',
    ],
    { encoding: 'utf8' },
  ).trim();
  if (captureParent !== fixCommit || approvalEngineDiffFromFix !== '') {
    throw new Error('expired_denial_fix_ancestry_or_zero_diff_failed');
  }
  attachment = await attachOfficialNative({ chromium });
  safety.push(...attachment.safety);
  const page = attachment.page;
  page.setDefaultTimeout(20_000);
  recorder = createPageEventRecorder(page, { limit: 100 });
  const onConsole = (message) => {
    const text = String(message.text());
    if (text.includes('[vite] connected.')) viteConnectedObserved = true;
    if (message.type() !== 'error' || !text.startsWith('[jarvis-kernel] request failed')) return;
    const task = (async () => {
      const values = await Promise.all(
        message
          .args()
          .slice(0, 2)
          .map((argument) => argument.jsonValue().catch(() => null)),
      );
      const details = values[1];
      const requestKind =
        typeof details?.requestKind === 'string' && SAFE_REQUEST_KIND.test(details.requestKind)
          ? details.requestKind
          : 'unclassified';
      const code =
        typeof details?.code === 'string' &&
        (SAFE_FAILURE_CODE.test(details.code) || details.code === 'unclassified')
          ? details.code
          : 'unclassified';
      kernelDiagnostics.push({ requestKind, code });
    })();
    consoleTasks.push(task);
  };
  page.on('console', onConsole);

  packet = createEvidencePacket({
    taskId: 'PR31-DEEPSEEK-ATTEMPT-12-EXPIRED-DENIAL-PROOF',
    captureHead,
    identity: attachment.identity,
    safety,
    metadata: {
      scenario:
        'one eb52 descendant-of-13c boot-refreshed Deny of the exact stale wrong-file approval',
      reloadCount: 0,
      denialClickCount: 0,
      modelDispatchCount: 0,
      approvalClickCount: 0,
      fileMutationCount: 0,
      processMutationCount: 0,
      rawPathsInReport: false,
      rawContentInReport: false,
      rawAccountIdsInReport: false,
      fixCommit,
      captureParent,
      approvalEngineDiffFromFix,
    },
  });

  const processBefore = await boundedProcessSnapshot(
    'attempt12:before',
    attachment.identity,
    safety,
  );
  processBeforeEvidence = processBefore;
  const filesBefore = {
    requestedTarget: await pathState(TARGET_PATH),
    wrongTarget: await pathState(WRONG_PATH),
  };
  filesBeforeEvidence = filesBefore;
  const stableModuleBefore = await waitForStableKernelModule(
    page,
    'stable eb52 kernelHost and 13c approvalEngine modules before boot refresh',
  );

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  reloadCount = 1;
  await waitForSemantic({
    description: 'official VibeSpace WebView ready after one full reload',
    timeoutMs: 30_000,
    intervalMs: 100,
    observe: () =>
      page.evaluate(() => ({
        ready: document.readyState === 'complete',
        title: document.title,
        rootPresent: Boolean(document.querySelector('#root')),
        tauriPresent: typeof window.__TAURI_INTERNALS__ === 'object',
        chatControlPresent: Boolean(
          [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Chat',
          ),
        ),
      })),
    accept: (state) =>
      state.ready &&
      state.title === 'VibeSpace' &&
      state.rootPresent &&
      state.tauriPresent &&
      state.chatControlPresent,
  });
  const stableModuleAfter = await waitForStableKernelModule(
    page,
    'stable eb52 kernelHost and 13c approvalEngine modules after boot refresh',
  );
  const processAfterReload = await boundedProcessSnapshot(
    'attempt12:after-reload',
    attachment.identity,
    safety,
  );
  processAfterReloadEvidence = processAfterReload;
  recordAssertion(
    packet,
    'one full WebView reload preserved exact official process ownership',
    reloadCount === 1 &&
      processAfterReload.jarvisPid === processBefore.jarvisPid &&
      processAfterReload.webViewPid === processBefore.webViewPid &&
      processAfterReload.openCodePid === processBefore.openCodePid &&
      processAfterReload.cdpOwnerExact &&
      processAfterReload.openCodeLoopbackExact,
    { processBefore, processAfterReload },
  );
  recordAssertion(
    packet,
    'kernelHost and 13c expired-denial approvalEngine sources were stable before and after boot refresh',
    stableModuleBefore.value.digest === stableModuleAfter.value.digest &&
      stableModuleAfter.value.kernelHost.hasSanitizer &&
      stableModuleAfter.value.kernelHost.hasDiagnostic &&
      stableModuleAfter.value.kernelHost.hasStageCodes &&
      stableModuleAfter.value.approvalEngine.hasAllowExpiredOption &&
      stableModuleAfter.value.approvalEngine.hasDecisionSpecificDenial,
    { stableModuleBefore, stableModuleAfter, viteConnectedObserved },
  );

  const target = await findTarget(page);
  targetEvidence = target;
  const card = await routeToExactTarget(page, target);
  const beforeDecision = await canonicalSnapshot(page, target);
  beforeDecisionEvidence = beforeDecision;
  lastCanonicalEvidence = beforeDecision;
  recordAssertion(
    packet,
    'exact hash-selected stale approval is the only open pending approval',
    beforeDecision.target.callIdSha256 === TARGET_CALL_ID_SHA256 &&
      beforeDecision.approval.status === 'pending' &&
      beforeDecision.run.status === 'awaiting_approval' &&
      beforeDecision.messagePart.status === 'pending' &&
      beforeDecision.card.status === 'pending' &&
      beforeDecision.exactTargetIsOnlyOpen,
    beforeDecision,
  );
  recordAssertion(
    packet,
    'requested and wrong targets are absent before Deny',
    !filesBefore.requestedTarget.exists && !filesBefore.wrongTarget.exists,
    filesBefore,
  );

  const deny = card.getByRole('button', { name: 'Deny action' });
  await waitForSemanticLocator(deny, {
    state: 'enabled',
    description: 'exact target Deny action',
  });
  await deny.click();
  denialClickCount = 1;

  let decisionWait;
  try {
    decisionWait = await waitForSemantic({
      description: 'Deny reaches durable terminal state or emits bounded failure',
      timeoutMs: 20_000,
      intervalMs: 100,
      observe: async () => {
        const state = await canonicalSnapshot(page, target);
        return { state, diagnosticCount: kernelDiagnostics.length };
      },
      accept: ({ state, diagnosticCount }) =>
        (state.approval.status === 'denied' &&
          state.run.status === 'running' &&
          state.messagePart.status === 'cancelled' &&
          state.card.status === 'cancelled' &&
          state.card.approveControlCount === 0 &&
          state.card.denyControlCount === 0 &&
          state.kernelStatus?.status === 'denied') ||
        state.card.decisionResponseCategory !== null ||
        diagnosticCount > 0,
    });
  } catch (error) {
    decisionWait = {
      timeout: true,
      code: String(error?.code ?? error?.message ?? 'semantic_timeout'),
    };
  }
  await Promise.allSettled(consoleTasks);
  const afterDecisionRead = await waitForSemantic({
    description: 'canonical denial state remains readable after the one decision',
    timeoutMs: 10_000,
    intervalMs: 100,
    observe: async () => {
      try {
        return { available: true, state: await canonicalSnapshot(page, target) };
      } catch (error) {
        return {
          available: false,
          errorCode: String(error?.code ?? error?.name ?? 'canonical_snapshot_failed'),
        };
      }
    },
    accept: (result) => result.available,
  });
  const afterDecision = afterDecisionRead.value.state;
  lastCanonicalEvidence = afterDecision;
  const filesAfterDecision = {
    requestedTarget: await pathState(TARGET_PATH),
    wrongTarget: await pathState(WRONG_PATH),
  };
  filesAfterEvidence = filesAfterDecision;
  const denialSucceeded =
    afterDecision.approval.status === 'denied' &&
    afterDecision.run.status === 'running' &&
    afterDecision.messagePart.status === 'cancelled' &&
    afterDecision.card.status === 'cancelled' &&
    afterDecision.card.approveControlCount === 0 &&
    afterDecision.card.denyControlCount === 0 &&
    afterDecision.kernelStatus?.status === 'denied';
  const decisionResponseCategory = denialSucceeded
    ? 'durable_denial_succeeded'
    : kernelDiagnostics.length > 0
      ? `kernel_request_failed:${kernelDiagnostics[0].code}`
      : (afterDecision.card.decisionResponseCategory ?? 'pending_without_bounded_diagnostic');

  let remountReadback = null;
  if (denialSucceeded) remountReadback = await remountAndReadBack(page, target);
  const durableAfterRemount =
    remountReadback !== null &&
    remountReadback.approval.status === 'denied' &&
    remountReadback.run.status === 'running' &&
    remountReadback.messagePart.status === 'cancelled' &&
    remountReadback.card.status === 'cancelled' &&
    remountReadback.card.approveControlCount === 0 &&
    remountReadback.card.denyControlCount === 0;

  screenshotArtifact = await captureScreenshot({
    evidenceDirectory: HERE,
    name: SCREENSHOT_NAME,
    page,
    imageMetadata: async (buffer) => sharp(buffer).metadata(),
  });
  packet.artifacts.push(screenshotArtifact);
  const processAfterDecision = await boundedProcessSnapshot(
    'attempt12:after-decision',
    attachment.identity,
    safety,
  );
  processAfterDecisionEvidence = processAfterDecision;
  const nativeLogEvidence = await knownNativeLogBoundary(processAfterDecision);

  packet.instrumentedDeny = {
    stableModuleBefore,
    stableModuleAfter,
    fixCommit,
    captureParent,
    approvalEngineDiffFromFix,
    viteConnectedObserved,
    processBefore,
    processAfterReload,
    processAfterDecision,
    nativeLogEvidence,
    beforeDecision,
    decisionWait,
    kernelDiagnostics,
    decisionResponseCategory,
    afterDecision,
    remountReadback,
    filesBefore,
    filesAfterDecision,
    repro: {
      steps: [
        'Attach to the official jarvis-owned WebView/CDP endpoint.',
        'Wait for stable eb52 kernelHost and 13c expired-denial approvalEngine module markers.',
        'Reload the official WebView exactly once and wait for VibeSpace readiness.',
        'Navigate through the public Chat control and select the hash-identified durable approval row.',
        'Click the exact target Deny action once and observe terminal canonical state or the sanitized stage failure.',
      ],
      expected:
        'Durable denied approval, running parent, cancelled message/card, no controls, and unchanged absent files.',
    },
    interactionCounts: {
      reloadCount,
      denialClickCount,
      approvalClickCount: 0,
      modelDispatchCount: 0,
      fileMutationCount: 0,
      processMutationCount: 0,
    },
  };
  recordAssertion(
    packet,
    'exact target Deny was clicked once with no model, approval, file, or process action',
    denialClickCount === 1,
    packet.instrumentedDeny.interactionCounts,
  );
  recordAssertion(packet, 'Deny reached durable canonical cancelled semantics', denialSucceeded, {
    decisionResponseCategory,
    afterDecision,
    kernelDiagnostics,
  });
  if (denialSucceeded) {
    recordAssertion(
      packet,
      'durable Deny survived route remount and canonical readback',
      durableAfterRemount,
      remountReadback,
    );
  }
  recordAssertion(
    packet,
    'requested and wrong targets remain absent and unchanged after Deny',
    !filesAfterDecision.requestedTarget.exists &&
      !filesAfterDecision.wrongTarget.exists &&
      JSON.stringify(filesAfterDecision) === JSON.stringify(filesBefore),
    { filesBefore, filesAfterDecision },
  );
  recordAssertion(
    packet,
    'official process tree and forbidden-service safety remain exact',
    processAfterDecision.jarvisPid === processBefore.jarvisPid &&
      processAfterDecision.webViewPid === processBefore.webViewPid &&
      processAfterDecision.openCodePid === processBefore.openCodePid &&
      processAfterDecision.webViewOwnedByJarvis &&
      processAfterDecision.openCodeOwnedByJarvis &&
      processAfterDecision.cdpOwnerExact &&
      processAfterDecision.openCodeLoopbackExact &&
      safety.every((entry) => entry.ollamaProcessCount === 0 && entry.listener11434Count === 0),
    processAfterDecision,
  );

  const finalized = finalizeEvidencePacket(packet, {
    events: recorder.snapshot(),
    safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: REPORT_NAME,
    packet: finalized,
  });
  process.stdout.write(
    `${JSON.stringify({ status: finalized.status, captureHead, decisionResponseCategory, kernelDiagnostics, approvalStatus: afterDecision.approval.status, runStatus: afterDecision.run.status, partStatus: afterDecision.messagePart.status, cardStatus: afterDecision.card.status, durableAfterRemount, denialClickCount, reloadCount, filesAbsent: !filesAfterDecision.requestedTarget.exists && !filesAfterDecision.wrongTarget.exists, jarvisPid: processAfterDecision.jarvisPid, webViewPid: processAfterDecision.webViewPid, openCodePid: processAfterDecision.openCodePid, safety: safety.at(-1) })}\n`,
  );
  page.off('console', onConsole);
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-DEEPSEEK-ATTEMPT-12-EXPIRED-DENIAL-PROOF',
      captureHead: git('rev-parse', 'HEAD'),
      metadata: {
        reloadCount,
        denialClickCount,
        modelDispatchCount: 0,
        approvalClickCount: 0,
        fileMutationCount: 0,
        processMutationCount: 0,
      },
    });
  }
  await Promise.allSettled(consoleTasks);
  if (attachment?.page && targetEvidence) {
    try {
      lastCanonicalEvidence = await canonicalSnapshot(attachment.page, targetEvidence);
    } catch {
      // Preserve the last successful canonical read and the primary failure.
    }
  }
  try {
    filesAfterEvidence = {
      requestedTarget: await pathState(TARGET_PATH),
      wrongTarget: await pathState(WRONG_PATH),
    };
  } catch {
    // Preserve the primary failure if a read-only file-state check fails.
  }
  if (attachment?.identity) {
    try {
      processAfterDecisionEvidence = await boundedProcessSnapshot(
        'attempt12:failure-after',
        attachment.identity,
        safety,
      );
    } catch {
      // The final standalone safety snapshot below remains authoritative.
    }
  }
  packet.instrumentedDenyFailure = {
    kernelDiagnostics,
    target: targetEvidence
      ? {
          callIdSha256: TARGET_CALL_ID_SHA256,
          approvalIdPresent: Boolean(targetEvidence.approvalId),
        }
      : null,
    beforeDecision: beforeDecisionEvidence,
    lastCanonical: lastCanonicalEvidence,
    filesBefore: filesBeforeEvidence,
    filesAfter: filesAfterEvidence,
    processBefore: processBeforeEvidence,
    processAfterReload: processAfterReloadEvidence,
    processAfterDecision: processAfterDecisionEvidence,
    interactionCounts: {
      reloadCount,
      denialClickCount,
      approvalClickCount: 0,
      modelDispatchCount: 0,
      fileMutationCount: 0,
      processMutationCount: 0,
    },
  };
  recordFirstFailure(packet, error, 'instrumented_deny');
  if (attachment?.page && !screenshotArtifact) {
    try {
      screenshotArtifact = await captureScreenshot({
        evidenceDirectory: HERE,
        name: SCREENSHOT_NAME,
        page: attachment.page,
        imageMetadata: async (buffer) => sharp(buffer).metadata(),
      });
      packet.artifacts.push(screenshotArtifact);
    } catch {
      // The primary failure remains canonical; screenshot absence is reported by artifacts=[] only.
    }
  }
  try {
    const finalState = await readWindowsNativeState();
    const finalSafety = assertZeroOllama(
      captureSafetySnapshot(finalState, 'attempt12:failure-final'),
      'attempt12:failure-final',
    );
    safety.push(finalSafety);
  } catch {
    // The primary failure remains canonical.
  }
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder?.snapshot() ?? [],
    safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: REPORT_NAME,
    packet: finalized,
  });
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', stage: finalized.firstFailure?.stage, code: finalized.firstFailure?.code, reloadCount, denialClickCount })}\n`,
  );
  process.exitCode = 1;
} finally {
  recorder?.dispose();
  await attachment?.browser?.close().catch(() => undefined);
}
