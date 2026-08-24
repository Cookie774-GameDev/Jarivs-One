import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetHotkeyBindingsForTests } from '@/lib/hotkeys';
import { Hotkeys } from './Hotkeys';

describe('Settings undo and redo commands', () => {
  beforeEach(() => {
    __resetHotkeyBindingsForTests();
    window.localStorage.removeItem('jarvis-hotkeys-v1');
  });

  afterEach(() => {
    cleanup();
    __resetHotkeyBindingsForTests();
  });

  it('lists standard and requested aliases without adding app chrome', () => {
    render(<Hotkeys />);

    expect(screen.getByText('Undo', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Undo outside text fields (Cut inside text fields)')).toBeTruthy();
    expect(screen.getByText('Redo', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Redo (alternate)')).toBeTruthy();
    expect(screen.getByLabelText(/Change shortcut for Undo, currently/i)).toBeTruthy();
    expect(
      screen.getByLabelText(/Change shortcut for Undo outside text fields .* currently/i),
    ).toBeTruthy();
  });
});
