import { describe, expect, it } from 'vitest';
import { getBuiltinAction } from './registry';
import { FILE_ACTIONS } from './registryFiles';

describe('FILE_ACTIONS', () => {
  it('registers files.write, files.read, and shell.powershell', () => {
    expect(FILE_ACTIONS.map((a) => a.id).sort()).toEqual([
      'files.read',
      'files.write',
      'shell.powershell',
    ].sort());

    expect(getBuiltinAction('files.write')?.id).toBe('files.write');
    expect(getBuiltinAction('files.read')?.id).toBe('files.read');
    expect(getBuiltinAction('shell.powershell')?.id).toBe('shell.powershell');
  });

  it('requires absolute paths for files.write', async () => {
    const def = getBuiltinAction('files.write');
    expect(def).toBeTruthy();
    const result = await def!.run({ path: 'relative.txt', content: 'hi' }, { source: 'ai' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/absolute/i);
  });
});
