import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('main entry split', () => {
  it('does not statically import App or theme CSS so the intro window stays light', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(source).toContain("viewParam === 'cold-start-intro'");
    expect(source).toContain("./bootstrapIntro");
    expect(source).toContain("./bootstrapApp");
    expect(source).not.toMatch(/from ['"]\.\/App['"]/);
    expect(source).not.toMatch(/@fontsource/);
    expect(source).not.toMatch(/styles\/vibespace-theme/);
  });
});
