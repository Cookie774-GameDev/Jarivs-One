import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DOCUMENTED_INTERACTION_PREVIEW_ERRORS,
  INTERACTION_CONTROLS,
  INTERACTION_SELECTORS,
  InteractionAuditError,
  REDUCED_MOTION_QUERY,
  assertInteractionPage,
  assertNoUnexpectedInteractionErrors,
  attachInteractionErrorObserver,
  assertActiveChatRoot,
  assertKeyboardFocusSemantics,
  exerciseComposerSubmission,
  interactionDomEvaluate,
  runInteractionAudit,
  submissionReadyEvaluate,
} from './interaction-audit.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const IMPLEMENTATION_SOURCE = readFileSync(
  resolve(MODULE_DIRECTORY, 'interaction-audit.mjs'),
  'utf8',
);
const PRODUCTION_SOURCES = Object.freeze({
  chatView: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/chat/ChatView.tsx'),
    'utf8',
  ),
  chatThread: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/chat/ChatThread.tsx'),
    'utf8',
  ),
  composer: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/chat/Composer.tsx'),
    'utf8',
  ),
  session: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/chat/activity/ChatActivityTimeline.tsx'),
    'utf8',
  ),
  topBar: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/components/layout/TopBar.tsx'),
    'utf8',
  ),
  appShell: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/components/layout/AppShell.tsx'),
    'utf8',
  ),
  navPane: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/components/layout/NavPane.tsx'),
    'utf8',
  ),
  decor: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/chat/OrigamiChatDecor.tsx'),
    'utf8',
  ),
  voiceModal: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/voice/VoiceModal.tsx'),
    'utf8',
  ),
  voiceHeader: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/voice/JarvisVoiceHeader.tsx'),
    'utf8',
  ),
  voiceTranscript: readFileSync(
    resolve(MODULE_DIRECTORY, '../../app/src/features/voice/JarvisVoiceTranscript.tsx'),
    'utf8',
  ),
});

async function withBrowserGlobals(globals, callback) {
  const descriptors = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  try {
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    return await callback();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function matchesSelector(element, selector) {
  if (selector === '*') return true;
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    const classAttribute = element.getAttribute('class') || '';
    return classAttribute.split(/\s+/).includes(className);
  }
  const attributePattern = /\[([^\]=]+)(?:="([^"]*)")?\]/g;
  const tagPart = selector.replace(attributePattern, '').trim();
  const attributes = [...selector.matchAll(attributePattern)].map((match) => ({
    name: match[1],
    value: match[2] === undefined ? null : match[2],
  }));
  if (tagPart && element.tagName.toLowerCase() !== tagPart.toLowerCase()) return false;
  for (const { name, value } of attributes) {
    const actual = element.getAttribute(name);
    if (value === null) {
      if (actual === null) return false;
    } else if (actual !== value) return false;
  }
  return true;
}

class FakeElement {
  constructor({ tagName = 'div', attributes = {}, textContent = '', children = [] } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.textContent = textContent;
    this.children = children;
    this.parentElement = null;
    for (const child of children) child.parentElement = this;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }
  querySelectorAll(selector) {
    const matched = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) matched.push(child);
        walk(child);
      }
    };
    walk(this);
    return matched;
  }
}

function makeWindow(reducedMotion) {
  return {
    matchMedia: (query) => ({ matches: query === REDUCED_MOTION_QUERY ? reducedMotion : false }),
  };
}

function makeComposerWrapper({ withShortcut = true } = {}) {
  const children = [
    new FakeElement({ tagName: 'textarea', attributes: { 'aria-label': 'Message' } }),
  ];
  if (withShortcut) {
    children.push(new FakeElement({ tagName: 'span', attributes: { class: 'kbd' } }));
  }
  return new FakeElement({
    tagName: 'div',
    attributes: { 'data-terminal-drop': 'chat' },
    textContent: withShortcut ? 'Enter to send' : '',
    children,
  });
}

function makeDocument(root, activeElement = null) {
  return {
    body: root,
    activeElement,
    querySelectorAll: (selector) => root.querySelectorAll(selector),
  };
}

function factsArgument() {
  return {
    kind: 'facts',
    selectors: INTERACTION_SELECTORS,
    reducedMotionQuery: REDUCED_MOTION_QUERY,
  };
}

test('DOM extractor reads a healthy Chat page as inert decor, live text, shortcut, and reduced motion', () => {
  const decor = new FakeElement({
    tagName: 'div',
    attributes: { 'data-testid': 'origami-chat-decor', 'aria-hidden': 'true' },
    textContent: '',
    children: [new FakeElement({ tagName: 'img', attributes: { alt: '' } })],
  });
  const thread = new FakeElement({
    tagName: 'div',
    attributes: { role: 'log', 'data-tour': 'chat-thread' },
    textContent: 'Hello from the user. A real live reply.',
  });
  const root = new FakeElement({ children: [decor, thread, makeComposerWrapper()] });
  return withBrowserGlobals({ document: makeDocument(root), window: makeWindow(true) }, () =>
    interactionDomEvaluate(factsArgument()),
  ).then((value) => {
    assert.equal(value.reducedMotionMedia, true);
    assert.deepEqual(value.decor, {
      count: 1,
      ariaHidden: true,
      focusableCount: 0,
      focusableTags: [],
      textLength: 0,
    });
    assert.equal(value.thread.count, 1);
    assert.equal(value.thread.hasLiveText, true);
    assert.equal(value.thread.imageOnly, false);
    assert.deepEqual(value.shortcut, { present: true, kbdCount: 1, hasSendHint: true });
  });
});

test('DOM extractor remains self-contained when serialized into an isolated page realm', () => {
  const decor = new FakeElement({
    attributes: { 'data-testid': 'origami-chat-decor', 'aria-hidden': 'true' },
  });
  const thread = new FakeElement({
    attributes: { role: 'log', 'data-tour': 'chat-thread' },
    textContent: 'Live isolated message',
  });
  const root = new FakeElement({ children: [decor, thread, makeComposerWrapper()] });
  const isolatedEvaluate = Function(
    'document',
    'window',
    'argument',
    `"use strict"; return (${interactionDomEvaluate.toString()})(argument);`,
  );

  const result = isolatedEvaluate(makeDocument(root), makeWindow(true), factsArgument());

  assert.equal(result.thread.hasLiveText, true);
  assert.equal(result.decor.textLength, 0);
  assert.equal(result.shortcut.present, true);
  assert.equal(result.reducedMotionMedia, true);
});

test('submission readiness callback is self-contained and scopes to the visible Chat root', () => {
  const cachedComposer = new FakeElement({
    tagName: 'textarea',
    attributes: { 'aria-label': 'Message' },
  });
  cachedComposer.value = 'probe';
  const cachedSend = new FakeElement({
    tagName: 'button',
    attributes: { 'aria-label': 'Send message' },
  });
  cachedSend.disabled = false;
  const cached = new FakeElement({
    attributes: { 'data-vibespace-page': 'chat' },
    children: [cachedComposer, cachedSend],
  });
  cached.getClientRects = () => [];

  const activeComposer = new FakeElement({
    tagName: 'textarea',
    attributes: { 'aria-label': 'Message' },
  });
  activeComposer.value = 'probe';
  const activeSend = new FakeElement({
    tagName: 'button',
    attributes: { 'aria-label': 'Send message' },
  });
  activeSend.disabled = true;
  const active = new FakeElement({
    attributes: { 'data-vibespace-page': 'chat' },
    children: [activeComposer, activeSend],
  });
  active.getClientRects = () => [{}];

  const document = makeDocument(new FakeElement({ children: [cached, active] }));
  const window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
  const isolated = Function(
    'document',
    'window',
    'argument',
    `"use strict"; return (${submissionReadyEvaluate.toString()})(argument);`,
  );
  const argument = {
    chatSelector: INTERACTION_SELECTORS.chat,
    composerSelector: INTERACTION_SELECTORS.composer,
    sendSelector: 'button[aria-label="Send message"]',
    probe: 'probe',
  };

  assert.equal(isolated(document, window, argument), false);
  activeSend.disabled = false;
  assert.equal(isolated(document, window, argument), true);
});

class FakeLocator {
  constructor(page, state) {
    this.page = page;
    this.state = state;
  }
  async count() {
    return this.state.count ?? 1;
  }
  async isVisible() {
    return this.state.visible ?? true;
  }
  async isDisabled() {
    return this.state.disabled ?? false;
  }
  async getAttribute(name) {
    return this.state.attributes?.[name] ?? null;
  }
  async textContent() {
    return this.state.text ?? '';
  }
  async inputValue() {
    return this.state.value ?? '';
  }
  async fill(value) {
    if (this.state.fillError) throw this.state.fillError;
    const updateSendImmediately = (await this.state.onFill?.(value)) !== false;
    this.state.value = value;
    if (updateSendImmediately) this.page.states.send.disabled = value.length === 0;
  }
  async click() {
    if (this.state.clickError) throw this.state.clickError;
    await this.state.onClick?.();
  }
  async press(key) {
    if (this.state.pressError) throw this.state.pressError;
    await this.state.onPress?.(key);
  }
  async focus() {
    if (this.state.focusError) throw this.state.focusError;
    if (this.state.disabled) return;
    this.page.activeElement = {
      focused: true,
      tag: this.state.tag ?? 'button',
      ariaLabel: this.state.attributes?.['aria-label'] ?? null,
    };
  }
  async waitFor(options) {
    if (this.state.waitError) throw this.state.waitError;
    await this.state.onWait?.(options);
  }
  getByRole(role, options = {}) {
    return this.page.resolveScoped(this.state, 'role', role, options.name);
  }
  getByLabel(label) {
    return this.page.resolveScoped(this.state, 'label', label);
  }
  getByText(text) {
    return this.page.resolveTextScoped(this.state, text);
  }
  locator(selector) {
    return this.page.resolveScoped(this.state, 'selector', selector);
  }
}

function nameMatches(actual, expected) {
  if (expected === undefined) return true;
  return expected instanceof RegExp ? expected.test(actual) : actual === expected;
}

function healthyFacts(overrides = {}) {
  return {
    reducedMotionMedia: true,
    decor: {
      count: 1,
      ariaHidden: true,
      focusableCount: 0,
      focusableTags: [],
      textLength: 0,
    },
    thread: {
      count: 1,
      textLength: 30,
      imageCount: 0,
      hasLiveText: true,
      imageOnly: false,
    },
    shortcut: { present: true, kbdCount: 1, hasSendHint: true },
    ...overrides,
  };
}

function makeHealthyPage({ facts = healthyFacts() } = {}) {
  const page = {
    activeElement: { focused: false, tag: null, ariaLabel: null },
    facts,
    emittedMessages: [],
    listeners: new Map(),
    states: {},
    locator(selector) {
      return new FakeLocator(this, this.bySelector(selector));
    },
    getByRole(role, options = {}) {
      return new FakeLocator(this, this.byRole(role, options.name));
    },
    getByLabel(label) {
      return new FakeLocator(this, this.byLabel(label));
    },
    getByText(text) {
      return new FakeLocator(this, {
        count: this.emittedMessages.filter((message) => message === text).length,
        visible: this.emittedMessages.includes(text),
      });
    },
    async evaluate(_callback, argument) {
      return argument.kind === 'facts' ? this.facts : this.activeElement;
    },
    async waitForFunction(callback, argument, options) {
      this.waitForFunctionCalls ??= [];
      this.waitForFunctionCalls.push({ callback, argument, options });
      await this.onWaitForFunction?.(argument, options);
      if (this.waitForFunctionError) throw this.waitForFunctionError;
      return true;
    },
    on(event, listener) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
    },
    off(event, listener) {
      const listeners = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        listeners.filter((candidate) => candidate !== listener),
      );
    },
    bySelector(selector) {
      const entry = Object.values(this.states).find((state) => state.selector === selector);
      return entry ?? { count: 0, visible: false };
    },
    byRole(role, expectedName) {
      const entries = Object.values(this.states).filter(
        (state) =>
          state.role === role &&
          nameMatches(state.attributes?.['aria-label'] ?? state.name ?? '', expectedName),
      );
      if (entries.length === 0) return { count: 0, visible: false };
      if (entries.length === 1) return entries[0];
      return {
        count: entries.reduce((sum, state) => sum + (state.count ?? 1), 0),
        visible: entries.some((state) => state.visible ?? true),
      };
    },
    byLabel(expectedLabel) {
      const entry = Object.values(this.states).find((state) =>
        nameMatches(state.attributes?.['aria-label'] ?? '', expectedLabel),
      );
      return entry ?? { count: 0, visible: false };
    },
    resolveScoped(parent, kind, roleOrLabel, expectedName) {
      const entry = Object.values(parent.children ?? {}).find((state) => {
        if (kind === 'selector') return state.selector === roleOrLabel;
        if (kind === 'label') {
          return nameMatches(state.attributes?.['aria-label'] ?? '', roleOrLabel);
        }
        return (
          state.role === roleOrLabel &&
          nameMatches(state.attributes?.['aria-label'] ?? state.name ?? '', expectedName)
        );
      });
      return new FakeLocator(this, entry ?? { count: 0, visible: false });
    },
    resolveTextScoped(parent, text) {
      const renderedCount = this.emittedMessages.filter((message) => message === text).length;
      const composerCount =
        parent === this.states.activeChat && this.states.composer.value === text ? 1 : 0;
      return new FakeLocator(this, {
        count: renderedCount + composerCount,
        visible: renderedCount + composerCount > 0,
      });
    },
  };

  const toggleExpanded = (state) => {
    state.attributes['aria-expanded'] =
      state.attributes['aria-expanded'] === 'true' ? 'false' : 'true';
  };
  const basic = {
    count: 1,
    visible: true,
    disabled: false,
    attributes: {},
  };
  page.states = {
    root: { ...basic, selector: INTERACTION_SELECTORS.root },
    chat: { ...basic, selector: INTERACTION_SELECTORS.chat },
    activeChat: {
      ...basic,
      selector: `${INTERACTION_SELECTORS.chat}:visible`,
      children: {},
    },
    session: {
      ...basic,
      selector: INTERACTION_SELECTORS.session,
      attributes: { 'aria-label': 'Jarvis session' },
    },
    thread: { ...basic, selector: INTERACTION_SELECTORS.thread },
    decor: { ...basic, selector: INTERACTION_SELECTORS.decor },
    composer: {
      ...basic,
      selector: INTERACTION_SELECTORS.composer,
      tag: 'textarea',
      value: '',
      attributes: { 'aria-label': 'Message' },
      onPress: async (key) => {
        if (key !== 'Control+Enter') throw new Error(`unexpected key ${key}`);
        page.emittedMessages.push(page.states.composer.value);
        page.states.composer.value = '';
        page.states.send.disabled = true;
      },
    },
    modelSelector: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Choose model', 'aria-expanded': 'false' },
    },
    agentMode: {
      ...basic,
      role: 'button',
      attributes: {
        'aria-label': 'Agent Mode. Open permissions panel.',
        'aria-expanded': 'false',
        'aria-haspopup': 'listbox',
      },
    },
    send: {
      ...basic,
      role: 'button',
      disabled: true,
      attributes: { 'aria-label': 'Send message' },
      onClick: async () => {
        page.emittedMessages.push(page.states.composer.value);
        page.states.composer.value = '';
        page.states.send.disabled = true;
      },
    },
    dictation: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Start dictation', 'aria-pressed': 'false' },
    },
    sessionExpand: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Expand session details', 'aria-expanded': 'false' },
    },
    navToggle: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Toggle navigation', 'aria-pressed': 'true' },
    },
    createProject: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Create project' },
    },
    createChat: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Create chat' },
    },
    jarvisOpener: {
      ...basic,
      role: 'button',
      attributes: { 'aria-label': 'Open Jarvis voice panel' },
    },
  };
  page.states.modelSelector.onClick = async () => toggleExpanded(page.states.modelSelector);
  page.states.agentMode.onClick = async () => toggleExpanded(page.states.agentMode);
  page.states.sessionExpand.onClick = async () => {
    toggleExpanded(page.states.sessionExpand);
    page.states.sessionExpand.attributes['aria-label'] =
      page.states.sessionExpand.attributes['aria-expanded'] === 'true'
        ? 'Collapse session details'
        : 'Expand session details';
  };
  page.states.navToggle.onClick = async () => {
    page.states.navToggle.attributes['aria-pressed'] =
      page.states.navToggle.attributes['aria-pressed'] === 'true' ? 'false' : 'true';
  };

  const close = {
    ...basic,
    role: 'button',
    attributes: { 'aria-label': 'Close Jarvis voice session' },
  };
  const panel = {
    ...basic,
    visible: false,
    attributes: {
      'aria-label': 'Jarvis voice session',
      'data-reduced-motion': 'true',
    },
    children: {
      status: { ...basic, role: 'status', text: 'Ready' },
      clickToTalk: {
        ...basic,
        role: 'button',
        attributes: { 'aria-label': 'Click to talk' },
      },
      commandCenter: {
        ...basic,
        role: 'button',
        name: 'Command Center',
        attributes: { 'aria-expanded': 'false' },
      },
      close,
      transcript: {
        ...basic,
        role: 'log',
        attributes: { 'aria-label': 'Voice session transcript' },
      },
    },
  };
  page.states.jarvisPanel = panel;
  page.states.activeChat.children = Object.fromEntries(
    [
      'session',
      'thread',
      'decor',
      'composer',
      'modelSelector',
      'agentMode',
      'send',
      'dictation',
      'sessionExpand',
      'jarvisOpener',
    ].map((id) => [id, page.states[id]]),
  );
  page.states.jarvisOpener.onClick = async () => {
    panel.visible = true;
  };
  panel.children.commandCenter.onClick = async () => {
    panel.children.commandCenter.attributes['aria-expanded'] = 'true';
  };
  close.onClick = async () => {
    panel.visible = false;
  };
  return page;
}

function setControlCount(page, id, count) {
  page.states[id].count = count;
  if (count === 0) page.states[id].visible = false;
}

test('complete browser-free audit proves source-grounded controls, both send paths, focus, and cleanup', async () => {
  const page = makeHealthyPage();
  page.states.composer.value = 'Preserve this draft';
  page.states.send.disabled = false;

  const result = await runInteractionAudit(page);

  assert.deepEqual(result.navigation, {
    sidebar: { present: true, enabled: true, expanded: true },
    project: { present: true, enabled: true },
    chat: { present: true, enabled: true },
  });
  assert.deepEqual(result.sessionExpand, { toggled: true, restored: true });
  assert.deepEqual(result.submission, {
    ctrlEnter: true,
    sendButton: true,
    messagesRendered: true,
  });
  assert.deepEqual(page.emittedMessages, [
    'Interaction audit Ctrl+Enter probe',
    'Interaction audit send-button probe',
  ]);
  assert.equal(page.states.jarvisPanel.visible, false);
  assert.equal(page.states.composer.value, 'Preserve this draft');
  assert.deepEqual(result.unexpectedPageErrors, []);
});

test('send focus temporarily enables an empty composer without submitting and restores it', async () => {
  const page = makeHealthyPage();
  const activeChat = await assertActiveChatRoot(page);

  const result = await assertKeyboardFocusSemantics(page, activeChat);

  assert.equal(result.focused.includes('send'), true);
  assert.equal(page.states.composer.value, '');
  assert.equal(page.states.send.disabled, true);
  assert.deepEqual(page.emittedMessages, []);
});

test('send focus restores a pre-existing composer draft exactly', async () => {
  const page = makeHealthyPage();
  page.states.composer.value = '  Existing draft\nwith spacing  ';
  page.states.send.disabled = false;
  const activeChat = await assertActiveChatRoot(page);

  await assertKeyboardFocusSemantics(page, activeChat);

  assert.equal(page.states.composer.value, '  Existing draft\nwith spacing  ');
  assert.equal(page.states.send.disabled, false);
});

test('send focus preserves primary failure before composer cleanup failure', async () => {
  const page = makeHealthyPage();
  const original = 'Existing draft';
  page.states.composer.value = original;
  page.states.send.disabled = false;
  page.states.send.focusError = new Error('send focus failed');
  page.states.composer.onFill = async (value) => {
    if (value === original) throw new Error('composer restore failed');
  };
  const activeChat = await assertActiveChatRoot(page);

  await assert.rejects(assertKeyboardFocusSemantics(page, activeChat), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /send focus failed/);
    assert.match(error.errors[1].message, /composer restore failed/);
    return true;
  });
});

test('active Chat scoping ignores hidden cached control duplicates', async () => {
  const page = makeHealthyPage();
  page.states.chat.count = 2;
  page.states.cachedDictation = {
    count: 1,
    visible: false,
    role: 'button',
    disabled: false,
    attributes: { 'aria-label': 'Start dictation', 'aria-pressed': 'false' },
  };

  const result = await runInteractionAudit(page);

  assert.equal(result.structure.chat, 1);
  assert.equal(result.composer.dictation.present, true);
});

test('submission evidence counts exact probe text only inside the live thread', async () => {
  const page = makeHealthyPage();
  page.states.composer.onPress = async (key) => {
    if (key !== 'Control+Enter') throw new Error(`unexpected key ${key}`);
    page.emittedMessages.push(page.states.composer.value);
    // Model the real async boundary where the thread renders before React clears the textarea.
  };

  const result = await runInteractionAudit(page);

  assert.equal(result.submission.ctrlEnter, true);
  assert.equal(result.submission.messagesRendered, true);
});

test('submission evidence remains exact-one and visible inside the live thread', async () => {
  const duplicatePage = makeHealthyPage();
  duplicatePage.states.composer.value = 'Preserved draft';
  duplicatePage.states.composer.onPress = async () => {
    duplicatePage.emittedMessages.push(
      duplicatePage.states.composer.value,
      duplicatePage.states.composer.value,
    );
  };
  await assert.rejects(
    runInteractionAudit(duplicatePage),
    (error) =>
      error instanceof InteractionAuditError && error.code === 'IA_SUBMISSION_NOT_RENDERED',
  );
  assert.equal(duplicatePage.states.composer.value, 'Preserved draft');

  const hiddenPage = makeHealthyPage();
  const resolveText = hiddenPage.resolveTextScoped.bind(hiddenPage);
  hiddenPage.resolveTextScoped = (parent, text) =>
    parent === hiddenPage.states.thread
      ? new FakeLocator(hiddenPage, { count: 1, visible: false })
      : resolveText(parent, text);
  await assert.rejects(
    runInteractionAudit(hiddenPage),
    (error) =>
      error instanceof InteractionAuditError && error.code === 'IA_SUBMISSION_NOT_RENDERED',
  );
});

test('submission awaits delayed Send enablement for each exact active-root probe', async () => {
  const page = makeHealthyPage();
  let probeFillCount = 0;
  page.states.composer.onFill = async (value) => {
    if (!value.includes('Ctrl+Enter probe') && !value.includes('send-button probe')) return true;
    probeFillCount += 1;
    page.states.send.disabled = true;
    return false;
  };
  page.onWaitForFunction = async (argument, options) => {
    assert.equal(argument.probe, page.states.composer.value);
    assert.equal(argument.chatSelector, INTERACTION_SELECTORS.chat);
    assert.equal(options.polling, 'raf');
    assert.equal(options.timeout > 0, true);
    page.states.send.disabled = false;
  };

  const result = await runInteractionAudit(page);

  assert.equal(result.submission.sendButton, true);
  assert.equal(probeFillCount >= 2, true);
  assert.equal(page.waitForFunctionCalls.length >= 2, true);
});

test('submission readiness timeout fails closed and preserves the exact draft', async () => {
  const page = makeHealthyPage();
  const draft = 'Draft before readiness timeout';
  page.states.composer.value = draft;
  page.states.send.disabled = false;
  page.states.composer.onFill = async (value) => {
    if (value.includes('Ctrl+Enter probe') || value.includes('send-button probe')) {
      page.states.send.disabled = true;
      return false;
    }
    return true;
  };
  page.waitForFunctionError = new Error('send readiness timeout');

  await assert.rejects(runInteractionAudit(page), /send readiness timeout/);
  assert.equal(page.states.composer.value, draft);
});

test('submission readiness primary failure precedes draft-cleanup failure', async () => {
  const page = makeHealthyPage();
  const draft = 'Draft whose restore fails';
  page.states.composer.value = draft;
  page.states.send.disabled = false;
  page.states.composer.onFill = async (value) => {
    if (value === draft) throw new Error('submission draft restore failed');
    if (value.includes('probe')) {
      page.states.send.disabled = true;
      return false;
    }
    return true;
  };
  page.waitForFunctionError = new Error('submission readiness timed out');
  const activeChat = await assertActiveChatRoot(page);

  await assert.rejects(exerciseComposerSubmission(page, activeChat), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /submission readiness timed out/);
    assert.match(error.errors[1].message, /submission draft restore failed/);
    return true;
  });
});

test('active Chat scoping fails closed for zero or multiple visible roots', async () => {
  for (const count of [0, 2]) {
    const page = makeHealthyPage();
    page.states.activeChat.count = count;
    page.states.activeChat.visible = count > 0;
    await assert.rejects(
      runInteractionAudit(page),
      (error) => error instanceof InteractionAuditError && error.code === 'IA_ACTIVE_CHAT_ROOT',
      `active root count ${count}`,
    );
  }
});

test('Jarvis opener remains scoped to the global TopBar sibling of active Chat main content', async () => {
  assert.match(PRODUCTION_SOURCES.appShell, /<TopBar \/>[\s\S]*<main[\s\S]*\{children\}/);
  const page = makeHealthyPage();
  delete page.states.activeChat.children.jarvisOpener;

  const result = await runInteractionAudit(page);

  assert.equal(result.jarvis.opened, true);
  assert.equal(result.focusSemantics.focused.includes('jarvisOpener'), true);
});

test('audit selectors and accessible names are anchored to the current production seams', () => {
  assert.match(PRODUCTION_SOURCES.chatView, /data-vibespace-page="chat"/);
  assert.match(PRODUCTION_SOURCES.chatThread, /role="log"[\s\S]*data-tour="chat-thread"/);
  assert.match(PRODUCTION_SOURCES.session, /data-testid="jarvis-session-panel"/);
  assert.match(PRODUCTION_SOURCES.session, /'(?:Expand|Collapse) session details'/);
  assert.match(PRODUCTION_SOURCES.composer, /aria-label="Message"/);
  assert.match(PRODUCTION_SOURCES.composer, /aria-label="Choose model"/);
  assert.match(PRODUCTION_SOURCES.composer, /aria-label="Send message"/);
  assert.match(PRODUCTION_SOURCES.composer, /'Start dictation'/);
  assert.match(PRODUCTION_SOURCES.composer, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key === 'Enter'/);
  assert.match(PRODUCTION_SOURCES.topBar, /aria-label="Toggle navigation"/);
  assert.match(PRODUCTION_SOURCES.topBar, /aria-label="Open Jarvis voice panel"/);
  assert.match(PRODUCTION_SOURCES.navPane, /aria-label="Create project"/);
  assert.match(PRODUCTION_SOURCES.navPane, /aria-label="Create chat"/);
  assert.match(PRODUCTION_SOURCES.decor, /aria-hidden="true"/);
  assert.match(PRODUCTION_SOURCES.decor, /data-testid="origami-chat-decor"/);
  assert.match(PRODUCTION_SOURCES.voiceModal, /aria-label="Jarvis voice session"/);
  assert.match(PRODUCTION_SOURCES.voiceModal, /data-reduced-motion=/);
  assert.match(PRODUCTION_SOURCES.voiceHeader, /'Click to talk'/);
  assert.match(PRODUCTION_SOURCES.voiceHeader, /aria-label="Close Jarvis voice session"/);
  assert.match(PRODUCTION_SOURCES.voiceTranscript, /aria-label="Voice session transcript"/);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(INTERACTION_CONTROLS).map(([id, control]) => [id, control.label]),
    ),
    {
      modelSelector: 'model selector',
      agentMode: 'Agent Mode control',
      composer: 'message textarea',
      send: 'send control',
      dictation: 'dictation control',
      jarvisOpener: 'Jarvis opener',
      sessionExpand: 'session details control',
      navToggle: 'sidebar navigation control',
      createProject: 'project control',
      createChat: 'chat control',
    },
  );
});

test('complete audit fails closed for every missing or duplicate required control', async () => {
  for (const id of [
    'root',
    'session',
    'thread',
    'composer',
    'modelSelector',
    'agentMode',
    'send',
    'dictation',
    'sessionExpand',
    'navToggle',
    'createProject',
    'createChat',
    'jarvisOpener',
  ]) {
    for (const count of [0, 2]) {
      const page = makeHealthyPage();
      setControlCount(page, id, count);
      await assert.rejects(
        runInteractionAudit(page),
        (error) => error instanceof InteractionAuditError && error.code === 'IA_CONTROL_MISSING',
        `${id} count ${count}`,
      );
    }
  }
});

test('complete audit rejects disabled and invalid semantic controls', async () => {
  for (const id of [
    'modelSelector',
    'agentMode',
    'composer',
    'dictation',
    'sessionExpand',
    'navToggle',
    'createProject',
    'createChat',
  ]) {
    const page = makeHealthyPage();
    page.states[id].disabled = true;
    await assert.rejects(
      runInteractionAudit(page),
      (error) => error instanceof InteractionAuditError && error.code === 'IA_CONTROL_DISABLED',
      id,
    );
  }

  const badCases = [
    ['agentMode', 'aria-haspopup', 'dialog'],
    ['composer', 'readonly', ''],
    ['dictation', 'aria-pressed', 'true'],
    ['modelSelector', 'aria-expanded', null],
    ['sessionExpand', 'aria-expanded', null],
    ['navToggle', 'aria-pressed', null],
  ];
  for (const [id, attribute, value] of badCases) {
    const page = makeHealthyPage();
    page.states[id].attributes[attribute] = value;
    await assert.rejects(
      runInteractionAudit(page),
      (error) => error instanceof InteractionAuditError && error.code === 'IA_CONTROL_SEMANTICS',
      `${id} ${attribute}`,
    );
  }
});

test('complete audit rejects focus loss, reduced-motion loss, baked UI, and non-live messages', async () => {
  const focusPage = makeHealthyPage();
  focusPage.states.send.focus = async () => {
    focusPage.activeElement = { focused: true, tag: 'div', ariaLabel: 'Wrong target' };
  };
  const originalFocus = FakeLocator.prototype.focus;
  FakeLocator.prototype.focus = async function focus() {
    if (this.state === focusPage.states.send) {
      focusPage.activeElement = { focused: true, tag: 'div', ariaLabel: 'Wrong target' };
      return;
    }
    return originalFocus.call(this);
  };
  try {
    await assert.rejects(
      runInteractionAudit(focusPage),
      (error) => error instanceof InteractionAuditError && error.code === 'IA_FOCUS_SEMANTICS',
    );
  } finally {
    FakeLocator.prototype.focus = originalFocus;
  }

  for (const facts of [
    healthyFacts({ reducedMotionMedia: false }),
    healthyFacts({ decor: { ...healthyFacts().decor, count: 0 } }),
    healthyFacts({ decor: { ...healthyFacts().decor, count: 2 } }),
    healthyFacts({ decor: { ...healthyFacts().decor, ariaHidden: false } }),
    healthyFacts({
      decor: { ...healthyFacts().decor, focusableCount: 1, focusableTags: ['button'] },
    }),
    healthyFacts({ decor: { ...healthyFacts().decor, textLength: 9 } }),
    healthyFacts({
      thread: {
        ...healthyFacts().thread,
        textLength: 0,
        imageCount: 1,
        hasLiveText: false,
        imageOnly: true,
      },
    }),
    healthyFacts({
      thread: {
        ...healthyFacts().thread,
        textLength: 0,
        imageCount: 0,
        hasLiveText: false,
        imageOnly: false,
      },
    }),
    healthyFacts({ thread: { ...healthyFacts().thread, count: 0 } }),
    healthyFacts({ thread: { ...healthyFacts().thread, count: 2 } }),
    healthyFacts({ shortcut: { present: false, kbdCount: 0, hasSendHint: false } }),
  ]) {
    await assert.rejects(runInteractionAudit(makeHealthyPage({ facts })), InteractionAuditError);
  }

  const jarvisMotionPage = makeHealthyPage();
  jarvisMotionPage.states.jarvisPanel.attributes['data-reduced-motion'] = 'false';
  await assert.rejects(
    runInteractionAudit(jarvisMotionPage),
    (error) => error instanceof InteractionAuditError && error.code === 'IA_JARVIS_REDUCED_MOTION',
  );
  assert.equal(jarvisMotionPage.states.jarvisPanel.visible, false);
});

test('failed expanding-control and sidebar assertions restore the original UI state', async () => {
  const modelPage = makeHealthyPage();
  let modelClicks = 0;
  modelPage.states.modelSelector.onClick = async () => {
    modelClicks += 1;
    if (modelClicks === 2) throw new Error('model close failed once');
    modelPage.states.modelSelector.attributes['aria-expanded'] =
      modelPage.states.modelSelector.attributes['aria-expanded'] === 'true' ? 'false' : 'true';
  };
  await assert.rejects(runInteractionAudit(modelPage), /model close failed once/);
  assert.equal(modelPage.states.modelSelector.attributes['aria-expanded'], 'false');

  const navPage = makeHealthyPage();
  navPage.states.navToggle.attributes['aria-pressed'] = 'false';
  setControlCount(navPage, 'createProject', 0);
  await assert.rejects(
    runInteractionAudit(navPage),
    (error) => error instanceof InteractionAuditError && error.code === 'IA_CONTROL_MISSING',
  );
  assert.equal(navPage.states.navToggle.attributes['aria-pressed'], 'false');
});

test('focus accepts either source-grounded session disclosure label', async () => {
  const page = makeHealthyPage();
  page.states.sessionExpand.attributes = {
    'aria-label': 'Collapse session details',
    'aria-expanded': 'true',
  };
  const result = await runInteractionAudit(page);
  assert.equal(result.sessionExpand.restored, true);
});

test('Jarvis validation failure still closes the opened panel', async () => {
  const page = makeHealthyPage();
  page.states.jarvisPanel.children.status.text = 'Listening';

  await assert.rejects(
    runInteractionAudit(page),
    (error) => error instanceof InteractionAuditError && error.code === 'IA_JARVIS_STATUS',
  );
  assert.equal(page.states.jarvisPanel.visible, false);
});

test('Jarvis opener awaits delayed panel visibility before semantic checks', async () => {
  const page = makeHealthyPage();
  page.states.jarvisOpener.onClick = async () => {};
  page.states.jarvisPanel.onWait = async ({ state }) => {
    if (state === 'visible') page.states.jarvisPanel.visible = true;
  };

  const result = await runInteractionAudit(page);

  assert.equal(result.jarvis.opened, true);
  assert.equal(result.jarvis.closed, true);
});

test('Jarvis audit expands Command Center before awaiting its transcript', async () => {
  const page = makeHealthyPage();
  const transcript = page.states.jarvisPanel.children.transcript;
  transcript.visible = false;
  page.states.jarvisPanel.children.commandCenter.onClick = async () => {
    page.states.jarvisPanel.children.commandCenter.attributes['aria-expanded'] = 'true';
    transcript.visible = true;
  };

  const result = await runInteractionAudit(page);

  assert.equal(result.jarvis.commandCenterExpanded, true);
  assert.equal(result.jarvis.transcriptPresent, true);
  assert.equal(result.jarvis.closed, true);
});

test('Jarvis close awaits delayed hidden readiness before verifying closure', async () => {
  const page = makeHealthyPage();
  page.states.jarvisPanel.children.close.onClick = async () => {};
  page.states.jarvisPanel.onWait = async ({ state }) => {
    if (state === 'hidden') page.states.jarvisPanel.visible = false;
  };

  const result = await runInteractionAudit(page);

  assert.equal(result.jarvis.closed, true);
  assert.equal(page.states.jarvisPanel.visible, false);
});

test('Jarvis visible-readiness timeout fails closed and still cleans up the panel', async () => {
  const page = makeHealthyPage();
  page.states.jarvisPanel.onWait = async ({ state }) => {
    if (state === 'visible') throw new Error('panel readiness timeout');
  };

  await assert.rejects(runInteractionAudit(page), /panel readiness timeout/);
  assert.equal(page.states.jarvisPanel.visible, false);
});

test('Jarvis primary and cleanup failures are both preserved', async () => {
  const page = makeHealthyPage();
  page.states.jarvisPanel.children.status.text = 'Listening';
  page.states.jarvisPanel.children.close.clickError = new Error('cleanup close failed');

  await assert.rejects(runInteractionAudit(page), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.length, 2);
    assert.equal(error.errors[0].code, 'IA_JARVIS_STATUS');
    assert.match(error.errors[1].message, /cleanup close failed/);
    return true;
  });
});

test('Jarvis cleanup verifies that the panel actually closed', async () => {
  const page = makeHealthyPage();
  page.states.jarvisPanel.children.status.text = 'Listening';
  page.states.jarvisPanel.children.close.onClick = async () => {};

  await assert.rejects(runInteractionAudit(page), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors[0].code, 'IA_JARVIS_STATUS');
    assert.equal(error.errors[1].code, 'IA_JARVIS_CLOSE_FAILED');
    return true;
  });
  assert.equal(page.states.jarvisPanel.visible, true);
});

test('error observer collects only error events and detaches without leaking listeners', () => {
  const page = makeHealthyPage();
  const observer = attachInteractionErrorObserver(page);
  const consoleListeners = page.listeners.get('console');
  const pageErrorListeners = page.listeners.get('pageerror');

  consoleListeners[0]({ type: () => 'warning', text: () => 'ignore me' });
  consoleListeners[0]({ type: () => 'error', text: () => 'boom' });
  pageErrorListeners[0](new Error('render failed'));

  assert.deepEqual(observer.errors, ['console: boom', 'pageerror: render failed']);
  observer.dispose();
  assert.equal(page.listeners.get('console').length, 0);
  assert.equal(page.listeners.get('pageerror').length, 0);
  observer.dispose();
});

test('adapter and page-error inputs fail closed before interaction', async () => {
  assert.throws(() => assertInteractionPage(null), {
    name: 'InteractionAuditError',
    code: 'IA_PAGE_ADAPTER',
  });
  const page = makeHealthyPage();
  delete page.getByText;
  assert.throws(() => assertInteractionPage(page), /getByText/);
  const noReadinessPage = makeHealthyPage();
  delete noReadinessPage.waitForFunction;
  assert.throws(() => assertInteractionPage(noReadinessPage), /waitForFunction/);
  await assert.rejects(
    runInteractionAudit(makeHealthyPage(), { pageErrors: 'not-an-array' }),
    (error) => error instanceof InteractionAuditError && error.code === 'IA_PAGE_ADAPTER',
  );
});

test('unexpected observed errors fail both before interaction and when emitted during interaction', async () => {
  const page = makeHealthyPage();
  await assert.rejects(
    runInteractionAudit(page, { pageErrors: ['console: unexpected'] }),
    (error) => error instanceof InteractionAuditError && error.code === 'IA_PAGE_ERRORS',
  );

  const duringPage = makeHealthyPage();
  duringPage.states.jarvisOpener.onClick = async () => {
    duringPage.states.jarvisPanel.visible = true;
    duringPage.pageErrors.push('pageerror: late failure');
  };
  duringPage.pageErrors = [];
  await assert.rejects(
    runInteractionAudit(duringPage, { pageErrors: duringPage.pageErrors }),
    (error) => error instanceof InteractionAuditError && error.code === 'IA_PAGE_ERRORS',
  );
  assert.equal(duringPage.states.jarvisPanel.visible, false);
});

test('documented preview errors remain the only allowlist and direct execution stays browser-free', () => {
  assert.deepEqual(assertNoUnexpectedInteractionErrors(DOCUMENTED_INTERACTION_PREVIEW_ERRORS), []);
  assert.equal(IMPLEMENTATION_SOURCE.includes("from 'playwright'"), false);
  assert.equal(IMPLEMENTATION_SOURCE.includes('chromium.launch'), false);
  assert.equal(IMPLEMENTATION_SOURCE.includes('setTimeout('), false);
  assert.equal(IMPLEMENTATION_SOURCE.includes('fetch('), false);
  assert.equal(IMPLEMENTATION_SOURCE.includes('spawn('), false);
  assert.equal(IMPLEMENTATION_SOURCE.includes('exec('), false);
});

test('DOM extractor flags focusable decorative nodes but ignores tabindex="-1"', () => {
  const decor = new FakeElement({
    tagName: 'div',
    attributes: { 'data-testid': 'origami-chat-decor', 'aria-hidden': 'true' },
    children: [
      new FakeElement({ tagName: 'button' }),
      new FakeElement({ tagName: 'div', attributes: { tabindex: '0' } }),
      new FakeElement({ tagName: 'div', attributes: { tabindex: '-1' } }),
    ],
  });
  const root = new FakeElement({ children: [decor, makeComposerWrapper()] });
  return withBrowserGlobals({ document: makeDocument(root), window: makeWindow(true) }, () =>
    interactionDomEvaluate(factsArgument()),
  ).then((value) => {
    assert.equal(value.decor.focusableCount, 2);
    assert.deepEqual(value.decor.focusableTags, ['button', 'tabindex:0']);
  });
});

test('DOM extractor reports decorative live text length', () => {
  const decor = new FakeElement({
    tagName: 'div',
    attributes: { 'data-testid': 'origami-chat-decor', 'aria-hidden': 'true' },
    textContent: 'Fake baked controls',
  });
  const root = new FakeElement({ children: [decor, makeComposerWrapper()] });
  return withBrowserGlobals({ document: makeDocument(root), window: makeWindow(true) }, () =>
    interactionDomEvaluate(factsArgument()),
  ).then((value) => {
    assert.equal(value.decor.textLength > 0, true);
  });
});

test('DOM extractor detects an image-only baked thread and an empty thread', () => {
  const imageOnly = new FakeElement({
    tagName: 'div',
    attributes: { role: 'log', 'data-tour': 'chat-thread' },
    textContent: '   ',
    children: [new FakeElement({ tagName: 'img' })],
  });
  let root = new FakeElement({ children: [imageOnly, makeComposerWrapper()] });
  const bakedPromise = withBrowserGlobals(
    { document: makeDocument(root), window: makeWindow(true) },
    () => interactionDomEvaluate(factsArgument()),
  );
  const empty = new FakeElement({
    tagName: 'div',
    attributes: { role: 'log', 'data-tour': 'chat-thread' },
    textContent: '',
  });
  root = new FakeElement({ children: [empty, makeComposerWrapper()] });
  const blankPromise = withBrowserGlobals(
    { document: makeDocument(root), window: makeWindow(true) },
    () => interactionDomEvaluate(factsArgument()),
  );
  return Promise.all([bakedPromise, blankPromise]).then(([baked, blank]) => {
    assert.equal(baked.thread.imageOnly, true);
    assert.equal(baked.thread.hasLiveText, false);
    assert.equal(blank.thread.imageOnly, false);
    assert.equal(blank.thread.hasLiveText, false);
  });
});

test('DOM extractor reports a missing send shortcut and lost reduced motion', () => {
  const thread = new FakeElement({
    tagName: 'div',
    attributes: { role: 'log', 'data-tour': 'chat-thread' },
    textContent: 'live text',
  });
  const root = new FakeElement({
    children: [thread, makeComposerWrapper({ withShortcut: false })],
  });
  return withBrowserGlobals({ document: makeDocument(root), window: makeWindow(false) }, () =>
    interactionDomEvaluate(factsArgument()),
  ).then((value) => {
    assert.equal(value.shortcut.present, false);
    assert.equal(value.reducedMotionMedia, false);
  });
});

test('DOM extractor identifies the focused element and treats body as unfocused', () => {
  const focusedButton = new FakeElement({
    tagName: 'button',
    attributes: { 'aria-label': 'Send message' },
  });
  const root = new FakeElement({ children: [focusedButton] });
  const focusedPromise = withBrowserGlobals(
    { document: makeDocument(root, focusedButton), window: makeWindow(true) },
    () => interactionDomEvaluate({ kind: 'activeElement' }),
  );
  const bodyPromise = withBrowserGlobals(
    { document: makeDocument(root, root), window: makeWindow(true) },
    () => interactionDomEvaluate({ kind: 'activeElement' }),
  );
  return Promise.all([focusedPromise, bodyPromise]).then(([active, body]) => {
    assert.deepEqual(active, { focused: true, tag: 'button', ariaLabel: 'Send message' });
    assert.deepEqual(body, { focused: false, tag: null, ariaLabel: null });
  });
});
