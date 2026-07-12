import type { Part } from '@/types/chat';
import type { JarvisQuestion, JarvisQuestionBlock, JarvisQuestionOption } from './types';

const QUESTION_FENCE_RE = /```jarvis_question\s*([\s\S]*?)```/gi;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asOption(value: unknown, index: number): JarvisQuestionOption | null {
  const record = asRecord(value);
  if (!record) return null;
  const label = asString(record.label);
  if (!label) return null;
  return {
    id: asString(record.id, `option_${index + 1}`),
    label,
    description: asString(record.description) || undefined,
  };
}

const FALLBACK_OPTIONS: JarvisQuestionOption[] = [
  { id: 'recommended', label: 'Use Jarvis’s recommended option' },
  { id: 'current_defaults', label: 'Use the current project defaults' },
  { id: 'minimal_scope', label: 'Use the smallest safe scope' },
];

function exactlyThreeOptions(value: unknown): JarvisQuestionOption[] {
  const parsed = Array.isArray(value)
    ? value.map(asOption).filter((option): option is JarvisQuestionOption => Boolean(option))
    : [];
  const unique = parsed.filter(
    (option, index, all) => all.findIndex((candidate) => candidate.id === option.id) === index,
  );
  for (const fallback of FALLBACK_OPTIONS) {
    if (unique.length >= 3) break;
    if (!unique.some((option) => option.id === fallback.id)) unique.push(fallback);
  }
  return unique.slice(0, 3);
}

function asQuestion(value: unknown, index: number): JarvisQuestion | null {
  const record = asRecord(value);
  if (!record) return null;
  const prompt = asString(record.prompt);
  if (!prompt) return null;
  const rawType = asString(record.type, 'text');
  const type: JarvisQuestion['type'] =
    rawType === 'single' || rawType === 'multi' || rawType === 'mixed' || rawType === 'text'
      ? rawType
      : 'text';
  const options = exactlyThreeOptions(record.options);
  return {
    id: asString(record.id, `q_${index + 1}`),
    prompt,
    type,
    options,
    required: asBoolean(record.required),
    allowSkip: asBoolean(record.allowSkip),
    placeholder: asString(record.placeholder) || undefined,
    allowCustomResponse: true,
  };
}

function asQuestionBlock(value: unknown, index: number): JarvisQuestionBlock | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.questions)) return null;
  const questions = record.questions
    .map(asQuestion)
    .filter((question): question is JarvisQuestion => Boolean(question))
    .slice(0, 3);
  if (questions.length === 0) return null;
  return {
    id: asString(record.id, `qb_${Date.now()}_${index}`),
    title: asString(record.title) || undefined,
    description: asString(record.description) || undefined,
    originalRequest: asString(record.originalRequest) || undefined,
    questions,
    status: 'pending',
  };
}

function stableId(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function createClarificationQuestionBlock(userText: string): JarvisQuestionBlock {
  const buildQuestion = (
    id: string,
    prompt: string,
    options: [JarvisQuestionOption, JarvisQuestionOption, JarvisQuestionOption],
  ): JarvisQuestion => ({
    id,
    prompt,
    type: 'single',
    options,
    required: true,
    allowSkip: false,
    allowCustomResponse: true,
  });
  return {
    id: `qb_clarify_${stableId(userText)}`,
    title: 'A few details before I continue',
    description: 'Answer up to three focused questions. Your answers stay attached to this task.',
    originalRequest: userText,
    questions: [
      buildQuestion('scope', 'What scope should I use?', [
        { id: 'focused', label: 'Focused minimum' },
        { id: 'complete', label: 'Complete polished version' },
        { id: 'phased', label: 'Build it in phases' },
      ]),
      buildQuestion('direction', 'Which direction should guide the result?', [
        { id: 'match_project', label: 'Match the current project' },
        { id: 'recommended', label: 'Use Jarvis’s recommendation' },
        { id: 'practical', label: 'Prioritize practical defaults' },
      ]),
      buildQuestion('destination', 'Where should the result go?', [
        { id: 'active_project', label: 'Current active project' },
        { id: 'jarvis_projects', label: 'New folder under Jarvis Projects' },
        { id: 'saved_project', label: 'Another saved project' },
      ]),
    ],
    status: 'pending',
  };
}

function textPart(text: string): Part[] {
  const trimmed = text.trim();
  return trimmed ? [{ kind: 'text', text: trimmed }] : [];
}

export function parseJarvisQuestionBlocks(text: string): {
  hasQuestionBlocks: boolean;
  parts: Part[];
} {
  const parts: Part[] = [];
  let lastIndex = 0;
  let count = 0;
  for (const match of text.matchAll(QUESTION_FENCE_RE)) {
    parts.push(...textPart(text.slice(lastIndex, match.index)));
    lastIndex = (match.index ?? 0) + match[0].length;
    try {
      const parsed = JSON.parse(match[1] ?? '');
      const block = asQuestionBlock(parsed, count);
      if (block) {
        parts.push({ kind: 'question_block', block });
        count += 1;
      } else {
        parts.push({ kind: 'text', text: match[0].trim() });
      }
    } catch {
      parts.push({ kind: 'text', text: match[0].trim() });
    }
  }
  parts.push(...textPart(text.slice(lastIndex)));
  return {
    hasQuestionBlocks: count > 0,
    parts: parts.length ? parts : [{ kind: 'text', text }],
  };
}
