import { describe, expect, it } from 'vitest';
import { AUTHORITY_INVENTORY, COMMAND_AUTHORITY_INVENTORY } from './authorityInventory';
import { INSTANT_COMMAND_CATALOG } from './catalog';

describe('AUTHORITY_INVENTORY', () => {
  it('maps every catalog authority to one canonical seam', () => {
    const authorities = new Set(AUTHORITY_INVENTORY.map((entry) => entry.id));
    for (const command of INSTANT_COMMAND_CATALOG) {
      expect(authorities.has(command.authority), `${command.id} authority`).toBe(true);
    }
  });

  it('does not advertise model routing, downloads, or ad-hoc UI clicking as authority', () => {
    const forbidden = /model routing|download|click|settimeout|network/i;
    for (const authority of AUTHORITY_INVENTORY) {
      expect(`${authority.id} ${authority.canonicalSeam}`).not.toMatch(forbidden);
    }
  });

  it('records one canonical safety/context/test seam for every planned catalog command', () => {
    expect(COMMAND_AUTHORITY_INVENTORY.map((entry) => entry.commandId).sort()).toEqual(
      INSTANT_COMMAND_CATALOG.map((entry) => entry.id).sort(),
    );
    for (const entry of COMMAND_AUTHORITY_INVENTORY) {
      expect(entry.canonicalSeam).toBeTruthy();
      expect(entry.requiredContext.length).toBeGreaterThan(0);
      expect(entry.testSeam).toMatch(/instant-command|authority|catalog/i);
      expect(['ready', 'blocked', 'capability-gated']).toContain(entry.currentState);
    }
  });
});
