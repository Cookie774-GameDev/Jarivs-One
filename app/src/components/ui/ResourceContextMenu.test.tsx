import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceContextMenu } from './ResourceContextMenu';

const resource = {
  kind: 'file' as const,
  name: 'demo.ts',
  path: 'C:\\repo\\src\\demo.ts',
};

describe('ResourceContextMenu', () => {
  const writeText = vi.fn(async () => undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('offers only valid actions and attaches to the exact active chat', async () => {
    const attached = vi.fn();
    window.addEventListener('jarvis:composer:attach-resource', attached);
    const onOpen = vi.fn();
    const onPreview = vi.fn();
    const onClose = vi.fn();

    render(
      <ResourceContextMenu
        x={12}
        y={18}
        resource={resource}
        activeChatId="chat-7"
        onOpen={onOpen}
        onPreview={onPreview}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Attach to active chat' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Reveal externally' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Attach to active chat' }));
    expect(attached).toHaveBeenCalledTimes(1);
    expect((attached.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      chatId: 'chat-7',
      resource,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    window.removeEventListener('jarvis:composer:attach-resource', attached);
  });

  it('navigates with arrows, activates with Enter, closes with Escape, and restores focus', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Resource';
    document.body.appendChild(trigger);
    trigger.focus();
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const view = render(
      <ResourceContextMenu
        x={12}
        y={18}
        resource={resource}
        onOpen={onOpen}
        onClose={onClose}
        returnFocus={trigger}
      />,
    );

    const open = await screen.findByRole('menuitem', { name: 'Open' });
    await waitFor(() => expect(document.activeElement).toBe(open));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Copy path' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(resource.path));
    expect(onClose).toHaveBeenCalledTimes(1);

    view.rerender(
      <ResourceContextMenu
        x={12}
        y={18}
        resource={resource}
        onOpen={onOpen}
        onClose={onClose}
        returnFocus={trigger}
      />,
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('inserts into a safe prior field and omits insertion for a secret field', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Prompt: ';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    document.body.appendChild(textarea);
    const onClose = vi.fn();

    const view = render(
      <ResourceContextMenu
        x={0}
        y={0}
        resource={resource}
        insertTarget={textarea}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Insert reference' }));
    expect(textarea.value).toBe(`Prompt: ${resource.path}`);

    const secret = document.createElement('input');
    secret.type = 'password';
    document.body.appendChild(secret);
    view.rerender(
      <ResourceContextMenu
        x={0}
        y={0}
        resource={resource}
        insertTarget={secret}
        onClose={onClose}
      />,
    );
    expect(screen.queryByRole('menuitem', { name: 'Insert reference' })).toBeNull();
  });
});
