import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ProjectDetail.tsx'), 'utf8');

describe('ProjectDetail MonoChrome appearance', () => {
  it('removes the ordinary empty-state paper gradient only under MonoChrome', () => {
    expect(source).toContain(
      'bg-paper-warm p-8 [html[data-theme=monochrome]_&]:bg-background [html[data-theme=monochrome]_&]:bg-none',
    );
    expect(source).toContain('bg-paper-warm');
  });
});
