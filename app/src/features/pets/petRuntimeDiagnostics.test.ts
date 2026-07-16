import { afterEach, describe, expect, it, vi } from 'vitest';
import { NORMAL_AXO_RUNTIME_ID, GLITCH_RUNTIME_ID } from './petCharacters';
import { buildPetRuntimeDiagnostics, installPetRuntimeDiagGlobal } from './petRuntimeDiagnostics';

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { __VIBESPACE_PET_DIAG__?: unknown }).__VIBESPACE_PET_DIAG__;
  delete (window as unknown as { __VIBESPACE_PET_TRACE__?: unknown }).__VIBESPACE_PET_TRACE__;
});

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
          tickerStarted: true,
          tickerListenerCount: 1,
          animationPaused: false,
          textureCacheKey: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.png',
          loadedAtlasJsonUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.json',
          currentTextureUid: 'tex:3',
          currentTextureSourceUid: 'src:1',
          currentTextureFrameRect: '384,0,128,128',
          lastTextureChanged: true,
          textureAssignmentCount: 4,
          setAnimationCallCount: 1,
          ignoredDuplicateAnimationRequests: 0,
          animationResetCount: 1,
          applicationObjectId: 'app:1',
          canvasObjectId: 'canvas:1',
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
    expect(snap.tickerStarted).toBe(true);
    expect(snap.tickerListenerCount).toBe(1);
    expect(snap.animationPaused).toBe(false);
    expect(snap.currentTextureUid).toBe('tex:3');
    expect(snap.currentTextureFrameRect).toBe('384,0,128,128');
    expect(snap.textureAssignmentCount).toBe(4);
    expect(snap.animationResetCount).toBe(1);
    expect(snap.buildInfo.gitCommit).toBeTypeOf('string');
    expect(snap.buildInfo.gitBranch).toBeTypeOf('string');
    expect(snap.buildInfo.selectedPetId).toBe(NORMAL_AXO_RUNTIME_ID);
    expect(snap.buildInfo.manifestAssetVersion).toBe('vibespace-axolotl@1');
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

  it('installs a bounded DEV trace ring buffer for real-time runtime sampling', () => {
    vi.useFakeTimers();
    let frame = 0;
    const dispose = installPetRuntimeDiagGlobal(() =>
      buildPetRuntimeDiagnostics({
        characterId: NORMAL_AXO_RUNTIME_ID,
        anim: 'idlePrimary',
        reducedMotion: false,
        panelOpen: false,
        player: {
          loadedImageUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.png',
          loadedAtlasJsonUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.json',
          currentFrameIndex: frame++,
          frameCount: 48,
          currentFrameName: `frame_${String(frame).padStart(3, '0')}`,
          getDiagnostics: () => ({
            currentFrameIndex: frame,
            frameCount: 48,
            currentFrameName: `frame_${String(frame).padStart(3, '0')}`,
            elapsedAnimationMs: frame * 169,
            fps: 5.9,
            loop: true,
            done: false,
            tickerRunning: true,
            tickerStarted: true,
            tickerListenerCount: 1,
            animationPaused: false,
            textureCacheKey: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.png',
            loadedAtlasJsonUrl: '/assets/vibespace-axolotl/atlases/idlePrimary@1x.json',
            currentTextureUid: `tex:${frame}`,
            currentTextureSourceUid: 'src:1',
            currentTextureFrameRect: `${frame * 128},0,128,128`,
            lastTextureChanged: true,
            textureAssignmentCount: frame,
            setAnimationCallCount: 1,
            ignoredDuplicateAnimationRequests: 0,
            animationResetCount: 1,
            applicationObjectId: 'app:1',
            canvasObjectId: 'canvas:1',
            liveApplicationCount: 1,
            backgroundAlpha: 0,
            scaleMode: 'nearest',
          }),
        },
      }),
    );

    vi.advanceTimersByTime(1250);
    const trace = (window as unknown as { __VIBESPACE_PET_TRACE__?: unknown[] }).__VIBESPACE_PET_TRACE__;

    expect(trace?.length).toBeGreaterThanOrEqual(5);
    expect(trace?.length).toBeLessThanOrEqual(24);
    expect(trace?.[0]).toHaveProperty('buildInfo.gitCommit');
    dispose();
  });
});
