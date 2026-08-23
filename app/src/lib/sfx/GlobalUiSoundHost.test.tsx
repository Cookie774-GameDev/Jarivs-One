import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const playUiSound = vi.hoisted(() => vi.fn());
vi.mock('./playUiSound', () => ({ playUiSound }));

import { GlobalUiSoundHost } from './GlobalUiSoundHost';

describe('GlobalUiSoundHost', () => {
  afterEach(() => {
    cleanup();
    playUiSound.mockReset();
  });

  it('plays one click cue for mouse activation of buttons, button roles, and links', () => {
    const { getByRole } = render(
      <>
        <GlobalUiSoundHost />
        <button type="button">Save</button>
        <div role="button" tabIndex={0}>
          Open
        </div>
        <a href="#details">Details</a>
      </>,
    );

    fireEvent.pointerUp(getByRole('button', { name: 'Save' }), { button: 0 });
    fireEvent.pointerUp(getByRole('button', { name: 'Open' }), { button: 0 });
    fireEvent.pointerUp(getByRole('link', { name: 'Details' }), { button: 0 });
    expect(playUiSound).toHaveBeenCalledTimes(3);
    expect(playUiSound).toHaveBeenNthCalledWith(1, 'ui_select');
  });

  it('ignores disabled, opted-out, switch, non-primary, and non-interactive targets', () => {
    const { getByRole, getByText } = render(
      <>
        <GlobalUiSoundHost />
        <button type="button" disabled>
          Disabled
        </button>
        <button type="button" data-ui-sound="none">
          Silent
        </button>
        <button type="button" role="switch">
          Toggle
        </button>
        <div>Plain</div>
      </>,
    );

    fireEvent.pointerUp(getByRole('button', { name: 'Disabled' }), { button: 0 });
    fireEvent.pointerUp(getByRole('button', { name: 'Silent' }), { button: 0 });
    fireEvent.pointerUp(getByRole('switch', { name: 'Toggle' }), { button: 0 });
    fireEvent.pointerUp(getByText('Plain'), { button: 0 });
    fireEvent.pointerUp(getByRole('button', { name: 'Silent' }), { button: 2 });
    expect(playUiSound).not.toHaveBeenCalled();
  });
});
