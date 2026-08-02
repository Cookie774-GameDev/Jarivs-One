import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JARVIS_KERNEL_MODE,
  JarvisKernelModeError,
  resolveJarvisKernelMode,
} from './kernelMode';

describe('JARVIS kernel mode gate', () => {
  it('defaults protected JARVIS to the canonical kernel', () => {
    expect(DEFAULT_JARVIS_KERNEL_MODE).toBe('kernel');
    expect(resolveJarvisKernelMode()).toBe('kernel');
  });

  it.each(['legacy', 'shadow', 'kernel'] as const)('accepts the internal %s override', (mode) => {
    expect(resolveJarvisKernelMode(mode)).toBe(mode);
  });

  it('rejects values outside the closed three-state gate', () => {
    expect(() => resolveJarvisKernelMode('disabled' as never)).toThrowError(
      expect.objectContaining<Partial<JarvisKernelModeError>>({
        name: 'JarvisKernelModeError',
        code: 'invalid_kernel_mode',
      }),
    );
  });
});
