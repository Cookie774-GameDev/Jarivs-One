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
  const options = Array.isArray(record.options)
    ? record.options.map(asOption).filter((option): option is JarvisQuestionOption => Boolean(option))
    : undefined;
  return {
    id: asString(record.id, `q_${index + 1}`),
    prompt,
    type,
    options,
    required: asBoolean(record.required),
    allowSkip: asBoolean(record.allowSkip),
    placeholder: asString(record.placeholder) || undefined,
  };
}

function asQuestionBlock(value: unknown, index: number): JarvisQuestionBlock | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.questions)) return null;
  const questions = record.questions
    .map(asQuestion)
    .filter((question): question is JarvisQuestion => Boolean(question));
  if (questions.length === 0) return null;
  return {
    id: asString(record.id, `qb_${Date.now()}_${index}`),
    title: asString(record.title) || undefined,
    description: asString(record.description) || undefined,
    questions,
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
