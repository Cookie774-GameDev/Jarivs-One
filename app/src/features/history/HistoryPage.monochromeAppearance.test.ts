import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const replaySource = readFileSync(resolve(__dirname, 'Replay.tsx'), 'utf8');
const listSource = readFileSync(resolve(__dirname, 'HistoryList.tsx'), 'utf8');

describe('History route MonoChrome appearance', () => {
  it('preserves the ordinary replay treatment while flattening MonoChrome decoration', () => {
    expect(replaySource).toContain(
      'linear-gradient(90deg, hsl(var(--terracotta)) 0%, hsl(var(--honey)) 100%)',
    );
    expect(replaySource).toContain('[html[data-theme=monochrome]_&]:![background-image:none]');
    expect(replaySource).toMatch(/shadow-soft[^"]*\[html\[data-theme=monochrome\]_&\]:shadow-none/);
    expect(listSource).toContain('[html[data-theme=monochrome]_&]:ring-0');
  });

  it('makes replay progress updates immediate only for reduced-motion users', () => {
    expect(replaySource).toContain('motion, useReducedMotion');
    expect(replaySource).toContain(
      "reducedMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }",
    );
  });
});
