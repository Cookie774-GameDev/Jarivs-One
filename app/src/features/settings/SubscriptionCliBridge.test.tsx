import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionCliBridge } from './sections/SubscriptionCliBridge';

describe('SubscriptionCliBridge', () => {
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
    render(<SubscriptionCliBridge records={{
      'openai-codex': {
        installation: 'installed', auth: 'authenticated',
        executablePath: 'C:\\Tools\\codex.exe', version: '1.2.3', lastCheckedAt: 1,
      },
    }} />);
    expect(screen.getByText('C:\\Tools\\codex.exe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh Codex CLI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable Codex CLI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forget Codex CLI metadata' })).toBeTruthy();
  });
});
