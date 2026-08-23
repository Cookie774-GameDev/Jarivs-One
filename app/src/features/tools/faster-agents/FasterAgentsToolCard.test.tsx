import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const launch = vi.fn();
const setRoute = vi.fn();

vi.mock('@/features/terminals/faster-agents/fasterAgentsStore', () => ({
  useFasterAgentsStore: { getState: () => ({ launch }) },
}));
vi.mock('@/stores/ui', () => ({
  useUIStore: { getState: () => ({ setRoute }) },
}));

import { FasterAgentsToolCard } from './FasterAgentsToolCard';

describe('FasterAgentsToolCard', () => {
  it('launches the selection flow before navigating to terminals', () => {
    render(<FasterAgentsToolCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Faster Agents' }));
    expect(launch).toHaveBeenCalledOnce();
    expect(setRoute).toHaveBeenCalledWith('terminal');
    expect(launch.mock.invocationCallOrder[0]).toBeLessThan(setRoute.mock.invocationCallOrder[0]!);
  });
});
