import * as React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SakuraScene } from './SakuraScene';

describe('SakuraScene', () => {
  it('renders the local scalable scene as inert decorative content', () => {
    const rendered = render(<SakuraScene />);
    const scene = rendered.container.querySelector('[data-sakura-scene]');

    expect(scene?.tagName).toBe('IMG');
    expect(scene?.getAttribute('src')).toMatch(/sakura-scene\.svg/);
    expect(scene?.getAttribute('alt')).toBe('');
    expect(scene?.getAttribute('aria-hidden')).toBe('true');
    expect(scene?.getAttribute('draggable')).toBe('false');
    expect(scene?.getAttribute('class')).toContain('h-full');
    expect(scene?.getAttribute('class')).toContain('w-full');
    expect(scene?.getAttribute('class')).toContain('object-cover');
  });
});
