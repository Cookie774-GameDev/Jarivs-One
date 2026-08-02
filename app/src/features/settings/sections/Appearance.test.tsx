import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { Appearance } from './Appearance';

describe('Appearance theme selector', () => {
  afterEach(() => {
    cleanup();
    useUIStore.setState({ theme: 'default' });
  });

  it('renders exactly five accessible theme choices and applies VibeSpace', () => {
    useUIStore.setState({ theme: 'default' });
    render(<Appearance />);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: /Default/ }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: /VibeSpace/ }));
    expect(useUIStore.getState().theme).toBe('vibespace');
    expect(document.documentElement.dataset.theme).toBe('vibespace');
  });

  it('offers Sakura as the cel-painted fifth choice and applies it', () => {
    render(<Appearance />);

    const sakura = screen.getByRole('radio', { name: /Sakura/ });
    expect(sakura.textContent).toContain('Cel-painted dusk workspace.');
    expect(sakura.querySelector('svg')?.getAttribute('class')).toMatch(/\blucide\b/);

    fireEvent.click(sakura);
    expect(useUIStore.getState().theme).toBe('sakura');
    expect(document.documentElement.dataset.theme).toBe('sakura');
    expect(document.documentElement.dataset.themePreference).toBe('sakura');
  });

  it('offers MonoChrome as the terminal-inspired fourth choice without surfacing Light', () => {
    render(<Appearance />);

    const monochrome = screen.getByRole('radio', { name: /MonoChrome/ });
    expect(monochrome.textContent).toContain('Terminal-inspired developer console.');
    expect(screen.queryByRole('radio', { name: /Light/ })).toBeNull();

    fireEvent.click(monochrome);
    expect(useUIStore.getState().theme).toBe('monochrome');
    expect(document.documentElement.dataset.theme).toBe('monochrome');
  });
});
