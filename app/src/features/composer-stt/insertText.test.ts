import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  insertTextIntoFocusedEditable,
  isComposerSttTextarea,
  isGlobalSttEditable,
  isTerminalSttSurface,
} from './insertText';

describe('insertText', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('detects composer vs generic textareas', () => {
    const composer = document.createElement('textarea');
    composer.setAttribute('aria-label', 'Message');
    const agent = document.createElement('textarea');
    agent.id = 'agent-prompt';

    expect(isComposerSttTextarea(composer)).toBe(true);
    expect(isComposerSttTextarea(agent)).toBe(false);
    expect(isGlobalSttEditable(agent)).toBe(true);
    expect(isGlobalSttEditable(composer)).toBe(false);
  });

  it('skips xterm surfaces', () => {
    const xterm = document.createElement('div');
    xterm.className = 'xterm';
    const helper = document.createElement('textarea');
    xterm.appendChild(helper);
    container.appendChild(xterm);
    helper.focus();

    expect(isTerminalSttSurface(helper)).toBe(true);
    expect(isGlobalSttEditable(helper)).toBe(false);
  });

  it('inserts speech at the caret in a generic textarea', () => {
    const field = document.createElement('textarea');
    field.value = 'Hello';
    field.selectionStart = 5;
    field.selectionEnd = 5;
    container.appendChild(field);
    field.focus();

    expect(insertTextIntoFocusedEditable('world')).toBe(true);
    expect(field.value).toBe('Hello world');
    expect(field.selectionStart).toBe(11);
  });
});
