import { describe, expect, it } from 'vitest';
import { LEGACY_DROPDOWN_TRANSITION, resolveDropdownMotion } from './dropdownMotion';

describe('slash dropdown motion policy', () => {
  it('mounts and unmounts without animation when reduced motion is requested', () => {
    const reducedTransition = { duration: 0 };
    expect(resolveDropdownMotion(true, reducedTransition)).toEqual({
      initial: false,
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: undefined,
      transition: reducedTransition,
    });
  });

  it('retains the existing spring presentation for ordinary motion', () => {
    expect(resolveDropdownMotion(false, LEGACY_DROPDOWN_TRANSITION)).toEqual({
      initial: { opacity: 0, y: 4, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: 4, scale: 0.98 },
      transition: LEGACY_DROPDOWN_TRANSITION,
    });
  });
});
