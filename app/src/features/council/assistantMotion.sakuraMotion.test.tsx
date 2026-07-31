import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Message } from '@/types';
import { ModeIndicator } from '@/features/jarvis-interaction/ModeIndicator';
import { VoiceCaption } from '@/features/voice/VoiceCaption';
import { useVoiceStore } from '@/features/voice/store';
import { AgentPanel } from './AgentPanel';

const motionProbe = vi.hoisted(() => ({
  layoutInputs: [] as unknown[],
  legacyTransitions: [] as unknown[],
  themedTransition: { duration: 0.123, ease: 'linear' } as const,
}));

vi.mock('@/features/appearance/themeMotion', () => ({
  useThemeMotionLayout: (legacyLayout: unknown) => {
    motionProbe.layoutInputs.push(legacyLayout);
    return false;
  },
  useThemeMotionTransition: (legacyTransition: unknown) => {
    motionProbe.legacyTransitions.push(legacyTransition);
    return motionProbe.themedTransition;
  },
}));

vi.mock('motion/react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const motionElement = (tag: 'button' | 'div') =>
    ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
      (
        {
          animate: _animate,
          children,
          exit: _exit,
          initial: _initial,
          layout,
          transition,
          ...props
        },
        ref,
      ) =>
        ReactModule.createElement(
          tag,
          {
            ...props,
            ref,
            'data-motion-layout': String(layout),
            'data-motion-transition': JSON.stringify(transition),
          },
          children as React.ReactNode,
        ),
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      button: motionElement('button'),
      div: motionElement('div'),
    },
  };
});

vi.mock('@/features/voice/useAppForeground', () => ({
  useAppForeground: () => true,
}));

const agent = {
  id: 'agent-1',
  slug: 'reviewer',
  name: 'Reviewer',
  description: '',
  system_prompt: '',
  model: {},
  tools_allowed: [],
  memory_scope: 'none',
  capabilities: [],
} as unknown as Agent;

const userMessage = {
  id: 'message-1',
  chat_id: 'chat-1',
  role: 'user',
  parts: [{ kind: 'text', text: 'Inspect motion' }],
  created_at: 1,
  updated_at: 1,
} as Message;

const themedTransitionText = JSON.stringify(motionProbe.themedTransition);

describe('Assistant Sakura Motion consumers', () => {
  beforeEach(() => {
    motionProbe.layoutInputs.length = 0;
    motionProbe.legacyTransitions.length = 0;
    useVoiceStore.getState().reset();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    useVoiceStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('routes both AgentPanel transitions through the shared policy', () => {
    const rendered = render(<AgentPanel agent={agent} messages={[userMessage]} />);

    expect(screen.getByText('Inspect motion')).toBeTruthy();
    expect(motionProbe.legacyTransitions).toEqual([
      { type: 'spring', stiffness: 400, damping: 30, mass: 0.8 },
      { type: 'spring', stiffness: 500, damping: 32, mass: 0.6 },
    ]);
    expect(motionProbe.layoutInputs).toEqual([true, true]);
    expect(rendered.container.querySelectorAll('[data-motion-layout="false"]')).toHaveLength(2);
    expect(
      rendered.container.querySelectorAll(`[data-motion-transition='${themedTransitionText}']`),
    ).toHaveLength(2);
  });

  it('routes ModeIndicator through the shared policy without changing selection behavior', () => {
    const onSelectMode = vi.fn();
    render(<ModeIndicator mode="agent" onSelectMode={onSelectMode} />);

    fireEvent.click(screen.getByRole('button', { name: /Agent Mode/i }));
    expect(
      document.querySelectorAll(`[data-motion-transition='${themedTransitionText}']`),
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole('option', { name: /Plan Mode/i }));

    expect(onSelectMode).toHaveBeenCalledWith('plan');
    expect(motionProbe.legacyTransitions.length).toBeGreaterThanOrEqual(1);
    for (const legacyTransition of motionProbe.legacyTransitions) {
      expect(legacyTransition).toEqual({ type: 'spring', stiffness: 420, damping: 28 });
    }
  });

  it('routes VoiceCaption through the shared policy while preserving the caption contract', () => {
    act(() => useVoiceStore.getState().setPartialTranscript('Calm voice caption'));
    const rendered = render(<VoiceCaption />);

    expect(screen.getByLabelText('Live voice caption').getAttribute('aria-live')).toBe('off');
    expect(screen.getByText('Calm voice caption')).toBeTruthy();
    expect(motionProbe.legacyTransitions).toEqual([
      { type: 'spring', stiffness: 360, damping: 32, mass: 0.7 },
    ]);
    expect(motionProbe.layoutInputs).toEqual([true]);
    expect(rendered.container.querySelector('[data-motion-layout="false"]')).toBeTruthy();
    expect(
      rendered.container.querySelector(`[data-motion-transition='${themedTransitionText}']`),
    ).toBeTruthy();
  });
});
