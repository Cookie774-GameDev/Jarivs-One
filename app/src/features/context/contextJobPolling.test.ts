import { describe, expect, it } from 'vitest';
import { contextJobPollDelay } from './contextJobPolling';

describe('Context job polling cadence', () => {
  it('stops background polling while the page is hidden', () => {
    expect(contextJobPollDelay({ visible: false, running: true })).toBeNull();
  });

  it('keeps active progress responsive and backs off for idle or terminal maps', () => {
    expect(contextJobPollDelay({ visible: true, running: true })).toBe(750);
    expect(contextJobPollDelay({ visible: true, running: false })).toBe(5_000);
  });
});
