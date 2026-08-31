import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');

describe('App Jarvis ambient boundary', () => {
  it('routes the isolated overlay before ordinary product boot', () => {
    expect(source).toContain("view === 'jarvis-ambient-overlay'");
    expect(source).toContain('<JarvisAmbientOverlayView />');
    expect(source.indexOf("view === 'jarvis-ambient-overlay'")).toBeLessThan(
      source.indexOf("view === 'pet-overlay'"),
    );
  });

  it('keeps voice lifecycle mounted but removes the visible legacy panel', () => {
    expect(source).toContain('<JarvisAmbientHost />');
    expect(source).toContain('data-jarvis-voice-lifecycle-only="true"');
    expect(source).toContain('hidden');
  });
});
