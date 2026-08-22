import { describe, expect, it, vi } from 'vitest';
import { createNativeChatFileDropHandler } from './nativeFileDrop';

describe('native chat file drop', () => {
  it('converts Tauri physical coordinates and forwards exact binary paths inside Chat', () => {
    const onDropPaths = vi.fn();
    const hitTest = vi.fn(() => true);
    const handle = createNativeChatFileDropHandler({
      devicePixelRatio: 2,
      hitTest,
      onHoverChange: vi.fn(),
      onDropPaths,
    });

    handle({
      type: 'drop',
      paths: ['C:\\Users\\viper\\Desktop\\5X30.mp3'],
      position: { x: 240, y: 120 },
    });

    expect(hitTest).toHaveBeenCalledWith(120, 60);
    expect(onDropPaths).toHaveBeenCalledWith(['C:\\Users\\viper\\Desktop\\5X30.mp3']);
  });

  it('ignores native file drops outside the active Chat surface', () => {
    const onDropPaths = vi.fn();
    const handle = createNativeChatFileDropHandler({
      devicePixelRatio: 1.25,
      hitTest: () => false,
      onHoverChange: vi.fn(),
      onDropPaths,
    });

    handle({
      type: 'drop',
      paths: ['D:\\audio\\voice.mp3'],
      position: { x: 500, y: 250 },
    });

    expect(onDropPaths).not.toHaveBeenCalled();
  });
});
