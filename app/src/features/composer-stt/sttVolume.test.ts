import { describe, expect, it } from 'vitest';
import { resetSttVolume, setSttVolumeLevel, sttVolumeRef } from './sttVolume';

describe('sttVolume', () => {
  it('clamps level into 0–1 range', () => {
    setSttVolumeLevel(1.5);
    expect(sttVolumeRef.current).toBe(1);
    setSttVolumeLevel(-0.2);
    expect(sttVolumeRef.current).toBe(0);
    resetSttVolume();
    expect(sttVolumeRef.current).toBe(0);
  });
});
