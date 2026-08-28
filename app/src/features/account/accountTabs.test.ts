import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TABS,
  DEFAULT_ACCOUNT_TAB,
  isAccountTabId,
  resolveAccountTab,
  resolveAccountTabFromSearch,
} from './accountTabs';

describe('accountTabs', () => {
  it('includes profile, status, billing, pets, and support (no more)', () => {
    expect(ACCOUNT_TABS.map((t) => t.id)).toEqual([
      'profile',
      'status',
      'billing',
      'pets',
      'support',
    ]);
  });

  it('resolves valid and invalid tab ids', () => {
    expect(isAccountTabId('status')).toBe(true);
    expect(isAccountTabId('pets')).toBe(true);
    expect(isAccountTabId('more')).toBe(false);
    expect(isAccountTabId('nope')).toBe(false);
    expect(resolveAccountTab('billing')).toBe('billing');
    expect(resolveAccountTab('pets')).toBe('pets');
    expect(resolveAccountTab('more')).toBe('support');
    expect(resolveAccountTab('')).toBe(DEFAULT_ACCOUNT_TAB);
    expect(resolveAccountTab(undefined)).toBe('profile');
  });

  it('resolves the initial product tab from an exact URL query', () => {
    expect(resolveAccountTabFromSearch('?tab=status')).toBe('status');
    expect(resolveAccountTabFromSearch('?tab=usage')).toBe('status');
    expect(resolveAccountTabFromSearch('?source=navigation&tab=billing')).toBe('billing');
    expect(resolveAccountTabFromSearch('?tab=more')).toBe('support');
    expect(resolveAccountTabFromSearch('?tab=unknown')).toBe('profile');
    expect(resolveAccountTabFromSearch('')).toBe('profile');
  });
});
