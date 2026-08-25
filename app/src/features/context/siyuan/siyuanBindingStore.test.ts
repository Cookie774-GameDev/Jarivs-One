import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSiyuanNodeBindings,
  deleteSiyuanNodeBindings,
  readSiyuanNodeBindings,
  writeSiyuanNodeBindings,
} from './siyuanBindingStore';

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vibespace-siyuan-map-bindings');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database_delete_blocked'));
  });
}

describe('SiYuan node binding store', () => {
  beforeEach(resetDatabase);

  it('persists large binding sets outside the compact map manifest', async () => {
    const bindings = Object.fromEntries(
      Array.from({ length: 5_000 }, (_, index) => [
        `folder/subfolder/file-${index}.txt`,
        `20260823180000-${index.toString().padStart(7, '0')}`,
      ]),
    );
    await writeSiyuanNodeBindings('project-1', 'map-1', bindings);
    expect(await readSiyuanNodeBindings('project-1', 'map-1')).toEqual(bindings);
  });

  it('isolates maps and supports incremental deletion and retirement', async () => {
    await writeSiyuanNodeBindings('project-1', 'map-1', { a: 'doc-a', b: 'doc-b' });
    await writeSiyuanNodeBindings('project-1', 'map-2', { a: 'other-a' });
    await deleteSiyuanNodeBindings('project-1', 'map-1', ['a']);
    expect(await readSiyuanNodeBindings('project-1', 'map-1')).toEqual({ b: 'doc-b' });
    expect(await readSiyuanNodeBindings('project-1', 'map-2')).toEqual({ a: 'other-a' });
    await clearSiyuanNodeBindings('project-1', 'map-1');
    expect(await readSiyuanNodeBindings('project-1', 'map-1')).toEqual({});
    expect(await readSiyuanNodeBindings('project-1', 'map-2')).toEqual({ a: 'other-a' });
  });
});
