import { describe, expect, it } from 'vitest';
import { canonicalSiyuanAuthorityRoot } from './siyuanPathAuthority';

describe('SiYuan path authority', () => {
  it('normalizes drive-letter and UNC roots case-insensitively on Windows', () => {
    expect(canonicalSiyuanAuthorityRoot('C:\\Users\\Viper\\')).toBe('c:/users/viper');
    expect(canonicalSiyuanAuthorityRoot('\\\\Server\\Share\\Folder')).toBe(
      canonicalSiyuanAuthorityRoot('//server/share/folder'),
    );
  });

  it('treats picker verbatim drive roots and the legacy malformed scanner root as the same drive authority', () => {
    expect(canonicalSiyuanAuthorityRoot('\\\\?\\C:\\Users\\Viper\\Projects')).toBe(
      'c:/users/viper/projects',
    );
    expect(canonicalSiyuanAuthorityRoot('/?/C:/Users/Viper/Projects')).toBe(
      'c:/users/viper/projects',
    );
    expect(canonicalSiyuanAuthorityRoot('\\\\.\\C:\\Users\\Viper\\Projects')).not.toBe(
      'c:/users/viper/projects',
    );
  });

  it('preserves case sensitivity for non-Windows roots', () => {
    expect(canonicalSiyuanAuthorityRoot('/Users/Viper')).not.toBe(
      canonicalSiyuanAuthorityRoot('/users/viper'),
    );
  });
});
