import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => reducedMotion.current,
  };
});

import { ProductTutorialOffer } from './ProductTutorialOffer';

describe('ProductTutorialOffer reduced-motion behavior', () => {
  beforeEach(() => {
    reducedMotion.current = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders highlight rows in their final state when reduced motion is requested', () => {
    reducedMotion.current = true;
    render(<ProductTutorialOffer onStart={vi.fn()} onSkip={vi.fn()} />);

    for (const row of screen.getAllByRole('listitem')) {
      expect(row.style.opacity).toBe('');
      expect(row.style.transform).toBe('');
    }
  });

  it('retains highlight entrance motion when reduced motion is not requested', () => {
    render(<ProductTutorialOffer onStart={vi.fn()} onSkip={vi.fn()} />);

    const firstRow = screen.getAllByRole('listitem')[0];
    expect(firstRow.style.opacity).toBe('0');
    expect(firstRow.style.transform).toContain('translateX(-8px)');
  });
});
