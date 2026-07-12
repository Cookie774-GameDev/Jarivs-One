import * as React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const playerState = vi.hoisted(() => ({
  instances: [] as Array<{
    disposed: boolean;
    initialized: boolean;
    setAnimationCalls: number;
    loadCalls: number;
  }>,
}));

vi.mock('./petSettingsStore', () => {
  const state = { characterId: 'vibespace-axolotl', showDiagnostics: false };
  const usePetSettingsStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return {
    PET_FORCE_ANIM_EVENT: 'vibespace:pet-force-animation',
    usePetSettingsStore,
  };
});

vi.mock('./pixiAtlasPlayer', () => {
  class MockPlayer {
    disposed = false;
    initialized = false;
    setAnimationCalls = 0;
    loadCalls = 0;
    isDestroyed = false;
    application = {};

    constructor() {
      playerState.instances.push(this);
    }

    static selectAtlasScale(def: { atlas: string }) {
      return { atlasPath: def.atlas, scale: '1x' as const };
    }

    async init(host: HTMLElement) {
      await Promise.resolve();
      if (!this.disposed) {
        this.initialized = true;
        host.replaceChildren(document.createElement('canvas'));
      }
    }

    async load() {
      this.loadCalls += 1;
      await Promise.resolve();
    }

    isPlaybackReady() {
      return false;
    }

    setPlaybackFps() {}

    setAnimation() {
      this.setAnimationCalls += 1;
    }

    getDiagnostics() {
      return {
        currentFrameIndex: 0,
        frameCount: 2,
        currentFrameName: 'frame_000',
        elapsedAnimationMs: 0,
        fps: 12,
        loop: true,
        done: false,
        tickerRunning: true,
        tickerStarted: true,
        tickerListenerCount: 1,
        animationPaused: false,
        textureCacheKey: 'idle.png',
        loadedAtlasJsonUrl: 'idle.json',
        currentTextureUid: 'texture-0',
        currentTextureSourceUid: 'source-0',
        currentTextureFrameRect: '0,0,128,128',
        lastTextureChanged: true,
        textureAssignmentCount: 1,
        setAnimationCallCount: this.setAnimationCalls,
        ignoredDuplicateAnimationRequests: 0,
        animationResetCount: this.setAnimationCalls,
        liveApplicationCount: 1,
        backgroundAlpha: 0,
        scaleMode: 'nearest' as const,
      };
    }

    dispose() {
      this.disposed = true;
      this.isDestroyed = true;
    }
  }

  return { PixiAtlasPlayer: MockPlayer };
});

import { PetOverlay } from './PetOverlay';

describe('PetOverlay StrictMode player lifecycle', () => {
  afterEach(() => {
    playerState.instances.length = 0;
  });

  it('allows only the final live player generation to start the visible animation', async () => {
    const view = render(
      <React.StrictMode>
        <PetOverlay />
      </React.StrictMode>,
    );

    await waitFor(() => {
      const live = playerState.instances.filter(
        (player) => player.initialized && !player.disposed,
      );
      expect(live).toHaveLength(1);
      expect(live[0].setAnimationCalls).toBe(1);
    });

    for (const stale of playerState.instances.filter((player) => player.disposed)) {
      expect(stale.setAnimationCalls).toBe(0);
    }

    view.unmount();
  });
});
