import type { PetAnimationLevel } from './petSettingsStore';

export interface PetMotionPolicyInput {
  level: PetAnimationLevel;
  userReducedMotion: boolean;
  systemReducedMotion: boolean;
  idleFunIntervalMs: number;
}

export interface PetMotionPolicy {
  animationsEnabled: boolean;
  reducedMotion: boolean;
  idleFunEnabled: boolean;
  idleFunIntervalMs: number;
}

export function resolvePetMotionPolicy(input: PetMotionPolicyInput): PetMotionPolicy {
  const baseInterval = Math.max(10_000, Math.min(input.idleFunIntervalMs, 30 * 60_000));
  const animationsEnabled = input.level !== 'off';
  const reducedMotion =
    !animationsEnabled ||
    input.level === 'reduced' ||
    input.userReducedMotion ||
    input.systemReducedMotion;
  const idleFunEnabled = animationsEnabled && !reducedMotion && input.level !== 'reduced';

  let idleFunIntervalMs = baseInterval;
  if (idleFunEnabled && input.level === 'calm') {
    idleFunIntervalMs = Math.max(baseInterval, 120_000);
  }
  if (idleFunEnabled && input.level === 'playful') {
    idleFunIntervalMs = Math.min(baseInterval, 30_000);
  }

  return {
    animationsEnabled,
    reducedMotion,
    idleFunEnabled,
    idleFunIntervalMs,
  };
}
