import { describe, expect, it, vi } from 'vitest';
import {
  PET_PANEL_HEADER_COLLAPSED_KEY,
  loadPetPanelHeaderCollapsed,
  petPanelDensityForSize,
  savePetPanelHeaderCollapsed,
} from './petPanelPreferences';

describe('Pet panel preferences', () => {
  it('loads and saves the collapsed header without requiring writable storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(loadPetPanelHeaderCollapsed(storage)).toBe(false);
    savePetPanelHeaderCollapsed(true, storage);
    expect(values.get(PET_PANEL_HEADER_COLLAPSED_KEY)).toBe('1');
    expect(loadPetPanelHeaderCollapsed(storage)).toBe(true);

    expect(() =>
      savePetPanelHeaderCollapsed(true, {
        setItem: vi.fn(() => {
          throw new Error('blocked');
        }),
      }),
    ).not.toThrow();
    expect(
      loadPetPanelHeaderCollapsed({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });

  it('selects comfortable, compact, and minimum modes from both dimensions', () => {
    expect(petPanelDensityForSize(700, 700)).toBe('comfortable');
    expect(petPanelDensityForSize(460, 700)).toBe('compact');
    expect(petPanelDensityForSize(700, 500)).toBe('compact');
    expect(petPanelDensityForSize(360, 700)).toBe('minimum');
    expect(petPanelDensityForSize(700, 400)).toBe('minimum');
  });
});
