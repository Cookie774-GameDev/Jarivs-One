import { describe, expect, it } from 'vitest';
import {
  isUsableTerminalGeometry,
  readTerminalContainerGeometry,
  sameTerminalGeometry,
  shouldSendTerminalResize,
} from './terminalGeometry';

describe('shouldSendTerminalResize', () => {
  it('sends the initial terminal geometry', () => {
    expect(shouldSendTerminalResize(null, { rows: 30, cols: 100 })).toBe(true);
  });

  it('skips duplicate rows and columns', () => {
    expect(
      shouldSendTerminalResize({ rows: 30, cols: 100 }, { rows: 30, cols: 100 }),
    ).toBe(false);
  });

  it('sends changed rows or columns', () => {
    expect(
      shouldSendTerminalResize({ rows: 30, cols: 100 }, { rows: 31, cols: 100 }),
    ).toBe(true);
    expect(
      shouldSendTerminalResize({ rows: 30, cols: 100 }, { rows: 30, cols: 101 }),
    ).toBe(true);
  });
});

describe('terminal container geometry', () => {
  it('reads width and height from the terminal own container', () => {
    expect(
      readTerminalContainerGeometry({ clientWidth: 640, clientHeight: 360 }),
    ).toEqual({ width: 640, height: 360 });
  });

  it('requires both dimensions to be independently usable', () => {
    expect(isUsableTerminalGeometry({ width: 640, height: 360 })).toBe(true);
    expect(isUsableTerminalGeometry({ width: 640, height: 0 })).toBe(false);
    expect(isUsableTerminalGeometry({ width: 0, height: 360 })).toBe(false);
    expect(isUsableTerminalGeometry({ width: 40, height: 360 })).toBe(false);
    expect(isUsableTerminalGeometry({ width: 640, height: 40 })).toBe(false);
  });

  it('compares both dimensions when deciding whether layout is stable', () => {
    expect(
      sameTerminalGeometry(
        { width: 640, height: 360 },
        { width: 640, height: 360 },
      ),
    ).toBe(true);
    expect(
      sameTerminalGeometry(
        { width: 640, height: 360 },
        { width: 641, height: 360 },
      ),
    ).toBe(false);
    expect(
      sameTerminalGeometry(
        { width: 640, height: 360 },
        { width: 640, height: 361 },
      ),
    ).toBe(false);
  });
});
