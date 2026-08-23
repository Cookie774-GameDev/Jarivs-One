import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmpireFreezerToolCard } from './EmpireFreezerToolCard';
import { resetEmpireFreezerForTests, updateEmpireFreezerConfig } from './empireFreezer';

const runAction = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock('@/lib/actions', () => ({ runAction }));

describe('EmpireFreezerToolCard', () => {
  beforeEach(() => {
    runAction.mockClear();
    resetEmpireFreezerForTests();
  });

  afterEach(cleanup);

  it('shows truthful local status and exposes enable, pause, and immediate-break controls', () => {
    render(<EmpireFreezerToolCard />);

    expect(screen.getByText('Paused')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Empire Freezer' }));
    expect(runAction).toHaveBeenCalledWith(
      'wellness.empireFreezer',
      { mode: 'enable', intervalMin: 20, durationSec: 20 },
      { source: 'user' },
    );

    act(() => updateEmpireFreezerConfig({ enabled: true }));
    expect(screen.getByText('Active')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause Empire Freezer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take a break now' }));
    expect(runAction).toHaveBeenNthCalledWith(
      2,
      'wellness.empireFreezer',
      { mode: 'pause', intervalMin: 20, durationSec: 20 },
      { source: 'user' },
    );
    expect(runAction).toHaveBeenNthCalledWith(
      3,
      'wellness.empireFreezer',
      { mode: 'run_now', intervalMin: 20, durationSec: 20 },
      { source: 'user' },
    );
  });
});
