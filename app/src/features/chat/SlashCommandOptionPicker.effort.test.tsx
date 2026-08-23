import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlashCommandOptionPicker } from './SlashCommandOptionPicker';

describe('/effort option picker', () => {
  it('uses the same live effort row semantics and ultra effects as the model modifier picker', () => {
    const { container } = render(
      <SlashCommandOptionPicker
        commandLabel="effort"
        options={[
          { id: 'auto', label: 'Auto', description: 'Provider default' },
          { id: 'medium', label: 'Medium', description: 'Balanced reasoning' },
          { id: 'ultra', label: 'Ultra', description: 'Maximum verified reasoning' },
        ]}
        selectedId="ultra"
        query=""
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Live effort options' })).toBeTruthy();
    expect(container.querySelector('[data-effort-level="medium"]')).toBeTruthy();
    expect(
      container.querySelector('[data-effort-level="ultra"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(container.querySelector('[data-ultra-roots="true"]')).toBeTruthy();
    expect(container.querySelector('[data-ultra-sigil="true"]')).toBeTruthy();
  });
});
