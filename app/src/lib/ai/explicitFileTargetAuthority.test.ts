import { describe, expect, it } from 'vitest';
import type { Part } from '@/types';
import { bindExplicitFileTargetAuthority } from './explicitFileTargetAuthority';

const exact =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\.vibespace-native-acceptance\\brief.md';

function edit(path: string, root?: string): Part {
  return {
    kind: 'action_proposal',
    call_id: 'edit-1',
    action_id: 'files.edit',
    params: { path, ...(root ? { root } : {}), content: 'bounded revision' },
    status: 'pending',
  };
}

describe('bindExplicitFileTargetAuthority', () => {
  it('replaces a model-invented relative/default-root edit with the one explicit target', () => {
    const [part] = bindExplicitFileTargetAuthority(
      `Refine the same exact authorized file at ${exact} and preserve its bounded content.`,
      [edit('Native Chat Workflow Fixture.md', 'C:\\Users\\viper\\Documents\\OldProject')],
    );
    expect(part).toMatchObject({
      kind: 'action_proposal',
      action_id: 'files.edit',
      params: { path: exact, content: 'bounded revision' },
    });
    expect((part as Extract<Part, { kind: 'action_proposal' }>).params).not.toHaveProperty('root');
  });

  it('does not rewrite ambiguous targets or unrelated file actions', () => {
    const other = 'C:\\project\\other.md';
    expect(
      bindExplicitFileTargetAuthority(`Compare ${exact} with ${other}, then advise.`, [
        edit('draft.md'),
      ]),
    ).toEqual([edit('draft.md')]);
    const create: Part = {
      kind: 'action_proposal',
      call_id: 'create-1',
      action_id: 'files.create',
      params: { path: 'draft.md', content: 'x' },
      status: 'pending',
    };
    expect(bindExplicitFileTargetAuthority(`Read ${exact}.`, [create])).toEqual([create]);
  });
});
