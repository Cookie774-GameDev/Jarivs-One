/**
 * Lightweight identity context for Jarvis from Settings (display name).
 * Distinct from AllAboutMe.md personality profile.
 */

export function buildUserIdentityContextBlock(displayName: string | null | undefined): string {
  const name = (displayName ?? '').trim();
  if (!name) return '';
  // Cap length so malicious/oversized settings values cannot bloat the prompt.
  const safe = name.slice(0, 80);
  return [
    '## User identity (from Settings)',
    `The user's preferred name is **${safe}**.`,
    'Address them by this name when natural. Treat it as their chosen display name only — not legal ID, email, or secrets.',
    'Do not invent other personal details (age, address, employer, etc.) unless the user or AllAboutMe profile states them.',
  ].join('\n');
}
