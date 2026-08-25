import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { playComposerKeySound, playUiSound } = vi.hoisted(() => ({
  playComposerKeySound: vi.fn(),
  playUiSound: vi.fn(),
}));
vi.mock('./playUiSound', () => ({ playComposerKeySound, playUiSound }));

import { GlobalUiSoundHost, resolveGlobalTextEntryTarget } from './GlobalUiSoundHost';

describe('GlobalUiSoundHost', () => {
  afterEach(() => {
    cleanup();
    playComposerKeySound.mockReset();
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

  it('reuses the Chat typing cue for text inputs, textareas, and editable UI', () => {
    const { getByLabelText, getByRole } = render(
      <>
        <GlobalUiSoundHost />
        <input aria-label="Name" />
        <textarea aria-label="Notes" />
        <div role="textbox" aria-label="Editor" contentEditable suppressContentEditableWarning>
          Draft
        </div>
      </>,
    );

    fireEvent.keyDown(getByLabelText('Name'), { key: 'n' });
    fireEvent.keyDown(getByLabelText('Notes'), { key: 'o' });
    fireEvent.keyDown(getByRole('textbox', { name: 'Editor' }), { key: 'p' });

    expect(playComposerKeySound).toHaveBeenCalledTimes(3);
    expect(playComposerKeySound.mock.calls.map(([event]) => event.key)).toEqual(['n', 'o', 'p']);
  });

  it('does not make typing noise for non-text UI or unavailable text fields', () => {
    const { getByLabelText, getByRole, getByText } = render(
      <>
        <GlobalUiSoundHost />
        <div>Canvas</div>
        <button type="button">Action</button>
        <input aria-label="Disabled" disabled />
        <input aria-label="Read only" readOnly />
        <input aria-label="Checkbox" type="checkbox" />
        <div role="textbox" aria-label="ARIA read only" aria-readonly="true" tabIndex={0} />
        <div data-ui-sound="none">
          <textarea aria-label="Silent editor" />
        </div>
      </>,
    );

    fireEvent.keyDown(getByText('Canvas'), { key: 'a' });
    fireEvent.keyDown(getByRole('button', { name: 'Action' }), { key: 'a' });
    fireEvent.keyDown(getByLabelText('Disabled'), { key: 'a' });
    fireEvent.keyDown(getByLabelText('Read only'), { key: 'a' });
    fireEvent.keyDown(getByLabelText('Checkbox'), { key: 'a' });
    fireEvent.keyDown(getByRole('textbox', { name: 'ARIA read only' }), { key: 'a' });
    fireEvent.keyDown(getByLabelText('Silent editor'), { key: 'a' });

    expect(playComposerKeySound).not.toHaveBeenCalled();
  });

  it('resolves nested contenteditable targets to their editable host', () => {
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    host.append(child);
    document.body.append(host);

    expect(resolveGlobalTextEntryTarget(child)).toBe(host);
    host.remove();
  });
});
