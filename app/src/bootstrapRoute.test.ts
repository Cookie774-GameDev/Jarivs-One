import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('auxiliary Pet bootstrap routing', () => {
  it('boots Pet windows without importing the full workspace application', () => {
    const sourceRoot = resolve(__dirname);
    const mainSource = readFileSync(resolve(sourceRoot, 'main.tsx'), 'utf8');
    const petBootstrapPath = resolve(sourceRoot, 'bootstrapPet.tsx');

    expect(mainSource).toContain("viewParam === 'pet-overlay' || viewParam === 'pet-mini-panel'");
    expect(mainSource).toContain("import('./bootstrapPet')");
    expect(existsSync(petBootstrapPath)).toBe(true);

    const petBootstrapSource = readFileSync(petBootstrapPath, 'utf8');
    expect(petBootstrapSource).toContain("from './features/pets/PetOverlayWindow'");
    expect(petBootstrapSource).toContain("from './features/pets/PetMiniPanelWindow'");
    expect(petBootstrapSource).not.toContain('data-pet-bootstrap-fallback');
    expect(petBootstrapSource).not.toContain("from './App'");
    expect(petBootstrapSource).not.toContain("import('./bootstrapApp')");
  });
});
