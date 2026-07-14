import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRightClickDrag } from './rightClickDrag';

describe('startRightClickDrag', () => {
  afterEach(() => {
    document.body.classList.remove('jarvis-terminal-right-dragging');
    delete document.body.dataset.jarvisSuppressContextMenuUntil;
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    vi.restoreAllMocks();
  });

  it('keeps file/context right-drag active through left-button mouseup', () => {
    const dropTarget = document.createElement('div');
    dropTarget.dataset.terminalDrop = 'chat';
    dropTarget.dataset.terminalDropChatId = 'chat-1';
    document.body.appendChild(dropTarget);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => dropTarget),
    });
    const attached = vi.fn();
    window.addEventListener('jarvis:composer:attach-resource', attached);

    startRightClickDrag(
      new MouseEvent('mousedown', {
        button: 2,
        buttons: 2,
        clientX: 10,
        clientY: 10,
        bubbles: true,
        cancelable: true,
      }),
      'file',
      { path: 'C:\\temp\\demo.txt' },
    );

    document.dispatchEvent(
      new MouseEvent('mousemove', {
        buttons: 2,
        clientX: 30,
        clientY: 30,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new MouseEvent('mouseup', {
        button: 0,
        buttons: 2,
        clientX: 31,
        clientY: 31,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(document.body.classList.contains('jarvis-terminal-right-dragging')).toBe(true);
    expect(attached).not.toHaveBeenCalled();

    document.dispatchEvent(
      new MouseEvent('mouseup', {
        button: 2,
        buttons: 0,
        clientX: 32,
        clientY: 32,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(document.body.classList.contains('jarvis-terminal-right-dragging')).toBe(false);
    expect(attached).toHaveBeenCalledTimes(1);
    expect((attached.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      chatId: 'chat-1',
      resource: {
        kind: 'file',
        name: 'demo.txt',
        path: 'C:\\temp\\demo.txt',
      },
    });

    window.removeEventListener('jarvis:composer:attach-resource', attached);
    dropTarget.remove();
  });

  it('quotes a terminal path for the pane shell and never appends Enter', () => {
    const dropTarget = document.createElement('div');
    dropTarget.dataset.terminalDrop = 'pane';
    dropTarget.dataset.terminalDropPaneId = 'pane-1';
    dropTarget.dataset.resourceShell = 'powershell.exe';
    document.body.appendChild(dropTarget);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => dropTarget),
    });
    const written = vi.fn();
    window.addEventListener('jarvis:terminal:write-text', written);

    startRightClickDrag(
      new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 2, clientY: 2 }),
      'file',
      { path: "C:\\project files\\O'Brien.txt" },
    );
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 2, clientX: 20, clientY: 20 }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, clientX: 20, clientY: 20 }));

    expect((written.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      paneId: 'pane-1',
      text: "'C:\\project files\\O''Brien.txt'",
    });
    expect((written.mock.calls[0]?.[0] as CustomEvent).detail.text).not.toMatch(/[\r\n]/);
    window.removeEventListener('jarvis:terminal:write-text', written);
  });

  it('rejects sensitive fields and clears all drag chrome on Escape', () => {
    const secret = document.createElement('input');
    secret.name = 'api-token';
    document.body.appendChild(secret);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => secret),
    });
    const input = vi.fn();
    secret.addEventListener('input', input);

    startRightClickDrag(
      new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 2, clientY: 2 }),
      'file',
      { path: 'C:\\temp\\demo.txt' },
    );
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 2, clientX: 20, clientY: 20 }));
    expect(document.body.classList.contains('jarvis-terminal-right-dragging')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.body.classList.contains('jarvis-terminal-right-dragging')).toBe(false);
    expect(document.querySelector('.jarvis-terminal-drag-preview')).toBeNull();
    expect(input).not.toHaveBeenCalled();
  });

  it.each(['dragend', 'jarvis:route-change'])('cleans up when %s fires', (eventName) => {
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => target),
    });

    startRightClickDrag(
      new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 2, clientY: 2 }),
      'file',
      { path: 'C:\\temp\\demo.txt' },
    );
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 2, clientX: 20, clientY: 20 }));
    window.dispatchEvent(new Event(eventName));

    expect(document.body.classList.contains('jarvis-terminal-right-dragging')).toBe(false);
    expect(document.querySelector('.jarvis-terminal-drag-preview')).toBeNull();
  });
});
