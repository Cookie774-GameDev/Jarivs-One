import { describe, expect, it } from 'vitest';
import { buildPetRuntimeDiagnostics } from './petRuntimeDiagnostics';

describe('buildPetRuntimeDiagnostics (Axo chain snapshot)', () => {
  it('resolves normal Axo to vibespace-axolotl never glitch', () => {
    const snap = buildPetRuntimeDiagnostics({
      characterId: 'axo',
      anim: 'idlePrimary',
      reducedMotion: false,
      panelOpen: false,
      player: {
        loadedImageUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.png',
        currentFrameIndex: 3,
        frameCount: 48,
        currentFrameName: 'frame_003',
        getDiagnostics: () => ({
          currentFrameIndex: 3,
          frameCount: 48,
          currentFrameName: 'frame_003',
          elapsedAnimationMs: 500,
          fps: 5.9,
          loop: true,
          done: false,
          tickerRunning: true,
          animationPaused: false,
          textureCacheKey: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.png',
          liveApplicationCount: 1,
          backgroundAlpha: 0,
          scaleMode: 'nearest',
        }),
      },
    });

    expect(snap.selectedPetId).toBe('axo');
    expect(snap.resolvedCharacterId).toBe('vibespace-axolotl');
    expect(snap.assetFolder).toBe('vibespace-axolotl');
    expect(snap.loadedManifestPath).toContain('vibespace-axolotl/animations.json');
    expect(snap.loadedManifestPath.toLowerCase()).not.toContain('glitch');
    expect(snap.loadedAtlasUrl?.toLowerCase()).toContain('vibespace-axolotl');
    expect(snap.loadedAtlasUrl?.toLowerCase()).not.toContain('glitch');
    expect(snap.currentAnimationState).toBe('idlePrimary');
    expect(snap.currentFrameIndex).toBe(3);
    expect(snap.frameCount).toBe(48);
    expect(snap.tickerRunning).toBe(true);
    expect(snap.animationPaused).toBe(false);
    expect(snap.reducedMotion).toBe(false);
    expect(snap.hiddenDueToPanel).toBe(false);
    expect(snap.activeTextureCacheKey).toContain('idlePrimary');
    expect(snap.livePixiApplications).toBe(1);
    expect(snap.scaleMode).toBe('nearest');
  });

  it('marks hidden when panel open and preserves Glitch identity separately', () => {
    const snap = buildPetRuntimeDiagnostics({
      characterId: 'glitch',
      anim: 'walkLeft',
      reducedMotion: true,
      panelOpen: true,
      player: null,
    });
    expect(snap.resolvedCharacterId).toBe('vibespace-axolotl-glitch');
    expect(snap.hiddenDueToPanel).toBe(true);
    expect(snap.reducedMotion).toBe(true);
    expect(snap.tickerRunning).toBe(false);
  });
});
