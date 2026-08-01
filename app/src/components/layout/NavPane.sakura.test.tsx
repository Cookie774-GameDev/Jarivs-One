import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavSection } from './NavPane';

describe('NavPane Sakura shell contract', () => {
  afterEach(cleanup);

  it('keeps long expanded labels truncated and the disclosure target at least 24px', () => {
    render(
      <NavSection
        id="long-label"
        title="A deliberately long navigation section label"
        icon={<span aria-hidden>icon</span>}
        navOpen
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      >
        <span>Section content</span>
      </NavSection>,
    );

    const disclosure = screen.getByRole('button', {
      name: 'Collapse A deliberately long navigation section label',
    });
    const label = screen.getByText('A deliberately long navigation section label');

    expect(disclosure.className).toContain('min-h-6');
    expect(disclosure.className).toContain('min-w-6');
    expect(label.className).toContain('truncate');
  });

  it('keeps the collapsed rail named without rendering an unusable disclosure', () => {
    render(
      <NavSection
        id="workspace"
        title="Workspace"
        icon={<span aria-hidden>icon</span>}
        navOpen={false}
        collapsed={false}
      >
        <button type="button">Chat</button>
      </NavSection>,
    );

    expect(screen.getByRole('region', { name: 'Workspace' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Workspace/ })).toBeNull();
  });
});
