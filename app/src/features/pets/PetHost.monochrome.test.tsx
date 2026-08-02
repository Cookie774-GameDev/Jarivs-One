import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MONO_SHADOW_NONE = '[html[data-theme=monochrome]_&_*]:shadow-none';

function readSource(): string {
  return readFileSync(resolve(__dirname, 'PetHost.tsx'), 'utf8');
}

function countOccurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe('PetHost MonoChrome appearance', () => {
  it('marks the pet-host surface and flattens descendant painted shadows beneath the MonoChrome gate only', () => {
    const source = readSource();

    expect(source).toContain('data-monochrome-surface="pet-host"');
    // Both the ordinary and the visual-test-deny branches keep the MonoChrome
    // descendant shadow flattening so no painted shadow survives in the flat skin.
    expect(countOccurrences(source, MONO_SHADOW_NONE)).toBe(2);
  });

  it('preserves the transparent pet renderer boundary and runtime-effect plumbing', () => {
    const source = readSource();

    // MC-010: the pet sprite renderer stays transparent (alpha 0) from first paint.
    expect(source).toContain('data-pet-renderer-bg-alpha="0"');
    expect(source).toContain('runtimeEffectsEnabled');
  });
});
