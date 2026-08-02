import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavSection } from './NavPane';

describe('NavSection accessibility', () => {
  afterEach(cleanup);

  it('puts disclosure state on the toggle button instead of the section header', () => {
    const onToggleCollapsed = vi.fn();

    const { container, rerender } = render(
      <NavSection
        id="workspace"
        title="Workspace"
        icon={<span aria-hidden="true">icon</span>}
        navOpen
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        action={<button type="button">New item</button>}
      >
        <span>Section content</span>
      </NavSection>,
    );

    const header = container.querySelector('header');
    const disclosure = screen.getByRole('button', { name: 'Collapse Workspace' });

    expect(header?.hasAttribute('aria-expanded')).toBe(false);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(disclosure);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);

    fireEvent.click(header!);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(2);

    rerender(
      <NavSection
        id="workspace"
        title="Workspace"
        icon={<span aria-hidden="true">icon</span>}
        navOpen
        collapsed
        onToggleCollapsed={onToggleCollapsed}
      >
        <span>Section content</span>
      </NavSection>,
    );

    const collapsedDisclosure = screen.getByRole('button', { name: 'Expand Workspace' });
    expect(collapsedDisclosure.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('header')?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('keeps title navigation separate from disclosure and trailing actions', () => {
    const onToggleCollapsed = vi.fn();
    const onTitleClick = vi.fn();
    const onAction = vi.fn();

    const { container } = render(
      <NavSection
        id="context"
        title="Context"
        icon={<span aria-hidden="true">icon</span>}
        navOpen
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onTitleClick={onTitleClick}
        action={
          <button type="button" onClick={onAction}>
            New item
          </button>
        }
      >
        <span>Section content</span>
      </NavSection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Context' }));
    expect(onTitleClick).toHaveBeenCalledTimes(1);
    expect(onToggleCollapsed).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('header')!);
    expect(onToggleCollapsed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onToggleCollapsed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Context' }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
