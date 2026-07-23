import type { JarvisResponseMode } from '@/lib/jarvis/contracts';
import { hasProviderOnlyTerminalState, type JarvisVerifiedFacts } from './modeClassifier';
import { getJarvisResponsePolicy } from './modes';

export type JarvisLintViolationDisposition = 'repairable' | 'deterministic' | 'quarantine';

export interface JarvisLintViolation {
  code: string;
  disposition: JarvisLintViolationDisposition;
  safeSummary: string;
}

function violation(
  code: string,
  disposition: JarvisLintViolationDisposition,
  safeSummary: string,
): JarvisLintViolation {
  return Object.freeze({ code, disposition, safeSummary });
}

export function lintJarvisProse(
  prose: string,
  mode: JarvisResponseMode,
  facts: Readonly<JarvisVerifiedFacts>,
): readonly JarvisLintViolation[] {
  const violations: JarvisLintViolation[] = [];
  if (
    /\b(system prompt|hidden (?:prompt|instructions?)|developer message|chain of thought)\b/i.test(
      prose,
    ) ||
    /\b(?:send|share|provide|reveal|enter)\b[\s\S]{0,80}\b(?:password|api key|token|credential|secret)\b/i.test(
      prose,
    )
  ) {
    violations.push(
      violation('protected_information_leak', 'quarantine', 'Protected information disclosure.'),
    );
  }
  if (/^\s*(?:sure|of course|absolutely)[!,.:\s]/i.test(prose)) {
    violations.push(violation('generic_opener', 'repairable', 'Generic opening filler.'));
  }
  if (
    /^\s*(?:sure!|of course!|absolutely!|great question!|hi there!|i(?:'d| would) be happy to help)/i.test(
      prose,
    )
  ) {
    violations.push(violation('forbidden_opening', 'repairable', 'Forbidden generic opening.'));
  }
  if (
    /\b(?:as an ai(?: language model)?|i am just a computer program|i(?: do not| don't) have feelings)\b/i.test(
      prose,
    )
  ) {
    violations.push(
      violation('generic_identity_disclaimer', 'repairable', 'Generic identity disclaimer.'),
    );
  }
  if (
    /\b(?:contact (?:our |the )?support(?: team)?|for further assistance|valued customer|how may i assist)\b/i.test(
      prose,
    )
  ) {
    violations.push(
      violation('generic_service_language', 'repairable', 'Generic service language.'),
    );
  }
  if ((prose.match(/!/g) ?? []).length > 1 || /!{2,}/.test(prose)) {
    violations.push(
      violation('excessive_exclamation', 'repairable', 'Excessive exclamation marks.'),
    );
  }
  if (/\p{Extended_Pictographic}/u.test(prose)) {
    violations.push(violation('emoji', 'repairable', 'Conversational emoji.'));
  }
  if ((prose.match(/\bsir\b/gi) ?? []).length > 1) {
    violations.push(violation('sir_overuse', 'repairable', 'The address cadence is overused.'));
  }
  if ((prose.match(/\b(?:sorry|apologi[sz]e|apologies)\b/gi) ?? []).length > 1) {
    violations.push(violation('excessive_apology', 'repairable', 'Excessive apology.'));
  }
  if (mode !== 'long_form_delivery' && /^\s*#{1,6}\s+/m.test(prose)) {
    violations.push(violation('excessive_headings', 'repairable', 'Unnecessary heading.'));
  }
  const responsePolicy = getJarvisResponsePolicy(mode);
  const maxSentences = responsePolicy.maxSentences;
  const sentenceCount = prose
    .split(/[.!?]+(?:\s+|$)/)
    .map((item) => item.trim())
    .filter(Boolean).length;
  if (maxSentences !== null && sentenceCount > maxSentences) {
    violations.push(
      violation('response_mode_budget', 'repairable', 'Too many sentences for the response mode.'),
    );
  }
  const wordCount = prose.trim().match(/\S+/gu)?.length ?? 0;
  const maximumTargetWords = responsePolicy.targetWords?.[1];
  if (maximumTargetWords !== undefined && wordCount > maximumTargetWords) {
    violations.push(
      violation(
        'response_mode_word_budget',
        'repairable',
        'Prose exceeds the response mode word target.',
      ),
    );
  }
  if (/^\s*\{action\}/im.test(prose)) {
    violations.push(
      violation('unsupported_action_macro', 'deterministic', 'Unsupported action macro.'),
    );
  }
  const status = facts.executionState?.status;
  const completionClaims = prose.replace(
    /\b(?:not|never|has not|hasn't|had not|hadn't)\s+(?:completed|finished|succeeded)\b/gi,
    '',
  );
  const runningClaims = prose.replace(/\b(?:not|never|is not|isn't)\s+running\b/gi, '');
  const claimsComplete = /\b(done|completed|finished|succeeded|successful)\b/i.test(
    completionClaims,
  );
  const claimsRunning = /\b(running|in progress|still working)\b/i.test(runningClaims);
  const terminalState = facts.terminalState;
  if (
    hasProviderOnlyTerminalState(facts) &&
    /\b(?:done|completed|finished|succeeded|successful|partial|failed|cancelled|timed out)\b/i.test(
      prose,
    )
  ) {
    violations.push(
      violation(
        'provider_only_terminal_claim',
        'deterministic',
        'Provider-only terminal state is not independently verified.',
      ),
    );
  }
  if (
    (claimsComplete && status !== undefined && status !== 'completed') ||
    (claimsRunning &&
      status !== undefined &&
      status !== 'running' &&
      status !== 'compiling' &&
      status !== 'queued') ||
    (claimsComplete && terminalState !== undefined && terminalState !== 'completed') ||
    (claimsRunning &&
      terminalState !== undefined &&
      terminalState !== 'running' &&
      terminalState !== 'queued')
  ) {
    violations.push(
      violation(
        'verified_state_contradiction',
        'deterministic',
        'Provider prose contradicts verified lifecycle state.',
      ),
    );
  }
  const capabilityContradiction = [...facts.plugins, ...facts.mcps].some((capability) => {
    const escapedId = capability.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const claim = new RegExp(
      `\\b${escapedId}\\b[^.!?\\n]{0,80}\\b(available|connected|authenticated)\\b`,
      'i',
    )
      .exec(prose)?.[1]
      ?.toLowerCase();
    if (!claim) return false;
    const rank = {
      planned: 0,
      unavailable: 0,
      degraded: 0,
      available: 1,
      connected: 2,
      authenticated: 3,
    } as const;
    return rank[claim as 'available' | 'connected' | 'authenticated'] > rank[capability.state];
  });
  if (capabilityContradiction) {
    violations.push(
      violation(
        'verified_capability_contradiction',
        'deterministic',
        'Provider prose exceeds the verified capability state.',
      ),
    );
  }
  if (
    facts.modelState === 'unavailable' &&
    /\b(?:switched|fell back|using another model|changed models?)\b/i.test(prose)
  ) {
    violations.push(
      violation(
        'verified_model_contradiction',
        'deterministic',
        'Provider prose claims an unverified model switch.',
      ),
    );
  }
  if (
    (mode === 'sensitive' || mode === 'action_failure') &&
    /\b(?:joke|funny|hilarious|amusing|silver lining)\b/i.test(prose)
  ) {
    violations.push(
      violation('inappropriate_humor', 'repairable', 'Humor is not appropriate for this mode.'),
    );
  }
  return Object.freeze(violations);
}
