import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUIStore } from '@/stores/ui';
import { PageRouter } from './PageRouter';

describe('PageRouter ChatGPT ADE route', () => {
  afterEach(() => {
    act(() => useUIStore.getState().resetUI());
  });

  it('renders the first-class ADE route with its truthful implementation state', async () => {
    act(() => useUIStore.getState().setRoute('ade'));

    render(<PageRouter />);

    expect(await screen.findByRole('heading', { name: 'ChatGPT ADE' })).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('data-ade-implementation-state')).toBe(
      'not-implemented',
    );
  });
});
