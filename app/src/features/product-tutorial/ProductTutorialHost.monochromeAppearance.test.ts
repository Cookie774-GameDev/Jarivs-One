import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ProductTutorialHost.tsx'), 'utf8');

describe('ProductTutorialHost MonoChrome appearance', () => {
  it('flattens descendant paint and ambient motion in both host phases', () => {
    expect(source.match(/!\[background-image:none\]/g)).toHaveLength(2);
    expect(source.match(/!\[filter:none\]/g)).toHaveLength(2);
    expect(source.match(/!\[backdrop-filter:none\]/g)).toHaveLength(2);
    expect(source.match(/!shadow-none/g)).toHaveLength(2);
    expect(source.match(/!animate-none/g)).toHaveLength(2);
  });
});
