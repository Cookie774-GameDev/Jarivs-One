import { describe, expect, it } from 'vitest';
import { NORMAL_AXO_RUNTIME_ID } from './petCharacters';
import { getPetRuntimeBuildInfo } from './petRuntimeBuildInfo';

describe('getPetRuntimeBuildInfo', () => {
  it('exposes safe build provenance and selected pet identity', () => {
    const info = getPetRuntimeBuildInfo(
      {
        VITE_APP_VERSION: '0.1.48',
        VITE_GIT_COMMIT: 'abc123def456',
        VITE_GIT_BRANCH: 'agent/pixel-pets-axolotl',
        VITE_BUILD_TIMESTAMP: '2026-07-12T11:00:00.000Z',
        VITE_FRONTEND_ASSET_VERSION: 'pets-test-version',
      },
      {
        selectedPetId: NORMAL_AXO_RUNTIME_ID,
        manifestAssetVersion: 'vibespace-axolotl@1',
      },
    );

    expect(info).toEqual({
      appVersion: '0.1.48',
      gitCommit: 'abc123def456',
      gitBranch: 'agent/pixel-pets-axolotl',
      buildTimestamp: '2026-07-12T11:00:00.000Z',
      frontendAssetVersion: 'pets-test-version',
      selectedPetId: NORMAL_AXO_RUNTIME_ID,
      manifestAssetVersion: 'vibespace-axolotl@1',
    });
  });

  it('uses explicit unknown markers instead of empty provenance', () => {
    const info = getPetRuntimeBuildInfo(
      {},
      {
        selectedPetId: NORMAL_AXO_RUNTIME_ID,
        manifestAssetVersion: 'vibespace-axolotl@1',
      },
    );

    expect(info.gitCommit).toBe('unknown');
    expect(info.gitBranch).toBe('unknown');
    expect(info.appVersion).toBe('0.0.0');
    expect(info.frontendAssetVersion).toBe('unknown');
  });
});
