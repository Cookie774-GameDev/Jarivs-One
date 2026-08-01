import { expect, it, vi } from 'vitest';

const databaseAccess = vi.hoisted(() => ({
  properties: [] as PropertyKey[],
}));

vi.mock('./index', () => ({
  db: new Proxy(
    {},
    {
      get(_target, property) {
        databaseAccess.properties.push(property);
        throw new Error(`database accessed during module initialization: ${String(property)}`);
      },
    },
  ),
}));

it('does not access database tables during module initialization', async () => {
  await expect(import('./repositories')).resolves.toBeDefined();
  expect(databaseAccess.properties).toEqual([]);
});
