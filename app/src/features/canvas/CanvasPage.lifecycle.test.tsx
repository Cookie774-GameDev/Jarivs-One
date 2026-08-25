import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { CanvasPage } from './CanvasPage';

afterEach(() => {
  cleanup();
  useUIStore.setState({ route: 'chat' });
});

describe('CanvasPage cached-route lifecycle', () => {
  it('detaches global Canvas shortcuts while its cached route is hidden and restores them on return', () => {
    useUIStore.setState({ route: 'chat' });
    render(
      <div data-canvas-route-cache>
        <CanvasPage />
      </div>,
    );

    const hiddenShortcut = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(hiddenShortcut);
    });
    expect(hiddenShortcut.defaultPrevented).toBe(false);

    act(() => {
      useUIStore.setState({ route: 'canvas' });
    });
    const visibleShortcut = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(visibleShortcut);
    });
    expect(visibleShortcut.defaultPrevented).toBe(true);
  });
});
