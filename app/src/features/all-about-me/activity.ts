const MAX_ACTIVITY_DIFF_LINES = 80;

function meaningfulLines(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

export function buildAllAboutMeLearningDiff(beforeMarkdown: string, afterMarkdown: string): string {
  const beforeLines = new Set(meaningfulLines(beforeMarkdown));
  const afterLines = new Set(meaningfulLines(afterMarkdown));
  const removed = meaningfulLines(beforeMarkdown).filter((line) => !afterLines.has(line));
  const added = meaningfulLines(afterMarkdown).filter((line) => !beforeLines.has(line));
  const body = [
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].slice(0, MAX_ACTIVITY_DIFF_LINES);
  if (removed.length + added.length > body.length) {
    body.push('+[diff truncated by VibeSpace]');
  }
  return ['--- AllAboutMe.md', '+++ AllAboutMe.md', ...body].join('\n');
}

export function summarizeAllAboutMeLearningChange(
  beforeMarkdown: string,
  afterMarkdown: string,
): { addedLines: number; removedLines: number } {
  const beforeLines = new Set(meaningfulLines(beforeMarkdown));
  const afterLines = new Set(meaningfulLines(afterMarkdown));
  return {
    addedLines: meaningfulLines(afterMarkdown).filter((line) => !beforeLines.has(line)).length,
    removedLines: meaningfulLines(beforeMarkdown).filter((line) => !afterLines.has(line)).length,
  };
}
