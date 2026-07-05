import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { JarvisContextMenu } from './JarvisContextMenu';

const requestComposerSttToggle = vi.fn();

vi.mock('@/features/composer-stt/composerSttService', () => ({
  requestComposerSttToggle: (...args: unknown[]) => requestComposerSttToggle(...args),
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      composerStt: true,
      setPaletteOpen: vi.fn(),
      toggleInspector: vi.fn(),
      setRoute: vi.fn(),
    }),
}));

describe('JarvisContextMenu', () => {
  afterEach(() => {
    delete document.body.dataset.jarvisSuppressContextMenuUntil;
    document.body.classList.remove('jarvis-terminal-right-dragging');
    document.body.classList.remove('jarvis-context-map-right-dragging');
    requestComposerSttToggle.mockClear();
  });

  it('does not open while a right-drag suppression window is active', () => {
    document.body.dataset.jarvisSuppressContextMenuUntil = String(Date.now() + 1000);
    render(<JarvisContextMenu />);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 32,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not open while terminal right-drag mode is active', () => {
    document.body.classList.add('jarvis-terminal-right-dragging');
    render(<JarvisContextMenu />);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 32,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not open while context-map right-drag mode is active', () => {
    document.body.classList.add('jarvis-context-map-right-dragging');
    render(<JarvisContextMenu />);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 32,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('suppresses the custom menu inside context-map interaction regions', () => {
    render(<JarvisContextMenu />);
    const region = document.createElement('div');
    region.dataset.jarvisSuppressContextMenu = 'true';
    document.body.appendChild(region);
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 32,
    });

    region.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    region.remove();
  });

  it('does not open for already prevented context-map events', () => {
    render(<JarvisContextMenu />);
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 32,
    });
    event.preventDefault();

    window.dispatchEvent(event);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers microphone instead of settings and starts dictation from a text field', () => {
    render(<JarvisContextMenu />);
    const field = document.createElement('textarea');
    field.id = 'agent-prompt';
    document.body.appendChild(field);
    field.focus();

    fireEvent.contextMenu(field, { clientX: 40, clientY: 48 });

    const voiceButton = screen.getByRole('menuitem', { name: /Microphone/i }) as HTMLButtonElement;
    expect(voiceButton.disabled).toBe(false);
    expect(screen.queryByRole('menuitem', { name: /Open Settings/i })).toBeNull();

    fireEvent.click(voiceButton);

    expect(requestComposerSttToggle).toHaveBeenCalledWith('context-menu');
    field.remove();
  });
});
