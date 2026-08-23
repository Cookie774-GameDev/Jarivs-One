import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Ambient Music Studio integration', () => {
  it('mounts the studio launcher without replacing existing ambient controls', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/settings/sections/Ambient.tsx'),
      'utf8',
    );
    expect(source).toContain('Open Music Studio');
    expect(source).toContain('<MusicStudio');
    expect(source).toContain('ambient-always-play');
    expect(source).toContain('ambient-volume');
  });
});
