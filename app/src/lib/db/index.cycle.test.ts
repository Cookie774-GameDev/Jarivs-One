import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readDbSource = (name: string): string => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('database module graph', () => {
  it('keeps singleton consumers off the public barrel during module evaluation', () => {
    for (const file of ['repositories.ts', 'jarvisRepositories.ts', 'seed.ts']) {
      const source = readDbSource(file);
      expect(source, file).not.toMatch(/from ['"]\.\/index['"]/);
      expect(source, file).toMatch(/from ['"]\.\/database['"]/);
    }
  });

  it('keeps the public barrel as re-exports instead of initializing the singleton', () => {
    const source = readDbSource('index.ts');
    expect(source).toContain("export * from './database'");
    expect(source).not.toContain('export const db:');
    expect(source).not.toContain('class JarvisDexie');
  });
});
