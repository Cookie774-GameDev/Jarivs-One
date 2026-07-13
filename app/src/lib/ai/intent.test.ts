import { describe, expect, it } from 'vitest';
import { classifyJarvisIntent } from './intent';

describe('classifyJarvisIntent', () => {
  it('keeps greetings and informational steps out of visible implementation plans', () => {
    expect(classifyJarvisIntent({ text: 'Hi' })).toMatchObject({
      kind: 'greeting', needsVisiblePlan: false, needsImplementationApproval: false,
    });
    expect(classifyJarvisIntent({ text: 'How do I make coffee step by step?' })).toMatchObject({
      kind: 'informational', needsVisiblePlan: false, needsImplementationApproval: false,
    });
  });

  it('honors an explicit request for questions before implementation', () => {
    expect(classifyJarvisIntent({ text: 'Build a game, but ask me three questions first.' })).toMatchObject({
      kind: 'clarification-needed', needsQuestions: true,
    });
  });

  it('distinguishes file creation, editing, commands, and project builds', () => {
    expect(classifyJarvisIntent({ text: 'Create a new file named dogs.' }).kind).toBe('file-create');
    expect(classifyJarvisIntent({ text: 'Update the existing ROADMAP.md file.' }).kind).toBe('file-edit');
    expect(classifyJarvisIntent({ text: 'Run the game in the terminal.' }).kind).toBe('command-run');
    expect(classifyJarvisIntent({ text: 'Build an HTML puzzle game.' })).toMatchObject({
      kind: 'project-build', needsVisiblePlan: true, needsImplementationApproval: true,
    });
  });

  it('does not let structured output bypass destructive safeguards', () => {
    expect(classifyJarvisIntent({ text: 'Deploy this.', structuredKind: 'informational' })).toMatchObject({
      kind: 'destructive', needsQuestions: true, needsImplementationApproval: true,
    });
  });
});
