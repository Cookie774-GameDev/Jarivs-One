export type AllAboutMeSlashOptionId = 'attach' | 'edit' | 'retake' | 'force-update';

export interface AllAboutMeSlashOption {
  id: AllAboutMeSlashOptionId;
  label: string;
  description: string;
}

export const ALL_ABOUT_ME_SLASH_OPTIONS: AllAboutMeSlashOption[] = [
  {
    id: 'attach',
    label: 'Attach AllAboutMe.md',
    description: 'Attach the current profile to the next Jarvis turn.',
  },
  {
    id: 'edit',
    label: 'Edit profile',
    description: 'Attach the profile and ask Jarvis to edit it.',
  },
  {
    id: 'retake',
    label: 'Retake test to update scores',
    description: 'Open the 60-question test to update the existing profile.',
  },
  {
    id: 'force-update',
    label: 'Force chat update',
    description: 'Update from this chat when it has at least 10 messages.',
  },
];

export function allAboutMeChatUpdateStatus(messageCount: number): { ok: boolean; message: string } {
  if (messageCount >= 10) {
    return { ok: true, message: 'This chat has enough messages to update AllAboutMe.md.' };
  }
  return {
    ok: false,
    message: `This chat needs at least 10 messages before it can update AllAboutMe.md. Current count: ${messageCount}.`,
  };
}

export function buildAllAboutMeSlashText(
  optionId: AllAboutMeSlashOptionId,
  markdown: string,
  chatMessageCount: number,
): string {
  const profile = markdown.trim();
  if (!profile) {
    return 'AllAboutMe.md is not created yet. Use /allaboutme retake to take the test first.';
  }
  if (optionId === 'attach') {
    return [
      'Attached AllAboutMe.md for this turn. Use it as user-personality context.',
      '```markdown',
      profile,
      '```',
    ].join('\n');
  }
  if (optionId === 'edit') {
    return [
      'Please edit this profile carefully. Preserve stable facts and improve clarity/detail only where the user asks.',
      '```markdown',
      profile,
      '```',
    ].join('\n');
  }
  if (optionId === 'force-update') {
    const status = allAboutMeChatUpdateStatus(chatMessageCount);
    if (!status.ok) return status.message;
    return [
      'Force update AllAboutMe.md from patterns found in this chat. Preserve the existing profile and improve it only with repeated evidence.',
      '```markdown',
      profile,
      '```',
    ].join('\n');
  }
  return 'Open Settings -> All About Me and retake the 60-question test.';
}
