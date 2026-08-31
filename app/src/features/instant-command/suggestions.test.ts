import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_CATALOG } from './catalog';
import { buildInstantCommandHelp } from './help';
import { suggestInstantCommands } from './suggestions';
import type { InstantCommandHelpItem } from './help';

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

  it('returns deep immutable suggestions and fails closed for invalid limits', () => {
    const suggestions = suggestInstantCommands(help, '/connect');
    expect(Object.isFrozen(suggestions)).toBe(true);
    expect(Object.isFrozen(suggestions[0])).toBe(true);
    expect(suggestions[0]).toMatchObject({ id: 'connections.open', disabled: false });

    for (const limit of [-1, 1.5, 51, Number.NaN]) {
      expect(suggestInstantCommands(help, 'terminal', limit)).toEqual([]);
    }
  });

  it('ranks an exact alias ahead of incidental metadata and alias prefixes ahead of broad matches', () => {
    const connection = help.find((item) => item.id === 'connections.open')!;
    const team = help.find((item) => item.id === 'team.connect')!;
    const terminal = help.find((item) => item.id === 'terminal.message')!;
    const incidentalConnection = {
      ...team,
      searchText: `${team.searchText} /connect`,
    } satisfies InstantCommandHelpItem;
    const incidentalMessage = {
      ...connection,
      searchText: `${connection.searchText} message`,
    } satisfies InstantCommandHelpItem;

    expect(
      suggestInstantCommands([incidentalConnection, connection], '/connect', 2).map(
        (item) => item.id,
      ),
    ).toEqual(['connections.open', 'team.connect']);
    expect(
      suggestInstantCommands([incidentalMessage, terminal], 'message', 2).map((item) => item.id),
    ).toEqual(['terminal.message', 'connections.open']);
  });

  it('fails closed on malformed, duplicate, non-array, or unbounded help registries', () => {
    const connection = help.find((item) => item.id === 'connections.open')!;
    const malformed = { ...connection, examples: [] } satisfies InstantCommandHelpItem;

    expect(suggestInstantCommands(null as never, '/connect')).toEqual([]);
    expect(suggestInstantCommands([malformed], '/connect')).toEqual([]);
    expect(suggestInstantCommands([connection, connection], '/connect')).toEqual([]);
    expect(
      suggestInstantCommands(
        Array.from({ length: 2_049 }, (_, index) => ({
          ...connection,
          id: `connections.open.${index}`,
        })),
        '/connect',
      ),
    ).toEqual([]);
  });
});
