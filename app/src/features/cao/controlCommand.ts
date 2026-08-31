import type { CaoTargetKind } from '@/lib/jarvis/contracts/execution';

export const CAO_CONTROL_ACTIONS = Object.freeze([
  'supervise',
  'diagnose',
  'restart',
  'verify',
  'grade',
  'force-check',
  'cancel',
] as const);
export type CaoControlAction = (typeof CAO_CONTROL_ACTIONS)[number];
export type CaoControlSelector = Readonly<{
  kind: CaoTargetKind;
  selector: string;
  by: 'id' | 'title';
}>;
export type CaoControlCommand = Readonly<{
  action: CaoControlAction;
  selectors: readonly CaoControlSelector[];
  source: 'natural-language' | 'catalog-reference';
}>;
export type CaoResolvedControlTarget = Readonly<{
  kind: CaoTargetKind;
  targetId: string;
  revision: number;
}>;
export type CaoControlScope = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string;
}>;
export type CaoControlCandidate = CaoControlScope &
  Readonly<{
    kind: CaoTargetKind;
    targetId: string;
    title: string;
    revision: number;
    selected: boolean;
    locked: boolean;
  }>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NEGATED_OR_AMBIGUOUS =
  /\?|\b(?:maybe|perhaps|possibly|could|would|should|might|may|do\s+not|don['’]t|never|not|all|every)\b/iu;
const TARGET_TOKEN =
  /(chat|terminal):(?:"([^"\r\n]{1,128})"|([A-Za-z0-9][A-Za-z0-9._:-]{0,127}))/giu;
const ACTION_PATTERN = CAO_CONTROL_ACTIONS.map((value) => value.replace('-', '[- ]')).join('|');

export class CaoControlCommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CaoControlCommandError';
  }
}

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function parseCaoControlCommand(input: {
  text: string;
  confirmedReferenceKeys?: readonly string[];
}): CaoControlCommand | null {
  const text = input.text.trim().replace(/\s+/gu, ' ');
  if (!text || text.length > 2_048 || NEGATED_OR_AMBIGUOUS.test(text)) return null;
  const selected = input.confirmedReferenceKeys?.includes('cao:jarvis-cao') === true;
  const prefix = selected
    ? ''
    : '(?:(?:please\\s+)?(?:have|ask|tell)\\s+(?:@?jarvis\\s+cao|@?cao)[,:]?\\s+(?:to\\s+)?|(?:@?jarvis\\s+cao|@?cao)[,:]?\\s+)';
  const match = new RegExp(`^${prefix}(${ACTION_PATTERN})\\s+(.+)$`, 'iu').exec(text);
  if (!match) return null;
  const action = match[1]!.toLocaleLowerCase().replace(' ', '-') as CaoControlAction;
  if (!CAO_CONTROL_ACTIONS.includes(action)) return null;
  const tail = match[2]!;
  const selectors: CaoControlSelector[] = [];
  let consumed = '';
  for (const token of tail.matchAll(TARGET_TOKEN)) {
    const kind = token[1]!.toLocaleLowerCase() as CaoTargetKind;
    const title = token[2]?.trim();
    const id = token[3];
    if ((title && !title.replace(/\s+/gu, ' ')) || (id && !SAFE_ID.test(id))) return null;
    selectors.push(Object.freeze({ kind, selector: title ?? id!, by: title ? 'title' : 'id' }));
    consumed += token[0];
  }
  const remainder = tail.replace(TARGET_TOKEN, '').replace(/[\s,]+/gu, '');
  if (selectors.length === 0 || selectors.length > 32 || remainder || !consumed) return null;
  const seen = new Set<string>();
  for (const selector of selectors) {
    const key = `${selector.kind}\0${selector.by}\0${selector.by === 'title' ? normalizedTitle(selector.selector) : selector.selector}`;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return Object.freeze({
    action,
    selectors: Object.freeze(selectors),
    source: selected ? 'catalog-reference' : 'natural-language',
  });
}

export function resolveCaoControlTargets(input: {
  command: CaoControlCommand;
  scope: CaoControlScope;
  candidates: readonly CaoControlCandidate[];
}): Readonly<{ command: CaoControlCommand; targets: readonly CaoResolvedControlTarget[] }> {
  const scoped = input.candidates.filter(
    (candidate) =>
      candidate.accountId === input.scope.accountId &&
      candidate.workspaceId === input.scope.workspaceId &&
      candidate.projectId === input.scope.projectId,
  );
  const targets: CaoResolvedControlTarget[] = [];
  for (const selector of input.command.selectors) {
    const matches = scoped.filter(
      (candidate) =>
        candidate.kind === selector.kind &&
        (selector.by === 'id'
          ? candidate.targetId === selector.selector
          : normalizedTitle(candidate.title) === normalizedTitle(selector.selector)),
    );
    if (matches.length === 0) throw new CaoControlCommandError('cao_control_target_missing');
    if (matches.length !== 1) throw new CaoControlCommandError('cao_control_target_ambiguous');
    const match = matches[0]!;
    if (!match.selected) throw new CaoControlCommandError('cao_control_target_unselected');
    if (match.locked) throw new CaoControlCommandError('cao_control_target_locked');
    if (
      !Number.isSafeInteger(match.revision) ||
      match.revision < 0 ||
      !SAFE_ID.test(match.targetId)
    ) {
      throw new CaoControlCommandError('cao_control_target_invalid');
    }
    targets.push(
      Object.freeze({ kind: match.kind, targetId: match.targetId, revision: match.revision }),
    );
  }
  return Object.freeze({ command: input.command, targets: Object.freeze(targets) });
}
