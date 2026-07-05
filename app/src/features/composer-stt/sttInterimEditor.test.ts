import { describe, expect, it } from 'vitest';
import {
  buildSttCommittedValue,
  buildSttPreviewValue,
  captureSttTextSnapshot,
  separatorForBefore,
} from './sttInterimEditor';

describe('sttInterimEditor', () => {
  it('builds live preview with spacing', () => {
    const snap = captureSttTextSnapshot('Hello', 5, 5);
    expect(buildSttPreviewValue(snap, 'world')).toBe('Hello world');
  });

  it('commits final text from snapshot', () => {
    const snap = captureSttTextSnapshot('Hi', 2, 2);
    expect(buildSttCommittedValue(snap, 'there')).toBe('Hi there');
  });

  it('returns null for empty finals', () => {
    const snap = captureSttTextSnapshot('Hi', 2, 2);
    expect(buildSttCommittedValue(snap, '   ')).toBeNull();
  });

  it('separatorForBefore avoids double spaces', () => {
    expect(separatorForBefore('Hi ')).toBe('');
    expect(separatorForBefore('Hi')).toBe(' ');
  });
});
