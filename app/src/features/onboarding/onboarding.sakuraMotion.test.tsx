import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REDUCED_THEME_MOTION_TRANSITION,
  SAKURA_THEME_MOTION_TRANSITION,
} from '@/features/appearance/themeMotion';
import { useUIStore } from '@/stores/ui';

const motionState = vi.hoisted(() => ({
  reduced: false,
  transitions: [] as unknown[],
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
            layout: _layout,
            transition,
            variants: _variants,
            whileHover: _whileHover,
            whileTap: _whileTap,
            ...domProps
          } = props;
          if (transition !== undefined) motionState.transitions.push(transition);
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

import { Onboarding } from './Onboarding';
import { Demo } from './steps/Demo';
import { Persona } from './steps/Persona';
import { Providers } from './steps/Providers';
import { Welcome } from './steps/Welcome';
import { WhatsNew } from './steps/WhatsNew';

beforeEach(() => {
  motionState.reduced = false;
  motionState.transitions = [];
  useUIStore.getState().setTheme('default');
});

afterEach(() => {
  cleanup();
  useUIStore.getState().setTheme('default');
});

describe('onboarding Sakura Motion integration', () => {
  it('preserves the exact frozen legacy spring objects for prior themes', () => {
    render(
      <>
        <Onboarding />
        <Demo onFinish={() => undefined} />
        <Persona />
        <Providers onSkip={() => undefined} />
        <Welcome onNext={() => undefined} />
        <WhatsNew onNext={() => undefined} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /More providers/u }));

    expect(motionState.transitions).toEqual(
      expect.arrayContaining([
        { type: 'spring', stiffness: 380, damping: 32, mass: 0.7 },
        { type: 'spring', stiffness: 220, damping: 28 },
        { type: 'spring', stiffness: 400, damping: 26 },
        { type: 'spring', stiffness: 380, damping: 30 },
        { type: 'spring', stiffness: 380, damping: 32 },
      ]),
    );
    expect(motionState.transitions.every((transition) => Object.isFrozen(transition))).toBe(true);
  });

  it('routes every rendered explicit spring through the Sakura and reduced-motion policies', () => {
    useUIStore.getState().setTheme('sakura');
    const rendered = render(
      <>
        <Onboarding />
        <Demo onFinish={() => undefined} />
        <Persona />
        <Providers onSkip={() => undefined} />
        <Welcome onNext={() => undefined} />
        <WhatsNew onNext={() => undefined} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /More providers/u }));
    expect(motionState.transitions.length).toBeGreaterThan(0);
    expect(
      motionState.transitions.every((transition) => transition === SAKURA_THEME_MOTION_TRANSITION),
    ).toBe(true);

    motionState.transitions = [];
    motionState.reduced = true;
    rendered.rerender(
      <>
        <Onboarding />
        <Demo onFinish={() => undefined} />
        <Persona />
        <Providers onSkip={() => undefined} />
        <Welcome onNext={() => undefined} />
        <WhatsNew onNext={() => undefined} />
      </>,
    );
    expect(motionState.transitions.length).toBeGreaterThan(0);
    expect(
      motionState.transitions.every((transition) => transition === REDUCED_THEME_MOTION_TRANSITION),
    ).toBe(true);
  });
});
