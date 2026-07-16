import type { PetCharacterId } from './petCharacters';

export interface PetRuntimeBuildInfo {
  appVersion: string;
  gitCommit: string;
  gitBranch: string;
  buildTimestamp: string;
  frontendAssetVersion: string;
  selectedPetId: PetCharacterId;
  manifestAssetVersion: string;
}

type BuildEnv = Partial<Record<
  | 'VITE_APP_VERSION'
  | 'VITE_GIT_COMMIT'
  | 'VITE_GIT_BRANCH'
  | 'VITE_BUILD_TIMESTAMP'
  | 'VITE_FRONTEND_ASSET_VERSION',
  string
>>;

function clean(value: unknown, fallback: string): string {
  const str = typeof value === 'string' ? value.trim() : '';
  return str.length > 0 ? str : fallback;
}

export function getPetRuntimeBuildInfo(
  env: BuildEnv = import.meta.env,
  runtime: Pick<PetRuntimeBuildInfo, 'selectedPetId' | 'manifestAssetVersion'>,
): PetRuntimeBuildInfo {
  return {
    appVersion: clean(env.VITE_APP_VERSION, '0.0.0'),
    gitCommit: clean(env.VITE_GIT_COMMIT, 'unknown'),
    gitBranch: clean(env.VITE_GIT_BRANCH, 'unknown'),
    buildTimestamp: clean(env.VITE_BUILD_TIMESTAMP, 'unknown'),
    frontendAssetVersion: clean(env.VITE_FRONTEND_ASSET_VERSION, 'unknown'),
    selectedPetId: runtime.selectedPetId,
    manifestAssetVersion: runtime.manifestAssetVersion,
  };
}
