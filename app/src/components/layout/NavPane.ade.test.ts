import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('NavPane ChatGPT ADE entry', () => {
  it('does not expose the removed standalone ADE page', () => {
    const source = readFileSync('src/components/layout/NavPane.tsx', 'utf8');
    expect(source).not.toContain('label="ChatGPT ADE"');
    expect(source).not.toContain('target="ade"');
  });
});
