import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { Hive } from './Hive';

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => reducedMotion.current,
  };
});

describe('Hive MonoChrome appearance', () => {
  beforeEach(() => {
    reducedMotion.current = false;
    useAuthStore.setState({
      plan: 'free',
      chatModelSelection: { mode: 'none' },
      previousChatModelSelection: { mode: 'none' },
    });
  });

  afterEach(cleanup);

  it('gates radius, background-image, and shadow under exact monochrome only', () => {
    render(<Hive />);

    const root = document.querySelector<HTMLElement>('.mc7f-settings-hive');
    expect(root).not.toBeNull();
    const className = root?.className ?? '';

    expect(className).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    // Ordinary-theme layout and the exact-theme accent rail stay intact.
    expect(className).toContain('[html[data-theme=monochrome]_&]:border-l-foreground/20');
    // The root container is flat: decorative gradients live on hidden overlays, not the root.
    expect(className).not.toMatch(/gradient|blur/);

    // Meaningful product surface and copy are preserved.
    expect(screen.getByRole('heading', { name: 'Hive' })).toBeTruthy();
    expect(screen.getByText('Hive Balance')).toBeTruthy();
    expect(screen.getByText(/Five models, one answer/)).toBeTruthy();
  });

  it('renders pipeline steps in their final state when reduced motion is requested', () => {
    reducedMotion.current = true;
    render(<Hive />);

    const step = screen.getByText('Gemini 3.5 Flash High').closest('li');
    expect(step).not.toBeNull();
    expect(step!.style.opacity).toBe('');
    expect(step!.style.transform).toBe('');
    expect(screen.getByRole('heading', { name: 'Hive' })).toBeTruthy();
  });

  it('retains pipeline entrance motion when reduced motion is not requested', () => {
    render(<Hive />);

    const step = screen.getByText('Gemini 3.5 Flash High').closest('li');
    expect(step).not.toBeNull();
    expect(step!.style.opacity).toBe('0');
  });
});
