import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_COUNT,
  advanceStep,
  allTutorialSurfaces,
  clampStepIndex,
  completeTutorial,
  getStep,
  isLastStep,
  isTutorialFinished,
  markTutorialPending,
  shouldOfferTutorial,
  skipTutorial,
  tourShellZClass,
  tourYieldsToProductModal,
} from './tutorialState';

describe('product tutorial state', () => {
  it('defines exactly 5 steps covering required product surfaces', () => {
    expect(TUTORIAL_STEP_COUNT).toBe(5);
    expect(TUTORIAL_STEPS).toHaveLength(5);

    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(ids).toEqual([
      'chat-actions',
      'schedule',
      'talk-respond',
      'context-map',
      'agents-skills-settings',
    ]);

    const surfaces = allTutorialSurfaces();
    expect(surfaces).toEqual(
      expect.arrayContaining([
        'chat',
        'actions',
        'schedule',
        'response',
        'context-map',
        'agents',
        'skills',
        'settings',
      ]),
    );

    // Titles/targets present for coach UI + spotlight
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.length).toBeGreaterThan(4);
      expect(step.body.length).toBeGreaterThan(20);
      expect(step.target).toMatch(/^\[data-tour=/);
      expect(step.number).toBeGreaterThanOrEqual(1);
      expect(step.number).toBeLessThanOrEqual(5);
    }
  });

  it('offers only when status is pending', () => {
    expect(shouldOfferTutorial('pending')).toBe(true);
    expect(shouldOfferTutorial(null)).toBe(false);
    expect(shouldOfferTutorial('skipped')).toBe(false);
    expect(shouldOfferTutorial('completed')).toBe(false);
  });

  it('skip path finishes without requiring all 5 steps', () => {
    const status = skipTutorial();
    expect(status).toBe('skipped');
    expect(isTutorialFinished(status)).toBe(true);
    expect(shouldOfferTutorial(status)).toBe(false);
    // Skip never touches step progression — still valid to query steps
    expect(getStep(0)?.id).toBe('chat-actions');
  });

  it('advance walks 0→1→2→3→4 then complete marks done', () => {
    let index = 0;
    expect(getStep(index)?.id).toBe('chat-actions');

    index = advanceStep(index)!;
    expect(index).toBe(1);
    expect(getStep(index)?.id).toBe('schedule');

    index = advanceStep(index)!;
    expect(index).toBe(2);
    expect(getStep(index)?.id).toBe('talk-respond');

    index = advanceStep(index)!;
    expect(index).toBe(3);
    expect(getStep(index)?.id).toBe('context-map');

    index = advanceStep(index)!;
    expect(index).toBe(4);
    expect(getStep(index)?.id).toBe('agents-skills-settings');
    expect(isLastStep(index)).toBe(true);
    expect(advanceStep(index)).toBeNull();

    const status = completeTutorial();
    expect(status).toBe('completed');
    expect(isTutorialFinished(status)).toBe(true);
    expect(shouldOfferTutorial(status)).toBe(false);
  });

  it('markTutorialPending only upgrades null; preserves finished states', () => {
    expect(markTutorialPending(null)).toBe('pending');
    expect(markTutorialPending('pending')).toBe('pending');
    expect(markTutorialPending('skipped')).toBe('skipped');
    expect(markTutorialPending('completed')).toBe('completed');
  });

  it('clampStepIndex stays inside 0..4', () => {
    expect(clampStepIndex(-3)).toBe(0);
    expect(clampStepIndex(99)).toBe(4);
    expect(clampStepIndex(2.7)).toBe(2);
    expect(clampStepIndex(Number.NaN)).toBe(0);
  });

  it('drops tour under z-50 dialogs when Settings or Actions is open', () => {
    // Dialog overlay/content in components/ui/dialog.tsx use z-50.
    expect(tourShellZClass({ settingsOpen: false, actionsOpen: false })).toBe('z-[90]');
    expect(tourShellZClass({ settingsOpen: true, actionsOpen: false })).toBe('z-40');
    expect(tourShellZClass({ settingsOpen: false, actionsOpen: true })).toBe('z-40');
    expect(tourShellZClass({ settingsOpen: true, actionsOpen: true })).toBe('z-40');
    expect(tourYieldsToProductModal({ settingsOpen: true, actionsOpen: false })).toBe(true);
    expect(tourYieldsToProductModal({ settingsOpen: false, actionsOpen: false })).toBe(false);
  });
});
