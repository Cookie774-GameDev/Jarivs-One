import { detectSecrets, hasDetectedSecret } from '@/lib/security/secretDetector';

export function containsAllAboutMeSecret(markdown: string): boolean {
  return hasDetectedSecret(markdown);
}

export function sanitizeAllAboutMeMarkdown(markdown: string): string {
  const findings = detectSecrets(markdown);
  if (findings.length === 0) return markdown.trim();
  const safeLines: string[] = [];
  for (const match of markdown.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)) {
    const segment = match[0];
    if (segment.length === 0 || match.index === undefined) continue;
    const lineEnd = match.index + segment.length;
    if (findings.some((finding) => finding.start < lineEnd && finding.end > match.index)) {
      continue;
    }
    safeLines.push(segment.replace(/(?:\r\n|\n|\r)$/u, ''));
  }
  return safeLines.join('\n').trim();
}
