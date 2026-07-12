import { describe, expect, it } from 'vitest';
import { NORMAL_AXO_RUNTIME_ID, GLITCH_RUNTIME_ID } from './petCharacters';
import { buildPetRuntimeDiagnostics } from './petRuntimeDiagnostics';

describe('buildPetRuntimeDiagnostics (Axo chain snapshot)', () => {
  it('resolves normal Axo to vibespace-axolotl never glitch', () => {
    const snap = buildPetRuntimeDiagnostics({
      characterId: NORMAL_AXO_RUNTIME_ID,
      anim: 'idlePrimary',
      reducedMotion: false,
      panelOpen: false,
      player: {
        loadedImageUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.png',
        loadedAtlasJsonUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.json',
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
          loadedAtlasJsonUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.json',
          currentTextureUid: 'axo-idlePrimary-frame_003',
          liveApplicationCount: 1,
          backgroundAlpha: 0,
          scaleMode: 'nearest',
        }),
      },
    });

    expect(snap.selectedPetId).toBe(NORMAL_AXO_RUNTIME_ID);
    expect(snap.resolvedCharacterId).toBe('vibespace-axolotl');
    expect(snap.resolvedManifestUrl).toContain('vibespace-axolotl/animations.json');
    expect(snap.resolvedAssetRoot).toContain('vibespace-axolotl/');
    expect(snap.requestedState).toBe('idlePrimary');
    expect(snap.activeState).toBe('idlePrimary');
    expect(snap.atlasJsonUrl).toContain('idlePrimary@1x.json');
    expect(snap.atlasPngUrl).toContain('idlePrimary@1x.png');
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
      characterId: GLITCH_RUNTIME_ID,
      anim: 'walkLeft',
      reducedMotion: true,
      panelOpen: true,
      player: null,
    });
    expect(snap.resolvedCharacterId).toBe('vibespace-axolotl-glitch');
    expect(snap.selectedPetId).toBe(GLITCH_RUNTIME_ID);
    expect(snap.hiddenDueToPanel).toBe(true);
    expect(snap.reducedMotion).toBe(true);
    expect(snap.tickerRunning).toBe(false);
  });
});
