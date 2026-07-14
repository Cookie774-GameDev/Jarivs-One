import { describe, expect, it } from 'vitest';
import { parseThemeSyncMessage } from './themeSync';

describe('theme cross-window messages', () => {
  it('accepts only the four public theme ids', () => {
    expect(parseThemeSyncMessage({ kind: 'theme', theme: 'vibespace' })).toBe('vibespace');
    expect(parseThemeSyncMessage({ kind: 'theme', theme: 'default' })).toBe('default');
    expect(parseThemeSyncMessage({ kind: 'theme', theme: 'dark' })).toBeNull();
    expect(parseThemeSyncMessage({ kind: 'theme', theme: 'unknown' })).toBeNull();
  });

  it('rejects malformed and unrelated messages', () => {
    expect(parseThemeSyncMessage(null)).toBeNull();
    expect(parseThemeSyncMessage({ kind: 'voice', theme: 'vibespace' })).toBeNull();
    expect(parseThemeSyncMessage({ kind: 'theme' })).toBeNull();
  });
});
