import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REDUCED_THEME_MOTION_TRANSITION,
  SAKURA_THEME_MOTION_TRANSITION,
} from '@/features/appearance/themeMotion';
import { useUIStore } from '@/stores/ui';

const motionState = vi.hoisted(() => ({
  reduced: false,
  records: [] as Array<{ layout: unknown; transition: unknown }>,
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  const ReactModule = await import('react');
  const components = new Map<PropertyKey, React.ComponentType<Record<string, unknown>>>();
  const motion = new Proxy(
    {},
    {
      get(_target, tag: PropertyKey) {
        const existing = components.get(tag);
        if (existing) return existing;
        const component = (props: Record<string, unknown>) => {
          const {
            animate: _animate,
            exit: _exit,
            initial: _initial,
            layout,
            transition,
            variants: _variants,
            whileHover: _whileHover,
            whileTap: _whileTap,
            ...domProps
          } = props;
          motionState.records.push({ layout, transition });
          return ReactModule.createElement(String(tag), domProps);
        };
        components.set(tag, component);
        return component;
      },
    },
  );

  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion,
    useReducedMotion: () => motionState.reduced,
  };
});

import { ProductTutorialTour } from './ProductTutorialTour';

function renderTour() {
  return render(<ProductTutorialTour onDone={() => undefined} onSkip={() => undefined} />);
}

function explicitTransitions() {
  return motionState.records
    .map(({ transition }) => transition)
    .filter((transition) => transition !== undefined);
}

beforeEach(() => {
  motionState.reduced = false;
  motionState.records = [];
  useUIStore.getState().setTheme('default');
});

afterEach(() => {
  cleanup();
  useUIStore.getState().setTheme('default');
});

describe('product tutorial Sakura Motion integration', () => {
  it('preserves one frozen legacy object for every prior theme and keeps layout animation intact', () => {
    renderTour();
    const legacyTransition = explicitTransitions()[0];

    expect(legacyTransition).toEqual({
      type: 'spring',
      stiffness: 380,
      damping: 32,
      mass: 0.75,
    });
    expect(Object.isFrozen(legacyTransition)).toBe(true);
    expect(motionState.records.filter(({ layout }) => layout === true)).toHaveLength(5);

    for (const theme of ['jarvis', 'vibespace', 'default', 'monochrome'] as const) {
      motionState.records = [];
      act(() => useUIStore.getState().setTheme(theme));
      expect(explicitTransitions()).toContain(legacyTransition);
      expect(motionState.records.filter(({ layout }) => layout === true)).toHaveLength(5);
    }
  });

  it('uses the shared Sakura tween and disables layout animation for Sakura and reduced motion', () => {
    useUIStore.getState().setTheme('sakura');
    const rendered = renderTour();

    expect(explicitTransitions()).toContain(SAKURA_THEME_MOTION_TRANSITION);
    expect(motionState.records.filter(({ layout }) => layout === false)).toHaveLength(5);

    motionState.records = [];
    motionState.reduced = true;
    rendered.rerender(<ProductTutorialTour onDone={() => undefined} onSkip={() => undefined} />);

    expect(explicitTransitions()).toContain(REDUCED_THEME_MOTION_TRANSITION);
    expect(motionState.records.filter(({ layout }) => layout === false)).toHaveLength(5);
  });
});
