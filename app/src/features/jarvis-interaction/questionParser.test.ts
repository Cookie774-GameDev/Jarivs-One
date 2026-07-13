import { describe, expect, it } from 'vitest';
import { parseJarvisQuestionBlocks } from './questionParser';

describe('parseJarvisQuestionBlocks', () => {
  it('converts fenced jarvis_question JSON into question_block parts and keeps prose', () => {
    const parsed = parseJarvisQuestionBlocks(`Before\n\n\`\`\`jarvis_question\n{
  "id": "qb_1",
  "title": "Choose scope",
  "questions": [
    {
      "id": "q1",
      "prompt": "Which files?",
      "type": "multi",
      "required": true,
      "options": [
        { "id": "chat", "label": "Chat UI" },
        { "id": "runtime", "label": "Runtime" }
      ]
    }
  ]
}\n\`\`\`\n\nAfter`);

    expect(parsed.hasQuestionBlocks).toBe(true);
    expect(parsed.parts).toEqual([
      { kind: 'text', text: 'Before' },
      {
        kind: 'question_block',
        block: {
          id: 'qb_1',
          title: 'Choose scope',
          questions: [
            {
              id: 'q1',
              prompt: 'Which files?',
              type: 'multi',
              required: true,
              options: [
                { id: 'chat', label: 'Chat UI' },
                { id: 'runtime', label: 'Runtime' },
                { id: 'recommended', label: 'Use Jarvis’s recommended option' },
              ],
              allowCustomResponse: true,
            },
          ],
          status: 'pending',
        },
      },
      { kind: 'text', text: 'After' },
    ]);
  });

  it('caps batches at three and enforces three presets plus custom input', () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
      id: `q${index}`,
      prompt: `Question ${index}`,
      options: Array.from({ length: 5 }, (__, option) => ({ id: `o${option}`, label: `Option ${option}` })),
    }));
    const parsed = parseJarvisQuestionBlocks(
      `\`\`\`jarvis_question\n${JSON.stringify({ questions })}\n\`\`\``,
    );
    const part = parsed.parts.find((item) => item.kind === 'question_block');
    expect(part?.kind).toBe('question_block');
    if (part?.kind !== 'question_block') return;
    expect(part.block.questions).toHaveLength(3);
    expect(part.block.questions.every((question) => question.options?.length === 3)).toBe(true);
    expect(part.block.questions.every((question) => question.allowCustomResponse)).toBe(true);
  });

  it('leaves plain text unchanged when there is no question block', () => {
    const parsed = parseJarvisQuestionBlocks('Just normal assistant text.');

    expect(parsed.hasQuestionBlocks).toBe(false);
    expect(parsed.parts).toEqual([{ kind: 'text', text: 'Just normal assistant text.' }]);
  });
});
