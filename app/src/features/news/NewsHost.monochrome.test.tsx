import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { NewsHost } from './NewsHost';

/**
 * MonoChrome closure for the News host wrapper (overlay:news-host).
 *
 * The host owns a blanket descendant shadow reset that flattens every painted
 * shadow inside the panel (shadow-2xl sheet, shadow-lg play overlay, shadow-soft
 * cards) under html[data-theme=monochrome] only. This locks that behavior and
 * confirms the panel still mounts inside the themed surface.
 */
describe('NewsHost MonoChrome closure', () => {
  const initialUiState = useUIStore.getState();

  afterEach(() => {
    cleanup();
    act(() => useUIStore.setState(initialUiState));
  });

  it('applies a monochrome-only blanket shadow reset to the news-host surface', () => {
    act(() => {
      useUIStore.setState({ newsPanelOpen: true });
    });
    const { container } = render(<NewsHost runtimeEffectsEnabled={false} />);

    const surface = container.querySelector('[data-monochrome-surface="news-host"]');
    expect(surface).not.toBeNull();
    expect(surface!.className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    // The panel still mounts inside the themed surface.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
