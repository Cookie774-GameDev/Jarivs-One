import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MONO_SHADOW_NONE = '[html[data-theme=monochrome]_&]:shadow-none';
const MONO_RING_NONE = '[html[data-theme=monochrome]_&]:ring-0';
const MONO_MUTED_TEXT = '[html[data-theme=monochrome]_&]:text-muted-foreground';

function readComponent(name: string): string {
  return readFileSync(resolve(__dirname, `${name}.tsx`), 'utf8');
}

function countOccurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe('MonoChrome shell overlay appearance', () => {
  it('flattens Inspector effect owners without removing ordinary-theme elevation', () => {
    const source = readComponent('Inspector');

    expect(source).toContain(`shadow-lg ${MONO_SHADOW_NONE}`);
    expect(countOccurrences(source, `shadow-soft ${MONO_SHADOW_NONE}`)).toBe(3);
    expect(source).toContain(`ring-1 ring-accent-copper/35 ${MONO_RING_NONE}`);
    expect(source).toContain('shadow-lg');
    expect(source).toContain('shadow-soft');
    expect(source).toContain('ring-1 ring-accent-copper/35');
  });

  it('keeps NavPane state contrast while removing MonoChrome-only painted rings', () => {
    const source = readComponent('NavPane');

    expect(source).toContain(`ring-1 ring-accent-copper/40 ${MONO_RING_NONE}`);
    expect(countOccurrences(source, MONO_MUTED_TEXT)).toBeGreaterThanOrEqual(4);
    expect(source).toContain('opacity-70 shrink-0 [html[data-theme=monochrome]_&]:opacity-100');
    expect(source).toContain(
      'group-hover:opacity-70 [html[data-theme=monochrome]_&]:group-hover:opacity-100',
    );
    expect(source).toContain('ring-1 ring-accent-copper/40');
    expect(source).toContain('text-muted-foreground/70');
    expect(source).toContain('text-muted-foreground/60');
  });

  it('flattens and freezes PageRouter fallbacks only under MonoChrome', () => {
    const source = readComponent('PageRouter');

    expect(countOccurrences(source, MONO_SHADOW_NONE)).toBe(2);
    expect(source).toContain('animate-breathe [html[data-theme=monochrome]_&]:animate-none');
    expect(source).toContain('shadow-soft');
    expect(source).toContain('animate-breathe');
  });
});
