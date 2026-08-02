import { describe, expect, it } from 'vitest';
import { createClarificationQuestionBlock, parseJarvisQuestionBlocks } from './questionParser';

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

  it('keeps only the first decision while preserving three presets plus custom input', () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
      id: `q${index}`,
      prompt: `Question ${index}`,
      options: Array.from({ length: 5 }, (__, option) => ({
        id: `o${option}`,
        label: `Option ${option}`,
      })),
    }));
    const parsed = parseJarvisQuestionBlocks(
      `\`\`\`jarvis_question\n${JSON.stringify({ questions })}\n\`\`\``,
    );
    const part = parsed.parts.find((item) => item.kind === 'question_block');
    expect(part?.kind).toBe('question_block');
    if (part?.kind !== 'question_block') return;
    expect(part.block.questions).toHaveLength(1);
    expect(part.block.questions.every((question) => question.options?.length === 3)).toBe(true);
    expect(part.block.questions.every((question) => question.allowCustomResponse)).toBe(true);
  });

  it('keeps only the first structured question block in one assistant turn', () => {
    const block = (id: string, prompt: string) =>
      `\`\`\`jarvis_question\n${JSON.stringify({
        id,
        questions: [{ id: `${id}_q`, prompt }],
      })}\n\`\`\``;

    const parsed = parseJarvisQuestionBlocks(
      `${block('first', 'Which project?')}\n${block('second', 'Which branch?')}`,
    );

    expect(parsed.parts.filter((part) => part.kind === 'question_block')).toHaveLength(1);
    const questionPart = parsed.parts.find((part) => part.kind === 'question_block');
    expect(questionPart?.kind).toBe('question_block');
    if (questionPart?.kind !== 'question_block') return;
    expect(questionPart.block.id).toBe('first');
    expect(questionPart.block.questions.map((question) => question.prompt)).toEqual([
      'Which project?',
    ]);
  });

  it('creates one deterministic fallback question for a blocked decision', () => {
    const block = createClarificationQuestionBlock('Build a game.');

    expect(block.questions).toHaveLength(1);
    expect(block.questions[0]).toMatchObject({
      id: 'scope',
      prompt: 'What scope should I use?',
      required: true,
      allowSkip: false,
      allowCustomResponse: true,
    });
    expect(block.questions[0]?.options).toHaveLength(3);
  });

  it('leaves plain text unchanged when there is no question block', () => {
    const parsed = parseJarvisQuestionBlocks('Just normal assistant text.');

    expect(parsed.hasQuestionBlocks).toBe(false);
    expect(parsed.parts).toEqual([{ kind: 'text', text: 'Just normal assistant text.' }]);
  });
});
