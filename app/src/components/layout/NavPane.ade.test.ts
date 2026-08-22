import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('NavPane ChatGPT ADE entry', () => {
  it('registers the truthful first-class ADE navigation target', () => {
    const source = readFileSync('src/components/layout/NavPane.tsx', 'utf8');

    expect(source).toContain('label="ChatGPT ADE"');
    expect(source).toContain('target="ade"');
  });
});
