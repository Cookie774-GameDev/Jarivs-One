import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeConnectionInspectionIfUnchanged,
  SubscriptionCliBridge,
} from './sections/SubscriptionCliBridge';
import { writeConnectionMetadata } from '@/lib/ai/connectionState';

describe('SubscriptionCliBridge', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('never starts sign-in or scanning without an explicit click', () => {
    const onScan = vi.fn();
    const onSignIn = vi.fn();
    render(<SubscriptionCliBridge onScan={onScan} onSignIn={onSignIn} />);
    expect(onScan).not.toHaveBeenCalled();
    expect(onSignIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Scan for agents' }));
    expect(onScan).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole('button', { name: /Sign in to/ })[0]!);
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('shows only sanitized connection metadata and explicit management actions', () => {
    render(
      <SubscriptionCliBridge
        records={{
          'openai-codex': {
            installation: 'installed',
            auth: 'authenticated',
            executablePath: 'C:\\Tools\\codex.exe',
            version: '1.2.3',
            lastCheckedAt: 1,
          },
        }}
      />,
    );
    expect(screen.getByText('C:\\Tools\\codex.exe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh Codex CLI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable Codex CLI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forget Codex CLI metadata' })).toBeTruthy();
  });

  it('reflects a completed background scan without starting another scan or sign-in', () => {
    const onScan = vi.fn();
    const onSignIn = vi.fn();
    render(<SubscriptionCliBridge onScan={onScan} onSignIn={onSignIn} />);

    act(() => {
      writeConnectionMetadata({
        'openai-codex': {
          installation: 'installed',
          auth: 'authenticated',
          executablePath: 'C:\\Tools\\codex.exe',
          version: 'codex-cli 1.2.3',
          lastCheckedAt: 42,
        },
      });
    });

    expect(screen.getByText('C:\\Tools\\codex.exe')).toBeTruthy();
    expect(onScan).not.toHaveBeenCalled();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('labels uncertain installation and authentication states without overclaiming', () => {
    render(
      <SubscriptionCliBridge
        records={{
          'openai-codex': {
            installation: 'installed',
            auth: 'unknown',
          },
          'anthropic-claude-code': {
            installation: 'unknown',
            auth: 'unknown',
          },
        }}
      />,
    );

    const codexCard = screen.getByText('Codex CLI').closest('article');
    const claudeCard = screen.getByText('Claude Code CLI').closest('article');
    expect(codexCard).not.toBeNull();
    expect(claudeCard).not.toBeNull();
    expect(within(codexCard!).getByText('Authentication unknown')).toBeTruthy();
    expect(within(claudeCard!).getByText('Needs attention')).toBeTruthy();
  });

  it('does not let a completed manual scan overwrite Forget or another user update', () => {
    const baseline = {
      installation: 'installed' as const,
      auth: 'authenticated' as const,
      lastCheckedAt: 1,
    };
    const inspected = {
      installation: 'installed' as const,
      auth: 'authenticated' as const,
      lastCheckedAt: 2,
    };

    expect(
      mergeConnectionInspectionIfUnchanged({}, 'openai-codex', baseline, inspected, 1, 1),
    ).toEqual({});
    const userUpdate = {
      'openai-codex': {
        ...baseline,
        auth: 'unauthenticated' as const,
      },
    };
    expect(
      mergeConnectionInspectionIfUnchanged(userUpdate, 'openai-codex', baseline, inspected, 1, 1),
    ).toBe(userUpdate);
  });

  it('does not let a completed manual scan overwrite an ABA user mutation', () => {
    const inspected = {
      installation: 'installed' as const,
      auth: 'authenticated' as const,
      lastCheckedAt: 2,
    };
    const current = {};

    expect(
      mergeConnectionInspectionIfUnchanged(current, 'openai-codex', undefined, inspected, 4, 6),
    ).toBe(current);
  });

  it('never reports contradictory installation metadata as ready', () => {
    render(
      <SubscriptionCliBridge
        records={{
          'openai-codex': {
            installation: 'not-installed',
            auth: 'authenticated',
          },
        }}
      />,
    );

    const codexCard = screen.getByText('Codex CLI').closest('article');
    expect(codexCard).not.toBeNull();
    expect(within(codexCard!).getByText('Not installed')).toBeTruthy();
    expect(within(codexCard!).queryByText('Ready')).toBeNull();
  });
});
