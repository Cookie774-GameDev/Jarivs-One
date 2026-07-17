import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { Appearance } from './Appearance';

describe('Appearance theme selector', () => {
  afterEach(() => {
    cleanup();
    useUIStore.setState({ theme: 'default' });
  });

  it('renders exactly Default and VibeSpace and applies VibeSpace', () => {
    useUIStore.setState({ theme: 'default' });
    render(<Appearance />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Default/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('radio', { name: /Jarvis Core/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Light/ })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /VibeSpace/ }));
    expect(useUIStore.getState().theme).toBe('vibespace');
    expect(document.documentElement.dataset.theme).toBe('vibespace');
  });
});
