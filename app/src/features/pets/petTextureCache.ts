/**
 * Distinct texture cache identity for Axo vs Glitch.
 * Pure — no Pixi import (safe for unit tests).
 */

export function buildPetTextureCacheKey(input: {
  characterId: string;
  animationState: string;
  scale: '1x' | '2x' | string;
  assetVersion?: string | number;
  imageUrl?: string;
}): string {
  const ver = input.assetVersion ?? '1';
  const url = input.imageUrl ?? '';
  return `${input.characterId}|${input.animationState}|${input.scale}|${ver}|${url}`;
}
