import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { Accessibility } from './Accessibility';

describe('Accessibility MonoChrome appearance', () => {
  beforeEach(() => {
    useUIStore.setState({ composerStt: true });
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ composerStt: true });
  });

  it('gates radius, background-image, and shadow under exact monochrome only', () => {
    render(<Accessibility />);

    const root = document.querySelector<HTMLElement>('.mc7f-settings-accessibility');
    expect(root).not.toBeNull();
    const className = root?.className ?? '';

    expect(className).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    // Ordinary-theme layout and the exact-theme accent rail stay intact.
    expect(className).toContain('flex flex-col gap-6');
    expect(className).toContain('[html[data-theme=monochrome]_&]:border-l-foreground/20');
    expect(className).not.toMatch(/gradient|blur/);

    // Meaningful product surface, including the reduced-motion readout.
    expect(screen.getByRole('heading', { name: 'Accessibility' })).toBeTruthy();
    expect(screen.getByText(/Voice-to-text in the composer/)).toBeTruthy();
    expect(screen.getByText('Reduced motion')).toBeTruthy();
  });
});
