import { describe, expect, it } from 'vitest';
import {
  buildAllAboutMeLearningDiff,
  summarizeAllAboutMeLearningChange,
} from './activity';

describe('AllAboutMe activity helpers', () => {
  it('builds a small file-write diff for chat learning updates', () => {
    const diff = buildAllAboutMeLearningDiff(
      '# AllAboutMe.md\n\n## Voice\n\nShort.',
      '# AllAboutMe.md\n\n## Voice\n\nShort.\n\n## New Pattern\n\nHype when shipping.',
    );

    expect(diff).toContain('--- AllAboutMe.md');
    expect(diff).toContain('+++ AllAboutMe.md');
    expect(diff).toContain('+## New Pattern');
    expect(diff).not.toContain('Short.');
  });

  it('summarizes added and removed markdown lines for the activity row', () => {
    const summary = summarizeAllAboutMeLearningChange(
      '# AllAboutMe.md\n\nOld line',
      '# AllAboutMe.md\n\nNew line\nExtra line',
    );

    expect(summary.addedLines).toBe(2);
    expect(summary.removedLines).toBe(1);
  });
});
