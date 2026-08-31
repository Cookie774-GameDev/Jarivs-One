import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_CATALOG } from './catalog';
import { buildInstantCommandHelp } from './help';
import { suggestInstantCommands } from './suggestions';

describe('Instant Command catalog suggestions', () => {
  const help = buildInstantCommandHelp(INSTANT_COMMAND_CATALOG);

  it('labels safety and availability from the catalog without disabling capability checks', () => {
    expect(suggestInstantCommands(help, 'connect terminals')).toEqual([
      expect.objectContaining({
        id: 'team.connect',
        disabled: false,
        confirmationRequired: false,
        approvalRequired: true,
        detail: expect.stringContaining('approval · capability-gated'),
      }),
    ]);
  });

  it('keeps blocked commands visible but disabled and respects the local result limit', () => {
    expect(suggestInstantCommands(help, 'rename terminal', 1)).toEqual([
      expect.objectContaining({ id: 'terminal.rename', disabled: true }),
    ]);
    expect(suggestInstantCommands(help, 'close terminal', 1)).toEqual([
      expect.objectContaining({
        id: 'terminal.close',
        disabled: true,
        confirmationRequired: true,
        approvalRequired: false,
        preview: 'Action terminal.close · target required · confirmation required',
      }),
    ]);
    expect(suggestInstantCommands(help, 'team', 2)).toHaveLength(2);
  });
});
