import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createStorageDoctor } from '@/lib/doctor/storageDoctor';
import { StorageDoctorHost, StorageDoctorNotice } from './StorageDoctorNotice';

function backingStoreError(): DOMException {
  return new DOMException(
    'Internal error opening backing store for indexedDB.open',
    'UnknownError',
  );
}

describe('StorageDoctorNotice', () => {
  it('runs the local health check once when the host mounts', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const doctor = createStorageDoctor({
      open,
      reset: vi.fn(),
      verify: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn(),
    });

    render(<StorageDoctorHost doctor={doctor} />);
    await waitFor(() => expect(doctor.getSnapshot().kind).toBe('healthy'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows one durable repair state and recovers through non-destructive Try Again', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(backingStoreError())
      .mockRejectedValueOnce(backingStoreError())
      .mockRejectedValueOnce(backingStoreError())
      .mockRejectedValueOnce(backingStoreError())
      .mockResolvedValue(undefined);
    const doctor = createStorageDoctor({
      open,
      reset: vi.fn(),
      verify: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await doctor.run();

    render(<StorageDoctorNotice doctor={doctor} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Local chat storage needs repair')).toBeTruthy();
    expect(screen.getByText(/Nothing has been erased/)).toBeTruthy();
    expect(screen.getByText(/indexeddb_backing_store_open_failed/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(open).toHaveBeenCalledTimes(5);
  });

  it('keeps unrecognized failures diagnostic-only instead of offering guessed cleanup', async () => {
    const doctor = createStorageDoctor({
      open: vi.fn().mockRejectedValue(new Error('unrelated failure')),
      reset: vi.fn(),
      verify: vi.fn(),
      sleep: vi.fn(),
    });
    await doctor.run();

    render(<StorageDoctorNotice doctor={doctor} />);
    expect(screen.getByText('Local chat storage is unavailable')).toBeTruthy();
    expect(screen.getByText(/storage_unrecognized_failure/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /repair local storage/i })).toBeNull();
  });
});
