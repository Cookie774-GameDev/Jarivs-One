import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatId } from '@/types';
import { TabItem } from './TabStrip';

describe('TabItem accessibility', () => {
  afterEach(cleanup);

  it('keeps tab selection and close as sibling interactive controls', () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();

    render(
      <TabItem
        tab={{ id: 'chat-1' as ChatId, title: 'New chat 1' }}
        active
        onActivate={onActivate}
        onClose={onClose}
        onRename={vi.fn()}
      />,
    );

    const tab = screen.getByRole('button', { name: 'New chat 1' });
    const close = screen.getByRole('button', { name: 'Close New chat 1' });

    expect(tab.contains(close)).toBe(false);
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    expect(tab.getAttribute('tabindex')).toBe('0');
    expect(tab.className).toContain('[html[data-theme=sakura]_&]:min-h-6');

    fireEvent.click(tab);
    fireEvent.click(close);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
