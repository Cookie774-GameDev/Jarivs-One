import type { JarvisLintViolation } from './linter';

export type JarvisSensitiveTopic =
  | 'crisis'
  | 'personal_safety'
  | 'medical'
  | 'legal'
  | 'financial'
  | 'security'
  | 'safety'
  | 'general';

const TOPIC_RULES: readonly Readonly<{
  topic: Exclude<JarvisSensitiveTopic, 'general'>;
  patterns: readonly RegExp[];
}>[] = Object.freeze([
  {
    topic: 'crisis',
    patterns: Object.freeze([
      /\b(?:I|we)\s+(?:want|plan|intend|am going|are going|may)\s+to\s+die\b/i,
      /\b(?:I|we)\s+(?:want|plan|intend|am going|are going|may)\s+to\s+(?:hurt|kill|shoot|poison|cut)\s+(?:myself|ourselves)\b/i,
      /\b(?:I'm|we're)\s+going\s+to\s+(?:die|(?:hurt|kill|shoot|poison|cut)\s+(?:myself|ourselves))\b/i,
      /\b(?:hurt|kill|shoot|poison|cut)\s+(?:myself|ourselves)\b/i,
      /\b(?:I|we)\s+(?:do not|don't)\s+want\s+to\s+live\b/i,
      /\b(?:end|take)\s+(?:my|our)\s+(?:own\s+)?li(?:fe|ves)\b/i,
      /\b(?:I am|I'm|we are|we're)\s+suicidal\b/i,
      /\b(?:suicidal thoughts?|thoughts? of suicide|thinking about suicide|plan(?:ning)? (?:my )?suicide)\b/i,
      /\b(?:self[- ]?harm)\b/i,
    ]),
  },
  {
    topic: 'personal_safety',
    patterns: Object.freeze([
      /\b(?:I|we)\s+(?:was|were|am|are|have been|have)\s+(?:assaulted|abused|attacked|stalked)\b/i,
      /\b(?:I|we)\s+(?:do not|don't)\s+feel safe\b/i,
      /\b(?:sexual assault|domestic (?:violence|abuse)|partner abuse|being stalked|unsafe (?:partner|home))\b/i,
    ]),
  },
  {
    topic: 'medical',
    patterns: Object.freeze([
      /\b(?:medical advice|medical emergency|allergic reaction|overdose|chest pain|difficulty breathing)\b/i,
      /\b(?:should|can|may|is it safe to)\b[^.!?\n]{0,80}\b(?:take|change|double|stop|start|increase|decrease)\b[^.!?\n]{0,60}\b(?:medication|medicine|dose|dosage|prescription|ibuprofen|acetaminophen|paracetamol|aspirin|insulin)\b/i,
      /\bhow (?:much|many)\b[^.!?\n]{0,60}\b(?:medication|medicine|ibuprofen|acetaminophen|paracetamol|aspirin|insulin|tablets?|pills?)\b[^.!?\n]{0,40}\b(?:can|should|may|safe|take|use)\b/i,
      /\b(?:double|change|stop|start|increase|decrease)\b[^.!?\n]{0,40}\b(?:my\s+)?(?:medication|dose|dosage|prescription)\b/i,
      /\b(?:diagnose|treat)\b[^.!?\n]{0,60}\b(?:my|these|this)\s+(?:symptoms?|condition|injury|pain)\b/i,
    ]),
  },
  {
    topic: 'legal',
    patterns: Object.freeze([
      /\b(?:legal advice|being sued|eviction notice|criminal charge|contract dispute|tenant rights|visa appeal)\b/i,
      /\b(?:court|filing|appeal|response)\s+deadline\b/i,
      /\b(?:can|could|may|will)\b[^.!?\n]{0,50}\b(?:landlord|employer|police|court)\b[^.!?\n]{0,50}\b(?:evict|fire|arrest|sue|charge|fine|deport)\b/i,
      /\b(?:what are my rights|can I be sued|I was charged|I have been charged)\b/i,
      /\bshould I sign\b[^.!?\n]{0,60}\b(?:contract|lease|agreement|waiver|settlement|court form|legal document|deed)\b/i,
    ]),
  },
  {
    topic: 'financial',
    patterns: Object.freeze([
      /\b(?:financial advice|investment advice|tax advice)\b/i,
      /\b(?:should|can|may|is it wise to)\b[^.!?\n]{0,70}\b(?:invest|buy|sell|trade|put)\b[^.!?\n]{0,90}\b(?:life savings|retirement savings|savings|bitcoin|crypto(?:currency)?|stocks?|securities|portfolio|funds?)\b/i,
      /\b(?:life|retirement)\s+savings\b[^.!?\n]{0,60}\b(?:invest|bitcoin|crypto(?:currency)?|stocks?|securities|portfolio)\b/i,
      /\b(?:what should I do|should I)\b[^.!?\n]{0,70}\b(?:debt|mortgage|loan|tax liability|bankruptcy)\b/i,
    ]),
  },
  {
    topic: 'security',
    patterns: Object.freeze([
      /\b(?:my|our|the)\b[^.!?\n]{0,50}\b(?:account|computer|device|network|email|wallet)\b[^.!?\n]{0,30}\b(?:was|were|is|are|got|been)?\s*(?:hacked|compromised|phished)\b/i,
      /\b(?:data breach|security incident|account takeover|ransomware|malware infection|phishing attack|exploited vulnerability)\b/i,
      /\b(?:gave|sent|shared|exposed|leaked)\b[^.!?\n]{0,60}\b(?:password|api key|token|credentials?)\b[^.!?\n]{0,50}\b(?:scammer|attacker|stranger|public|online)\b/i,
      /\b(?:password|api key|token|credentials?)\b[^.!?\n]{0,60}\b(?:scammer|leaked|exposed|stolen|compromised)\b/i,
    ]),
  },
  {
    topic: 'safety',
    patterns: Object.freeze([
      /\b(?:gas leak|electrical hazard|chemical spill|carbon monoxide|building fire|serious injury|immediate danger)\b/i,
      /\b(?:I|we)\s+smell\s+gas\b/i,
      /\b(?:poison(?:ing|ed)|unsafe equipment)\b[^.!?\n]{0,60}\b(?:what should|help|danger|emergency|evacuat)\b/i,
    ]),
  },
]);

const UNCERTAINTY_SIGNAL =
  /\b(?:cannot|can't|uncertain|depends?|general information|not (?:medical|legal|financial) advice|circumstances|unable to (?:assess|confirm|verify)|(?:could|may|might)\s+(?:be|have|not|depend|vary|indicate|suggest|require))\b/i;

const SAFETY_CONTEXT: Readonly<Record<JarvisSensitiveTopic, RegExp>> = Object.freeze({
  crisis:
    /\b(?:immediate safety|move away|stay with|do not (?:be|stay) alone|trusted (?:person|adult)|urgent help|danger)\b/i,
  personal_safety:
    /\b(?:immediate safety|safer place|avoid confronting|preserve (?:relevant )?evidence|trusted (?:person|adult)|may be at risk|danger)\b/i,
  medical:
    /\b(?:(?:avoid|do not|don't)\b[^.!?]{0,60}\b(?:chang(?:e|ing)|tak(?:e|ing)|medication|treatment|dose)|allerg|severe|worsening|urgent|contraindication|immediate danger)\b/i,
  legal:
    /\b(?:jurisdiction|deadline|filing deadline|preserve (?:relevant )?records|do not miss|rights|legal consequences)\b/i,
  financial:
    /\b(?:risk|loss|fees?|tax (?:impact|consequences?|liability)|risk tolerance|cannot afford|market volatility|do not commit)\b/i,
  security:
    /\b(?:isolate|disconnect|preserve evidence|rotate|revoke|trusted device|do not (?:use|continue)|stop using)\b/i,
  safety:
    /\b(?:hazard|move away|evacuat(?:e|ion)|immediate danger|worsen|anyone may be at risk)\b/i,
  general: /\b(?:harm|irreversible|immediate danger|risk|worsen)\b/i,
});

const PROFESSIONAL_HELP: Readonly<Record<JarvisSensitiveTopic, RegExp>> = Object.freeze({
  crisis:
    /\b(?:qualified (?:crisis|mental-health|mental health) professional|emergency services|trusted (?:person|adult))\b/i,
  personal_safety:
    /\b(?:emergency services|victim-support professional|assault professional|abuse professional|trusted (?:person|adult))\b/i,
  medical:
    /\b(?:qualified clinician|doctor|healthcare professional|pharmacist|emergency services)\b/i,
  legal: /\b(?:qualified lawyer|attorney|legal-aid|legal aid)\b/i,
  financial:
    /\b(?:qualified financial adviser|qualified financial advisor|accountant|tax professional)\b/i,
  security:
    /\b(?:security (?:or )?incident-response team|incident response team|security team|affected provider|IT administrator)\b/i,
  safety: /\b(?:emergency services|qualified safety professional|local authorities)\b/i,
  general: /\b(?:qualified professional|emergency services)\b/i,
});

const EMERGENCY_HELP = /\b(?:emergency services|emergency department|urgent help)\b/i;

const FALLBACKS: Readonly<Record<JarvisSensitiveTopic, string>> = Object.freeze({
  crisis:
    'I cannot assess your immediate safety from here. Move away from anything you could use to hurt yourself and stay with a trusted person if you can. If you may be in immediate danger, contact local emergency services now or seek urgent help from a qualified crisis or mental-health professional.',
  personal_safety:
    'I cannot assess your immediate safety or the full situation from here. Move to a safer place, avoid confronting the person if that could increase danger, and preserve relevant evidence when safe. Contact someone you trust and local emergency services or an appropriate assault, abuse, or victim-support professional if you may be at risk.',
  medical:
    'I cannot diagnose this or confirm what is safe for your circumstances. Avoid changing medication or treatment solely from this reply, and treat severe or worsening symptoms as urgent. Contact a qualified clinician or pharmacist, and use local emergency services if there may be immediate danger.',
  legal:
    'This is general information, and the answer may depend on your jurisdiction and exact facts. Preserve relevant records and do not miss any filing, court, or response deadline. A qualified lawyer or legal-aid service can assess the consequences and options.',
  financial:
    'This is general information, and the outcome may depend on your finances, taxes, fees, and risk tolerance. Do not commit funds you cannot afford to lose or act solely on this reply. A qualified financial adviser, accountant, or tax professional can review the decision.',
  security:
    'I cannot verify the scope of the security incident from this reply. Isolate the affected system, preserve evidence, and rotate or revoke exposed credentials from a trusted device. Contact your security or incident-response team or the affected provider, and use emergency services if there is an immediate physical-safety risk.',
  safety:
    'I cannot assess the immediate danger from here. Move away from the hazard, avoid actions that could worsen it, and evacuate if needed. Contact local emergency services or a qualified safety professional if anyone may be at risk.',
  general:
    'I cannot confirm the safest answer without more context. Avoid any step that could cause harm or an irreversible consequence. A qualified professional can assess the situation, and contact local emergency services if there may be immediate danger.',
});

function deterministicViolation(code: string, safeSummary: string): JarvisLintViolation {
  return Object.freeze({ code, disposition: 'deterministic', safeSummary });
}

export function classifyJarvisSensitiveTopic(
  userText: string,
): Exclude<JarvisSensitiveTopic, 'general'> | undefined {
  return TOPIC_RULES.find(({ patterns }) => patterns.some((pattern) => pattern.test(userText)))
    ?.topic;
}

export function lintJarvisSensitiveProse(
  prose: string,
  topic: JarvisSensitiveTopic,
): readonly JarvisLintViolation[] {
  const violations: JarvisLintViolation[] = [];
  if (prose.trim() !== FALLBACKS[topic]) {
    violations.push(
      deterministicViolation(
        'sensitive_closed_response_required',
        'Sensitive guidance must use the reviewed closed response for its topic.',
      ),
    );
  }
  if (!UNCERTAINTY_SIGNAL.test(prose)) {
    violations.push(
      deterministicViolation(
        'sensitive_uncertainty_missing',
        'Sensitive guidance must state its uncertainty or limits.',
      ),
    );
  }
  if (!SAFETY_CONTEXT[topic].test(prose)) {
    violations.push(
      deterministicViolation(
        'sensitive_safety_context_missing',
        'Sensitive guidance must retain essential safety context.',
      ),
    );
  }
  if (!PROFESSIONAL_HELP[topic].test(prose)) {
    violations.push(
      deterministicViolation(
        'sensitive_professional_help_missing',
        'Sensitive guidance must identify appropriate professional help.',
      ),
    );
  }
  if (topic === 'crisis' && !EMERGENCY_HELP.test(prose)) {
    violations.push(
      deterministicViolation(
        'sensitive_emergency_help_missing',
        'Immediate crisis guidance must identify emergency help.',
      ),
    );
  }
  return Object.freeze(violations);
}

export function buildJarvisSensitiveFallback(topic: JarvisSensitiveTopic): string {
  return FALLBACKS[topic];
}
