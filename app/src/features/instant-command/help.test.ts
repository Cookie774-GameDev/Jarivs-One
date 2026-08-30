import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_CATALOG } from './catalog';
import { buildInstantCommandHelp, searchInstantCommandHelp } from './help';

describe('Instant Command catalog help', () => {
  it('generates one accessible help item per catalog definition', () => {
    const help = buildInstantCommandHelp(INSTANT_COMMAND_CATALOG);
    expect(help).toHaveLength(INSTANT_COMMAND_CATALOG.length);
    expect(help.find((item) => item.id === 'terminal.close')).toMatchObject({
      safety: 'confirm',
      availability: 'blocked',
    });
    expect(help.every((item) => item.examples.length > 0 && item.aliases.length > 0)).toBe(true);
  });

  it('searches locally by id, alias, and family', () => {
    const help = buildInstantCommandHelp(INSTANT_COMMAND_CATALOG);
    expect(searchInstantCommandHelp(help, 'fullscreen').map((item) => item.id)).toContain(
      'fullscreen.set',
    );
    expect(
      searchInstantCommandHelp(help, 'team').every((item) => item.searchText.includes('team')),
    ).toBe(true);
    expect(searchInstantCommandHelp(help, '/connect')).toEqual([
      expect.objectContaining({ id: 'connections.open', availability: 'available' }),
    ]);
  });
});
