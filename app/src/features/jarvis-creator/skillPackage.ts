import type { JarvisCreatorProposal, JarvisCreatorSkillDraft } from './contracts';

export interface VibeSpaceSkillPackageFile {
  path: string;
  content: string;
}

export interface VibeSpaceSkillProvenance {
  version: 1;
  creator: 'VibeSpace';
  source: 'vibespace-authored';
  attribution: 'none';
  userApprovedScope: false;
}

export interface VibeSpaceSkillPackage {
  slug: string;
  skillMarkdown: string;
  guide: string;
  provenance: VibeSpaceSkillProvenance;
  files: VibeSpaceSkillPackageFile[];
}

const VIBESPACE_SKILL_AUTHORING_GUIDE = `# VibeSpace Skill Authoring Guide

This VibeSpace-authored guide helps turn a reviewed proposal into a small, project-specific skill package.

## Authoring rules

- State the trigger conditions, inputs, output contract, and verification plainly.
- Keep tool use narrow and list every approval boundary.
- Do not retain secrets, credentials, private keys, or access tokens in a skill package.
- Treat project paths and external services as user-approved scope only; ask again when scope changes.
- Test with safe, representative inputs before relying on the skill for an important task.

## Package shape

- \`SKILL.md\` is the human-readable instruction and contract.
- \`provenance.json\` records that this preview was authored by VibeSpace, not copied from an external repository.
- Put optional project references in \`references/\`; do not add third-party material without a separate provenance and license review.
`;

const listSection = (title: string, entries: string[], empty: string): string =>
  `## ${title}\n\n${entries.length > 0 ? entries.map((entry) => `- ${entry}`).join('\n') : `- ${empty}`}`;

const safeText = (value: string): string => value.trim().replace(/\s+/g, ' ').slice(0, 280);

const fallbackProposal = (draft: JarvisCreatorSkillDraft): JarvisCreatorProposal => ({
  purpose: safeText(draft.description) || 'Clarify the requested outcome.',
  triggers: [],
  permitted: draft.tools,
  approvals: ['Ask for confirmation before actions outside the editor.'],
  inputs: [],
  outputs: ['A VibeSpace skill-package preview.'],
  verification: ['Review the draft with the user before saving.'],
});

export const slugForVibeSpaceSkill = (title: string): string => {
  const raw = title.trim();
  if (!raw || /[\\/\0]/.test(raw) || raw.includes('..')) {
    throw new Error('A safe skill title is required to create a package preview.');
  }

  const slug = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('A safe skill title is required to create a package preview.');
  }
  return slug;
};

const skillMarkdown = (draft: JarvisCreatorSkillDraft, proposal: JarvisCreatorProposal): string => {
  const title = safeText(draft.title);
  const description = safeText(draft.description);
  const addendum = draft.systemPromptAddendum.trim();
  const body = draft.body.trim();

  return [
    '---',
    `name: ${slugForVibeSpaceSkill(title)}`,
    `description: ${description}`,
    'author: VibeSpace',
    'provenance: vibespace-authored',
    '---',
    '',
    `# ${title}`,
    '',
    description,
    '',
    listSection('trigger conditions', proposal.triggers, 'Use when the reviewed outcome needs this skill.'),
    '',
    listSection('Inputs', proposal.inputs, 'Ask for the minimum project context needed.'),
    '',
    listSection('Allowed tools and scope', proposal.permitted, 'No tools or external services are approved by default.'),
    '',
    listSection('Approval boundaries', proposal.approvals, 'Ask before changing anything outside the editor.'),
    '',
    listSection('Output contract', proposal.outputs, 'Return the requested result in the agreed form.'),
    '',
    listSection('Verification', proposal.verification, 'Review the result against the user-approved proposal.'),
    '',
    '## Instructions',
    '',
    addendum || 'Follow the reviewed proposal and preserve the user’s existing work.',
    '',
    body,
    '',
  ].join('\n');
};

/** Builds a deterministic preview only; it never writes, installs, or imports. */
export const buildVibeSpaceSkillPackage = (draft: JarvisCreatorSkillDraft): VibeSpaceSkillPackage => {
  const slug = slugForVibeSpaceSkill(draft.title);
  const provenance: VibeSpaceSkillProvenance = {
    version: 1,
    creator: 'VibeSpace',
    source: 'vibespace-authored',
    attribution: 'none',
    userApprovedScope: false,
  };
  const preview = skillMarkdown(draft, draft.proposal ?? fallbackProposal(draft));
  const files: VibeSpaceSkillPackageFile[] = [
    { path: `${slug}/SKILL.md`, content: preview },
    {
      path: `${slug}/references/VIBESPACE_SKILL_AUTHORING_GUIDE.md`,
      content: VIBESPACE_SKILL_AUTHORING_GUIDE,
    },
    { path: `${slug}/provenance.json`, content: `${JSON.stringify(provenance, null, 2)}\n` },
  ];

  return {
    slug,
    skillMarkdown: preview,
    guide: VIBESPACE_SKILL_AUTHORING_GUIDE,
    provenance,
    files,
  };
};
