import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  isCloudSyncConfigured: () => true,
  getSupabaseClient: () => ({ auth }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { SignInDialog } from './SignInDialog';

describe('SignInDialog password recovery', () => {
  beforeEach(() => {
    auth.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
    auth.verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
    auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  });

  it('verifies the emailed recovery code before accepting a new password', async () => {
    const onOpenChange = vi.fn();
    render(<SignInDialog open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: ' Owner@Example.test ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send recovery code/i }));

    await waitFor(() => {
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('owner@example.test');
    });

    fireEvent.change(screen.getByLabelText('Digit 1 of 6'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify recovery code/i }));

    await waitFor(() => {
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        email: 'owner@example.test',
        token: '123456',
        type: 'recovery',
      });
    });

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    await waitFor(() => {
      expect(auth.updateUser).toHaveBeenCalledWith({ password: 'SecurePass9' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('does not update the account when password confirmation differs', async () => {
    render(<SignInDialog open onOpenChange={vi.fn()} initialMode="recovery" />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send recovery code/i }));
    await screen.findByText(/enter the recovery code/i);

    fireEvent.change(screen.getByLabelText('Digit 1 of 6'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify recovery code/i }));
    await screen.findByLabelText('New password');

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'Different9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/passwords do not match/i);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  function RecoveryHarness() {
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Reopen recovery
        </button>
        <SignInDialog open={open} onOpenChange={setOpen} initialMode="recovery" />
      </>
    );
  }

  it('clears email and OTP state before cancelling from recovery verification', async () => {
    render(<RecoveryHarness />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send recovery code/i }));
    await screen.findByLabelText('Digit 1 of 6');
    fireEvent.change(screen.getByLabelText('Digit 1 of 6'), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /reopen recovery/i }));

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Digit 1 of 6')).toBeNull();
  });

  it('clears recovery passwords and phase before cancelling after code verification', async () => {
    render(<RecoveryHarness />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send recovery code/i }));
    await screen.findByLabelText('Digit 1 of 6');
    fireEvent.change(screen.getByLabelText('Digit 1 of 6'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify recovery code/i }));
    await screen.findByLabelText('New password');
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'SecurePass9' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /reopen recovery/i }));

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.queryByDisplayValue('SecurePass9')).toBeNull();
  });

  it('clears recovery credentials when the footer Cancel button closes the dialog', () => {
    render(<RecoveryHarness />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.test' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /reopen recovery/i }));

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
  });

  it('clears credentials when the controlled open prop closes and reopens the dialog', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<SignInDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'SecurePass9' },
    });

    rerender(<SignInDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<SignInDialog open onOpenChange={onOpenChange} />);

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('clears recovery new-password state across a controlled close and reopen', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <SignInDialog open onOpenChange={onOpenChange} initialMode="recovery" />,
    );
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send recovery code/i }));
    await screen.findByLabelText('Digit 1 of 6');
    fireEvent.change(screen.getByLabelText('Digit 1 of 6'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify recovery code/i }));
    await screen.findByLabelText('New password');
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'SecurePass9' },
    });

    rerender(<SignInDialog open={false} onOpenChange={onOpenChange} initialMode="recovery" />);
    rerender(<SignInDialog open onOpenChange={onOpenChange} initialMode="recovery" />);

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.queryByDisplayValue('SecurePass9')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
