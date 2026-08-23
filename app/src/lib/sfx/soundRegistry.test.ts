import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIBESPACE_SOUNDS } from './soundRegistry';

describe('SFX public assets', () => {
  it('ships every registry asset under app/public/audio/ui', () => {
    const root = resolve(process.cwd(), 'public');
    for (const spec of Object.values(VIBESPACE_SOUNDS)) {
      const relative = spec.src.replace(/^\//, '');
      expect(existsSync(resolve(root, relative)), spec.src).toBe(true);
    }
  });

  it('routes the supplied click, error, and completion cues to their production ids', () => {
    expect(VIBESPACE_SOUNDS.ui_select.src).toBe('/audio/ui/vibespace_button_click.mp3');
    expect(VIBESPACE_SOUNDS.system_critical.src).toBe('/audio/ui/vibespace_error.mp3');
    expect(VIBESPACE_SOUNDS.notification_complete.src).toBe('/audio/ui/vibespace_notification.mp3');
  });
});
