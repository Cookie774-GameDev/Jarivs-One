import { localConversationReply } from './responsePolicy';
import { interpretJarvisRequest } from './intentInterpreter';

export interface GoldStandardCase {
  id: string;
  prompt: string;
  expectedIntent: string;
  expectedResponseStyle: string;
  expectedAction: string | string[] | null;
  expectedPermission: string;
  completionCriteria: string[];
  forbiddenBehavior: string[];
  supportedEnvironment: string;
}

export interface GoldStandardFixtures {
  version: number;
  cases: GoldStandardCase[];
}

export interface GoldStandardEvaluation {
  total: number;
  unregisteredActions: string[];
  benignRefusalRate: number;
  duplicateActionRate: number;
  averageConversationalSentences: number;
  outputs: Array<{
    id: string;
    output: string;
    selectedActions: string[];
    intent: string;
    permission: string;
    pass: boolean;
    failures: string[];
  }>;
}

function actions(test: GoldStandardCase): string[] {
  return Array.isArray(test.expectedAction)
    ? test.expectedAction
    : test.expectedAction ? [test.expectedAction] : [];
}

function sentenceCount(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches?.filter((sentence) => sentence.trim()).length ?? 0;
}

const PERMISSION_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  'depends-on-input': ['approval-required'],
  'depends-on-tool': ['approval-required'],
  'read-only-approved': ['automatic'],
  'none-until-available': ['automatic'],
};

function permissionMatches(expected: string, actual: string): boolean {
  return expected === actual || PERMISSION_EQUIVALENTS[expected]?.includes(actual) === true;
}

export function validateGoldStandardFixtures(input: GoldStandardFixtures): string[] {
  const errors: string[] = [];
  if (input.version !== 1) errors.push('fixture version must be 1');
  if (!Array.isArray(input.cases) || input.cases.length < 20) errors.push('at least 20 cases are required');
  const ids = new Set<string>();
  for (const [index, test] of input.cases.entries()) {
    const label = test?.id || `case-${index + 1}`;
    if (!test?.id || !/^[a-z0-9][a-z0-9-]*$/.test(test.id)) errors.push(`${label}: invalid id`);
    if (ids.has(test.id)) errors.push(`${label}: duplicate id`);
    ids.add(test.id);
    for (const key of ['prompt', 'expectedIntent', 'expectedResponseStyle', 'expectedPermission', 'supportedEnvironment'] as const) {
      if (typeof test?.[key] !== 'string' || !test[key].trim()) errors.push(`${label}: missing ${key}`);
    }
    if (!Array.isArray(test?.completionCriteria) || test.completionCriteria.length === 0) {
      errors.push(`${label}: completion criteria required`);
    }
    if (!Array.isArray(test?.forbiddenBehavior) || test.forbiddenBehavior.length === 0) {
      errors.push(`${label}: forbidden behavior required`);
    }
    if (!(test.expectedAction === null || typeof test.expectedAction === 'string' || Array.isArray(test.expectedAction))) {
      errors.push(`${label}: expectedAction must be string, array, or null`);
    }
  }
  return errors;
}

export function evaluateGoldStandardFixtures(
  input: GoldStandardFixtures,
  availableActionIds: ReadonlySet<string>,
): GoldStandardEvaluation {
  const unregistered = new Set<string>();
  let benignPrompts = 0;
  let benignRefusals = 0;
  let duplicateCases = 0;
  const conversationalSentenceCounts: number[] = [];

  const outputs = input.cases.map((test) => {
    const interpreted = interpretJarvisRequest(test.prompt);
    const selectedActions = interpreted.steps.map((step) => step.action);
    const expectedActions = actions(test);
    const failures: string[] = [];
    if (interpreted.intent !== test.expectedIntent) {
      failures.push(`intent mismatch: expected ${test.expectedIntent}, received ${interpreted.intent}`);
    }
    if (selectedActions.length !== expectedActions.length
      || selectedActions.some((action, index) => action !== expectedActions[index])) {
      failures.push(`action mismatch: expected ${expectedActions.join(', ') || 'none'}, received ${selectedActions.join(', ') || 'none'}`);
    }
    if (!permissionMatches(test.expectedPermission, interpreted.execution)) {
      failures.push(`permission mismatch: expected ${test.expectedPermission}, received ${interpreted.execution}`);
    }
    for (const action of selectedActions) {
      if (!availableActionIds.has(action)) {
        unregistered.add(action);
        failures.push(`unregistered action: ${action}`);
      }
    }
    if (new Set(selectedActions).size !== selectedActions.length) {
      duplicateCases += 1;
      failures.push('duplicate action selected');
    }

    let output = interpreted.response;
    if (test.expectedIntent === 'casual-conversation') {
      benignPrompts += 1;
      if (/\b(?:cannot|can't|won't|not allowed|explicit content|unsafe)\b/i.test(output)) {
        benignRefusals += 1;
        failures.push('benign refusal');
      }
      conversationalSentenceCounts.push(sentenceCount(output));
    } else if (test.expectedAction === null && ['question-answering', 'ambiguous'].includes(test.expectedIntent)) {
      const local = localConversationReply(test.prompt);
      if (local) {
        output = local;
        conversationalSentenceCounts.push(sentenceCount(local));
      }
    }

    return {
      id: test.id,
      output,
      selectedActions,
      intent: interpreted.intent,
      permission: interpreted.execution,
      pass: failures.length === 0,
      failures,
    };
  });

  return {
    total: input.cases.length,
    unregisteredActions: [...unregistered].sort(),
    benignRefusalRate: benignPrompts ? benignRefusals / benignPrompts : 0,
    duplicateActionRate: input.cases.length ? duplicateCases / input.cases.length : 0,
    averageConversationalSentences: conversationalSentenceCounts.length
      ? conversationalSentenceCounts.reduce((sum, count) => sum + count, 0) / conversationalSentenceCounts.length
      : 0,
    outputs,
  };
}
