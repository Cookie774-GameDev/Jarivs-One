import { describe, expect, it } from 'vitest';
import { buildMarkdownCreationInstruction, parseMarkdownSlashArgument } from './markdownCommand';

describe('parseMarkdownSlashArgument', () => {
  it('parses a supported kind and preserves the remaining brief', () => {
    expect(parseMarkdownSlashArgument('goal Ship PR31 with exact evidence')).toEqual({
      kind: 'goal',
      brief: 'Ship PR31 with exact evidence',
    });
    expect(parseMarkdownSlashArgument('CUSTOM   Compare both approaches')).toEqual({
      kind: 'custom',
      brief: 'Compare both approaches',
    });
  });

  it('rejects missing or unsupported kinds', () => {
    expect(parseMarkdownSlashArgument('')).toBeUndefined();
    expect(parseMarkdownSlashArgument('spreadsheet quarterly plan')).toBeUndefined();
  });
});

describe('buildMarkdownCreationInstruction', () => {
  it('saves the generated document without attaching it to Chat by default', () => {
    const instruction = buildMarkdownCreationInstruction({
      kind: 'goal',
      brief: 'Ship PR31 with exact evidence',
      projectRoot: 'C:\\repo',
      fullyLocal: true,
    });

    expect(instruction).toContain('"attachToChat":false');
    expect(instruction).toContain('Do not attach the resulting file to this chat');
    expect(instruction).not.toContain('"attachToChat":true');
  });
});
