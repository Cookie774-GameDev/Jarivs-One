import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoundryPage } from './FoundryPage';
import { InMemoryStorageAdapter } from './localRepository';

const NOW = '2026-07-13T12:00:00.000Z';

function idFactory() {
  const counts = new Map<string, number>();
  return (kind: string) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${kind}-${next}`;
  };
}

function renderFoundry(storage = new InMemoryStorageAdapter()) {
  const dependencies = { clock: () => NOW, idFactory: idFactory() };
  return {
    storage,
    dependencies,
    ...render(<FoundryPage storage={storage} dependencies={dependencies} />),
  };
}

describe('FoundryPage fixture vertical slice', () => {
  it('runs create, fixture training, evaluation, explicit promotion, and restart recovery', async () => {
    const view = renderFoundry();

    expect(screen.getByRole('heading', { name: 'Build Your Own AI' })).toBeTruthy();
    expect(screen.getByText(/fixture mode never trains weights/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create VibeCoder' }));
    expect(screen.getByRole('heading', { name: 'VibeCoder' })).toBeTruthy();
    expect(screen.getByText('Project ready')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Check this device' }));
    expect(await screen.findByText('Desktop hardware check unavailable in web mode.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prepare approved fixture inputs' }));
    expect(screen.getByText('1 approved example')).toBeTruthy();
    expect(screen.getByText('Fixture Base · Apache-2.0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start fixture training' }));
    const jobRegion = screen.getByRole('region', { name: 'Training job' });
    expect(within(jobRegion).getByText('Queued')).toBeTruthy();

    for (const expectedState of ['Preparing', 'Training', 'Checkpointing', 'Completed']) {
      fireEvent.click(screen.getByRole('button', { name: 'Advance fixture job' }));
      expect(within(jobRegion).getByText(expectedState)).toBeTruthy();
    }
    expect(screen.getByText(/no model training or gpu work occurred/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Run fixture evaluation' }));
    expect(screen.getByText('All gates passed')).toBeTruthy();
    expect(screen.getByText('0 safety failures')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Promote candidate' }));
    expect(screen.getByText('Current champion')).toBeTruthy();

    view.unmount();
    render(<FoundryPage storage={view.storage} dependencies={view.dependencies} />);
    expect(screen.getByRole('heading', { name: 'VibeCoder' })).toBeTruthy();
    expect(screen.getByText('Current champion')).toBeTruthy();
  });

  it('does not expose promotion before a complete passing evaluation', () => {
    renderFoundry();
    fireEvent.click(screen.getByRole('button', { name: 'Create VibeCoder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare approved fixture inputs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start fixture training' }));

    expect(screen.queryByRole('button', { name: 'Promote candidate' })).not.toBeTruthy();
  });

  it('persists an interrupted restart state and resumes it explicitly', () => {
    const view = renderFoundry();
    fireEvent.click(screen.getByRole('button', { name: 'Create VibeCoder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare approved fixture inputs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start fixture training' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advance fixture job' }));
    view.unmount();

    const restarted = render(<FoundryPage storage={view.storage} dependencies={view.dependencies} />);
    expect(within(screen.getByRole('region', { name: 'Training job' })).getByText('Interrupted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume fixture job' }));
    expect(within(screen.getByRole('region', { name: 'Training job' })).getByText('Preparing')).toBeTruthy();
    restarted.unmount();

    render(<FoundryPage storage={view.storage} dependencies={view.dependencies} />);
    expect(within(screen.getByRole('region', { name: 'Training job' })).getByText('Interrupted')).toBeTruthy();
  });

  it('requires explicit license approval for a pinned real model download', () => {
    renderFoundry();
    fireEvent.click(screen.getByRole('button', { name: 'Create VibeCoder' }));
    fireEvent.click(screen.getByRole('button', { name: /SmolLM2 135M Instruct/ }));

    expect(screen.getByText(/Revision a91318be/)).toBeTruthy();
    expect(screen.getByText(/Remote model code stays disabled/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download and verify model' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Download and verify model' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Prepare approved fixture inputs' })).not.toBeTruthy();
  });});
