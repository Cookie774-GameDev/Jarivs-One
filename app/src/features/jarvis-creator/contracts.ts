import type { AgentCapability, ToolAllowlist } from '@/types';
import type { JarvisQuestionBlock } from '@/features/jarvis-interaction/types';

export type JarvisCreatorKind = 'agent' | 'skill';

export const JARVIS_CREATOR_START_EVENT = 'jarvis:creator:start';
export const JARVIS_CREATOR_APPLY_AGENT_EVENT = 'jarvis:creator:apply-agent';
export const JARVIS_CREATOR_APPLY_SKILL_EVENT = 'jarvis:creator:apply-skill';

export interface JarvisCreatorStartDetail {
  kind: JarvisCreatorKind;
  currentName?: string;
  currentDescription?: string;
}

export interface JarvisCreatorAgentDraft {
  name: string;
  description: string;
  system_prompt: string;
  capabilities: AgentCapability[];
  tools_allowed: ToolAllowlist;
  temperature: number;
}

export interface JarvisCreatorSkillDraft {
  title: string;
  description: string;
  tools: string[];
  systemPromptAddendum: string;
  body: string;
  emoji?: string;
}

export type JarvisCreatorDraft<K extends JarvisCreatorKind = JarvisCreatorKind> =
  K extends 'agent' ? JarvisCreatorAgentDraft : JarvisCreatorSkillDraft;

export type JarvisCreatorParseResult<K extends JarvisCreatorKind> =
  | { ok: true; draft: JarvisCreatorDraft<K> }
  | { ok: false; error: string };

export interface JarvisCreatorPromptContext {
  currentName?: string;
  currentDescription?: string;
}

export function buildJarvisCreatorQuestionBlock(kind: JarvisCreatorKind): JarvisQuestionBlock {
  const isAgent = kind === 'agent';
  return {
    id: `jarvis_creator_${kind}`,
    title: isAgent ? 'Make This Agent With Jarvis' : 'Make This Skill With Jarvis',
    description: 'Answer two quick prompts. Jarvis will draft the title, description, prompt, rules, and settings; then you still click Save.',
    status: 'pending',
    questions: [
      {
        id: 'goal',
        prompt: isAgent
          ? 'What do you want this agent to do?'
          : 'What do you want this skill to do?',
        type: 'text',
        required: true,
        placeholder: isAgent ? 'Example: Review React code and suggest safe fixes.' : 'Example: Turn rough notes into polished release notes.',
      },
      {
        id: 'rules_boundaries',
        prompt: isAgent
          ? 'How should it behave in detail? Include rules, tools, boundaries, tone, and do-not-dos.'
          : 'How should it behave in detail? Include examples, boundaries, tone, and do-not-dos.',
        type: 'text',
        required: true,
        placeholder: 'Be concise, avoid secrets, ask before risky actions...',
      },
    ],
  };
}

const AGENT_QUESTIONS = [
  'What do you want this agent to do?',
  'How should it behave in detail? Include rules, tools, boundaries, tone, and do-not-dos.',
];

const SKILL_QUESTIONS = [
  'What do you want this skill to do?',
  'How should it behave in detail? Include examples, boundaries, tone, and do-not-dos.',
];

export function buildJarvisCreatorPrompt(kind: JarvisCreatorKind, context: JarvisCreatorPromptContext = {}): string {
  const isAgent = kind === 'agent';
  const title = isAgent ? 'Create an agent with Jarvis' : 'Create a skill with Jarvis';
  const questions = isAgent ? AGENT_QUESTIONS : SKILL_QUESTIONS;
  const contextLabel = isAgent ? 'Current agent' : 'Current skill';
  const contextLines = context.currentName
    ? [
        `${contextLabel}: ${context.currentName}`,
        context.currentDescription ? `Current description: ${context.currentDescription}` : '',
        '',
      ].filter(Boolean)
    : [];
  return [
    title,
    '',
    ...contextLines,
    `Jarvis is already configured for this ${isAgent ? 'agent' : 'skill'} editor. This is a quick two-question setup with written responses only.`,
    'Use the two answers to draft production-style fields that feel like a focused expert wrote them, not a shallow template.',
    'Make every draft structured, detailed, concrete, and directly usable from the editor.',
    'The prompt/instructions must cover role, mission, behavior rules, boundaries, tools, output style, quality bar, and avoid-list.',
    isAgent
      ? 'Model agent prompts on the built-in agents: crisp identity, exact job, operating rules, honesty about uncertainty, and no vague motivational filler.'
      : 'Model skills as reusable operating instructions: when to use it, how to behave, inputs to respect, outputs to produce, and failure modes to avoid.',
    'Keep chat prose concise, but make the apply-ready fields complete enough to ship.',
    '',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    '',
    'After the user answers, turn the answers into polished draft fields for this editor.',
    'Once the two answers are present, return an apply-ready draft immediately so the UI can show a button to push it into the editor.',
    isAgent
      ? 'Return agent fields: name, description, system_prompt, capabilities, tools_allowed, and temperature. Pick a useful temperature from 0.0 to 2.0: lower for precise agents, higher for creative agents.'
      : [
          'Return skill fields in a single fenced JSON object with EXACT keys:',
          '  title (short skill name only)',
          '  description (one-sentence picker blurb)',
          '  tools (string array, e.g. ["files","terminal","web"])',
          '  systemPromptAddendum (runtime instructions injected into chat — operating rules only, not the title line)',
          '  body (library markdown: headings + full instructions for the skill library)',
          '  emoji (optional single emoji)',
          'Do NOT put the whole plan into systemPromptAddendum only. Fill title, description, systemPromptAddendum, and body separately.',
        ].join('\n'),
    'Avoid weak prompts: generic assistant language, one-line system prompts, unspecified tools, missing boundaries, fake certainty, and filler bullets.',
    'Reply with ONLY a fenced ```json block for apply-ready drafts (no long essay outside JSON). The user can still ask for changes before clicking Save.',
    'The user must still click Save in the editor. Applying the draft only fills the visible fields.',
  ].join('\n');
}

function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text;
  return JSON.parse(raw.trim());
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function asTemperature(value: unknown): number {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0.7;
  if (!Number.isFinite(raw)) return 0.7;
  return Math.max(0, Math.min(2, raw));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseAgentDraft(value: unknown): JarvisCreatorParseResult<'agent'> {
  if (!isRecord(value)) return { ok: false, error: 'Jarvis returned JSON, but it was not an object.' };
  const draft: JarvisCreatorAgentDraft = {
    name: asString(value.name),
    description: asString(value.description),
    system_prompt: asString(value.system_prompt),
    capabilities: asStringArray(value.capabilities) as AgentCapability[],
    tools_allowed: asStringArray(value.tools_allowed),
    temperature: asTemperature(value.temperature),
  };
  if (!draft.name || !draft.description || !draft.system_prompt) {
    return { ok: false, error: 'Jarvis JSON is missing name, description, or system_prompt.' };
  }
  return { ok: true, draft };
}

function parseSkillDraft(value: unknown): JarvisCreatorParseResult<'skill'> {
  if (!isRecord(value)) return { ok: false, error: 'Jarvis returned JSON, but it was not an object.' };
  // Accept common alias keys local models invent.
  const title =
    asString(value.title) ||
    asString(value.name) ||
    asString(value.skill_name) ||
    asString(value.skillName);
  const description =
    asString(value.description) ||
    asString(value.summary) ||
    asString(value.blurb);
  const systemPromptAddendum =
    asString(value.systemPromptAddendum) ||
    asString(value.system_prompt_addendum) ||
    asString(value.runtime_instructions) ||
    asString(value.runtimeInstructions) ||
    asString(value.addendum) ||
    asString(value.instructions);
  const body =
    asString(value.body) ||
    asString(value.markdown) ||
    asString(value.library_body) ||
    asString(value.libraryBody);
  const toolsRaw = value.tools ?? value.tool_list ?? value.toolList;
  const tools = Array.isArray(toolsRaw)
    ? asStringArray(toolsRaw)
    : asString(toolsRaw)
        .split(/[,;\n]+/)
        .map((t) => t.trim())
        .filter(Boolean);
  const draft: JarvisCreatorSkillDraft = {
    title,
    description,
    tools,
    systemPromptAddendum,
    body: body || systemPromptAddendum,
    emoji: asString(value.emoji) || undefined,
  };
  if (!draft.title || !draft.description || !draft.systemPromptAddendum) {
    return { ok: false, error: 'Jarvis JSON is missing title, description, or systemPromptAddendum.' };
  }
  return { ok: true, draft };
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unquote(value: string): string {
  return value
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
}

function firstMeaningfulLine(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s{0,3}#{1,6}\s+/.test(line))
    .map((line) => stripMarkdown(line))
    .find((line) => line.length > 12 && !line.endsWith(':') && !/^skill\s*name\b/i.test(line)) ?? '';
}

function firstHeading(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const heading = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*$/)?.[1];
      return heading ? stripMarkdown(heading) : '';
    })
    .find((line) => line.length >= 3 && line.length <= 80) ?? '';
}

/** Match `Label: value` on a single line (markdown bold optional). */
function labeledField(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(
    new RegExp(`^\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:\\-]\\s*(.+)$`, 'im'),
  );
  return match ? unquote(stripMarkdown(match[1] ?? '')) : '';
}

/**
 * Capture a multi-line section that starts at `Label:` / `**Label:**` / `## Label`
 * and runs until the next heading-like label.
 */
function labeledSection(text: string, labels: string[]): string {
  const labelAlt = labels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,3}\\s*|(?:\\*\\*)?)(?:${labelAlt})(?:\\*\\*)?\\s*[:\\-]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#{1,3}\\s*|\\*\\*)?(?:Skill\\s*Name|Title|Name|Description|Summary|Behavior|Instructions|Runtime|Tools|Body|Avoid|When to use|Do not)(?:\\*\\*)?\\s*[:\\-]|$)`,
    'i',
  );
  const match = text.match(re);
  return (match?.[1] ?? '').trim();
}

function cleanDraftName(value: string): string {
  return unquote(
    stripMarkdown(value)
      .replace(/^(?:skill\s*)?(?:name|title)\s*[:\-]\s*/i, '')
      .trim(),
  ).slice(0, 80);
}

function looksLikeCreatorSkillMarkdown(text: string): boolean {
  const normalized = text.toLowerCase();
  // Require at least two independent draft hints. A single incidental word
  // like "skill" in normal prose must not surface a Push button; when the
  // content is ambiguous we hide the action by default.
  const hints = [
    /additional aspects|runtime instructions|custom instructions|skill name|systempromptaddendum/.test(normalized),
    /\bskill\b/.test(normalized),
    /assistant should|conversation experience|reminder|behavior/.test(normalized),
    /boundaries|do not|avoid|must not|when to use|introduction/.test(normalized),
    /^\s*(?:[-*+]|\d+\.)\s+/m.test(text),
    /\*\*[^*]+\*\*\s*:/.test(text),
  ];
  return hints.filter(Boolean).length >= 2;
}

function looksLikeCreatorAgentMarkdown(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!normalized || /```json/i.test(normalized)) return false;
  const hints = [
    /\bagent\b/.test(normalized),
    /system[_ -]?prompt|persona|role|mission/.test(normalized),
    /capabilit/.test(normalized),
    /\btools?\b|tools[_ -]?allowed/.test(normalized),
    /behavior rules|boundaries|avoid|do not|must not/.test(normalized),
  ];
  return hints.filter(Boolean).length >= 2 && (hints[0] || hints[1]);
}

function extractToolsFromText(text: string): string[] {
  const labeled = labeledField(text, 'tools') || labeledField(text, 'tool list');
  if (labeled) {
    return labeled
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  const known = ['files', 'terminal', 'web', 'browser', 'shell', 'git', 'search'];
  const found = known.filter((tool) => new RegExp(`\\b${tool}\\b`, 'i').test(text));
  return found;
}

export function parseLooseJarvisCreatorAgentDraft(text: string): JarvisCreatorParseResult<'agent'> {
  const trimmed = text.trim();
  if (!trimmed || !looksLikeCreatorAgentMarkdown(trimmed)) {
    return { ok: false, error: 'Jarvis response does not look like an agent draft.' };
  }
  const name =
    cleanDraftName(labeledField(trimmed, 'name')) ||
    cleanDraftName(labeledField(trimmed, 'agent')) ||
    cleanDraftName(labeledField(trimmed, 'agent name')) ||
    cleanDraftName(firstHeading(trimmed)) ||
    'Jarvis Agent Draft';
  const firstLine = firstMeaningfulLine(trimmed);
  const descriptionSource =
    labeledField(trimmed, 'description') ||
    labeledSection(trimmed, ['Description', 'Summary']) ||
    (firstLine && firstLine.toLowerCase() !== name.toLowerCase() ? firstLine : '') ||
    'Jarvis-generated agent draft.';
  const behavior =
    labeledSection(trimmed, ['Behavior', 'Behavior rules', 'Instructions', 'System prompt', 'Rules']) ||
    stripMarkdown(trimmed);
  const systemPrompt = [
    `You are ${name}.`,
    behavior,
    'Operate conservatively: ask before risky actions, do not request secrets, and state uncertainty plainly.',
  ].join('\n\n');
  const draft: JarvisCreatorAgentDraft = {
    name,
    description: stripMarkdown(descriptionSource).slice(0, 180),
    system_prompt: systemPrompt,
    capabilities: ['reasoning'],
    tools_allowed: [],
    temperature: 0.4,
  };
  return { ok: true, draft };
}

/**
 * Markdown / prose fallback when the model does not return valid JSON.
 * Must still fill title, description, runtime addendum, and library body
 * with *distinct* usable content — not dump the entire reply into one field.
 */
export function parseLooseJarvisCreatorSkillDraft(text: string): JarvisCreatorParseResult<'skill'> {
  const trimmed = text.trim();
  // Allow loose parse even when a broken json fence is present (fall through).
  const withoutBrokenJson = trimmed.replace(/```json[\s\S]*?```/gi, '').trim() || trimmed;
  if (!withoutBrokenJson || !looksLikeCreatorSkillMarkdown(withoutBrokenJson)) {
    return { ok: false, error: 'Jarvis response does not look like a skill draft.' };
  }

  const title =
    cleanDraftName(labeledField(withoutBrokenJson, 'Skill Name')) ||
    cleanDraftName(labeledField(withoutBrokenJson, 'skill name')) ||
    cleanDraftName(labeledField(withoutBrokenJson, 'Title')) ||
    cleanDraftName(labeledField(withoutBrokenJson, 'Name')) ||
    cleanDraftName(firstHeading(withoutBrokenJson)) ||
    'Jarvis Skill Draft';

  const descriptionRaw =
    labeledField(withoutBrokenJson, 'Description') ||
    labeledField(withoutBrokenJson, 'Summary') ||
    labeledSection(withoutBrokenJson, ['Description', 'Summary']) ||
    firstMeaningfulLine(withoutBrokenJson);
  let description = stripMarkdown(descriptionRaw).slice(0, 180);
  // Avoid stuffing "Skill Name: Foo" into description when that's all we found.
  if (!description || /^skill\s*name\b/i.test(description) || description.toLowerCase() === title.toLowerCase()) {
    description = `Skill that ${title.replace(/skill$/i, '').trim() || 'helps with this task'}`.slice(0, 180);
  }

  const behaviorSection =
    labeledSection(withoutBrokenJson, [
      'Behavior',
      'Instructions',
      'Runtime instructions',
      'Runtime',
      'How it works',
      'Rules',
    ]) || '';

  // Runtime addendum: operating rules only — prefer Behavior section, else
  // full text with title/description lines stripped.
  let systemPromptAddendum = behaviorSection.trim();
  if (!systemPromptAddendum) {
    systemPromptAddendum = withoutBrokenJson
      .split(/\r?\n/)
      .filter((line) => {
        const plain = stripMarkdown(line);
        if (!plain) return false;
        if (/^skill\s*name\b/i.test(plain)) return false;
        if (/^title\b/i.test(plain)) return false;
        if (/^description\b/i.test(plain)) return false;
        if (plain.toLowerCase() === title.toLowerCase()) return false;
        return true;
      })
      .join('\n')
      .trim();
  }
  if (!systemPromptAddendum) {
    systemPromptAddendum = `When this skill is active, act as ${title}. Follow the user's goal carefully and stay within stated boundaries.`;
  }

  const tools = extractToolsFromText(withoutBrokenJson);

  const body = [
    `# ${title}`,
    '',
    description,
    '',
    '## Instructions',
    '',
    systemPromptAddendum,
  ].join('\n');

  const draft: JarvisCreatorSkillDraft = {
    title,
    description,
    tools,
    systemPromptAddendum,
    body,
    emoji: '✨',
  };
  return { ok: true, draft };
}

export function parseJarvisCreatorDraft<K extends JarvisCreatorKind>(
  kind: K,
  text: string,
): JarvisCreatorParseResult<K> {
  try {
    const parsed = extractJsonBlock(text);
    return (kind === 'agent' ? parseAgentDraft(parsed) : parseSkillDraft(parsed)) as JarvisCreatorParseResult<K>;
  } catch (err) {
    // JSON failed — try markdown/prose fallback so Push still works.
    if (kind === 'skill') {
      const loose = parseLooseJarvisCreatorSkillDraft(text);
      if (loose.ok) return loose as JarvisCreatorParseResult<K>;
    } else {
      const loose = parseLooseJarvisCreatorAgentDraft(text);
      if (loose.ok) return loose as JarvisCreatorParseResult<K>;
    }
    return {
      ok: false,
      error: `Jarvis did not return valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Normalize a skill draft so every editor field is always filled. */
export function normalizeJarvisCreatorSkillDraft(
  draft: Partial<JarvisCreatorSkillDraft> | null | undefined,
): JarvisCreatorSkillDraft | null {
  if (!draft) return null;
  const title = asString(draft.title) || 'Jarvis Skill Draft';
  const description =
    asString(draft.description) ||
    `Custom skill: ${title}`.slice(0, 180);
  const systemPromptAddendum =
    asString(draft.systemPromptAddendum) ||
    asString(draft.body) ||
    `When this skill is active, act as ${title}.`;
  const body =
    asString(draft.body) ||
    [`# ${title}`, '', description, '', '## Instructions', '', systemPromptAddendum].join('\n');
  const tools = Array.isArray(draft.tools)
    ? draft.tools.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (!title || !description || !systemPromptAddendum) return null;
  return {
    title,
    description,
    tools,
    systemPromptAddendum,
    body,
    emoji: asString(draft.emoji) || '✨',
  };
}
