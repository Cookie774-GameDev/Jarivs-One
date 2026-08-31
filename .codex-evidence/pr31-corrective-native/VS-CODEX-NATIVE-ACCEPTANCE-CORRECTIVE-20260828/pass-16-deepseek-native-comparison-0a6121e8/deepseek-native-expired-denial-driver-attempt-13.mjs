import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

import {
  assertSemantic,
  assertZeroOllama,
  attachOfficialNative,
  captureOfficialIdentity,
  captureSafetySnapshot,
  captureScreenshot,
  createPageEventRecorder,
  discoverCanonicalApprovalTarget,
  readWindowsNativeState,
  sanitizeEvidence,
  sha256,
  waitForSemantic,
  writeEvidencePacket,
} from '../../../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const HEAD = 'eb52d15ebb534a38695f57de6c91798f8cf8857c';
const ROUTE = Object.freeze({
  providerId: 'opencode',
  connectionId: 'opencode-cli',
  modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
});
const VISIBLE_ROUTE = 'DeepSeek V4 Flash Vision Exp · Opencode Go provider connection';
const PROMPT =
  'Write a UTF-8 file named output.txt in the current working directory containing exactly LATENCY_OK followed by one newline.';
const EXPECTED_CONTENT = 'LATENCY_OK\n';
const WRONG_TARGET =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\jarvis-note.txt';
const REPORT_NAME = 'deepseek-native-expired-denial-attempt-13.json';
const PENDING_SCREENSHOT = '17-deepseek-expiring-pending-attempt-13.png';
const DENIED_SCREENSHOT = '18-deepseek-expired-denied-attempt-13.png';

let attachment;
let recorder;
let page;
let disposableChatId;
let targetPath;
let rawTarget;
let denyClicks = 0;
let modelDispatches = 0;
let publicCleanupClicks = 0;
let currentStage = 'preflight';
let firstFailure = null;
const startedAt = new Date().toISOString();
const startedPerf = performance.now();
const safety = [];
const assertions = [];
const artifacts = [];
const checkpoints = [];

const packet = {
  schemaVersion: 1,
  taskId: 'PR31-DEEPSEEK-NATIVE-EXPIRED-DENIAL-ATTEMPT-13',
  captureHead: HEAD,
  startedAt,
  status: 'failed',
  constraints: {
    officialTauriCdpOnly: true,
    exactModelRouteOnly: ROUTE,
    modelDispatchLimit: 1,
    denyClickLimit: 1,
    approveClicks: 0,
    reloads: 0,
    databaseWritesByDriver: 0,
    expiryMutationByDriver: 0,
    ollamaAllowed: false,
  },
  authority: null,
  openCode: null,
  chat: null,
  modelIdentity: null,
  dispatch: null,
  proposal: null,
  naturalExpiry: null,
  denial: null,
  cleanup: null,
  nativeLogs: {
    available: false,
    reason:
      'official jarvis process is detached from this evidence driver; renderer console/page events are captured by CDP',
  },
  assertions,
  safety,
  checkpoints,
  artifacts,
  events: [],
  firstFailure: null,
};

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function elapsedMs() {
  return Math.round(performance.now() - startedPerf);
}

function checkpoint(stage, details = {}) {
  const entry = { stage, elapsedMs: elapsedMs(), ...sanitizeEvidence(details) };
  checkpoints.push(entry);
  process.stdout.write(`${JSON.stringify({ checkpoint: entry })}\n`);
  return entry;
}

function requireAssertion(name, condition, details = {}) {
  try {
    const result = assertSemantic(name, condition, details);
    assertions.push(result);
    return result;
  } catch (error) {
    assertions.push({ name, passed: false, details: sanitizeEvidence(details) });
    throw error;
  }
}

async function fileState(filePath) {
  try {
    const info = await stat(filePath);
    return {
      exists: true,
      size: info.size,
      modifiedAtMs: Math.round(info.mtimeMs),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, size: 0, modifiedAtMs: null };
    throw error;
  }
}

function processName(process) {
  return String(process?.Name ?? process?.name ?? '').toLowerCase();
}

function processPid(process) {
  return Number(process?.ProcessId ?? process?.pid);
}

function processParentPid(process) {
  return Number(process?.ParentProcessId ?? process?.parentPid);
}

function processExecutable(process) {
  return String(process?.ExecutablePath ?? process?.executablePath ?? '');
}

function listenerPort(listener) {
  return Number(listener?.LocalPort ?? listener?.localPort);
}

function listenerOwner(listener) {
  return Number(listener?.OwningProcess ?? listener?.owningProcess);
}

function listenerAddress(listener) {
  return String(listener?.LocalAddress ?? listener?.localAddress ?? '');
}

function processAuthority(state, identity) {
  const openCode = state.processes.filter(
    (item) => processName(item) === 'opencode.exe' && processParentPid(item) === identity.jarvisPid,
  );
  requireAssertion('exactly one jarvis-owned OpenCode runtime is live', openCode.length === 1, {
    count: openCode.length,
  });
  const runtime = openCode[0];
  const runtimePid = processPid(runtime);
  const runtimeListeners = state.listeners.filter(
    (item) =>
      listenerOwner(item) === runtimePid &&
      listenerPort(item) !== 9223 &&
      ['127.0.0.1', '::1', 'localhost'].includes(listenerAddress(item)),
  );
  requireAssertion(
    'jarvis-owned OpenCode exposes one loopback listener',
    runtimeListeners.length === 1,
    {
      count: runtimeListeners.length,
    },
  );
  return {
    jarvisPid: identity.jarvisPid,
    webViewPid: identity.webViewPid,
    cdpPort: identity.cdpPort,
    cdpListenerAddress: identity.listenerAddress,
    profile: identity.profile,
    jarvisExecutableSha256: hash(identity.executablePath),
    openCodePid: runtimePid,
    openCodeParentPid: processParentPid(runtime),
    openCodeExecutableSha256: hash(processExecutable(runtime)),
    openCodeLoopbackPort: listenerPort(runtimeListeners[0]),
    ownership: 'jarvis owns official WebView/CDP and direct OpenCode runtime',
  };
}

async function guard(label) {
  const state = await readWindowsNativeState();
  const snapshot = captureSafetySnapshot(state, label);
  assertZeroOllama(snapshot, label);
  safety.push(snapshot);
  const identity = captureOfficialIdentity(state, {
    localAppData: process.env.LOCALAPPDATA,
    cdpPort: 9223,
    jarvisPid: packet.authority?.jarvisPid,
  });
  const authority = processAuthority(state, identity);
  if (packet.authority) {
    requireAssertion(
      `official process authority is stable at ${label}`,
      authority.jarvisPid === packet.authority.jarvisPid &&
        authority.webViewPid === packet.authority.webViewPid &&
        authority.openCodePid === packet.authority.openCodePid &&
        authority.openCodeLoopbackPort === packet.authority.openCodeLoopbackPort,
      { label },
    );
  } else {
    packet.authority = authority;
  }
  return { state, identity, authority };
}

async function capture(name) {
  const artifact = await captureScreenshot({
    page,
    evidenceDirectory: HERE,
    name,
    fullPage: false,
    imageMetadata: async (buffer) => sharp(buffer).metadata(),
  });
  artifacts.push(artifact);
  return artifact;
}

async function ensureChatSurface() {
  const messageBox = page.getByRole('textbox', { name: 'Message', exact: true });
  if (!(await messageBox.isVisible().catch(() => false))) {
    const navigation = page.locator('[data-nav-pane="true"]');
    const chatControl = navigation.getByRole('button', { name: 'Chat', exact: true });
    await chatControl.waitFor({ state: 'visible', timeout: 10_000 });
    await chatControl.click();
  }
  await messageBox.waitFor({ state: 'visible', timeout: 20_000 });
  requireAssertion(
    'official public Chat surface is active',
    new URL(page.url()).searchParams.get('route') === 'chat',
  );
}

async function readActiveChat() {
  return page.evaluate(async () => {
    const [{ db }, { useUIStore }] = await Promise.all([
      import('/src/lib/db/index.ts'),
      import('/src/stores/ui.ts'),
    ]);
    const id = useUIStore.getState().activeChatId;
    const chat = id ? await db.chats.get(id) : undefined;
    return id && chat
      ? {
          id: String(id),
          title: String(chat.title ?? ''),
          projectId: String(chat.project_id ?? ''),
        }
      : null;
  });
}

async function createDisposableChat() {
  const original = await readActiveChat();
  const newChat = page
    .locator('[data-monochrome-surface="tab-strip"]')
    .getByRole('button', { name: 'New chat', exact: true });
  await newChat.waitFor({ state: 'visible', timeout: 10_000 });
  await newChat.click();
  const created = await waitForSemantic({
    description: 'public New chat creates a distinct active persisted chat',
    timeoutMs: 20_000,
    intervalMs: 100,
    observe: readActiveChat,
    accept: (value) => Boolean(value?.id && value.id !== original?.id),
  });
  disposableChatId = created.value.id;
  packet.chat = {
    originalChatIdentitySha256: original?.id ? hash(original.id) : null,
    disposableChatIdentitySha256: hash(disposableChatId),
    projectIdentitySha256: hash(created.value.projectId),
    createdPublicly: true,
    titleAtCreationSha256: hash(created.value.title),
  };
  return created.value;
}

async function projectBoundary() {
  return page.evaluate(async () => {
    const [{ useAuthStore }, { getStoredProjectRoot }] = await Promise.all([
      import('/src/stores/auth.ts'),
      import('/src/features/files/projectFiles.ts'),
    ]);
    const auth = useAuthStore.getState();
    const projectRoot = getStoredProjectRoot(auth.projectId ?? null);
    return {
      workspaceId: String(auth.workspaceId ?? ''),
      projectId: String(auth.projectId ?? ''),
      projectRoot: String(projectRoot ?? ''),
    };
  });
}

async function selectExactModelRoute() {
  const pickerButton = page.getByRole('button', { name: 'Choose model', exact: true });
  await pickerButton.click();
  const picker = page.getByRole('listbox');
  await picker.waitFor({ state: 'visible', timeout: 20_000 });
  const receipt = await page.evaluate(() => {
    const raw = document.documentElement.getAttribute('data-vibespace-opencode-catalog-evidence');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  requireAssertion(
    'OpenCode catalog receipt is current-session authenticated',
    receipt?.authority === 'current-session-authenticated' &&
      receipt?.sessionChecked === true &&
      receipt?.available === true &&
      receipt?.auth === 'authenticated' &&
      receipt?.connectionId === ROUTE.connectionId &&
      Number.isSafeInteger(receipt?.routeCount) &&
      receipt.routeCount > 0 &&
      /^[0-9a-f]{64}$/u.test(String(receipt?.catalogSha256 ?? '')),
  );
  packet.openCode = receipt;
  const routeOption = picker.getByText(VISIBLE_ROUTE, { exact: true });
  await routeOption.waitFor({ state: 'visible', timeout: 20_000 });
  const visibleComposite = String((await routeOption.textContent()) ?? '').trim();
  requireAssertion(
    'exact DeepSeek/OpenCode composite route is visible',
    visibleComposite === VISIBLE_ROUTE,
  );
  await routeOption.click();
  const saved = await waitForSemantic({
    description: 'exact DeepSeek route persists to store and disposable Chat',
    timeoutMs: 20_000,
    intervalMs: 100,
    observe: () =>
      page.evaluate(
        async ({ chatId }) => {
          const [{ db }, { useAuthStore }, { readChatRuntimePolicyState }] = await Promise.all([
            import('/src/lib/db/index.ts'),
            import('/src/stores/auth.ts'),
            import('/src/features/chat/runtime/chatRuntimeSettingsStore.ts'),
          ]);
          const chat = await db.chats.get(chatId);
          return {
            selected: useAuthStore.getState().chatModelSelection,
            connection: chat?.connection ?? null,
            runtime: readChatRuntimePolicyState(chatId),
          };
        },
        { chatId: disposableChatId },
      ),
    accept: (value) =>
      value.selected?.mode === 'single' &&
      value.selected.providerId === ROUTE.providerId &&
      value.selected.connectionId === ROUTE.connectionId &&
      value.selected.modelId === ROUTE.modelId &&
      value.connection?.providerId === ROUTE.providerId &&
      value.connection?.id === ROUTE.connectionId &&
      value.connection?.modelId === ROUTE.modelId,
  });
  const buttonText = String((await pickerButton.textContent()) ?? '').trim();
  requireAssertion(
    'selected DeepSeek model label remains visible on Composer',
    /DeepSeek V4 Flash Vision Exp/u.test(buttonText),
  );
  packet.modelIdentity = {
    visibleComposite,
    visibleComposerModelLabel: buttonText,
    savedRoute: {
      providerId: saved.value.connection.providerId,
      connectionId: saved.value.connection.id,
      modelId: saved.value.connection.modelId,
    },
    selectedRoute: {
      providerId: saved.value.selected.providerId,
      connectionId: saved.value.selected.connectionId,
      modelId: saved.value.selected.modelId,
    },
    effort: {
      savedRuntimePreference: saved.value.runtime.settings.effort,
      visibleComposerBadge:
        (await pickerButton
          .locator('[data-composer-effort]')
          .getAttribute('data-composer-effort')) ?? 'auto',
    },
    fast: {
      savedRuntimePreference: saved.value.runtime.settings.fastMode,
      boundary:
        'provider Fast mode is recorded from the saved per-chat runtime policy; no local slash mutation was used',
    },
  };
  return saved.value;
}

async function setAgentWriteMode() {
  const trigger = page.getByRole('button', { name: /Mode\. Open permissions panel\./u });
  await trigger.click();
  const modeList = page.getByRole('listbox', { name: 'Chat modes' });
  await modeList.waitFor({ state: 'visible', timeout: 10_000 });
  const agentMode = modeList.getByRole('option', { name: /Agent Mode/u });
  if ((await agentMode.getAttribute('aria-selected')) !== 'true') await agentMode.click();
  const accessList = page.getByRole('listbox', { name: 'Access and Approve All' });
  await accessList.waitFor({ state: 'visible', timeout: 10_000 });
  const write = accessList.getByRole('option', { name: /Write Access/u });
  if ((await write.getAttribute('aria-selected')) !== 'true') await write.click();
  await page.keyboard.press('Escape');
  const settled = await waitForSemantic({
    description: 'Agent Mode Write Access is visibly selected and saved',
    timeoutMs: 10_000,
    intervalMs: 100,
    observe: () =>
      page.evaluate(
        async ({ chatId }) => {
          const [{ readChatRuntimePolicyState }, { useJarvisInteractionStore }] = await Promise.all(
            [
              import('/src/features/chat/runtime/chatRuntimeSettingsStore.ts'),
              import('/src/features/chat/jarvisInteractionStore.ts').catch(() => ({
                useJarvisInteractionStore: null,
              })),
            ],
          );
          return {
            runtime: readChatRuntimePolicyState(chatId),
            interactionMode: useJarvisInteractionStore?.getState?.().modeForChat?.(chatId) ?? null,
          };
        },
        { chatId: disposableChatId },
      ),
    accept: (value) => value.runtime?.access === 'write',
  });
  requireAssertion(
    'Agent Mode control is visible after Write Access selection',
    await trigger.isVisible().catch(() => false),
  );
  packet.chat.mode = {
    visibleControlText: String((await trigger.textContent()) ?? '').trim(),
    interactionMode: settled.value.interactionMode,
    access: settled.value.runtime.access,
    approveAllForRun: settled.value.runtime.approveAllForRun,
  };
}

async function proposalSnapshot() {
  return page.evaluate(
    async ({ chatId, expectedRoot, expectedPath, expectedContent }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const messages = await db.messages.where('chat_id').equals(chatId).sortBy('created_at');
      const proposals = [];
      for (const message of messages) {
        for (const part of message.parts) {
          if (part.kind !== 'action_proposal') continue;
          const callId = String(part.call_id ?? '');
          proposals.push({
            messageId: String(message.id),
            callId,
            approvalId: callId.startsWith('jarvisapproval:')
              ? callId.slice('jarvisapproval:'.length)
              : '',
            actionId: String(part.action_id ?? ''),
            status: String(part.status ?? ''),
            rootMatches: part.params?.root === expectedRoot,
            pathMatches: part.params?.path === expectedPath,
            contentMatches: part.params?.content === expectedContent,
            attachToChat: part.params?.attachToChat,
          });
        }
      }
      const assistantProjectionCount = messages.filter(
        (message) =>
          (message.role === 'assistant' || message.role === 'agent') &&
          message.parts.some(
            (part) =>
              (part.kind === 'text' && String(part.text ?? '').length > 0) ||
              part.kind === 'action_proposal',
          ),
      ).length;
      return {
        messageCount: messages.length,
        assistantProjectionCount,
        proposals,
      };
    },
    {
      chatId: disposableChatId,
      expectedRoot: rawTarget.projectRoot,
      expectedPath: targetPath,
      expectedContent: EXPECTED_CONTENT,
    },
  );
}

async function readStoredApproval(approvalId) {
  return page.evaluate(
    async ({ approvalId, chatId, expectedRoot, expectedPath, expectedContent }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const approval = await db.jarvis_approvals.get(approvalId);
      if (!approval) return null;
      const run = await db.jarvis_runs.get(approval.run_id);
      if (!run || String(run.chat_id ?? '') !== chatId) return null;
      const messages = await db.messages.where('chat_id').equals(chatId).toArray();
      const matchingParts = [];
      for (const message of messages) {
        for (const part of message.parts) {
          if (part.kind === 'action_proposal' && part.call_id === `jarvisapproval:${approvalId}`) {
            matchingParts.push({
              messageId: String(message.id),
              status: String(part.status),
              actionId: String(part.action_id),
              rootMatches: part.params?.root === expectedRoot,
              pathMatches: part.params?.path === expectedPath,
              contentMatches: part.params?.content === expectedContent,
            });
          }
        }
      }
      if (matchingParts.length !== 1) return null;
      const part = matchingParts[0];
      if (!part.rootMatches || !part.pathMatches || !part.contentMatches) return null;
      return {
        approval: {
          id: String(approval.id),
          actionId: String(approval.action_id),
          status: String(approval.status),
          runId: String(approval.run_id),
        },
        run: { id: String(run.id), status: String(run.status) },
        messagePart: {
          approvalId: String(approval.id),
          actionId: part.actionId,
          status: part.status,
        },
        exact: {
          messageId: part.messageId,
          requestId: String(approval.request_id),
          attemptNumber: Number(approval.attempt_number),
          createdAt: Number(approval.created_at),
          expiresAt: Number(approval.expires_at),
          paramsRootMatches: approval.params?.root === expectedRoot,
          paramsPathMatches: approval.params?.path === expectedPath,
          paramsContentMatches: approval.params?.content === expectedContent,
          model: run.model,
          runUpdatedAt: Number(run.updated_at),
          transportAttempts: Array.isArray(run.transport_attempts)
            ? run.transport_attempts.map((attempt) => ({
                attemptNumber: attempt.attemptNumber,
                status: attempt.status,
                kind: attempt.kind,
              }))
            : [],
        },
      };
    },
    {
      approvalId,
      chatId: disposableChatId,
      expectedRoot: rawTarget.projectRoot,
      expectedPath: targetPath,
      expectedContent: EXPECTED_CONTENT,
    },
  );
}

async function dispatchOnce() {
  const textbox = page.getByRole('textbox', { name: 'Message', exact: true });
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await textbox.fill(PROMPT);
  requireAssertion(
    'disposable prompt is exact before dispatch',
    (await textbox.inputValue()) === PROMPT,
    {
      promptSha256: hash(PROMPT),
      promptCharCount: PROMPT.length,
    },
  );
  const dispatchStartedAt = Date.now();
  const dispatchStartedPerf = performance.now();
  await send.click();
  modelDispatches += 1;
  requireAssertion('exactly one model dispatch was issued', modelDispatches === 1);
  const stopObserved = await waitForSemantic({
    description: 'cold exact-model dispatch exposes Stop current request',
    timeoutMs: 15_000,
    intervalMs: 50,
    observe: async () => ({
      visible: await page
        .getByRole('button', { name: 'Stop current request', exact: true })
        .isVisible()
        .catch(() => false),
      at: Date.now(),
    }),
    accept: (value) => value.visible,
  });
  const firstProjection = await waitForSemantic({
    description: 'cold dispatch projects exact new assistant/action state',
    timeoutMs: 180_000,
    intervalMs: 100,
    observe: proposalSnapshot,
    accept: (value) => value.assistantProjectionCount > 0,
  });
  const anyProposal = await waitForSemantic({
    description: 'cold dispatch emits one canonical file proposal',
    timeoutMs: 180_000,
    intervalMs: 100,
    observe: proposalSnapshot,
    accept: (value) => value.proposals.length > 0,
  });
  requireAssertion(
    'cold dispatch emits exactly one action proposal',
    anyProposal.value.proposals.length === 1,
    { count: anyProposal.value.proposals.length },
  );
  const proposal = anyProposal.value.proposals[0];
  requireAssertion(
    'proposal is exact pending canonical files.create target',
    proposal.actionId === 'files.create' &&
      proposal.status === 'pending' &&
      proposal.approvalId.length > 0 &&
      proposal.rootMatches &&
      proposal.pathMatches &&
      proposal.contentMatches,
    {
      actionId: proposal.actionId,
      status: proposal.status,
      hasCanonicalApprovalIdentity: proposal.approvalId.length > 0,
      rootMatches: proposal.rootMatches,
      pathMatches: proposal.pathMatches,
      contentMatches: proposal.contentMatches,
    },
  );
  const target = await discoverCanonicalApprovalTarget(page, {
    actionId: 'files.create',
    approvalStatus: 'pending',
    runStatus: 'awaiting_approval',
    messagePartStatus: 'pending',
    timeoutMs: 30_000,
    stableObservations: 3,
    readStoredApproval,
  });
  requireAssertion(
    'semantic discovery resolves the exact proposal identity',
    target.approvalId === proposal.approvalId,
  );
  const exact = target.storedIdentity.exact;
  requireAssertion(
    'canonical approval row preserves exact root/path/content',
    exact.paramsRootMatches && exact.paramsPathMatches && exact.paramsContentMatches,
  );
  requireAssertion(
    'canonical run preserves the exact OpenCode DeepSeek route',
    exact.model?.provider_id === ROUTE.providerId &&
      exact.model?.connection_id === ROUTE.connectionId &&
      exact.model?.model_id === ROUTE.modelId,
    {
      providerId: exact.model?.provider_id,
      connectionId: exact.model?.connection_id,
      modelId: exact.model?.model_id,
    },
  );
  const lifetimeMs = exact.expiresAt - exact.createdAt;
  requireAssertion(
    'canonical approval has natural production expiry lifetime',
    lifetimeMs >= 595_000 && lifetimeMs <= 605_000,
    { lifetimeMs },
  );
  packet.dispatch = {
    cold: true,
    promptSha256: hash(PROMPT),
    promptCharCount: PROMPT.length,
    startedAt: dispatchStartedAt,
    stopControlObservedAtMs: Math.round(stopObserved.value.at - dispatchStartedAt),
    firstAssistantProjectionAtMs: Math.round(
      performance.now() - dispatchStartedPerf - (anyProposal.elapsedMs - firstProjection.elapsedMs),
    ),
    pendingApprovalAtMs: Math.round(performance.now() - dispatchStartedPerf),
    modelDispatches,
    streamReceipt: {
      stopControlObserved: true,
      assistantProjectionCount: anyProposal.value.assistantProjectionCount,
      messageCount: anyProposal.value.messageCount,
      transportAttempts: exact.transportAttempts,
    },
  };
  packet.proposal = {
    actionId: proposal.actionId,
    status: proposal.status,
    approvalIdentitySha256: hash(proposal.approvalId),
    runIdentitySha256: hash(target.storedIdentity.run.id),
    requestIdentitySha256: hash(exact.requestId),
    messageIdentitySha256: hash(exact.messageId),
    attemptNumber: exact.attemptNumber,
    createdAt: exact.createdAt,
    expiresAt: exact.expiresAt,
    lifetimeMs,
    rootMatches: true,
    pathMatches: true,
    contentMatches: true,
    expectedRootSha256: hash(rawTarget.projectRoot),
    expectedPathSha256: hash(targetPath),
    expectedContentSha256: hash(EXPECTED_CONTENT),
    semanticDiscovery: {
      observations: target.observations,
      elapsedMs: target.elapsedMs,
      stableObservations: target.stableObservations,
    },
  };
  return target;
}

async function expiryState(approvalId) {
  const [stored, file] = await Promise.all([readStoredApproval(approvalId), fileState(targetPath)]);
  const card = rawTarget.card;
  return {
    observedAt: Date.now(),
    approvalStatus: stored?.approval?.status ?? null,
    runStatus: stored?.run?.status ?? null,
    messagePartStatus: stored?.messagePart?.status ?? null,
    cardStatus: await card.getAttribute('data-status'),
    denyVisible: await card
      .getByRole('button', { name: 'Deny action', exact: true })
      .isVisible()
      .catch(() => false),
    targetExists: file.exists,
  };
}

async function waitForNaturalExpiry(target) {
  rawTarget = { ...rawTarget, card: target.card };
  const expiresAt = target.storedIdentity.exact.expiresAt;
  let lastProgressBucket = null;
  let lastSafetyBucket = null;
  const expired = await waitForSemantic({
    description:
      'canonical approval reaches natural production expiry while remaining exactly pending',
    timeoutMs: Math.max(30_000, expiresAt - Date.now() + 120_000),
    intervalMs: 1_000,
    observe: async () => {
      const now = Date.now();
      const safetyBucket = Math.floor(now / 30_000);
      if (safetyBucket !== lastSafetyBucket) {
        lastSafetyBucket = safetyBucket;
        await guard(`natural-expiry-observer:${safetyBucket}`);
      }
      return expiryState(target.approvalId);
    },
    onObservation: (value) => {
      const remainingMs = expiresAt - value.observedAt;
      const bucket = Math.max(-1, Math.floor(Math.max(0, remainingMs) / 30_000));
      if (bucket !== lastProgressBucket) {
        lastProgressBucket = bucket;
        checkpoint('natural-expiry-observation', {
          remainingMs: Math.max(0, remainingMs),
          approvalStatus: value.approvalStatus,
          runStatus: value.runStatus,
          messagePartStatus: value.messagePartStatus,
          cardStatus: value.cardStatus,
          denyVisible: value.denyVisible,
          targetExists: value.targetExists,
        });
      }
    },
    accept: (value) =>
      value.observedAt >= expiresAt + 1_000 &&
      value.approvalStatus === 'pending' &&
      value.runStatus === 'awaiting_approval' &&
      value.messagePartStatus === 'pending' &&
      value.cardStatus === 'pending' &&
      value.denyVisible &&
      !value.targetExists,
  });
  packet.naturalExpiry = {
    expiresAt,
    observedAt: expired.value.observedAt,
    observedAfterExpiryMs: expired.value.observedAt - expiresAt,
    approvalStillPending: expired.value.approvalStatus === 'pending',
    runStillAwaitingApproval: expired.value.runStatus === 'awaiting_approval',
    messagePartStillPending: expired.value.messagePartStatus === 'pending',
    cardStillPending: expired.value.cardStatus === 'pending',
    denyVisible: expired.value.denyVisible,
    targetAbsent: !expired.value.targetExists,
    observations: expired.attempts,
    elapsedMs: expired.elapsedMs,
  };
  await capture(PENDING_SCREENSHOT);
  return expired.value;
}

async function denialSnapshot(approvalId) {
  return page.evaluate(
    async ({ approvalId, chatId }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const approval = await db.jarvis_approvals.get(approvalId);
      const run = approval ? await db.jarvis_runs.get(approval.run_id) : undefined;
      const events = run ? await db.jarvis_events.where('run_id').equals(run.id).sortBy('seq') : [];
      const messages = await db.messages.where('chat_id').equals(chatId).toArray();
      const matching = [];
      for (const message of messages) {
        for (const part of message.parts) {
          if (part.kind === 'action_proposal' && part.call_id === `jarvisapproval:${approvalId}`) {
            matching.push({ messageId: String(message.id), status: String(part.status) });
          }
        }
      }
      return {
        approval: approval
          ? {
              status: String(approval.status),
              createdAt: Number(approval.created_at),
              expiresAt: Number(approval.expires_at),
              decidedAt: Number(approval.decided_at ?? 0),
            }
          : null,
        run: run
          ? {
              status: String(run.status),
              updatedAt: Number(run.updated_at),
            }
          : null,
        matchingParts: matching,
        eventTailSeq: events.at(-1)?.seq ?? null,
        denialEventCount: events.filter(
          (event) => event.type === 'approval' && event.status === 'denied',
        ).length,
        resumedEventCount: events.filter(
          (event) => event.type === 'run_state' && event.status === 'running',
        ).length,
      };
    },
    { approvalId, chatId: disposableChatId },
  );
}

async function denyOnce(target) {
  const deny = target.card.getByRole('button', { name: 'Deny action', exact: true });
  requireAssertion(
    'exact target Deny is visible and enabled after natural expiry',
    (await deny.count()) === 1 &&
      (await deny.isVisible().catch(() => false)) &&
      (await deny.isEnabled().catch(() => false)),
  );
  await guard('deny-once:before');
  await deny.click();
  denyClicks += 1;
  requireAssertion('exactly one Deny click was issued', denyClicks === 1);
  const reconciled = await waitForSemantic({
    description: 'expired denial commits canonical, message, card, and run reconciliation',
    timeoutMs: 30_000,
    intervalMs: 100,
    observe: async () => {
      const [stored, targetFile] = await Promise.all([
        denialSnapshot(target.approvalId),
        fileState(targetPath),
      ]);
      return {
        stored,
        targetExists: targetFile.exists,
        cardStatus: await target.card.getAttribute('data-status'),
        approveControls: await target.card
          .getByRole('button', { name: 'Approve fixed action', exact: true })
          .count(),
        denyControls: await target.card
          .getByRole('button', { name: 'Deny action', exact: true })
          .count(),
        sendVisible: await page
          .getByRole('button', { name: 'Send message', exact: true })
          .isVisible()
          .catch(() => false),
        stopCount: await page
          .getByRole('button', { name: 'Stop current request', exact: true })
          .count(),
      };
    },
    accept: (value) =>
      value.stored.approval?.status === 'denied' &&
      value.stored.approval.decidedAt >= value.stored.approval.expiresAt &&
      value.stored.run?.status === 'running' &&
      value.stored.run.updatedAt === value.stored.approval.decidedAt &&
      value.stored.matchingParts.length === 1 &&
      value.stored.matchingParts[0].status === 'cancelled' &&
      value.stored.denialEventCount === 1 &&
      value.stored.resumedEventCount >= 1 &&
      value.cardStatus === 'cancelled' &&
      value.approveControls === 0 &&
      value.denyControls === 0 &&
      value.sendVisible &&
      value.stopCount === 0 &&
      !value.targetExists,
  });
  const stable = await waitForSemantic({
    description: 'denial readback remains stable across repeated canonical observations',
    timeoutMs: 5_000,
    intervalMs: 250,
    observe: () => denialSnapshot(target.approvalId),
    accept: (() => {
      let count = 0;
      return (value) => {
        const exact =
          value.approval?.status === 'denied' &&
          value.run?.status === 'running' &&
          value.matchingParts.length === 1 &&
          value.matchingParts[0].status === 'cancelled';
        count = exact ? count + 1 : 0;
        return count >= 3;
      };
    })(),
  });
  await guard('deny-once:after');
  packet.denial = {
    denyClicks,
    decisionResponseCategory: 'approval_decided',
    decisionResponseBoundary:
      'successful category is established by exact canonical approval=denied plus committed denial/resume events; public UI exposes no raw host response payload',
    approvalStatus: reconciled.value.stored.approval.status,
    approvalDecidedAt: reconciled.value.stored.approval.decidedAt,
    decidedAfterExpiryMs:
      reconciled.value.stored.approval.decidedAt - reconciled.value.stored.approval.expiresAt,
    runStatus: reconciled.value.stored.run.status,
    runUpdatedAtMatchesDecision:
      reconciled.value.stored.run.updatedAt === reconciled.value.stored.approval.decidedAt,
    messagePartStatus: reconciled.value.stored.matchingParts[0].status,
    cardStatus: reconciled.value.cardStatus,
    approvalControlsAbsent:
      reconciled.value.approveControls === 0 && reconciled.value.denyControls === 0,
    composerRestored: reconciled.value.sendVisible && reconciled.value.stopCount === 0,
    denialEventCount: reconciled.value.stored.denialEventCount,
    resumedEventCount: reconciled.value.stored.resumedEventCount,
    eventTailSeq: reconciled.value.stored.eventTailSeq,
    targetAbsent: !reconciled.value.targetExists,
    stableReadbackObservations: stable.attempts,
  };
  await capture(DENIED_SCREENSHOT);
  return reconciled.value;
}

async function cleanupDisposableChat() {
  if (!disposableChatId || !page || page.isClosed()) return;
  const active = await readActiveChat();
  if (active?.id !== disposableChatId) {
    packet.cleanup = {
      attempted: false,
      completed: false,
      reason:
        'disposable Chat was no longer the active public tab; no direct database cleanup used',
    };
    return;
  }
  const openChats = page.getByRole('group', { name: 'Open chats', exact: true });
  const activeTab = openChats.getByRole('button', { pressed: true });
  await activeTab.waitFor({ state: 'visible', timeout: 10_000 });
  const close = activeTab.locator('xpath=..').getByRole('button', { name: /^Close /u });
  requireAssertion(
    'one public close control owns the disposable Chat',
    (await close.count()) === 1,
  );
  await close.click();
  publicCleanupClicks += 1;
  const removed = await waitForSemantic({
    description: 'public close removes only the disposable Chat and its messages',
    timeoutMs: 20_000,
    intervalMs: 100,
    observe: () =>
      page.evaluate(
        async ({ chatId }) => {
          const [{ db }, { useUIStore }] = await Promise.all([
            import('/src/lib/db/index.ts'),
            import('/src/stores/ui.ts'),
          ]);
          return {
            chatExists: Boolean(await db.chats.get(chatId)),
            messageCount: await db.messages.where('chat_id').equals(chatId).count(),
            activeIsDisposable: useUIStore.getState().activeChatId === chatId,
          };
        },
        { chatId: disposableChatId },
      ),
    accept: (value) => !value.chatExists && value.messageCount === 0 && !value.activeIsDisposable,
  });
  packet.cleanup = {
    attempted: true,
    completed: true,
    publicCloseClicks: publicCleanupClicks,
    directDatabaseCleanup: false,
    ...removed.value,
  };
}

async function bestEffortFailureScreenshot() {
  if (!page || page.isClosed()) return;
  const name = artifacts.some((artifact) => artifact.name === PENDING_SCREENSHOT)
    ? DENIED_SCREENSHOT
    : PENDING_SCREENSHOT;
  if (artifacts.some((artifact) => artifact.name === name)) return;
  await capture(name).catch(() => undefined);
}

async function finalFileEvidence() {
  const [target, wrong] = await Promise.all([
    targetPath ? fileState(targetPath) : Promise.resolve(null),
    fileState(WRONG_TARGET),
  ]);
  return {
    requestedTarget: target
      ? {
          identitySha256: hash(targetPath),
          exists: target.exists,
          size: target.size,
        }
      : null,
    historicalWrongTarget: {
      identitySha256: hash(WRONG_TARGET),
      exists: wrong.exists,
      size: wrong.size,
    },
  };
}

try {
  const gitHead = (await import('node:child_process'))
    .execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
    .trim();
  requireAssertion('frozen native proof HEAD is exact', gitHead === HEAD, { gitHead });
  currentStage = 'official_attach';
  await guard('pre-attach');
  attachment = await attachOfficialNative({
    chromium,
    stateProbe: readWindowsNativeState,
    localAppData: process.env.LOCALAPPDATA,
    cdpPort: 9223,
    jarvisPid: packet.authority.jarvisPid,
    readinessTimeoutMs: 20_000,
  });
  page = attachment.page;
  recorder = createPageEventRecorder(page, { limit: 240 });
  await ensureChatSurface();
  checkpoint('official-app-ready', packet.authority);

  currentStage = 'project_preflight';
  rawTarget = await projectBoundary();
  requireAssertion(
    'current official project identity and root are available',
    rawTarget.workspaceId.length > 0 &&
      rawTarget.projectId.length > 0 &&
      path.win32.isAbsolute(rawTarget.projectRoot),
  );
  targetPath = path.win32.join(rawTarget.projectRoot, 'output.txt');
  const [targetBefore, wrongBefore] = await Promise.all([
    fileState(targetPath),
    fileState(WRONG_TARGET),
  ]);
  requireAssertion('disposable requested target is absent before dispatch', !targetBefore.exists);
  requireAssertion('historical wrong target is absent before dispatch', !wrongBefore.exists);
  packet.preflightFiles = {
    requestedTargetIdentitySha256: hash(targetPath),
    requestedTargetAbsent: !targetBefore.exists,
    historicalWrongTargetIdentitySha256: hash(WRONG_TARGET),
    historicalWrongTargetAbsent: !wrongBefore.exists,
  };

  currentStage = 'public_chat_create';
  await createDisposableChat();
  checkpoint('disposable-chat-created', packet.chat);

  currentStage = 'exact_identity';
  await guard('before-model-picker');
  await selectExactModelRoute();
  await guard('after-model-picker');
  await setAgentWriteMode();
  checkpoint('exact-model-and-write-mode-saved', packet.modelIdentity);

  currentStage = 'single_model_dispatch';
  rawTarget = { ...rawTarget, card: null };
  const target = await dispatchOnce();
  rawTarget = { ...rawTarget, card: target.card };
  checkpoint('real-canonical-pending-approval-proven', packet.proposal);
  await guard('pending-approval-proven');

  currentStage = 'natural_expiry';
  await waitForNaturalExpiry(target);
  checkpoint('natural-production-expiry-proven', packet.naturalExpiry);

  currentStage = 'single_deny';
  await denyOnce(target);
  checkpoint('durable-denial-reconciled', packet.denial);

  currentStage = 'evidence_cleanup';
  packet.filesAfterDenial = await finalFileEvidence();
  requireAssertion(
    'requested and historical wrong targets remain absent after denial',
    packet.filesAfterDenial.requestedTarget?.exists === false &&
      packet.filesAfterDenial.historicalWrongTarget.exists === false,
  );
  await cleanupDisposableChat();
  await guard('final-after-cleanup');
  packet.status = 'passed';
} catch (error) {
  firstFailure = {
    stage: currentStage,
    code: String(error?.code ?? error?.message ?? 'native_attempt_failed').slice(0, 240),
    name: String(error?.name ?? 'Error').slice(0, 120),
    details: sanitizeEvidence(error?.details ?? null),
  };
  packet.firstFailure = firstFailure;
  checkpoint('first-failure', firstFailure);
  await bestEffortFailureScreenshot();
  packet.filesAtFailure = await finalFileEvidence().catch(() => null);
  await cleanupDisposableChat().catch((cleanupError) => {
    packet.cleanup = {
      attempted: true,
      completed: false,
      reasonCode: String(cleanupError?.code ?? cleanupError?.message ?? 'cleanup_failed').slice(
        0,
        200,
      ),
    };
  });
} finally {
  packet.events = recorder?.snapshot() ?? [];
  recorder?.dispose();
  if (!packet.filesAfterDenial) {
    packet.filesFinal = await finalFileEvidence().catch(() => null);
  }
  const consoleFailures = packet.events.filter(
    (event) => event.source === 'console' && event.type === 'error',
  );
  const pageFailures = packet.events.filter((event) => event.source === 'pageerror');
  packet.logSummary = {
    totalCapturedEvents: packet.events.length,
    consoleErrorCount: consoleFailures.length,
    pageErrorCount: pageFailures.length,
    jarvisKernelFailureCount: packet.events.filter(
      (event) => event.source === 'console' && event.classification === 'jarvis_kernel',
    ).length,
    valuesAreHashedAndBounded: true,
  };
  packet.counts = {
    modelDispatches,
    denyClicks,
    approveClicks: 0,
    reloads: 0,
    publicCleanupClicks,
  };
  packet.completedAt = new Date().toISOString();
  packet.durationMs = elapsedMs();
  await attachment?.browser.close().catch(() => undefined);
  const finalState = await readWindowsNativeState().catch(() => null);
  if (finalState) {
    const finalSafety = captureSafetySnapshot(finalState, 'finally-after-cdp-detach');
    safety.push(finalSafety);
    try {
      assertZeroOllama(finalSafety, 'finally-after-cdp-detach');
    } catch (error) {
      if (!packet.firstFailure) {
        packet.firstFailure = {
          stage: 'finally_after_cdp_detach',
          code: String(error?.code ?? 'forbidden_ollama_or_11434'),
        };
        packet.status = 'failed';
      }
    }
  }
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: REPORT_NAME,
    packet,
  });
  process.stdout.write(
    `${JSON.stringify({
      completed: true,
      status: packet.status,
      report: REPORT_NAME,
      modelDispatches,
      denyClicks,
      approveClicks: 0,
      ollamaProcessCount: safety.at(-1)?.ollamaProcessCount ?? null,
      listener11434Count: safety.at(-1)?.listener11434Count ?? null,
    })}\n`,
  );
}

process.exitCode = packet.status === 'passed' ? 0 : 1;
