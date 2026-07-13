export type JarvisIntentKind =
  | 'greeting'
  | 'informational'
  | 'brainstorm'
  | 'clarification-needed'
  | 'file-create'
  | 'file-edit'
  | 'project-build'
  | 'command-run'
  | 'plan-only'
  | 'implementation'
  | 'destructive'
  | 'unknown';

export interface JarvisIntent {
  kind: JarvisIntentKind;
  needsQuestions: boolean;
  needsVisiblePlan: boolean;
  needsImplementationApproval: boolean;
  canProceedReadOnly: boolean;
  destination?: string;
  confidence: number;
  reasons: string[];
}

export interface JarvisIntentInput {
  text: string;
  structuredKind?: JarvisIntentKind;
  destination?: string;
  hasResolvedDestination?: boolean;
}

const GREETING_RE = /^\s*(?:hi|hey|hello|howdy|good (?:morning|afternoon|evening)|yo)[!.?\s]*$/i;
const EXPLICIT_QUESTIONS_RE = /\b(?:ask me|question me|clarify with me)\b[\s\S]{0,80}\b(?:question|questions|first|before)\b/i;
const FILE_CREATE_RE = /\b(?:create|make|write|draft|generate|add)\b[\s\S]{0,80}\b(?:new\s+)?(?:file|document|script|page|stylesheet|config|roadmap)\b/i;
const FILE_EDIT_RE = /\b(?:edit|update|append|replace|modify|fix)\b[\s\S]{0,80}\b(?:file|document|script|page|stylesheet|config|roadmap|\.[a-z0-9]{1,8}\b)/i;
const COMMAND_RE = /\b(?:run|execute|start|launch|preview|build|test|install)\b[\s\S]{0,100}\b(?:command|script|server|app|game|tests?|npm|pnpm|yarn|cargo|powershell|terminal)\b/i;
const DESTRUCTIVE_RE = /\b(?:delete|drop|truncate|wipe|erase|uninstall|reset|deploy|publish|charge|refund)\b/i;
const PROJECT_BUILD_RE = /\b(?:build|create|make|implement|develop)\b[\s\S]{0,120}\b(?:app|application|website|site|game|project|feature|system|component)\b/i;
const PLAN_ONLY_RE = /\b(?:plan|roadmap|proposal|architecture)\b[\s\S]{0,80}\b(?:only|without (?:editing|building|implementing)|do not (?:edit|build|implement))\b/i;
const BRAINSTORM_RE = /\b(?:brainstorm|ideas?|names?|concepts?|options?)\b/i;
const INFORMATIONAL_RE = /^(?:what|why|who|when|where|how|explain|summarize|translate|compare|list)\b/i;

function result(kind: JarvisIntentKind, patch: Partial<JarvisIntent> = {}): JarvisIntent {
  const mutating = ['file-create', 'file-edit', 'project-build', 'command-run', 'implementation', 'destructive'].includes(kind);
  return {
    kind,
    needsQuestions: false,
    needsVisiblePlan: kind === 'project-build' || kind === 'implementation' || kind === 'destructive',
    needsImplementationApproval: mutating,
    canProceedReadOnly: !mutating,
    confidence: 0.72,
    reasons: [],
    ...patch,
  };
}

/** Deterministic safety classifier. Structured model output may select a kind,
 * but cannot bypass the mutation, destructive-action, or explicit-question rules. */
export function classifyJarvisIntent(input: JarvisIntentInput): JarvisIntent {
  const text = input.text.trim();
  const destination = input.destination?.trim() || undefined;
  if (!text) return result('unknown', { confidence: 1, reasons: ['empty request'] });
  if (EXPLICIT_QUESTIONS_RE.test(text)) {
    return result('clarification-needed', {
      needsQuestions: true,
      confidence: 0.99,
      reasons: ['user explicitly requested clarification questions'],
      destination,
    });
  }
  if (GREETING_RE.test(text)) {
    return result('greeting', { confidence: 0.99, reasons: ['short greeting'], destination });
  }
  if (DESTRUCTIVE_RE.test(text)) {
    return result('destructive', {
      needsQuestions: /\bdeploy|publish\b/i.test(text) && !destination,
      confidence: 0.95,
      reasons: ['request contains a destructive or externally consequential action'],
      destination,
    });
  }
  if (PLAN_ONLY_RE.test(text)) {
    return result('plan-only', { confidence: 0.94, reasons: ['explicit plan-only request'], destination });
  }
  if (FILE_EDIT_RE.test(text)) {
    return result('file-edit', { confidence: 0.9, reasons: ['existing-file mutation requested'], destination });
  }
  if (FILE_CREATE_RE.test(text)) {
    return result('file-create', {
      needsQuestions: false,
      confidence: 0.9,
      reasons: [input.hasResolvedDestination ? 'new file requested with resolved destination' : 'new file requested; safe default destination is available'],
      destination,
    });
  }
  if (PROJECT_BUILD_RE.test(text)) {
    return result('project-build', {
      needsQuestions: /\b(?:game|website|site|app|application)\b/i.test(text) && text.length < 120,
      confidence: 0.86,
      reasons: ['multi-step project implementation requested'],
      destination,
    });
  }
  if (COMMAND_RE.test(text)) {
    return result('command-run', { confidence: 0.88, reasons: ['command or runnable workflow requested'], destination });
  }
  if (BRAINSTORM_RE.test(text)) {
    return result('brainstorm', { confidence: 0.84, reasons: ['ideation request'], destination });
  }
  if (INFORMATIONAL_RE.test(text)) {
    return result('informational', { confidence: 0.82, reasons: ['read-only information request'], destination });
  }
  if (input.structuredKind) {
    return result(input.structuredKind, {
      confidence: 0.7,
      reasons: ['validated structured classifier result'],
      destination,
    });
  }
  return result('unknown', { confidence: 0.35, reasons: ['no deterministic class matched'], destination });
}

export function formatJarvisIntentPolicy(intent: JarvisIntent): string {
  return [
    '## Request policy classification',
    `Intent: ${intent.kind}`,
    `Clarification questions: ${intent.needsQuestions ? 'required before mutation' : 'not required unless a new blocker appears'}`,
    `Visible implementation plan: ${intent.needsVisiblePlan ? 'required' : 'not required'}`,
    `Implementation approval: ${intent.needsImplementationApproval ? 'required before side effects' : 'not required'}`,
    intent.destination ? `Resolved destination: ${intent.destination}` : '',
    `Reason: ${intent.reasons.join('; ')}`,
    'This classification is a safety boundary. Do not invent completed actions or request approval for a read-only answer.',
  ].filter(Boolean).join('\n');
}
