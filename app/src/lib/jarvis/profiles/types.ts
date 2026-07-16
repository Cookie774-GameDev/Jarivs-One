export interface JarvisProfile {
  id: string;
  revisionId: string;
  accountId: string;
  name: string;
  customInstructions: string;
  instructionSource: 'none' | 'user' | 'legacy_user_extension';
  memoryScope: 'none' | 'profile' | 'shared_selected';
  voiceEnabled: boolean;
  active: boolean;
  identityVersion: number;
  soulRevisionId?: string;
  sourcePromptHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JarvisProfileSnapshot {
  profileId: string;
  revisionId: string;
  soulRevisionId?: string;
  customInstructions: string;
  memoryScope: 'none' | 'profile' | 'shared_selected';
}

export function createJarvisProfileSnapshot(
  profile: JarvisProfile,
): Readonly<JarvisProfileSnapshot> {
  return Object.freeze({
    profileId: profile.id,
    revisionId: profile.revisionId,
    ...(profile.soulRevisionId === undefined ? {} : { soulRevisionId: profile.soulRevisionId }),
    customInstructions: profile.customInstructions,
    memoryScope: profile.memoryScope,
  });
}
