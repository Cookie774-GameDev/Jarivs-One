import { describe, expect, it } from 'vitest';
import { clampVoicePanelTranslation, shouldStartVoicePanelDrag } from './voicePanelDrag';

describe('voice panel drag geometry', () => {
  it('keeps the complete panel inside the viewport margin', () => {
    expect(
      clampVoicePanelTranslation({
        rect: { left: 300, top: 100, width: 200, height: 300 },
        current: { x: 50, y: 20 },
        requested: { x: 400, y: -200 },
        viewport: { width: 500, height: 400 },
      }),
    ).toEqual({ x: 42, y: -72 });
  });

  it('reclamps the current position when expansion makes the panel wider', () => {
    expect(
      clampVoicePanelTranslation({
        rect: { left: 500, top: 24, width: 420, height: 360 },
        current: { x: 160, y: 0 },
        requested: { x: 160, y: 0 },
        viewport: { width: 800, height: 700 },
      }),
    ).toEqual({ x: 32, y: 0 });
  });

  it('allows only primary-pointer drag from noninteractive panel chrome', () => {
    const chrome = document.createElement('div');
    const button = document.createElement('button');
    const icon = document.createElement('svg');
    const tab = document.createElement('span');
    tab.setAttribute('role', 'tab');
    const transcript = document.createElement('div');
    transcript.dataset.noPanelDrag = 'true';
    button.append(icon);

    expect(shouldStartVoicePanelDrag(0, chrome)).toBe(true);
    expect(shouldStartVoicePanelDrag(1, chrome)).toBe(false);
    expect(shouldStartVoicePanelDrag(0, icon)).toBe(false);
    expect(shouldStartVoicePanelDrag(0, tab)).toBe(false);
    expect(shouldStartVoicePanelDrag(0, transcript)).toBe(false);
  });
});
