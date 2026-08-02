import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'KanbanPage.tsx'), 'utf8');

describe('Kanban route MonoChrome appearance', () => {
  it('retains ordinary accents while flattening MonoChrome gradients and elevation', () => {
    expect(source).toContain(
      'bg-gradient-to-r from-transparent via-accent-copper/60 to-transparent',
    );
    expect(source).toContain('[html[data-theme=monochrome]_&]:bg-none');
    expect(source).toMatch(
      /bg-paper shadow-soft[^"]*\[html\[data-theme=monochrome\]_&\]:shadow-none/,
    );
    expect(source).toMatch(
      /shadow-\[0_0_24px_rgba\(217,119,87,0\.22\)\][^`]*\[html\[data-theme=monochrome\]_&\]:shadow-none/,
    );
  });

  it('removes celebration and row exit animation only under reduced motion', () => {
    expect(source).toMatch(/exit=\{\s*reducedMotion\s*\?\s*undefined/);
    expect(source).toContain('initial={reducedMotion ? false : { opacity: 0.7, scale: 0.96 }}');
    expect(source).toContain('transition={reducedMotion ? undefined : { duration: 0.85 }}');
  });
});
