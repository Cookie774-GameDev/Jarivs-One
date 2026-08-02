import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFullscreenStore } from './fullscreenStore';
import { FocusModeExit } from './FocusModeExit';

describe('FocusModeExit', () => {
  beforeEach(() => {
    useFullscreenStore.setState({
      focusActive: false,
      activationOrder: [],
      error: null,
    });
  });

  it('is absent outside Focus Mode', () => {
    render(<FocusModeExit />);
    expect(screen.queryByRole('button', { name: 'Exit Focus Mode' })).toBeNull();
  });

  it('provides a keyboard-focusable pointer exit without reserving layout space', () => {
    useFullscreenStore.getState().setFocusActive(true);
    render(<FocusModeExit />);

    const exit = screen.getByRole('button', { name: 'Exit Focus Mode' });
    expect(exit.tabIndex).toBe(0);
    expect(exit.getAttribute('data-focus-mode-exit')).toBe('true');

    fireEvent.click(exit);
    expect(useFullscreenStore.getState().focusActive).toBe(false);
  });
});
