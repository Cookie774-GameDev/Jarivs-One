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

  it('requires a second explicit confirmation before scheduling backup and restart', async () => {
    const doctor = createStorageDoctor({
      open: vi.fn().mockRejectedValue(backingStoreError()),
      reset: vi.fn(),
      verify: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await doctor.run();
    const scheduleRepair = vi.fn().mockResolvedValue(undefined);

    render(
      <StorageDoctorNotice
        doctor={doctor}
        repairActions={{
          scheduleRepair,
          scheduleRestore: vi.fn(),
          listBackups: vi.fn().mockResolvedValue([]),
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /repair local storage/i }));
    expect(scheduleRepair).not.toHaveBeenCalled();
    expect(screen.getByText(/first create a local backup/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /back up and restart vibespace/i }));
    await waitFor(() => expect(scheduleRepair).toHaveBeenCalledWith({ confirmed: true }));
  });

  it('discovers the newest retained backup and requires confirmation before restore', async () => {
    const doctor = createStorageDoctor({
      open: vi.fn().mockRejectedValue(backingStoreError()),
      reset: vi.fn(),
      verify: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await doctor.run();
    const scheduleRestore = vi.fn().mockResolvedValue(undefined);

    render(
      <StorageDoctorNotice
        doctor={doctor}
        repairActions={{
          scheduleRepair: vi.fn(),
          scheduleRestore,
          listBackups: vi.fn().mockResolvedValue([
            {
              backupId: '1777000000000-123e4567-e89b-42d3-a456-426614174000',
              createdAtMs: 1_777_000_000_000,
            },
          ]),
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /restore retained backup/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /restore retained backup/i }));
    expect(scheduleRestore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm restore and restart/i }));
    await waitFor(() =>
      expect(scheduleRestore).toHaveBeenCalledWith({
        confirmed: true,
        backupId: '1777000000000-123e4567-e89b-42d3-a456-426614174000',
      }),
    );
  });
});
