import { deepFreezeJarvisCopy } from './requestEnvelope';

export type JarvisDelegationReason =
  | 'repository'
  | 'research'
  | 'large_change'
  | 'document'
  | 'design'
  | 'parallel';

export interface JarvisDelegationTask {
  role: string;
  objective: string;
}

export type JarvisDelegationDecision =
  | Readonly<{ status: 'direct'; reason: 'trivial' | 'single_task' }>
  | Readonly<{
      status: 'delegate';
      reason: JarvisDelegationReason;
      tasks: readonly Readonly<JarvisDelegationTask>[];
    }>;

const MAX_DELEGATION_TEXT = 800;

function safeTaskText(raw: string): string {
  return raw
    .replace(
      /\b(?:sk-(?:proj|live|test)-[a-z0-9_-]{12,}|xox[baprs]-[a-z0-9-]{12,}|gh[pousr]_[a-z0-9]{12,})\b/giu,
      '[redacted]',
    )
    .replace(
      /\b(?:api[\s_-]?key|access[\s_-]?token|password|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
      '[redacted]',
    )
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_DELEGATION_TEXT);
}

function frozenDecision(decision: JarvisDelegationDecision): JarvisDelegationDecision {
  return deepFreezeJarvisCopy(decision);
}

function direct(reason: 'trivial' | 'single_task'): JarvisDelegationDecision {
  return frozenDecision({ status: 'direct', reason });
}

function delegated(
  reason: JarvisDelegationReason,
  tasks: readonly JarvisDelegationTask[],
): JarvisDelegationDecision {
  const unique = tasks
    .filter((task) => task.role.trim() && task.objective.trim())
    .filter(
      (task, index, all) =>
        all.findIndex((candidate) => candidate.role.toLowerCase() === task.role.toLowerCase()) ===
        index,
    )
    .slice(0, 3);
  return frozenDecision({ status: 'delegate', reason, tasks: unique });
}

function task(role: string, objective: string): JarvisDelegationTask {
  return {
    role,
    objective: `${objective} Work read-only and return only evidence, conclusions, and blockers; do not modify files.`,
  };
}

function isTrivialDirectRequest(text: string): boolean {
  return (
    /^(?:hi|hey|hello|howdy|yo)[.!?]*$/iu.test(text) ||
    /^(?:quick\s+)?(?:status|progress)(?:\s+question)?\b|^(?:quick\s+)?question:\s*(?:what|when|where|who)\b/iu.test(
      text,
    ) ||
    /^(?:open|show|go\s+to|navigate\s+to)\s+\S+/iu.test(text) ||
    /^(?:switch(?:\s+me)?\s+to|use)\s+(?:gemini|grok|a?\s*local model)\b|^switch back[.!?]*$/iu.test(
      text,
    ) ||
    /^(?:toggle|turn\s+(?:on|off)|mute|unmute|close|hide)\s+(?:the\s+)?(?:sidebar|navigation|nav|captions?|microphone|mic)\b/iu.test(
      text,
    )
  );
}

/**
 * Decide whether a request warrants child-agent work without inspecting
 * repositories, starting agents, or mutating state. Matching is deliberately
 * conservative: ordinary work remains with JARVIS unless the value of a
 * specialist or parallel read-only analysis is explicit in the request.
 */
export function planJarvisDelegation(raw: string): Readonly<JarvisDelegationDecision> {
  const text = safeTaskText(raw);
  if (!text || isTrivialDirectRequest(text)) return direct('trivial');

  if (
    /\b(?:audit|map|trace|explore)\b[\s\S]*\b(?:repo(?:sitory)?|codebase)\b/iu.test(text) ||
    /\b(?:deep(?:ly)?|entire|whole|full|comprehensive)\b[\s\S]*\b(?:repo(?:sitory)?|codebase)\b/iu.test(
      text,
    )
  ) {
    return delegated('repository', [
      task('Scout', `Map the relevant repository structure and evidence for this request: ${text}`),
      task(
        'Reviewer',
        `Independently identify correctness, security, and verification risks for this repository request: ${text}`,
      ),
    ]);
  }

  if (
    /\bresearch\b[\s\S]*\b(?:sources?|citations?|papers?|references?)\b/iu.test(text) ||
    /\b(?:compare|verify)\b[\s\S]*\b(?:multiple|several|independent)\s+sources?\b/iu.test(text)
  ) {
    return delegated('research', [
      task('Researcher', `Gather and attribute the minimum sufficient sources for: ${text}`),
      task('Fact reviewer', `Independently verify the key claims and source quality for: ${text}`),
    ]);
  }

  if (
    /\b(?:large|major|cross-cutting|repo-wide|many files?)\b[\s\S]*\b(?:change|refactor|implementation|feature)\b/iu.test(
      text,
    ) ||
    /\b(?:change|refactor|implementation|feature)\b[\s\S]*\b(?:across many files?|repo-wide)\b/iu.test(
      text,
    )
  ) {
    return delegated('large_change', [
      task('Scout', `Map affected files, dependencies, and acceptance checks for: ${text}`),
      task('Reviewer', `Independently assess regression and security risks for: ${text}`),
    ]);
  }

  if (
    /\b(?:canva|figma|design-capable|designer)\b/iu.test(text) &&
    /\b(?:design|landing[\s-]?page|mockup|brand|visual)\b/iu.test(text)
  ) {
    return delegated('design', [
      task(
        'Design specialist',
        `Prepare the design approach and verified connector requirements for: ${text}`,
      ),
    ]);
  }

  if (
    /\b(?:write|draft|prepare|create)\b[\s\S]*\b(?:polished|formal|specialist|publication-ready)\b[\s\S]*\b(?:document|report|proposal|specification|brief)\b/iu.test(
      text,
    ) ||
    /\b(?:polished|formal|specialist|publication-ready)\b[\s\S]*\b(?:document|report|proposal|specification|brief)\b/iu.test(
      text,
    )
  ) {
    return delegated('document', [
      task('Writer', `Prepare the specialist document structure and draft for: ${text}`),
    ]);
  }

  if (/\b(?:in parallel|parallel work|concurrently|independent parallel)\b/iu.test(text)) {
    return delegated('parallel', [
      task('Scout', `Inspect the first independent workstream requested here: ${text}`),
      task('Reviewer', `Inspect the second independent workstream requested here: ${text}`),
    ]);
  }

  return direct('single_task');
}
