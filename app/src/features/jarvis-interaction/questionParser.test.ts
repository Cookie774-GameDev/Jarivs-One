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
              ],
            },
          ],
          status: 'pending',
        },
      },
      { kind: 'text', text: 'After' },
    ]);
  });

  it('leaves plain text unchanged when there is no question block', () => {
    const parsed = parseJarvisQuestionBlocks('Just normal assistant text.');

    expect(parsed.hasQuestionBlocks).toBe(false);
    expect(parsed.parts).toEqual([{ kind: 'text', text: 'Just normal assistant text.' }]);
  });
});
