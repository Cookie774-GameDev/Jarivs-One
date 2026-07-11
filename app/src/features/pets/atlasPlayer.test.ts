import { describe, expect, it } from 'vitest';
import { AtlasPlayer, type AnimPlaybackMeta } from './atlasPlayer';

describe('AtlasPlayer timing', () => {
  it('advances frames by fps and completes one-shots without looping', () => {
    const p = new AtlasPlayer();
    // Inject atlas without loading image
    (p as unknown as { atlas: unknown; frameNames: string[]; fps: number; loop: boolean }).atlas = {
      frames: {
        a: { frame: { x: 0, y: 0, w: 1, h: 1 } },
        b: { frame: { x: 1, y: 0, w: 1, h: 1 } },
        c: { frame: { x: 2, y: 0, w: 1, h: 1 } },
      },
      meta: { image: 'x', size: { w: 3, h: 1 } },
    };
    let completed = 0;
    const meta: AnimPlaybackMeta = {
      frames: ['a', 'b', 'c'],
      fps: 10, // 100ms per frame
      loop: false,
      oneShot: true,
    };
    p.setAnimation(meta, () => {
      completed += 1;
    });
    expect(p.currentFrameName).toBe('a');
    p.update(100);
    expect(p.currentFrameName).toBe('b');
    p.update(100);
    expect(p.currentFrameName).toBe('c');
    const done = p.update(100);
    expect(done).toBe(true);
    expect(completed).toBe(1);
    // further updates stay done
    expect(p.update(500)).toBe(true);
    expect(completed).toBe(1);
    p.dispose();
  });

  it('loops when loop=true', () => {
    const p = new AtlasPlayer();
    (p as unknown as { atlas: unknown }).atlas = {
      frames: {
        a: { frame: { x: 0, y: 0, w: 1, h: 1 } },
        b: { frame: { x: 1, y: 0, w: 1, h: 1 } },
      },
      meta: { image: 'x', size: { w: 2, h: 1 } },
    };
    p.setAnimation({ frames: ['a', 'b'], fps: 10, loop: true });
    p.update(100);
    expect(p.currentFrameName).toBe('b');
    p.update(100);
    expect(p.currentFrameName).toBe('a');
    p.dispose();
  });
});
