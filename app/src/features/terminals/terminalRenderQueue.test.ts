import { describe, expect, it } from 'vitest';
import { createTerminalRenderQueue } from './terminalRenderQueue';

describe('terminal render queue', () => {
  it('preserves ordered output below its bound', () => {
    const queue = createTerminalRenderQueue(32);
    queue.enqueue('one', 'one');
    queue.enqueue('two', 'two');

    expect(queue.drain()).toEqual({
      displayData: 'onetwo',
      transcriptData: 'onetwo',
      droppedCharacters: 0,
    });
  });

  it('drops only the oldest complete pending batches when a renderer falls behind', () => {
    const queue = createTerminalRenderQueue(8);
    queue.enqueue('1234', '1234');
    queue.enqueue('5678', '5678');
    queue.enqueue('abcd', 'abcd');

    expect(queue.drain()).toEqual({
      displayData: '5678abcd',
      transcriptData: '5678abcd',
      droppedCharacters: 4,
    });
  });

  it('drops one anomalously oversized batch whole instead of splitting Unicode or ANSI', () => {
    const queue = createTerminalRenderQueue(8);
    const oversized = '\u001b[31m😀😀😀😀\u001b[0m';

    queue.enqueue(oversized, oversized);

    expect(queue.drain()).toEqual({
      displayData: '',
      transcriptData: '',
      droppedCharacters: oversized.length,
    });
  });

  it('bounds a large backpressure burst without shifting pending arrays', () => {
    const queue = createTerminalRenderQueue(32);
    const originalShift = Array.prototype.shift;
    let shiftCalls = 0;
    Array.prototype.shift = function countedShift<T>(this: T[]): T | undefined {
      shiftCalls += 1;
      return originalShift.call(this) as T | undefined;
    };

    try {
      for (let index = 0; index < 2_000; index += 1) {
        queue.enqueue(
          `${index.toString().padStart(4, '0')}\n`,
          `${index.toString().padStart(4, '0')}\n`,
        );
      }
      expect(shiftCalls).toBe(0);
      expect(queue.drain()).toEqual({
        displayData: '1994\n1995\n1996\n1997\n1998\n1999\n',
        transcriptData: '1994\n1995\n1996\n1997\n1998\n1999\n',
        droppedCharacters: 9_970,
      });
    } finally {
      Array.prototype.shift = originalShift;
    }
  });
});
