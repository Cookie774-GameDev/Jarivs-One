import { describe, expect, it } from 'vitest';
import { buildVibeSpaceSkillPackage } from './skillPackage';

describe('buildVibeSpaceSkillPackage', () => {
  it('creates a VibeSpace-owned, project-specific skill package without upstream attribution', () => {
    const result = buildVibeSpaceSkillPackage({
      title: 'Release Notes Coach',
      description: 'Turns verified project notes into concise release notes.',
      tools: ['files'],
      systemPromptAddendum: 'Cite the supplied notes, ask before publishing, and never invent changes.',
      body: '# Release Notes Coach\n\nUse for verified release notes.',
      proposal: {
        purpose: 'Create verified release notes for project stakeholders.',
        triggers: ['release candidate is ready'],
        permitted: ['files'],
        approvals: ['Ask before publishing externally.'],
        inputs: ['approved changelog'],
        outputs: ['release-note draft'],
        verification: ['Check every claim against the changelog.'],
      },
    });

    expect(result.slug).toBe('release-notes-coach');
    expect(result.files.map((file) => file.path)).toEqual([
      'release-notes-coach/SKILL.md',
      'release-notes-coach/references/VIBESPACE_SKILL_AUTHORING_GUIDE.md',
      'release-notes-coach/provenance.json',
    ]);
    expect(result.skillMarkdown).toContain('trigger conditions');
    expect(result.skillMarkdown).toContain('Ask before publishing externally.');
    expect(result.guide).toContain('VibeSpace Skill Authoring Guide');
    expect(result.guide).toContain('Do not retain secrets');
    expect(result.provenance).toMatchObject({
      creator: 'VibeSpace',
      source: 'vibespace-authored',
      attribution: 'none',
      userApprovedScope: false,
    });
  });

  it('rejects an unsafe or empty package name', () => {
    expect(() =>
      buildVibeSpaceSkillPackage({
        title: '../unsafe',
        description: 'Description',
        tools: [],
        systemPromptAddendum: 'Use safe boundaries.',
        body: '# Unsafe',
      }),
    ).toThrow(/safe skill title/i);
  });
});
