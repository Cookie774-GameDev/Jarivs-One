import { describe, expect, it } from 'vitest';
import {
  claimPetHostInstance,
  getPetHostInstanceCount,
  releasePetHostInstance,
} from './petTauriBridge';

describe('pet host single-instance', () => {
  it('allows only one host claim at a time', () => {
    // Reset by releasing any leftover
    while (getPetHostInstanceCount() > 0) releasePetHostInstance();
    expect(claimPetHostInstance()).toBe(true);
    expect(claimPetHostInstance()).toBe(false);
    expect(getPetHostInstanceCount()).toBe(1);
    releasePetHostInstance();
    expect(getPetHostInstanceCount()).toBe(0);
    expect(claimPetHostInstance()).toBe(true);
    releasePetHostInstance();
  });
});
