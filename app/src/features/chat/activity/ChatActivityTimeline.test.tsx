import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityRow } from './ChatActivityTimeline';
import type { ChatActivityEvent } from './types';

describe('ActivityRow', () => {
  it('renders diff counts and expands the code diff on click', () => {
    const event: ChatActivityEvent = {
      id: 'diff_1',
      chatId: 'chat_1',
      kind: 'diff',
      status: 'done',
      title: 'Wrote file',
      subtitle: 'src/App.tsx',
      filePath: 'src/App.tsx',
      addedLines: 8,
      removedLines: 2,
      diff: '+new code\n-old code',
      ts: 1,
    };

    render(<ActivityRow event={event} />);

    expect(screen.getByText('+8')).toBeTruthy();
    expect(screen.getByText('-2')).toBeTruthy();
    expect(screen.queryByText((content) => content.includes('+new code'))).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText((content) => content.includes('+new code'))).toBeTruthy();
  });

  it('renders AllAboutMe learning file writes with diff counts', () => {
    const event: ChatActivityEvent = {
      id: 'diff_all_about_me',
      chatId: 'chat_1',
      kind: 'diff',
      status: 'done',
      title: 'AllAboutMe.md file written',
      subtitle: 'VibeSpace Profile Vault/AllAboutMe.md',
      filePath: 'VibeSpace Profile Vault/AllAboutMe.md',
      addedLines: 3,
      removedLines: 1,
      diff: '--- AllAboutMe.md\n+++ AllAboutMe.md\n-old\n+new',
      ts: 1,
    };

    render(<ActivityRow event={event} />);

    expect(screen.getByText('AllAboutMe.md file written')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('-1')).toBeTruthy();
  });
});

