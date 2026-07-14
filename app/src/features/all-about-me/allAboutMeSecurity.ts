const SECRET_LINE_RE = /(?:api[-_ ]?key|password|access[-_ ]?token|refresh[-_ ]?token|token|private[-_ ]?key|signing[-_ ]?key|secret|credentials?)\s*(?:[:=]|\bis\b)\s*\S+/i;
const TOKEN_VALUE_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,})\b/;

export function containsAllAboutMeSecret(markdown: string): boolean {
  return markdown.split(/\r?\n/).some((line) => SECRET_LINE_RE.test(line) || TOKEN_VALUE_RE.test(line));
}

export function sanitizeAllAboutMeMarkdown(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !SECRET_LINE_RE.test(line) && !TOKEN_VALUE_RE.test(line))
    .join('\n')
    .trim();
}
