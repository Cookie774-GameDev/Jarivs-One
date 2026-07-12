import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TABS,
  DEFAULT_ACCOUNT_TAB,
  isAccountTabId,
  resolveAccountTab,
} from './accountTabs';

describe('accountTabs', () => {
  it('includes profile, usage, billing, support, and more', () => {
    expect(ACCOUNT_TABS.map((t) => t.id)).toEqual([
      'profile',
      'usage',
      'billing',
      'support',
      'more',
    ]);
  });

  it('resolves valid and invalid tab ids', () => {
    expect(isAccountTabId('usage')).toBe(true);
    expect(isAccountTabId('nope')).toBe(false);
    expect(resolveAccountTab('billing')).toBe('billing');
    expect(resolveAccountTab('')).toBe(DEFAULT_ACCOUNT_TAB);
    expect(resolveAccountTab(undefined)).toBe('profile');
  });
});
