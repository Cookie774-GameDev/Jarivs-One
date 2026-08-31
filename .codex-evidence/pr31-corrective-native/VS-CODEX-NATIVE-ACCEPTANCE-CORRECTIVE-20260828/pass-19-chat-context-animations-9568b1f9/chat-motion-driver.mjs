import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import sharp from 'sharp';

import {
  assertZeroOllama,
  attachOfficialNative,
  captureSafetySnapshot,
  captureScreenshot,
  createEvidencePacket,
  createPageEventRecorder,
  finalizeEvidencePacket,
  readWindowsNativeState,
  recordAssertion,
  recordFirstFailure,
  waitForSemantic,
  writeEvidencePacket,
} from '../../../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const FIXTURE_ID = 'chat_pr31_structured_motion_20260828';
const FIXTURE_TITLE = 'PR31 Structured Motion Native Fixture';
const MOTION_EVENT_ID = 'pr31_structured_motion_event';
const NORMAL_VIEWPORT = Object.freeze({ width: 1280, height: 900 });
const NARROW_VIEWPORT = Object.freeze({ width: 760, height: 900 });

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function must(packet, name, passed, details) {
  recordAssertion(packet, name, passed, details);
  if (!passed) throw new Error(`Assertion failed: ${name}`);
}

async function safety(label) {
  return assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), label), label);
}

async function wake(page) {
  const ambient = page.getByRole('dialog', { name: /Ambient mode/u });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Shift');
    await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
  }
}

async function capture(packet, page, name, semanticState) {
  const before = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    devicePixelRatio: window.devicePixelRatio,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  const artifact = await captureScreenshot({
    page,
    evidenceDirectory: HERE,
    name,
    imageMetadata: async (buffer) => sharp(buffer).metadata(),
  });
  packet.artifacts.push({
    ...artifact,
    viewport: page.viewportSize(),
    window: before,
    semanticState,
  });
  return artifact;
}

async function createFixture(page) {
  return page.evaluate(
    async ({ fixtureId, fixtureTitle, motionEventId }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useAuthStore } = await import('/src/stores/auth.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
      const auth = useAuthStore.getState();
      const ui = useUIStore.getState();
      if (!auth.workspaceId) throw new Error('No active native workspace');
      const priorChatId = ui.activeChatId;
      const now = Date.now();
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.messages.where('chat_id').equals(fixtureId).delete();
        await db.chats.delete(fixtureId);
        await db.chats.add({
          id: fixtureId,
          workspace_id: auth.workspaceId,
          ...(auth.projectId ? { project_id: auth.projectId } : {}),
          title: fixtureTitle,
          mode: 'chat',
          active_agent_ids: [],
          created_at: now - 60_000,
          updated_at: now,
        });
        await db.messages.bulkPut([
          {
            id: `${fixtureId}_user`,
            chat_id: fixtureId,
            role: 'user',
            parts: [
              {
                kind: 'text',
                text: 'Show the structured local activity receipts without dispatching a provider.',
              },
            ],
            created_at: now - 55_000,
            updated_at: now - 55_000,
          },
          {
            id: `${fixtureId}_assistant`,
            chat_id: fixtureId,
            role: 'assistant',
            parts: [
              {
                kind: 'text',
                text: 'This native fixture exercises product rendering from bounded local structured activity state. It is not provider activity.',
              },
            ],
            created_at: now - 50_000,
            updated_at: now - 1_000,
          },
        ]);
      });
      const activity = useChatActivityStore.getState();
      activity.clearChat(fixtureId);
      activity.record({
        id: motionEventId,
        chatId: fixtureId,
        kind: 'file',
        category: 'file',
        status: 'running',
        title: 'Reading the local motion contract',
        filePath: 'app/src/features/chat/agentic-console/AgentMotionIndicator.tsx',
        ts: now - 10_000,
        startedAt: now - 10_000,
      });
      ui.setActiveChat(fixtureId);
      ui.setRoute('chat');
      return { priorChatId, workspaceId: String(auth.workspaceId) };
    },
    { fixtureId: FIXTURE_ID, fixtureTitle: FIXTURE_TITLE, motionEventId: MOTION_EVENT_ID },
  );
}

async function setFixtureActivity(page, patch) {
  await page.evaluate(
    async ({ fixtureId, motionEventId, patch }) => {
      const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
      useChatActivityStore.getState().update(fixtureId, motionEventId, {
        ...patch,
        ts: Date.now(),
        startedAt: Date.now(),
        status: 'running',
      });
    },
    { fixtureId: FIXTURE_ID, motionEventId: MOTION_EVENT_ID, patch },
  );
}

async function cleanupFixture(page, priorChatId) {
  return page.evaluate(
    async ({ fixtureId, priorChatId }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
      useChatActivityStore.getState().clearChat(fixtureId);
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.messages.where('chat_id').equals(fixtureId).delete();
        await db.chats.delete(fixtureId);
      });
      useUIStore.getState().setActiveChat(priorChatId || null);
      useUIStore.getState().setRoute('chat');
      return {
        chatCount: await db.chats.where('id').equals(fixtureId).count(),
        messageCount: await db.messages.where('chat_id').equals(fixtureId).count(),
        activityCount: useChatActivityStore.getState().eventsByChat[String(fixtureId)]?.length ?? 0,
      };
    },
    { fixtureId: FIXTURE_ID, priorChatId },
  );
}

async function motionState(page, expectedMotion) {
  const result = await waitForSemantic({
    description: `current ${expectedMotion} structured motion`,
    timeoutMs: 10_000,
    intervalMs: 100,
    observe: () =>
      page.evaluate((expected) => {
        const current = document.querySelector(
          `[data-agent-motion="${expected}"][data-agent-motion-presence="current"]`,
        );
        const activeMail = document.querySelector(
          '[data-agent-motion="mail-send"][data-agent-motion-presence="current"]',
        );
        const activeShip = document.querySelector(
          '[data-agent-motion="ship-launch"][data-agent-motion-presence="current"]',
        );
        const disclosure = current?.closest('button');
        const labelledBy = disclosure?.getAttribute('aria-labelledby')?.split(/\s+/u) ?? [];
        const accessibleLabel = labelledBy
          .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/gu, ' ').trim() ?? '')
          .filter(Boolean)
          .join(' ');
        const animatedNodes = current
          ? [current, ...current.querySelectorAll('*')].flatMap((node) => {
              const own = getComputedStyle(node);
              const after = getComputedStyle(node, '::after');
              return [
                { target: node.className || node.tagName, pseudo: '', name: own.animationName },
                {
                  target: node.className || node.tagName,
                  pseudo: '::after',
                  name: after.animationName,
                },
              ];
            })
          : [];
        return {
          found: Boolean(current),
          expected,
          currentAriaHidden: current?.getAttribute('aria-hidden') ?? null,
          transitionAriaHidden: current?.parentElement?.getAttribute('aria-hidden') ?? null,
          focusableDescendants: current?.querySelectorAll(
            'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
          ).length,
          disclosureExpanded: disclosure?.getAttribute('aria-expanded') ?? null,
          accessibleLabel,
          activeMail: Boolean(activeMail),
          activeShip: Boolean(activeShip),
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          animatedNodes,
        };
      }, expectedMotion),
    accept: (value) => value.found === true,
  });
  return result.value;
}

let attachment;
let recorder;
let packet;
let priorChatId = null;
let originalViewport = null;
let originalReducedMotion = false;

try {
  const captureHead = git('rev-parse', 'HEAD');
  attachment = await attachOfficialNative({ chromium });
  recorder = createPageEventRecorder(attachment.page, { limit: 200 });
  packet = createEvidencePacket({
    taskId: 'PR31-CHAT-STRUCTURED-MOTION-NATIVE',
    captureHead,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      fixtureAuthority: 'local deterministic Chat activity store; not provider activity',
      modelDispatched: false,
      modelIdentity: null,
      appRestarted: false,
      credentialsMutated: false,
      productionMutated: false,
      normalViewport: NORMAL_VIEWPORT,
      narrowViewport: NARROW_VIEWPORT,
    },
  });
  const page = attachment.page;
  await wake(page);
  originalViewport = page.viewportSize();
  originalReducedMotion = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const fixture = await createFixture(page);
  priorChatId = fixture.priorChatId;
  const chatNav = page.getByText('Chat', { exact: true }).first();
  await chatNav.click();
  await page
    .getByRole('textbox', { name: 'Message' })
    .waitFor({ state: 'visible', timeout: 15_000 });
  const fixtureNav = page.getByText(FIXTURE_TITLE, { exact: true }).first();
  await fixtureNav.waitFor({ state: 'visible', timeout: 15_000 });
  await fixtureNav.click();
  await page
    .getByText(
      'This native fixture exercises product rendering from bounded local structured activity state. It is not provider activity.',
      { exact: true },
    )
    .waitFor({ state: 'visible', timeout: 15_000 });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize(NORMAL_VIEWPORT);
  const book = await motionState(page, 'book-read');
  must(
    packet,
    'book motion is decorative beside an accessible ledger disclosure',
    book.currentAriaHidden === 'true' &&
      book.transitionAriaHidden === 'true' &&
      book.focusableDescendants === 0 &&
      book.accessibleLabel.includes('Show activity details'),
    book,
  );
  must(
    packet,
    'book motion is animated under normal motion preference',
    !book.reducedMotion && book.animatedNodes.some((entry) => entry.name !== 'none'),
    book.animatedNodes,
  );
  await capture(packet, page, '01-book-read-normal-attempt-02.png', {
    structuredKind: 'file',
    motion: 'book-read',
    providerActivity: false,
  });

  await setFixtureActivity(page, {
    kind: 'url',
    category: 'context',
    semanticIntent: undefined,
    title: 'Searching a bounded local reference',
    url: 'https://example.com/reference',
  });
  await page.setViewportSize(NARROW_VIEWPORT);
  const search = await motionState(page, 'search-scan');
  must(
    packet,
    'search motion remains accessible and decorative in narrow layout',
    search.currentAriaHidden === 'true' &&
      search.transitionAriaHidden === 'true' &&
      search.focusableDescendants === 0 &&
      search.accessibleLabel.includes('Show activity details'),
    search,
  );
  await capture(packet, page, '02-search-scan-narrow-attempt-02.png', {
    structuredKind: 'url',
    motion: 'search-scan',
    providerActivity: false,
  });

  await setFixtureActivity(page, {
    kind: 'tool',
    category: 'thinking',
    semanticIntent: undefined,
    title: 'Send mail and ship this package in generic prose',
    url: undefined,
    filePath: undefined,
  });
  const proseNegative = await motionState(page, 'cursor-forge');
  must(
    packet,
    'generic mail and ship prose does not trigger structured motions',
    !proseNegative.activeMail && !proseNegative.activeShip,
    proseNegative,
  );

  await setFixtureActivity(page, {
    kind: 'tool',
    category: 'thinking',
    semanticIntent: undefined,
    title: 'Gmail list and read receipt',
  });
  const gmailNegative = await motionState(page, 'cursor-forge');
  must(
    packet,
    'Gmail list and read activity does not trigger send motion',
    !gmailNegative.activeMail && !gmailNegative.activeShip,
    gmailNegative,
  );

  await setFixtureActivity(page, {
    kind: 'tool',
    category: 'thinking',
    semanticIntent: 'mail',
    title: 'Canonical structured mail send receipt',
  });
  await page.setViewportSize(NORMAL_VIEWPORT);
  const mail = await motionState(page, 'mail-send');
  must(
    packet,
    'structured mail intent alone renders mail send motion',
    mail.activeMail && !mail.activeShip && mail.currentAriaHidden === 'true',
    mail,
  );
  await capture(packet, page, '03-mail-send-normal-attempt-02.png', {
    structuredSemanticIntent: 'mail',
    motion: 'mail-send',
    providerActivity: false,
  });

  await setFixtureActivity(page, {
    kind: 'tool',
    category: 'thinking',
    semanticIntent: 'ship',
    title: 'Canonical structured ship launch receipt',
  });
  await page.setViewportSize(NARROW_VIEWPORT);
  const ship = await motionState(page, 'ship-launch');
  must(
    packet,
    'structured ship intent alone renders ship launch motion',
    ship.activeShip && !ship.activeMail && ship.currentAriaHidden === 'true',
    ship,
  );
  await capture(packet, page, '04-ship-launch-narrow-attempt-02.png', {
    structuredSemanticIntent: 'ship',
    motion: 'ship-launch',
    providerActivity: false,
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedShip = await motionState(page, 'ship-launch');
  const reducedAnimations = reducedShip.animatedNodes.filter((entry) => entry.name !== 'none');
  must(
    packet,
    'reduced motion disables all ship animation while preserving semantic ledger state',
    reducedShip.reducedMotion && reducedAnimations.length === 0 && reducedShip.activeShip,
    { reducedShip, reducedAnimations },
  );
  await capture(packet, page, '05-ship-launch-narrow-reduced-motion-attempt-02.png', {
    structuredSemanticIntent: 'ship',
    motion: 'ship-launch',
    reducedMotion: true,
    providerActivity: false,
  });
  packet.metadata.states = { book, search, proseNegative, gmailNegative, mail, ship, reducedShip };
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-CHAT-STRUCTURED-MOTION-NATIVE',
      captureHead: git('rev-parse', 'HEAD'),
    });
  }
  recordFirstFailure(packet, error, 'chat_structured_motion');
  if (attachment?.page) {
    await capture(packet, attachment.page, 'FAIL-chat-structured-motion-attempt-02.png', {
      firstFailure: packet.firstFailure,
    }).catch(() => undefined);
  }
} finally {
  if (attachment?.page) {
    try {
      await attachment.page.emulateMedia({
        reducedMotion: originalReducedMotion ? 'reduce' : 'no-preference',
      });
      if (originalViewport) await attachment.page.setViewportSize(originalViewport);
      const cleanup = await cleanupFixture(attachment.page, priorChatId);
      must(
        packet,
        'fixture chat, messages, and activity were fully removed',
        cleanup.chatCount === 0 && cleanup.messageCount === 0 && cleanup.activityCount === 0,
        cleanup,
      );
      packet.metadata.cleanup = cleanup;
    } catch (error) {
      recordFirstFailure(packet, error, 'chat_fixture_cleanup');
    }
  }
  recorder?.dispose();
  await attachment?.browser.close().catch(() => undefined);
  try {
    packet.safety.push(await safety('chat-motion:after'));
  } catch (error) {
    recordFirstFailure(packet, error, 'chat_motion_after');
  }
}

const events = recorder?.snapshot() ?? [];
recordAssertion(
  packet,
  'no console, page, or network failures were recorded',
  events.length === 0,
  {
    eventCount: events.length,
  },
);
const completed = finalizeEvidencePacket(packet, { events });
const output = await writeEvidencePacket({
  evidenceDirectory: HERE,
  name:
    completed.status === 'passed'
      ? 'chat-motion-report-attempt-02.json'
      : 'chat-motion-failure-attempt-02.json',
  packet: completed,
});
process.stdout.write(`${JSON.stringify({ status: completed.status, output })}\n`);
process.exitCode = completed.status === 'passed' ? 0 : 1;
