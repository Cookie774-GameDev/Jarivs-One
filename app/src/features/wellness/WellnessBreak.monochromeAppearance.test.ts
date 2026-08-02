import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'WellnessBreak.tsx'), 'utf8');

describe('WellnessBreak MonoChrome appearance', () => {
  it('retains ordinary ambience while flattening MonoChrome paint and motion', () => {
    expect(source).toContain('radial-gradient(circle at 30% 30%');
    expect(source).toContain('[html[data-theme=monochrome]_&]:![background-image:none]');
    expect(source).toContain('[html[data-theme=monochrome]_&]:![filter:none]');
    expect(source).toContain('animate-breathe');
    expect(source).toContain('[html[data-theme=monochrome]_&]:animate-none');
  });

  it('raises low-opacity secondary copy to the full muted token in MonoChrome', () => {
    expect(source.match(/\[html\[data-theme=monochrome\]_&\]:text-muted-foreground/g)).toHaveLength(
      4,
    );
  });
});
