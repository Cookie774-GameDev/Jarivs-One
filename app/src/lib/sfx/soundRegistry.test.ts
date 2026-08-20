import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIBESPACE_SOUNDS } from './soundRegistry';

describe('SFX public assets', () => {
  it('ships every registry wav under app/public/audio/ui', () => {
    const root = resolve(process.cwd(), 'public');
    for (const spec of Object.values(VIBESPACE_SOUNDS)) {
      const relative = spec.src.replace(/^\//, '');
      expect(existsSync(resolve(root, relative)), spec.src).toBe(true);
    }
  });
});
