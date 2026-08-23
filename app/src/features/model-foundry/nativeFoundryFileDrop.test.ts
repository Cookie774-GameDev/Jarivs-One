import { describe, expect, it, vi } from 'vitest';
import { createNativeFoundryFileDropHandler } from './nativeFoundryFileDrop';

describe('native Model Foundry file drop', () => {
  it('converts physical coordinates and forwards distinct exact paths inside the source zone', () => {
    const onDropPaths = vi.fn();
    const hitTest = vi.fn(() => true);
    const onHoverChange = vi.fn();
    const handle = createNativeFoundryFileDropHandler({
      devicePixelRatio: 2,
      hitTest,
      onHoverChange,
      onDropPaths,
    });

    handle({
      type: 'drop',
      paths: ['D:\\training\\notes.md', ' D:\\training\\notes.md ', 'D:\\training\\clip.mp4'],
      position: { x: 320, y: 180 },
    });

    expect(hitTest).toHaveBeenCalledWith(160, 90);
    expect(onHoverChange).toHaveBeenLastCalledWith(false);
    expect(onDropPaths).toHaveBeenCalledWith(['D:\\training\\notes.md', 'D:\\training\\clip.mp4']);
  });

  it('ignores drops outside the visible source zone and clears hover on leave', () => {
    const onDropPaths = vi.fn();
    const onHoverChange = vi.fn();
    const handle = createNativeFoundryFileDropHandler({
      devicePixelRatio: 1,
      hitTest: () => false,
      onHoverChange,
      onDropPaths,
    });

    handle({ type: 'enter', paths: ['C:\\private\\dataset.jsonl'], position: { x: 5, y: 5 } });
    handle({ type: 'leave' });

    expect(onDropPaths).not.toHaveBeenCalled();
    expect(onHoverChange).toHaveBeenLastCalledWith(false);
  });
});
