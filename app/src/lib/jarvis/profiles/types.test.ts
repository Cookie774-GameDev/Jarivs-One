import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createJarvisProfileSnapshot,
  type JarvisProfile,
  type JarvisProfileSnapshot,
} from './types';

type ExpectedJarvisProfile = {
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
};

type ExpectedJarvisProfileSnapshot = {
  profileId: string;
  revisionId: string;
  soulRevisionId?: string;
  customInstructions: string;
  memoryScope: 'none' | 'profile' | 'shared_selected';
};

const PROFILE: JarvisProfile = {
  id: 'profile-account-7',
  revisionId: 'profile-revision-1',
  accountId: 'account-7',
  name: 'Primary JARVIS',
  customInstructions: 'Prefer compact implementation summaries.',
  instructionSource: 'user',
  memoryScope: 'shared_selected',
  voiceEnabled: true,
  active: true,
  identityVersion: 1,
  soulRevisionId: 'soul-revision-3',
  sourcePromptHash: 'historical-prompt-hash',
  createdAt: 1_762_000_000_000,
  updatedAt: 1_762_000_001_000,
};

describe('JARVIS profile contracts', () => {
  it('exports the exact profile types and snapshot factory signature', () => {
    expectTypeOf<JarvisProfile>().toEqualTypeOf<ExpectedJarvisProfile>();
    expectTypeOf<JarvisProfileSnapshot>().toEqualTypeOf<ExpectedJarvisProfileSnapshot>();
    expectTypeOf(createJarvisProfileSnapshot).toEqualTypeOf<
      (profile: JarvisProfile) => Readonly<JarvisProfileSnapshot>
    >();
  });

  it('creates a full frozen snapshot with only approved immutable request fields', () => {
    const snapshot = createJarvisProfileSnapshot(PROFILE);

    expect(snapshot).toEqual({
      profileId: 'profile-account-7',
      revisionId: 'profile-revision-1',
      soulRevisionId: 'soul-revision-3',
      customInstructions: 'Prefer compact implementation summaries.',
      memoryScope: 'shared_selected',
    });
    expect(Object.keys(snapshot).sort()).toEqual(
      ['profileId', 'revisionId', 'soulRevisionId', 'customInstructions', 'memoryScope'].sort(),
    );
    for (const omitted of [
      'accountId',
      'name',
      'instructionSource',
      'voiceEnabled',
      'active',
      'identityVersion',
      'sourcePromptHash',
      'createdAt',
      'updatedAt',
    ]) {
      expect(snapshot).not.toHaveProperty(omitted);
    }
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(
      Reflect.set(snapshot as unknown as Record<string, unknown>, 'revisionId', 'changed'),
    ).toBe(false);
    expect(snapshot.revisionId).toBe('profile-revision-1');
  });

  it('omits the optional soul revision key when no soul revision is selected', () => {
    const snapshot = createJarvisProfileSnapshot({
      ...PROFILE,
      soulRevisionId: undefined,
    });

    expect(snapshot).toEqual({
      profileId: 'profile-account-7',
      revisionId: 'profile-revision-1',
      customInstructions: 'Prefer compact implementation summaries.',
      memoryScope: 'shared_selected',
    });
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'soulRevisionId')).toBe(false);
  });

  it('keeps the profile id stable while snapshotting each authorized revision id', () => {
    const first = createJarvisProfileSnapshot(PROFILE);
    const second = createJarvisProfileSnapshot({
      ...PROFILE,
      revisionId: 'profile-revision-2',
      customInstructions: 'Use concise review findings.',
      updatedAt: PROFILE.updatedAt + 1,
    });

    expect(first.profileId).toBe('profile-account-7');
    expect(second.profileId).toBe('profile-account-7');
    expect(first.revisionId).toBe('profile-revision-1');
    expect(second.revisionId).toBe('profile-revision-2');
    expect(first.revisionId).not.toBe(second.revisionId);
  });
});
