import { describe, expect, it } from 'vitest';
import { buildUserIdentityContextBlock } from './userIdentity';

describe('buildUserIdentityContextBlock', () => {
  it('returns empty when no display name is set', () => {
    expect(buildUserIdentityContextBlock('')).toBe('');
    expect(buildUserIdentityContextBlock('   ')).toBe('');
    expect(buildUserIdentityContextBlock(null)).toBe('');
    expect(buildUserIdentityContextBlock(undefined)).toBe('');
  });

  it('injects the settings display name for Jarvis', () => {
    const block = buildUserIdentityContextBlock('Viper');
    expect(block).toContain('User identity');
    expect(block).toContain('**Viper**');
    expect(block).toContain('preferred name');
  });

  it('truncates extremely long names', () => {
    const long = 'A'.repeat(200);
    const block = buildUserIdentityContextBlock(long);
    expect(block).toContain('**' + 'A'.repeat(80) + '**');
    expect(block).not.toContain('A'.repeat(81));
  });
});
