import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const INTERACTION_AUDIT_ROOT = resolve(MODULE_DIRECTORY, '../..');

/**
 * Real Chat seams. These mirror the production readiness selectors used by the capture harness so
 * the interaction audit checks the genuine live Chat root, thread, composer, and session rather
 * than a fixture route or a decorative duplicate. The decorative Origami layer is included so the
 * audit can prove it stays inert and unfocusable.
 */
export const INTERACTION_SELECTORS = Object.freeze({
  root: '#root',
  chat: '[data-vibespace-page="chat"]',
  activeChat: '[data-vibespace-page="chat"]:visible',
  session: '[data-testid="jarvis-session-panel"]',
  composer: 'textarea[aria-label="Message"]',
  thread: '[role="log"][data-tour="chat-thread"]',
  decor: '[data-testid="origami-chat-decor"]',
});

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The only native web-preview diagnostics permitted during the audit. They mirror the documented
 * Tauri-preview exclusions: the missing native bridge invoke and the expected kernel-host boot
 * notice. Every other console/page error fails the audit.
 */
export const DOCUMENTED_INTERACTION_PREVIEW_ERRORS = Object.freeze([
  "pageerror: Cannot read properties of undefined (reading 'invoke')",
  'console: [boot] account scope startup: jarvis_kernel_host_not_installed',
]);

/** Accessible-name descriptors for the required live Composer and Jarvis controls. */
export const INTERACTION_CONTROLS = Object.freeze({
  modelSelector: Object.freeze({
    id: 'modelSelector',
    label: 'model selector',
    kind: 'role',
    role: 'button',
    name: 'Choose model',
    exact: true,
  }),
  agentMode: Object.freeze({
    id: 'agentMode',
    label: 'Agent Mode control',
    kind: 'role',
    role: 'button',
    name: /Agent Mode/i,
    exact: false,
  }),
  composer: Object.freeze({
    id: 'composer',
    label: 'message textarea',
    kind: 'locator',
    selector: INTERACTION_SELECTORS.composer,
  }),
  send: Object.freeze({
    id: 'send',
    label: 'send control',
    kind: 'role',
    role: 'button',
    name: 'Send message',
    exact: true,
  }),
  dictation: Object.freeze({
    id: 'dictation',
    label: 'dictation control',
    kind: 'role',
    role: 'button',
    name: 'Start dictation',
    exact: true,
  }),
  jarvisOpener: Object.freeze({
    id: 'jarvisOpener',
    label: 'Jarvis opener',
    kind: 'role',
    role: 'button',
    name: 'Open Jarvis voice panel',
    exact: true,
  }),
  sessionExpand: Object.freeze({
    id: 'sessionExpand',
    label: 'session details control',
    kind: 'role',
    role: 'button',
    name: /(?:Expand|Collapse) session details/,
    exact: false,
  }),
  navToggle: Object.freeze({
    id: 'navToggle',
    label: 'sidebar navigation control',
    kind: 'role',
    role: 'button',
    name: 'Toggle navigation',
    exact: true,
  }),
  createProject: Object.freeze({
    id: 'createProject',
    label: 'project control',
    kind: 'role',
    role: 'button',
    name: 'Create project',
    exact: true,
  }),
  createChat: Object.freeze({
    id: 'createChat',
    label: 'chat control',
    kind: 'role',
    role: 'button',
    name: 'Create chat',
    exact: true,
  }),
});

/** Structural seams that must each resolve to exactly one visible real element. */
export const INTERACTION_STRUCTURE = Object.freeze({
  root: Object.freeze({
    id: 'root',
    label: 'app root',
    kind: 'locator',
    selector: INTERACTION_SELECTORS.root,
  }),
  chat: Object.freeze({
    id: 'chat',
    label: 'real Chat root',
    kind: 'locator',
    selector: INTERACTION_SELECTORS.chat,
  }),
  session: Object.freeze({
    id: 'session',
    label: 'Chat session panel',
    kind: 'locator',
    selector: INTERACTION_SELECTORS.session,
  }),
  composer: Object.freeze({
    id: 'composer',
    label: 'composer textarea',
    kind: 'locator',
    selector: INTERACTION_SELECTORS.composer,
  }),
  thread: Object.freeze({
    id: 'thread',
    label: 'Chat thread',
    kind: 'locator',
    selector: INTERACTION_SELECTORS.thread,
  }),
});

export const JARVIS_PANEL_LABEL = 'Jarvis voice session';
export const JARVIS_CLOSE_LABEL = 'Close Jarvis voice session';
export const JARVIS_CLICK_TO_TALK_LABEL = 'Click to talk';
export const JARVIS_COMMAND_CENTER_LABEL = /^Command Center/;
export const JARVIS_TRANSCRIPT_LABEL = 'Voice session transcript';
export const JARVIS_READY_STATUS = 'Ready';

/** Fail-closed audit error carrying a stable machine-readable code. */
export class InteractionAuditError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'InteractionAuditError';
    this.code = code;
  }
}

const REQUIRED_PAGE_OPERATIONS = Object.freeze([
  'locator',
  'getByRole',
  'getByLabel',
  'getByText',
  'evaluate',
  'waitForFunction',
]);
const SEND_READY_TIMEOUT_MS = 5_000;
const SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"]';

/** Validate the injected page adapter surface before any audit step runs. */
export function assertInteractionPage(page) {
  if (!page || typeof page !== 'object') {
    throw new InteractionAuditError('IA_PAGE_ADAPTER', 'An injectable page adapter is required.');
  }
  const missing = REQUIRED_PAGE_OPERATIONS.filter(
    (operation) => typeof page[operation] !== 'function',
  );
  if (missing.length > 0) {
    throw new InteractionAuditError(
      'IA_PAGE_ADAPTER',
      `Page adapter is missing required operations: ${missing.join(', ')}.`,
    );
  }
  return page;
}

function normalizeText(value) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Single browser-side extractor shared by the audit. It switches on `argument.kind` so the injected
 * page adapter only needs one evaluate seam. The callback intentionally uses a tiny DOM surface
 * (querySelectorAll, getAttribute, textContent, parentElement, matchMedia, activeElement) so it is
 * deterministic and unit-testable without a browser.
 */
export function interactionDomEvaluate(argument) {
  // Playwright serializes this callback into the page realm, so every helper it uses must live
  // inside the function rather than close over module scope.
  const normalizeDomText = (value) => (value ?? '').replace(/\s+/g, ' ').trim();

  if (argument.kind === 'activeElement') {
    const active = document.activeElement;
    if (!active || active === document.body) {
      return { focused: false, tag: null, ariaLabel: null };
    }
    return {
      focused: true,
      tag: (active.tagName || '').toLowerCase(),
      ariaLabel: active.getAttribute ? active.getAttribute('aria-label') : null,
    };
  }

  const selectors = argument.selectors;
  const reducedMotionMedia =
    typeof window.matchMedia === 'function'
      ? Boolean(window.matchMedia(argument.reducedMotionQuery).matches)
      : false;

  const decorNodes = [...document.querySelectorAll(selectors.decor)];
  let decor;
  if (decorNodes.length === 1) {
    const node = decorNodes[0];
    const focusableTags = [];
    for (const element of [...node.querySelectorAll('*')]) {
      const tag = (element.tagName || '').toLowerCase();
      const tabindex = element.getAttribute ? element.getAttribute('tabindex') : null;
      const nativeFocusable = ['a', 'button', 'input', 'select', 'textarea'].includes(tag);
      const tabindexFocusable = tabindex !== null && tabindex !== '-1';
      if (nativeFocusable) focusableTags.push(tag);
      else if (tabindexFocusable) focusableTags.push(`tabindex:${tabindex}`);
    }
    decor = {
      count: 1,
      ariaHidden: node.getAttribute('aria-hidden') === 'true',
      focusableCount: focusableTags.length,
      focusableTags,
      textLength: normalizeDomText(node.textContent).length,
    };
  } else {
    decor = {
      count: decorNodes.length,
      ariaHidden: false,
      focusableCount: 0,
      focusableTags: [],
      textLength: 0,
    };
  }

  const threadNodes = [...document.querySelectorAll(selectors.thread)];
  let thread;
  if (threadNodes.length === 1) {
    const node = threadNodes[0];
    const textLength = normalizeDomText(node.textContent).length;
    const imageCount = [...node.querySelectorAll('img')].length;
    thread = {
      count: 1,
      textLength,
      imageCount,
      hasLiveText: textLength > 0,
      imageOnly: textLength === 0 && imageCount > 0,
    };
  } else {
    thread = {
      count: threadNodes.length,
      textLength: 0,
      imageCount: 0,
      hasLiveText: false,
      imageOnly: false,
    };
  }

  const composerNodes = [...document.querySelectorAll(selectors.composer)];
  let shortcut;
  if (composerNodes.length === 1) {
    let scope = composerNodes[0];
    while (scope && !(scope.getAttribute && scope.getAttribute('data-terminal-drop') === 'chat')) {
      scope = scope.parentElement || null;
    }
    const root = scope || composerNodes[0];
    const kbdCount = [...root.querySelectorAll('.kbd')].length;
    const hasSendHint = normalizeDomText(root.textContent).includes('to send');
    shortcut = { present: kbdCount > 0 && hasSendHint, kbdCount, hasSendHint };
  } else {
    shortcut = { present: false, kbdCount: 0, hasSendHint: false };
  }

  return { reducedMotionMedia, decor, thread, shortcut };
}

/**
 * Browser-serialized readiness predicate for a filled Composer and enabled Send control.
 * Hidden cached Chat roots are ignored; readiness is true only inside one visible active Chat.
 */
export function submissionReadyEvaluate(argument) {
  const visibleChatRoots = [...document.querySelectorAll(argument.chatSelector)].filter((root) => {
    const style = window.getComputedStyle(root);
    return (
      !root.hidden &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      root.getClientRects().length > 0
    );
  });
  if (visibleChatRoots.length !== 1) return false;
  const root = visibleChatRoots[0];
  const composers = [...root.querySelectorAll(argument.composerSelector)];
  const sendControls = [...root.querySelectorAll(argument.sendSelector)];
  return (
    composers.length === 1 &&
    sendControls.length === 1 &&
    composers[0].value === argument.probe &&
    !sendControls[0].disabled
  );
}

async function waitForSubmissionReady(page, probe) {
  await page.waitForFunction(
    submissionReadyEvaluate,
    {
      chatSelector: INTERACTION_SELECTORS.chat,
      composerSelector: INTERACTION_SELECTORS.composer,
      sendSelector: SEND_BUTTON_SELECTOR,
      probe,
    },
    { polling: 'raf', timeout: SEND_READY_TIMEOUT_MS },
  );
}

export async function collectInteractionDomFacts(page) {
  return page.evaluate(interactionDomEvaluate, {
    kind: 'facts',
    selectors: INTERACTION_SELECTORS,
    reducedMotionQuery: REDUCED_MOTION_QUERY,
  });
}

export async function readActiveElement(page) {
  return page.evaluate(interactionDomEvaluate, { kind: 'activeElement' });
}

function resolveControlLocator(page, control, scope = page) {
  if (control.kind === 'role') {
    const options = control.exact ? { name: control.name, exact: true } : { name: control.name };
    return scope.getByRole(control.role, options);
  }
  if (control.kind === 'label') {
    return scope.getByLabel(control.name, { exact: control.exact !== false });
  }
  return scope.locator(control.selector);
}

/** Fail closed unless exactly one matching control exists and it is visible. */
export async function assertSingleVisibleControl(page, control, scope = page) {
  const locator = resolveControlLocator(page, control, scope);
  const count = await locator.count();
  const visible = count === 1 ? await locator.isVisible() : false;
  if (count !== 1 || !visible) {
    throw new InteractionAuditError(
      'IA_CONTROL_MISSING',
      `Refusing interaction audit: expected exactly one visible ${control.label}; found ${count} matching control(s), ${visible ? 'visible' : 'not visible'}.`,
    );
  }
  return locator;
}

/** Select the only visible active Chat root while allowing hidden cached Chat trees. */
export async function assertActiveChatRoot(page) {
  const activeChat = page.locator(INTERACTION_SELECTORS.activeChat);
  const count = await activeChat.count();
  const visible = count === 1 && (await activeChat.isVisible());
  if (count !== 1 || !visible) {
    throw new InteractionAuditError(
      'IA_ACTIVE_CHAT_ROOT',
      `Refusing interaction audit: expected exactly one visible active Chat root; found ${count}.`,
    );
  }
  return activeChat;
}

/** Assert the app root plus active Chat session, composer, and thread structure. */
export async function assertChatInteractionStructure(page, activeChat) {
  await assertSingleVisibleControl(page, INTERACTION_STRUCTURE.root);
  for (const control of [
    INTERACTION_STRUCTURE.session,
    INTERACTION_STRUCTURE.composer,
    INTERACTION_STRUCTURE.thread,
  ]) {
    await assertSingleVisibleControl(page, control, activeChat);
  }
  const receipt = { root: 1, chat: 1, session: 1, composer: 1, thread: 1 };
  return receipt;
}

function assertDecorativeLayer(facts) {
  const { decor } = facts;
  if (decor.count === 0) {
    throw new InteractionAuditError(
      'IA_DECOR_MISSING',
      'Refusing interaction audit: expected the inert Origami decorative layer to be present.',
    );
  }
  if (decor.count > 1) {
    throw new InteractionAuditError(
      'IA_DECOR_DUPLICATE',
      `Refusing interaction audit: a decorative duplicate is forbidden; found ${decor.count} decorative layers.`,
    );
  }
  if (!decor.ariaHidden) {
    throw new InteractionAuditError(
      'IA_DECOR_NOT_HIDDEN',
      'Refusing interaction audit: the decorative layer must be aria-hidden.',
    );
  }
  if (decor.focusableCount > 0) {
    throw new InteractionAuditError(
      'IA_DECOR_FOCUSABLE',
      `Refusing interaction audit: decorative content must not be focusable; found ${decor.focusableCount} focusable node(s): ${decor.focusableTags.join(', ')}.`,
    );
  }
  if (decor.textLength > 0) {
    throw new InteractionAuditError(
      'IA_DECOR_TEXT',
      'Refusing interaction audit: the decorative layer must not carry live text content.',
    );
  }
  return decor;
}

function assertLiveMessageContent(facts) {
  const { thread } = facts;
  if (thread.count !== 1) {
    throw new InteractionAuditError(
      'IA_THREAD_MISSING',
      `Refusing interaction audit: expected exactly one Chat thread; found ${thread.count}.`,
    );
  }
  if (thread.imageOnly) {
    throw new InteractionAuditError(
      'IA_THREAD_IMAGE_ONLY',
      'Refusing interaction audit: Chat messages must be live DOM text, not a baked image.',
    );
  }
  if (!thread.hasLiveText) {
    throw new InteractionAuditError(
      'IA_THREAD_NO_LIVE_TEXT',
      'Refusing interaction audit: Chat thread has no live message text.',
    );
  }
  return thread;
}

function assertShortcutLabel(facts) {
  if (!facts.shortcut.present) {
    throw new InteractionAuditError(
      'IA_SHORTCUT_MISSING',
      'Refusing interaction audit: the send shortcut label is missing or not live DOM.',
    );
  }
  return facts.shortcut;
}

function assertReducedMotionMedia(facts) {
  if (!facts.reducedMotionMedia) {
    throw new InteractionAuditError(
      'IA_REDUCED_MOTION_MEDIA',
      'Refusing interaction audit: prefers-reduced-motion is not active; reduced motion was lost.',
    );
  }
  return true;
}

async function assertControlEnabled(locator, control) {
  if (await locator.isDisabled()) {
    throw new InteractionAuditError(
      'IA_CONTROL_DISABLED',
      `Refusing interaction audit: the ${control.label} must not be disabled.`,
    );
  }
}

/** Assert the Composer's required live controls are present, visible, real, and actionable. */
export async function assertComposerControls(page, activeChat = page) {
  const modelSelector = await assertSingleVisibleControl(
    page,
    INTERACTION_CONTROLS.modelSelector,
    activeChat,
  );
  await assertControlEnabled(modelSelector, INTERACTION_CONTROLS.modelSelector);

  const agentMode = await assertSingleVisibleControl(
    page,
    INTERACTION_CONTROLS.agentMode,
    activeChat,
  );
  await assertControlEnabled(agentMode, INTERACTION_CONTROLS.agentMode);
  const agentPopup = await agentMode.getAttribute('aria-haspopup');
  if (agentPopup !== 'listbox') {
    throw new InteractionAuditError(
      'IA_CONTROL_SEMANTICS',
      `Refusing interaction audit: the Agent Mode control lost its listbox popup semantics; aria-haspopup="${agentPopup}".`,
    );
  }

  const composer = await assertSingleVisibleControl(
    page,
    INTERACTION_CONTROLS.composer,
    activeChat,
  );
  await assertControlEnabled(composer, INTERACTION_CONTROLS.composer);
  const readonly = await composer.getAttribute('readonly');
  if (readonly === 'true' || readonly === '') {
    throw new InteractionAuditError(
      'IA_CONTROL_SEMANTICS',
      'Refusing interaction audit: the message textarea must remain editable.',
    );
  }

  const send = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.send, activeChat);
  const dictation = await assertSingleVisibleControl(
    page,
    INTERACTION_CONTROLS.dictation,
    activeChat,
  );
  await assertControlEnabled(dictation, INTERACTION_CONTROLS.dictation);
  const dictationPressed = await dictation.getAttribute('aria-pressed');
  if (dictationPressed !== 'false') {
    throw new InteractionAuditError(
      'IA_CONTROL_SEMANTICS',
      `Refusing interaction audit: the idle dictation control must report aria-pressed="false"; observed "${dictationPressed}".`,
    );
  }

  return {
    modelSelector: { present: true, enabled: true },
    agentMode: { present: true, enabled: true, popup: 'listbox' },
    composer: { present: true, editable: true },
    send: { present: true, disabledWhenEmpty: await send.isDisabled() },
    dictation: { present: true, enabled: true, pressed: false },
  };
}

async function exerciseExpandingControl(page, control, errorCode, activeChat = page) {
  const locator = await assertSingleVisibleControl(page, control, activeChat);
  const before = await locator.getAttribute('aria-expanded');
  if (before !== 'false') {
    throw new InteractionAuditError(
      'IA_CONTROL_SEMANTICS',
      `Refusing interaction audit: the ${control.label} must start with aria-expanded="false"; observed "${before}".`,
    );
  }
  let primaryError;
  try {
    await locator.click();
    const opened = await locator.getAttribute('aria-expanded');
    if (opened !== 'true') {
      throw new InteractionAuditError(
        errorCode,
        `Refusing interaction audit: the ${control.label} did not open on activation; aria-expanded="${opened}".`,
      );
    }
    await locator.click();
    const closed = await locator.getAttribute('aria-expanded');
    if (closed !== 'false') {
      throw new InteractionAuditError(
        errorCode,
        `Refusing interaction audit: the ${control.label} did not restore aria-expanded="false" on second activation; observed "${closed}".`,
      );
    }
    return { opened: true, closed: true };
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  let cleanupError;
  try {
    if ((await locator.getAttribute('aria-expanded')) === 'true') {
      await locator.click();
      if ((await locator.getAttribute('aria-expanded')) !== 'false') {
        throw new InteractionAuditError(
          `${errorCode}_CLEANUP`,
          `The interaction audit could not restore the ${control.label}.`,
        );
      }
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  }
  if (cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      `Interaction audit ${control.label} check and cleanup failed.`,
    );
  }
  throw primaryError;
}

export function exerciseModelSelector(page, activeChat = page) {
  return exerciseExpandingControl(
    page,
    INTERACTION_CONTROLS.modelSelector,
    'IA_MODEL_SELECTOR_NO_RESPONSE',
    activeChat,
  );
}

export function exerciseAgentMode(page, activeChat = page) {
  return exerciseExpandingControl(
    page,
    INTERACTION_CONTROLS.agentMode,
    'IA_AGENT_MODE_NO_RESPONSE',
    activeChat,
  );
}

/** Toggle the live session disclosure in either direction, then restore its initial state. */
export async function exerciseSessionExpansion(page, activeChat = page) {
  const control = INTERACTION_CONTROLS.sessionExpand;
  const locator = await assertSingleVisibleControl(page, control, activeChat);
  await assertControlEnabled(locator, control);
  const before = await locator.getAttribute('aria-expanded');
  if (before !== 'true' && before !== 'false') {
    throw new InteractionAuditError(
      'IA_CONTROL_SEMANTICS',
      `Refusing interaction audit: the session details control must expose a boolean aria-expanded state; observed "${before}".`,
    );
  }
  let primaryError;
  try {
    await locator.click();
    const toggled = await locator.getAttribute('aria-expanded');
    const expected = before === 'true' ? 'false' : 'true';
    if (toggled !== expected) {
      throw new InteractionAuditError(
        'IA_SESSION_EXPAND_NO_RESPONSE',
        `Refusing interaction audit: the session details control did not toggle; observed aria-expanded="${toggled}".`,
      );
    }
    await locator.click();
    const restored = await locator.getAttribute('aria-expanded');
    if (restored !== before) {
      throw new InteractionAuditError(
        'IA_SESSION_EXPAND_NO_RESPONSE',
        `Refusing interaction audit: the session details control did not restore its initial state; observed aria-expanded="${restored}".`,
      );
    }
    return { toggled: true, restored: true };
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  let cleanupError;
  try {
    if ((await locator.getAttribute('aria-expanded')) !== before) {
      await locator.click();
      if ((await locator.getAttribute('aria-expanded')) !== before) {
        throw new InteractionAuditError(
          'IA_SESSION_EXPAND_CLEANUP',
          'The interaction audit could not restore the session details control.',
        );
      }
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  }
  if (cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Interaction audit session-details check and cleanup failed.',
    );
  }
  throw primaryError;
}

/** Ensure the real sidebar is open and its project/chat controls remain actionable. */
export async function assertNavigationControls(page) {
  const toggle = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.navToggle);
  await assertControlEnabled(toggle, INTERACTION_CONTROLS.navToggle);
  const pressed = await toggle.getAttribute('aria-pressed');
  if (pressed !== 'true' && pressed !== 'false') {
    throw new InteractionAuditError(
      'IA_CONTROL_SEMANTICS',
      `Refusing interaction audit: the sidebar navigation control must expose boolean aria-pressed; observed "${pressed}".`,
    );
  }
  let openedForAudit = false;
  let primaryError;
  try {
    if (pressed === 'false') {
      await toggle.click();
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
        throw new InteractionAuditError(
          'IA_NAVIGATION_NO_RESPONSE',
          'Refusing interaction audit: the sidebar did not open on activation.',
        );
      }
      openedForAudit = true;
    }

    const project = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.createProject);
    await assertControlEnabled(project, INTERACTION_CONTROLS.createProject);
    const chat = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.createChat);
    await assertControlEnabled(chat, INTERACTION_CONTROLS.createChat);
    return {
      receipt: {
        sidebar: { present: true, enabled: true, expanded: true },
        project: { present: true, enabled: true },
        chat: { present: true, enabled: true },
      },
      toggle,
      restore: openedForAudit,
    };
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  let cleanupError;
  if (openedForAudit) {
    try {
      await toggle.click();
      if ((await toggle.getAttribute('aria-pressed')) !== 'false') {
        throw new InteractionAuditError(
          'IA_NAVIGATION_CLEANUP',
          'The interaction audit could not restore the initially closed sidebar.',
        );
      }
    } catch (error) {
      cleanupError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Interaction audit navigation check and cleanup failed.',
    );
  }
  throw primaryError;
}

/** Type into the composer and confirm the send control's enabled state tracks the live handler. */
export async function exerciseComposerSendEnablement(page, activeChat = page) {
  const composer = await assertSingleVisibleControl(
    page,
    INTERACTION_CONTROLS.composer,
    activeChat,
  );
  const send = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.send, activeChat);
  const original = await composer.inputValue();
  const probe = 'Interaction audit probe';
  let primaryError;
  let result;
  try {
    await composer.fill(probe);
    const readback = await composer.inputValue();
    if (readback !== probe) {
      throw new InteractionAuditError(
        'IA_SEND_ENABLEMENT',
        `Refusing interaction audit: the composer did not accept typed text; read "${readback}".`,
      );
    }
    const enabledWithText = !(await send.isDisabled());
    await composer.fill('');
    const disabledWhenEmpty = await send.isDisabled();
    if (!enabledWithText) {
      throw new InteractionAuditError(
        'IA_SEND_ENABLEMENT',
        'Refusing interaction audit: the send control did not enable when the composer had text.',
      );
    }
    if (!disabledWhenEmpty) {
      throw new InteractionAuditError(
        'IA_SEND_ENABLEMENT',
        'Refusing interaction audit: the send control did not disable when the composer was cleared.',
      );
    }
    result = { fillAccepted: true, sendEnabledWithText: true, sendDisabledWhenEmpty: true };
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  let cleanupError;
  try {
    await composer.fill(original);
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Interaction audit send-enablement check and composer cleanup failed.',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) {
    throw new AggregateError(
      [cleanupError],
      'Interaction audit send-enablement composer cleanup failed.',
    );
  }
  return result;
}

/** Exercise both production submit handlers and require each probe to render as live DOM text. */
export async function exerciseComposerSubmission(page, activeChat = page) {
  const composer = await assertSingleVisibleControl(
    page,
    INTERACTION_CONTROLS.composer,
    activeChat,
  );
  const send = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.send, activeChat);
  const thread = await assertSingleVisibleControl(page, INTERACTION_STRUCTURE.thread, activeChat);
  const original = await composer.inputValue();
  const probes = [
    ['Interaction audit Ctrl+Enter probe', 'Control+Enter'],
    ['Interaction audit send-button probe', null],
  ];
  let primaryError;
  try {
    for (const [probe, key] of probes) {
      await composer.fill(probe);
      await waitForSubmissionReady(page, probe);
      if (await send.isDisabled()) {
        throw new InteractionAuditError(
          'IA_SUBMISSION_DISABLED',
          `Refusing interaction audit: the send control stayed disabled for "${probe}".`,
        );
      }
      if (key) await composer.press(key);
      else await send.click();
      const rendered = thread.getByText(probe, { exact: true });
      await rendered.waitFor({ state: 'visible' });
      const count = await rendered.count();
      if (count !== 1 || !(await rendered.isVisible())) {
        throw new InteractionAuditError(
          'IA_SUBMISSION_NOT_RENDERED',
          `Refusing interaction audit: expected one live rendered message for "${probe}"; found ${count}.`,
        );
      }
    }
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  let cleanupError;
  try {
    await composer.fill(original);
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Interaction audit submission and composer cleanup failed.',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) {
    throw new AggregateError([cleanupError], 'Interaction audit composer cleanup failed.');
  }
  return { ctrlEnter: true, sendButton: true, messagesRendered: true };
}

const FOCUS_EXPECTATIONS = Object.freeze([
  Object.freeze({ control: INTERACTION_CONTROLS.composer, tag: 'textarea' }),
  Object.freeze({ control: INTERACTION_CONTROLS.modelSelector, ariaLabel: 'Choose model' }),
  Object.freeze({ control: INTERACTION_CONTROLS.agentMode, ariaLabelPrefix: 'Agent Mode' }),
  Object.freeze({ control: INTERACTION_CONTROLS.send, ariaLabel: 'Send message' }),
  Object.freeze({ control: INTERACTION_CONTROLS.dictation, ariaLabel: 'Start dictation' }),
  Object.freeze({
    control: INTERACTION_CONTROLS.jarvisOpener,
    ariaLabel: 'Open Jarvis voice panel',
  }),
  Object.freeze({
    control: INTERACTION_CONTROLS.sessionExpand,
    ariaLabelPattern: /^(?:Expand|Collapse) session details$/,
  }),
  Object.freeze({
    control: INTERACTION_CONTROLS.navToggle,
    ariaLabel: 'Toggle navigation',
  }),
  Object.freeze({
    control: INTERACTION_CONTROLS.createProject,
    ariaLabel: 'Create project',
  }),
  Object.freeze({
    control: INTERACTION_CONTROLS.createChat,
    ariaLabel: 'Create chat',
  }),
]);
const GLOBAL_FOCUS_CONTROL_IDS = new Set([
  INTERACTION_CONTROLS.jarvisOpener.id,
  INTERACTION_CONTROLS.navToggle.id,
  INTERACTION_CONTROLS.createProject.id,
  INTERACTION_CONTROLS.createChat.id,
]);

function matchesFocusExpectation(active, expectation) {
  const { tag, ariaLabel, ariaLabelPrefix, ariaLabelPattern } = expectation;
  return (
    active.focused &&
    ((tag !== undefined && active.tag === tag) ||
      (ariaLabel !== undefined && active.ariaLabel === ariaLabel) ||
      (ariaLabelPrefix !== undefined &&
        typeof active.ariaLabel === 'string' &&
        active.ariaLabel.startsWith(ariaLabelPrefix)) ||
      (ariaLabelPattern !== undefined &&
        typeof active.ariaLabel === 'string' &&
        ariaLabelPattern.test(active.ariaLabel)))
  );
}

/** Confirm keyboard focus lands on each live control and decorative content stays unfocusable. */
export async function assertKeyboardFocusSemantics(page, activeChat = page) {
  const focused = [];
  for (const expectation of FOCUS_EXPECTATIONS) {
    const { control } = expectation;
    const scope = GLOBAL_FOCUS_CONTROL_IDS.has(control.id) ? page : activeChat;
    const locator = await assertSingleVisibleControl(page, control, scope);

    let composer;
    let originalComposerValue;
    let primaryError;
    if (control.id === INTERACTION_CONTROLS.send.id) {
      composer = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.composer, activeChat);
      originalComposerValue = await composer.inputValue();
    }

    try {
      if (composer) {
        await composer.fill('Interaction audit focus probe');
        if (await locator.isDisabled()) {
          throw new InteractionAuditError(
            'IA_FOCUS_SEND_DISABLED',
            'Refusing interaction audit: the send control did not enable for the focus probe.',
          );
        }
      }
      await locator.focus();
      const active = await readActiveElement(page);
      if (!matchesFocusExpectation(active, expectation)) {
        throw new InteractionAuditError(
          'IA_FOCUS_SEMANTICS',
          `Refusing interaction audit: keyboard focus did not land on the ${control.label}; observed ${JSON.stringify(active)}.`,
        );
      }
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }

    let cleanupError;
    if (composer) {
      try {
        await composer.fill(originalComposerValue);
      } catch (error) {
        cleanupError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (primaryError && cleanupError) {
      throw new AggregateError(
        [primaryError, cleanupError],
        'Interaction audit send-focus check and composer cleanup failed.',
      );
    }
    if (primaryError) throw primaryError;
    if (cleanupError) {
      throw new AggregateError(
        [cleanupError],
        'Interaction audit send-focus composer cleanup failed.',
      );
    }
    focused.push(control.id);
  }
  return { focused };
}

/** Open the real Jarvis module and verify its live Ready/Click-to-talk/close/transcript seams. */
export async function openJarvisForAudit(page, onPanelOpened) {
  const opener = await assertSingleVisibleControl(page, INTERACTION_CONTROLS.jarvisOpener);
  await opener.click();
  const panel = page.getByLabel(JARVIS_PANEL_LABEL, { exact: true });
  onPanelOpened?.(panel);
  await panel.waitFor({ state: 'visible' });
  const panelCount = await panel.count();
  const panelVisible = panelCount === 1 && (await panel.isVisible());
  if (!panelVisible) {
    throw new InteractionAuditError(
      'IA_JARVIS_PANEL',
      `Refusing interaction audit: expected exactly one visible real Jarvis voice module after opening; found ${panelCount}.`,
    );
  }
  const reducedMotion = (await panel.getAttribute('data-reduced-motion')) === 'true';
  if (!reducedMotion) {
    throw new InteractionAuditError(
      'IA_JARVIS_REDUCED_MOTION',
      'Refusing interaction audit: the Jarvis voice module did not activate reduced motion.',
    );
  }
  const status = panel.getByRole('status');
  const statusCount = await status.count();
  const statusVisible = statusCount === 1 && (await status.isVisible());
  const statusText = statusVisible ? normalizeText(await status.textContent()) : '';
  if (!statusVisible || statusText !== JARVIS_READY_STATUS) {
    throw new InteractionAuditError(
      'IA_JARVIS_STATUS',
      `Refusing interaction audit: expected the Jarvis Ready status; observed "${statusText || 'missing'}".`,
    );
  }
  const clickToTalk = panel.getByRole('button', { name: JARVIS_CLICK_TO_TALK_LABEL, exact: true });
  const clickToTalkCount = await clickToTalk.count();
  if (!(clickToTalkCount === 1 && (await clickToTalk.isVisible()))) {
    throw new InteractionAuditError(
      'IA_JARVIS_CLICK_TO_TALK',
      `Refusing interaction audit: expected exactly one visible Click to talk control; found ${clickToTalkCount}.`,
    );
  }
  const close = panel.getByRole('button', { name: JARVIS_CLOSE_LABEL });
  const closeCount = await close.count();
  if (!(closeCount === 1 && (await close.isVisible()))) {
    throw new InteractionAuditError(
      'IA_JARVIS_CLOSE',
      `Refusing interaction audit: expected exactly one visible Jarvis close control; found ${closeCount}.`,
    );
  }
  const commandCenter = panel.getByRole('button', { name: JARVIS_COMMAND_CENTER_LABEL });
  const commandCenterCount = await commandCenter.count();
  if (!(commandCenterCount === 1 && (await commandCenter.isVisible()))) {
    throw new InteractionAuditError(
      'IA_JARVIS_COMMAND_CENTER',
      `Refusing interaction audit: expected exactly one visible Jarvis Command Center disclosure; found ${commandCenterCount}.`,
    );
  }
  if ((await commandCenter.getAttribute('aria-expanded')) !== 'true') {
    await commandCenter.click();
  }
  if ((await commandCenter.getAttribute('aria-expanded')) !== 'true') {
    throw new InteractionAuditError(
      'IA_JARVIS_COMMAND_CENTER',
      'Refusing interaction audit: the Jarvis Command Center disclosure did not expand.',
    );
  }
  const transcript = panel.getByLabel(JARVIS_TRANSCRIPT_LABEL);
  await transcript.waitFor({ state: 'visible', timeout: 5_000 });
  const transcriptCount = await transcript.count();
  if (!(transcriptCount === 1 && (await transcript.isVisible()))) {
    throw new InteractionAuditError(
      'IA_JARVIS_TRANSCRIPT',
      `Refusing interaction audit: expected exactly one visible Jarvis transcript; found ${transcriptCount}.`,
    );
  }
  return {
    opened: true,
    reducedMotion: true,
    status: JARVIS_READY_STATUS,
    control: JARVIS_CLICK_TO_TALK_LABEL,
    closePresent: true,
    commandCenterExpanded: true,
    transcriptPresent: true,
    panel,
  };
}

export async function closeJarvisForAudit(page, panel) {
  const close = panel.getByRole('button', { name: JARVIS_CLOSE_LABEL });
  await close.click();
  await panel.waitFor({ state: 'hidden' });
  const stillVisible = (await panel.count()) === 1 && (await panel.isVisible());
  if (stillVisible) {
    throw new InteractionAuditError(
      'IA_JARVIS_CLOSE_FAILED',
      'Refusing interaction audit: the Jarvis voice module did not close on activation.',
    );
  }
  return { closed: true };
}

export function assertNoUnexpectedInteractionErrors(errors) {
  const unexpected = errors.filter(
    (message) => !DOCUMENTED_INTERACTION_PREVIEW_ERRORS.includes(message),
  );
  if (unexpected.length > 0) {
    throw new InteractionAuditError(
      'IA_PAGE_ERRORS',
      `Unexpected page errors during interaction audit:\n${unexpected.join('\n')}`,
    );
  }
  return [];
}

/**
 * Collect console/page errors in the documented format. The coordinator attaches this observer to a
 * real page right after creation and passes the returned array to runInteractionAudit. It mirrors
 * the capture harness so the same two native web-preview diagnostics are the only ones permitted.
 */
export function attachInteractionErrorObserver(page) {
  if (
    !page ||
    typeof page.on !== 'function' ||
    (typeof page.off !== 'function' && typeof page.removeListener !== 'function')
  ) {
    throw new InteractionAuditError(
      'IA_PAGE_ADAPTER',
      'The error observer requires page.on and page.off/removeListener operations.',
    );
  }
  const errors = [];
  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  };
  const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const remove =
      typeof page.off === 'function' ? page.off.bind(page) : page.removeListener.bind(page);
    remove('console', onConsole);
    remove('pageerror', onPageError);
  };
  Object.defineProperties(errors, {
    errors: { value: errors },
    dispose: { value: dispose },
  });
  return errors;
}

/**
 * Run the complete fail-closed Origami Chat interaction audit against an injected page adapter.
 *
 * The page adapter is Playwright-shaped and must expose locator(selector), getByRole(role, options),
 * getByLabel(label, options), getByText(text, options), evaluate(fn, argument), and
 * waitForFunction(fn, argument, options); returned locators must expose count, isVisible,
 * isDisabled, getAttribute, textContent, click, press, focus, fill, inputValue, waitFor, and scoped
 * locator/getByRole/getByLabel/getByText. This module never launches a browser, never sleeps on a
 * timer, and never touches the network or filesystem; the coordinator performs any later real
 * browser run and passes the collected pageErrors array (see attachInteractionErrorObserver).
 */
export async function runInteractionAudit(page, options = {}) {
  assertInteractionPage(page);
  const pageErrors = options.pageErrors ?? [];
  if (!Array.isArray(pageErrors)) {
    throw new InteractionAuditError(
      'IA_PAGE_ADAPTER',
      'pageErrors must be an array of observed console/page error strings.',
    );
  }

  let panel;
  let jarvisOpened = false;
  let primaryError;
  let navigationRestore;
  let result;
  try {
    const activeChat = await assertActiveChatRoot(page);
    const facts = await collectInteractionDomFacts(page);
    const structure = await assertChatInteractionStructure(page, activeChat);
    assertNoUnexpectedInteractionErrors(pageErrors);
    const decor = assertDecorativeLayer(facts);
    const thread = assertLiveMessageContent(facts);
    const shortcut = assertShortcutLabel(facts);
    assertReducedMotionMedia(facts);
    const composer = await assertComposerControls(page, activeChat);
    const modelSelector = await exerciseModelSelector(page, activeChat);
    const agentMode = await exerciseAgentMode(page, activeChat);
    const sendEnablement = await exerciseComposerSendEnablement(page, activeChat);
    const sessionExpand = await exerciseSessionExpansion(page, activeChat);
    const navigation = await assertNavigationControls(page);
    if (navigation.restore) navigationRestore = navigation.toggle;
    const submission = await exerciseComposerSubmission(page, activeChat);
    const focusSemantics = await assertKeyboardFocusSemantics(page, activeChat);

    const opened = await openJarvisForAudit(page, (openedPanel) => {
      panel = openedPanel;
      jarvisOpened = true;
    });
    panel = opened.panel;
    jarvisOpened = true;
    const closed = await closeJarvisForAudit(page, panel);
    jarvisOpened = false;
    const jarvis = { ...opened, ...closed };
    delete jarvis.panel;
    assertNoUnexpectedInteractionErrors(pageErrors);

    result = {
      schemaVersion: 1,
      structure,
      decorative: {
        count: decor.count,
        ariaHidden: decor.ariaHidden,
        focusableCount: decor.focusableCount,
      },
      thread: { count: thread.count, hasLiveText: thread.hasLiveText, imageOnly: thread.imageOnly },
      shortcut: { present: shortcut.present },
      reducedMotion: { media: facts.reducedMotionMedia, jarvisPanel: jarvis.reducedMotion },
      composer,
      modelSelector,
      agentMode,
      sendEnablement,
      sessionExpand,
      navigation: navigation.receipt,
      submission,
      focusSemantics,
      jarvis,
      unexpectedPageErrors: [],
    };
  } catch (error) {
    primaryError =
      error instanceof Error
        ? error
        : new InteractionAuditError('IA_UNEXPECTED', `Unexpected audit failure: ${String(error)}`);
  }

  const cleanupErrors = [];
  if (jarvisOpened && panel) {
    try {
      const stillOpen = (await panel.count()) > 0 && (await panel.isVisible());
      if (stillOpen) {
        await panel.getByRole('button', { name: JARVIS_CLOSE_LABEL }).click();
        await panel.waitFor({ state: 'hidden' });
        if ((await panel.count()) > 0 && (await panel.isVisible())) {
          throw new InteractionAuditError(
            'IA_JARVIS_CLOSE_FAILED',
            'The interaction audit could not close the Jarvis voice module during cleanup.',
          );
        }
      }
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (navigationRestore) {
    try {
      await navigationRestore.click();
      if ((await navigationRestore.getAttribute('aria-pressed')) !== 'false') {
        throw new InteractionAuditError(
          'IA_NAVIGATION_CLEANUP',
          'The interaction audit could not restore the initially closed sidebar.',
        );
      }
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
      primaryError ? 'Interaction audit and cleanup failed.' : 'Interaction audit cleanup failed.',
    );
  }
  if (primaryError) throw primaryError;
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.stderr.write(
    'interaction-audit.mjs is an injectable, browser-free harness. Call runInteractionAudit(page, { pageErrors }) with a coordinator-supplied page adapter; it never launches a browser.\n',
  );
  process.exitCode = 1;
}
