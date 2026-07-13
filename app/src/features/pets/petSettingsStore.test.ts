import { beforeEach, describe, expect, it } from 'vitest';
import { usePetSettingsStore } from './petSettingsStore';

describe('Pet settings store desktop controls', () => {
  beforeEach(() => {
    localStorage.clear();
    usePetSettingsStore.setState(usePetSettingsStore.getInitialState(), true);
  });

  it('uses the approved safe defaults for a fresh profile', () => {
    const state = usePetSettingsStore.getInitialState();

    expect(state.enabled).toBe(true);
    expect(state.overlayVisible).toBe(true);
    expect(state.panelMode).toBe('normal');
    expect(state.positionLocked).toBe(false);
    expect(state.edgeSnapping).toBe(false);
    expect(state.animationLevel).toBe('calm');
    expect(state.soundEnabled).toBe(true);
    expect(state.notificationReactions).toBe(true);
    expect(state.pointerTracking).toBe(true);
    expect(state.reducedMotion).toBe(false);
    expect(state.showDiagnostics).toBe(false);
  });

  it('preserves an existing user profile instead of replacing it with new defaults', async () => {
    localStorage.setItem('vibespace-pet-settings', JSON.stringify({
      state: {
        enabled: false,
        overlayVisible: false,
        positionLocked: true,
        edgeSnapping: true,
        animationLevel: 'playful',
        soundEnabled: false,
        notificationReactions: false,
        pointerTracking: false,
        reducedMotion: true,
        showDiagnostics: true,
      },
      version: 0,
    }));

    await usePetSettingsStore.persist.rehydrate();

    expect(usePetSettingsStore.getState()).toMatchObject({
      enabled: false,
      overlayVisible: false,
      positionLocked: true,
      edgeSnapping: true,
      animationLevel: 'playful',
      soundEnabled: false,
      notificationReactions: false,
      pointerTracking: false,
      reducedMotion: true,
      showDiagnostics: true,
    });
  });

  it('fills missing legacy fields from the fresh safe defaults', async () => {
    localStorage.setItem('vibespace-pet-settings', JSON.stringify({
      state: { panelMode: 'follow-pet' },
      version: 0,
    }));

    await usePetSettingsStore.persist.rehydrate();

    expect(usePetSettingsStore.getState()).toMatchObject({
      panelMode: 'follow-pet',
      positionLocked: false,
      edgeSnapping: false,
      animationLevel: 'calm',
      reducedMotion: false,
      showDiagnostics: false,
    });
  });

  it('validates and persists movement, animation, sound, and reaction controls', () => {
    const state = usePetSettingsStore.getState();

    state.setPanelMode('always-on-top');
    state.setPositionLocked(true);
    state.setEdgeSnapping(false);
    state.setAnimationLevel('playful');
    state.setSoundEnabled(false);
    state.setNotificationReactions(false);
    state.setPointerTracking(false);

    expect(usePetSettingsStore.getState()).toMatchObject({
      panelMode: 'always-on-top',
      positionLocked: true,
      edgeSnapping: false,
      animationLevel: 'playful',
      soundEnabled: false,
      notificationReactions: false,
      pointerTracking: false,
    });

    const persisted = JSON.parse(localStorage.getItem('vibespace-pet-settings')!);
    expect(persisted.state).toMatchObject({
      panelMode: 'always-on-top',
      positionLocked: true,
      edgeSnapping: false,
      animationLevel: 'playful',
      soundEnabled: false,
      notificationReactions: false,
      pointerTracking: false,
    });
  });
});
