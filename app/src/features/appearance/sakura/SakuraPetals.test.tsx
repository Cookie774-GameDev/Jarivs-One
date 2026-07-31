import * as React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SAKURA_PETAL_COUNT, SakuraPetals } from './SakuraPetals';

describe('SakuraPetals', () => {
  it('renders a stable bounded field without JS animation work', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    const interval = vi.spyOn(window, 'setInterval');
    const rendered = render(<SakuraPetals paused={false} />);
    const petals = rendered.container.querySelectorAll('[data-sakura-petal]');

    expect(SAKURA_PETAL_COUNT).toBe(8);
    expect(petals).toHaveLength(8);
    expect(Array.from(petals, (petal) => petal.getAttribute('data-sakura-petal'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });

  it('pauses as state and removes the field entirely for static rendering', () => {
    const rendered = render(<SakuraPetals paused />);
    expect(rendered.container.firstElementChild?.getAttribute('data-sakura-paused')).toBe('true');

    rendered.rerender(<SakuraPetals paused={false} staticMode />);
    expect(rendered.container.firstElementChild).toBeNull();
  });
});
