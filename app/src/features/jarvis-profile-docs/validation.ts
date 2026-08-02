import type { SoulValidation, SoulValidationIssue } from './types';

const RULES: ReadonlyArray<{
  issue: SoulValidationIssue;
  pattern: RegExp;
}> = [
  {
    issue: 'permission_bypass',
    pattern:
      /\b(?:bypass|ignore|disable|skip|override)\b.{0,48}\b(?:permission|approval|security|canonical|system|safeguard|confirmation)s?\b|\bauto[- ]?approve\b|\b(?:no approval is|approval is (?:not|never)) required\b/iu,
  },
  {
    issue: 'false_success',
    pattern:
      /\b(?:claim|report|say|state|pretend)\b.{0,48}\b(?:success|succeeded|complete|completed|done)\b.{0,48}\b(?:regardless|even (?:if|when)|without verifying|despite failure)\b|\b(?:claim|report|mark|state)\b.{0,24}\b(?:every|all)\b.{0,32}\b(?:success|successful|complete|completed|done)\b/iu,
  },
  {
    issue: 'private_memory_reveal',
    pattern:
      /\b(?:reveal|expose|publish|share|disclose)\b.{0,48}\b(?:private|confidential|hidden|personal)\b.{0,24}\b(?:memory|memories|history|data)\b|\b(?:include|use)\b.{0,24}\bprivate memor(?:y|ies)\b.{0,32}\b(?:public|reply|replies|response|responses)\b/iu,
  },
  {
    issue: 'unapproved_messaging',
    pattern:
      /\b(?:send|post|publish|message|email)\b.{0,48}\b(?:without|before)\b.{0,24}\b(?:approval|confirmation|consent)\b|\bauto[- ]?send\b|\b(?:send|post|publish)\b.{0,48}\b(?:immediately|automatically)\b/iu,
  },
  {
    issue: 'style_authority_override',
    pattern:
      /\b(?:tone|speaking style|writing style|voice|persona)\b|\b(?:speak|write|respond)\b.{0,24}\b(?:chaotic|sarcastic|aggressive|profane)\b/iu,
  },
  {
    issue: 'embedded_secret',
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|secret)\b\s*[:=]\s*["']?[^\s"']{6,}|\bauthorization\s*:\s*bearer\s+\S{8,}/iu,
  },
];

export function validateSoulDocument(content: string): SoulValidation {
  const issues = RULES.filter(({ pattern }) => pattern.test(content)).map(({ issue }) => issue);
  return { valid: issues.length === 0, issues };
}
