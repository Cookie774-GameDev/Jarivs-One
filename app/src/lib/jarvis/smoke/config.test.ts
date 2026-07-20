import { describe, expect, it } from 'vitest';

import { isKernelSmokeEnabled, type KernelSmokeConfigInput } from './config';

describe('kernel smoke configuration', () => {
  it.each([
    [{ devBuild: true, explicitFlag: '1' }, true],
    [{ devBuild: true, explicitFlag: undefined }, false],
    [{ devBuild: true, explicitFlag: '' }, false],
    [{ devBuild: true, explicitFlag: '0' }, false],
    [{ devBuild: true, explicitFlag: 'true' }, false],
    [{ devBuild: false, explicitFlag: '1' }, false],
    [{ devBuild: false, explicitFlag: undefined }, false],
    [{ devBuild: false, explicitFlag: '0' }, false],
  ] satisfies readonly (readonly [KernelSmokeConfigInput, boolean])[])(
    'enables only a development build with the exact explicit flag: %o',
    (input, expected) => {
      expect(isKernelSmokeEnabled(input)).toBe(expected);
    },
  );
});
