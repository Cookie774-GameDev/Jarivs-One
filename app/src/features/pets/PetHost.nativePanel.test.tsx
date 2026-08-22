import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(): string {
  return readFileSync(resolve(__dirname, 'PetHost.tsx'), 'utf8');
}

describe('PetHost native panel boundary', () => {
  it('never substitutes an inline Pet or panel while running in Tauri', () => {
    const source = readSource();

    expect(source).toContain('React.useState(() => isTauriRuntime())');
    expect(source).toContain('const showInlineSprite = showStandalone && !tauri;');
    expect(source).toContain('{!tauri && (');
    expect(source).not.toContain('(!tauri || useInlineFallback) &&');
  });

  it('clears a failed native panel request instead of selecting an inline fallback', () => {
    const source = readSource();

    expect(source).toContain('setUseInlineFallback(false);');
    expect(source).toContain('setHideSpriteForPanel(false);');
    expect(source).toContain('setPetPanelOpenFlag(false);');
  });
});
