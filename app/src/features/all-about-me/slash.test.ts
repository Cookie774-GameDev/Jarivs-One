import { describe, expect, it } from 'vitest';
import {
  ALL_ABOUT_ME_SLASH_OPTIONS,
  allAboutMeChatUpdateStatus,
  buildAllAboutMeSlashText,
} from './slash';

describe('AllAboutMe slash helpers', () => {
  it('defines four slash options', () => {
    expect(ALL_ABOUT_ME_SLASH_OPTIONS.map((option) => option.id)).toEqual([
      'attach',
      'edit',
      'retake',
      'force-update',
    ]);
  });

  it('attaches or edits the current profile through chat context text', () => {
    const markdown = '# AllAboutMe.md\n\nProfile.';

    expect(buildAllAboutMeSlashText('attach', markdown, 10)).toContain(markdown);
    expect(buildAllAboutMeSlashText('edit', markdown, 10)).toContain('edit this profile');
  });

  it('requires at least 10 chat messages before force update is allowed', () => {
    expect(allAboutMeChatUpdateStatus(9)).toMatchObject({ ok: false });
    expect(allAboutMeChatUpdateStatus(10)).toMatchObject({ ok: true });
    expect(buildAllAboutMeSlashText('force-update', '# AllAboutMe.md\n\nProfile.', 9)).toContain('at least 10 messages');
  });
});
