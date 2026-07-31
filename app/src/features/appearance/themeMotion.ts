import { useReducedMotion, type MotionProps, type Transition } from 'motion/react';
import { useUIStore } from '@/stores/ui';
import type { SelectableTheme } from './themeContract';

const SAKURA_THEME_MOTION_EASE = Object.freeze([0.2, 0, 0, 1] as const);

export const SAKURA_THEME_MOTION_TRANSITION = Object.freeze({
  type: 'tween',
  duration: 0.22,
  ease: SAKURA_THEME_MOTION_EASE,
} as const) satisfies Transition;

export const REDUCED_THEME_MOTION_TRANSITION = Object.freeze({
  duration: 0,
} as const) satisfies Transition;

export function resolveThemeMotionTransition(
  theme: SelectableTheme,
  reducedMotion: boolean,
  legacyTransition: Transition,
): Transition {
  if (reducedMotion) return REDUCED_THEME_MOTION_TRANSITION;
  if (theme === 'sakura') return SAKURA_THEME_MOTION_TRANSITION;
  return legacyTransition;
}

export function resolveThemeLayoutTransition(
  theme: SelectableTheme,
  reducedMotion: boolean,
  legacyTransition: Transition,
): Transition {
  if (reducedMotion || theme === 'sakura') return REDUCED_THEME_MOTION_TRANSITION;
  return legacyTransition;
}

export function resolveThemeMotionLayout<T extends MotionProps['layout']>(
  theme: SelectableTheme,
  reducedMotion: boolean,
  legacyLayout: T,
): T | false {
  if (reducedMotion || theme === 'sakura') return false;
  return legacyLayout;
}

export function useThemeMotionTransition(legacyTransition: Transition): Transition {
  const theme = useUIStore((state) => state.theme);
  const reducedMotion = Boolean(useReducedMotion());

  return resolveThemeMotionTransition(theme, reducedMotion, legacyTransition);
}

export function useThemeLayoutTransition(legacyTransition: Transition): Transition {
  const theme = useUIStore((state) => state.theme);
  const reducedMotion = Boolean(useReducedMotion());

  return resolveThemeLayoutTransition(theme, reducedMotion, legacyTransition);
}

export function useThemeMotionLayout<T extends MotionProps['layout']>(legacyLayout: T): T | false {
  const theme = useUIStore((state) => state.theme);
  const reducedMotion = Boolean(useReducedMotion());

  return resolveThemeMotionLayout(theme, reducedMotion, legacyLayout);
}
