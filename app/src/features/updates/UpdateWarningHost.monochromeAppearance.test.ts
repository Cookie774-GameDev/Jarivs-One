import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'UpdateWarningHost.tsx'), 'utf8');

describe('UpdateWarningHost MonoChrome appearance', () => {
  it('keeps ordinary elevation and alerts while flattening MonoChrome paint and motion', () => {
    expect(source.match(/shadow-lg/g)).toHaveLength(2);
    expect(source.match(/\[html\[data-theme=monochrome\]_&\]:shadow-none/g)).toHaveLength(2);
    expect(source).toContain(
      'animate-spin rounded-full border-4 border-accent-cyan/30 border-t-accent-cyan',
    );
    expect(source).toContain('[html[data-theme=monochrome]_&]:animate-none');
    expect(source).toContain('text-accent-amber [html[data-theme=monochrome]_&]:text-foreground');
    expect(source).toContain('text-accent-cyan [html[data-theme=monochrome]_&]:text-foreground');
  });
});
