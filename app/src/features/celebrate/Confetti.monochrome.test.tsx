import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MONO_CANVAS_HIDDEN = '[html[data-theme=monochrome]_&>canvas]:hidden';

function readSource(name: string): string {
  return readFileSync(resolve(__dirname, name), 'utf8');
}

describe('Celebration (Confetti) MonoChrome appearance', () => {
  it('marks the celebration-host surface and hides the confetti canvas beneath the MonoChrome gate only', () => {
    const host = readSource('index.ts');

    // The host is the named overlay surface.
    expect(host).toContain("'data-monochrome-surface': 'celebration-host'");
    // Ordinary themes keep the canvas mounted (`contents`); MonoChrome hides it so
    // no colorful confetti particles render in the flat skin.
    expect(host).toContain(`contents ${MONO_CANVAS_HIDDEN}`);
    // The visual-test deny branch preserves a non-interactive fullscreen mount.
    expect(host).toContain('pointer-events-none fixed inset-0');
  });

  it('preserves reduced-motion and runtime-effect behavior (no functional regression)', () => {
    const confetti = readSource('Confetti.tsx');
    const host = readSource('index.ts');

    expect(confetti).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(confetti).toContain('runtimeEffectsEnabled');
    expect(host).toContain('runtimeEffectsEnabled');
  });
});
