import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatNavRow, NavSection, ProjectRow } from './NavPane';

describe('NavPane Sakura shell contract', () => {
  afterEach(cleanup);

  it('keeps long labels truncated and a 24px disclosure inside the legacy MonoChrome footprint', () => {
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
    expect(disclosure.className).toContain('[html[data-theme=monochrome]_&]:-mx-1');
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

  it('gives every compact Sakura navigation action a 24px target without changing row geometry', () => {
    render(
      <TooltipProvider>
        <NavSection
          id="context"
          title="Context"
          icon={<span aria-hidden>icon</span>}
          navOpen
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          onTitleClick={vi.fn()}
        />
        <ProjectRow
          project={{ id: 'project-1', name: 'Inbox' } as never}
          navOpen
          active={false}
          onActivate={vi.fn()}
          onTerminalHover={vi.fn()}
          onDropTerminal={vi.fn()}
          onOpenSettings={vi.fn()}
        />
        <ChatNavRow
          chat={{ id: 'chat-1', title: 'New chat 1' } as never}
          navOpen
          active={false}
          onOpen={vi.fn()}
          onTogglePin={vi.fn()}
        />
      </TooltipProvider>,
    );

    for (const control of [
      screen.getByRole('button', { name: 'Context' }),
      screen.getByRole('button', { name: 'Inbox' }),
      screen.getByRole('button', { name: 'Open Inbox settings' }),
      screen.getByRole('button', { name: 'New chat 1' }),
    ]) {
      expect(control.className).toContain('[html[data-theme=sakura]_&]:min-h-6');
    }
    expect(screen.getByRole('button', { name: 'Open Inbox settings' }).className).toContain(
      '[html[data-theme=sakura]_&]:min-w-6',
    );
  });
});
