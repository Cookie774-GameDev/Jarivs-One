/**
 * Account Center top tabs — pure config for the profile page shell.
 */

export const ACCOUNT_TABS = [
  { id: 'profile', label: 'Profile', description: 'Sign in and local identity' },
  { id: 'usage', label: 'Usage', description: 'Shared company credit pool' },
  { id: 'billing', label: 'Billing', description: 'Plan and upgrades' },
  { id: 'pets', label: 'Pets', description: 'Desktop companion' },
  { id: 'support', label: 'Support', description: 'Help, docs, and device' },
] as const;

export type AccountTabId = (typeof ACCOUNT_TABS)[number]['id'];

export const DEFAULT_ACCOUNT_TAB: AccountTabId = 'profile';

export function isAccountTabId(value: string | null | undefined): value is AccountTabId {
  return ACCOUNT_TABS.some((tab) => tab.id === value);
}

export function resolveAccountTab(value: string | null | undefined): AccountTabId {
  // Legacy "more" tab content moved under Support.
  if (value === 'more') return 'support';
  return isAccountTabId(value) ? value : DEFAULT_ACCOUNT_TAB;
}
