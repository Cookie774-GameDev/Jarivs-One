import { describe, expect, it } from 'vitest';
import { FOUNDRY_MODEL_CATALOG, modelCompatibility } from './modelRegistry';

describe('Foundry model catalog', () => {
  it('pins every downloadable model to safetensors, an immutable revision, and SHA-256', () => {
    const downloads = FOUNDRY_MODEL_CATALOG.filter((model) => model.kind === 'downloadable');
    expect(downloads.length).toBeGreaterThan(0);
    for (const model of downloads) {
      expect(model.format).toBe('safetensors');
      expect(model.remoteCode).toBe(false);
      expect(model.revision).toMatch(/^[a-f0-9]{40}$/);
      expect(model.download?.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(model.download?.url).toContain(`/resolve/${model.revision}/`);
    }
  });

  it('reports fixture compatibility without inventing native memory data', () => {
    expect(modelCompatibility(FOUNDRY_MODEL_CATALOG[0], null)).toBe('compatible');
    expect(modelCompatibility(FOUNDRY_MODEL_CATALOG[1], null)).toBe('unknown');
  });
});
