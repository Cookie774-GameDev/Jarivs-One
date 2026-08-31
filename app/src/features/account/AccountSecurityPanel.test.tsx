import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';

const updateUser = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { updateUser } }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

import { AccountSecurityPanel } from './AccountSecurityPanel';

describe('AccountSecurityPanel', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    toastSuccess.mockReset();
    toastError.mockReset();
    useAuthStore.setState({
      cloudSession: {
        user_id: 'account-a',
        email: 'ada@example.test',
        expires_at: 2_000_000_000,
      },
    });
  });

  it('shows the exact active cloud identity and session boundary', () => {
    render(<AccountSecurityPanel accountId="account-a" />);

    expect(screen.getByRole('heading', { name: 'Active cloud session' })).toBeTruthy();
    expect(screen.getByText('ada@example.test')).toBeTruthy();
    expect(screen.getByText(/account-a/)).toBeTruthy();
    expect(screen.getByText(/session expires/i)).toBeTruthy();
  });

  it('fails closed when the rendered account no longer owns the active session', () => {
    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-b',
          email: 'grace@example.test',
          expires_at: 2_000_000_100,
        },
      });
    });

    render(<AccountSecurityPanel accountId="account-a" />);

    expect(screen.getByText(/active cloud session is unavailable/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
  });

  it('changes the password only for the current authenticated session', async () => {
    render(<AccountSecurityPanel accountId="account-a" />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    fireEvent.change(screen.getByLabelText('New account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass9' });
    });
    expect(screen.getByRole('status').textContent).toMatch(/password updated/i);
  });

  it('never offers a password mutation without a cloud session', () => {
    useAuthStore.setState({ cloudSession: null });
    render(<AccountSecurityPanel accountId="" />);

    expect(screen.queryByLabelText('New account password')).toBeNull();
    expect(screen.getByText(/sign in to change/i)).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('clears password fields and status when the cloud account changes', async () => {
    const { rerender } = render(<AccountSecurityPanel accountId="account-a" />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    fireEvent.change(screen.getByLabelText('New account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm account password'), {
      target: { value: 'Different9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/passwords do not match/i);

    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-b',
          email: 'grace@example.test',
          expires_at: 2_000_000_100,
        },
      });
    });
    rerender(<AccountSecurityPanel accountId="account-b" />);

    expect(screen.queryByLabelText('New account password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect((screen.getByLabelText('New account password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirm account password') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears secret and error state across a session-only account switch', () => {
    render(<AccountSecurityPanel accountId="account-a" />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    fireEvent.change(screen.getByLabelText('New account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm account password'), {
      target: { value: 'Different9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/passwords do not match/i);

    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-b',
          email: 'grace@example.test',
          expires_at: 2_000_000_100,
        },
      });
    });
    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-a',
          email: 'ada-returned@example.test',
          expires_at: 2_000_000_200,
        },
      });
    });

    expect(screen.queryByLabelText('New account password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect((screen.getByLabelText('New account password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirm account password') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('invalidates a delayed response across a session-only A to B to A switch', async () => {
    let resolveUpdate: ((value: { data: object; error: null }) => void) | undefined;
    updateUser.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(<AccountSecurityPanel accountId="account-a" />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    fireEvent.change(screen.getByLabelText('New account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));

    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-b',
          email: 'grace@example.test',
          expires_at: 2_000_000_100,
        },
      });
    });
    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-a',
          email: 'ada-returned@example.test',
          expires_at: 2_000_000_200,
        },
      });
    });
    await act(async () => {
      resolveUpdate?.({ data: {}, error: null });
    });

    expect(screen.queryByText('Password updated.')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('ignores a delayed password response after switching accounts', async () => {
    let resolveUpdate: ((value: { data: object; error: null }) => void) | undefined;
    updateUser.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const { rerender } = render(<AccountSecurityPanel key="account-a" accountId="account-a" />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    fireEvent.change(screen.getByLabelText('New account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm account password'), {
      target: { value: 'SecurePass9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));

    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'account-b',
          email: 'grace@example.test',
          expires_at: 2_000_000_100,
        },
      });
    });
    rerender(<AccountSecurityPanel key="account-b" accountId="account-b" />);
    await act(async () => {
      resolveUpdate?.({ data: {}, error: null });
    });

    await waitFor(() => {
      expect(screen.queryByText('Password updated.')).toBeNull();
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
