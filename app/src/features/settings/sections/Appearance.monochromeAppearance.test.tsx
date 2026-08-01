import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { Appearance } from './Appearance';

describe('Appearance MonoChrome appearance', () => {
  afterEach(() => {
    cleanup();
    useUIStore.setState({ theme: 'default' });
  });

  it('gates radius, background-image, and shadow under exact monochrome only', () => {
    useUIStore.setState({ theme: 'default' });
    render(<Appearance />);

    const root = document.querySelector<HTMLElement>('.mc7f-settings-appearance');
    expect(root).not.toBeNull();
    const className = root?.className ?? '';

    expect(className).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    for (const radio of radios) {
      expect(radio.className).toContain('bg-panel');
    }
    expect(className).not.toMatch(/gradient|blur/);
  });
});
