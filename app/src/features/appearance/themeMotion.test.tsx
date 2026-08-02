import * as React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Transition } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motionPreference.reduced,
}));

import {
  REDUCED_THEME_MOTION_TRANSITION,
  SAKURA_THEME_MOTION_TRANSITION,
  resolveThemeLayoutTransition,
  resolveThemeMotionLayout,
  resolveThemeMotionTransition,
  useThemeLayoutTransition,
  useThemeMotionLayout,
  useThemeMotionTransition,
} from './themeMotion';

const LEGACY_SHELL_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 400,
  damping: 30,
} as const) satisfies Transition;

afterEach(() => {
  cleanup();
  motionPreference.reduced = false;
  useUIStore.getState().setTheme('default');
});

describe('theme Motion policy', () => {
  it.each(['jarvis', 'vibespace', 'default', 'monochrome'] as const)(
    'preserves the exact accepted %s transition object',
    (theme) => {
      expect(resolveThemeMotionTransition(theme, false, LEGACY_SHELL_TRANSITION)).toBe(
        LEGACY_SHELL_TRANSITION,
      );
    },
  );

  it('uses one calm bounded no-overshoot tween for Sakura', () => {
    expect(resolveThemeMotionTransition('sakura', false, LEGACY_SHELL_TRANSITION)).toBe(
      SAKURA_THEME_MOTION_TRANSITION,
    );
    expect(SAKURA_THEME_MOTION_TRANSITION).toEqual({
      type: 'tween',
      duration: 0.22,
      ease: [0.2, 0, 0, 1],
    });
    expect(Object.isFrozen(SAKURA_THEME_MOTION_TRANSITION)).toBe(true);
    expect(Object.isFrozen(SAKURA_THEME_MOTION_TRANSITION.ease)).toBe(true);
  });

  it('makes reduced motion zero-duration for every theme', () => {
    for (const theme of ['jarvis', 'vibespace', 'default', 'monochrome', 'sakura'] as const) {
      expect(resolveThemeMotionTransition(theme, true, LEGACY_SHELL_TRANSITION)).toBe(
        REDUCED_THEME_MOTION_TRANSITION,
      );
    }
    expect(REDUCED_THEME_MOTION_TRANSITION).toEqual({ duration: 0 });
    expect(Object.isFrozen(REDUCED_THEME_MOTION_TRANSITION)).toBe(true);
  });

  it('makes layout changes immediate for Sakura and reduced motion', () => {
    for (const theme of ['jarvis', 'vibespace', 'default', 'monochrome'] as const) {
      expect(resolveThemeMotionLayout(theme, false, 'position')).toBe('position');
      expect(resolveThemeLayoutTransition(theme, false, LEGACY_SHELL_TRANSITION)).toBe(
        LEGACY_SHELL_TRANSITION,
      );
    }

    expect(resolveThemeMotionLayout('sakura', false, 'position')).toBe(false);
    expect(resolveThemeLayoutTransition('sakura', false, LEGACY_SHELL_TRANSITION)).toBe(
      REDUCED_THEME_MOTION_TRANSITION,
    );
    expect(resolveThemeMotionLayout('default', true, 'size')).toBe(false);
    expect(resolveThemeLayoutTransition('default', true, LEGACY_SHELL_TRANSITION)).toBe(
      REDUCED_THEME_MOTION_TRANSITION,
    );
  });

  it('reacts to real theme state while preserving the caller legacy object', () => {
    useUIStore.getState().setTheme('default');
    const rendered = renderHook(() => useThemeMotionTransition(LEGACY_SHELL_TRANSITION));
    expect(rendered.result.current).toBe(LEGACY_SHELL_TRANSITION);

    act(() => useUIStore.getState().setTheme('sakura'));
    expect(rendered.result.current).toBe(SAKURA_THEME_MOTION_TRANSITION);

    motionPreference.reduced = true;
    rendered.rerender();
    expect(rendered.result.current).toBe(REDUCED_THEME_MOTION_TRANSITION);
  });

  it('reacts to real theme state for layout guards and transitions', () => {
    useUIStore.getState().setTheme('default');
    const rendered = renderHook(() => ({
      layout: useThemeMotionLayout('position'),
      transition: useThemeLayoutTransition(LEGACY_SHELL_TRANSITION),
    }));
    expect(rendered.result.current.layout).toBe('position');
    expect(rendered.result.current.transition).toBe(LEGACY_SHELL_TRANSITION);

    act(() => useUIStore.getState().setTheme('sakura'));
    expect(rendered.result.current.layout).toBe(false);
    expect(rendered.result.current.transition).toBe(REDUCED_THEME_MOTION_TRANSITION);
  });
});
