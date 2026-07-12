import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TABS,
  DEFAULT_ACCOUNT_TAB,
  isAccountTabId,
  resolveAccountTab,
} from './accountTabs';

describe('accountTabs', () => {
  it('includes profile, usage, billing, pets, and support (no more)', () => {
    expect(ACCOUNT_TABS.map((t) => t.id)).toEqual([
      'profile',
      'usage',
      'billing',
      'pets',
      'support',
    ]);
  });

  it('resolves valid and invalid tab ids', () => {
    expect(isAccountTabId('usage')).toBe(true);
    expect(isAccountTabId('pets')).toBe(true);
    expect(isAccountTabId('more')).toBe(false);
    expect(isAccountTabId('nope')).toBe(false);
    expect(resolveAccountTab('billing')).toBe('billing');
    expect(resolveAccountTab('pets')).toBe('pets');
    expect(resolveAccountTab('more')).toBe('support');
    expect(resolveAccountTab('')).toBe(DEFAULT_ACCOUNT_TAB);
    expect(resolveAccountTab(undefined)).toBe('profile');
  });
});
