import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextRecoveryNotice } from './ContextRecoveryNotice';

describe('ContextRecoveryNotice', () => {
  it('shows every safe recovery choice without exposing quarantined payloads', () => {
    render(
      <ContextRecoveryNotice
        recovery={{
          issueCount: 2,
          options: [
            {
              id: 'retry',
              label: 'Retry recovery',
              description: 'Validate the preserved source again and retry the migration.',
            },
            {
              id: 'restore_backup',
              label: 'Restore backup',
              description: 'Restore the preserved pre-migration backup.',
            },
            {
              id: 'export_then_discard',
              label: 'Export then discard',
              description: 'Export quarantined records before discarding their local copies.',
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(/2 records need recovery/i);
    expect(screen.getByText('Retry recovery')).toBeTruthy();
    expect(screen.getByText('Restore backup')).toBeTruthy();
    expect(screen.getByText('Export then discard')).toBeTruthy();
    expect(screen.queryByText(/raw payload/i)).toBeNull();
  });

  it('renders nothing when no scoped recovery is required', () => {
    const { container } = render(<ContextRecoveryNotice recovery={null} />);
    expect(container.innerHTML).toBe('');
  });
});
