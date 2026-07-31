import type { Transition } from 'motion/react';

const DROPDOWN_VISIBLE = { opacity: 1, y: 0, scale: 1 } as const;
const DROPDOWN_HIDDEN = { opacity: 0, y: 4, scale: 0.98 } as const;

export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 500,
  damping: 30,
} as const) satisfies Transition;

export function resolveDropdownMotion(reducedMotion: boolean | null, themeTransition: Transition) {
  if (reducedMotion) {
    return {
      initial: false as const,
      animate: DROPDOWN_VISIBLE,
      exit: undefined,
      transition: themeTransition,
    };
  }
  return {
    initial: DROPDOWN_HIDDEN,
    animate: DROPDOWN_VISIBLE,
    exit: DROPDOWN_HIDDEN,
    transition: themeTransition,
  };
}
