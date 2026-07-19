export type JarvisKernelMode = 'legacy' | 'shadow' | 'kernel';

export const DEFAULT_JARVIS_KERNEL_MODE: JarvisKernelMode = 'kernel';

export class JarvisKernelModeError extends Error {
  readonly code: 'invalid_kernel_mode' | 'kernel_mode_not_ready';

  constructor(code: 'invalid_kernel_mode' | 'kernel_mode_not_ready', message: string) {
    super(message);
    this.name = 'JarvisKernelModeError';
    this.code = code;
  }
}

export function resolveJarvisKernelMode(override?: JarvisKernelMode): JarvisKernelMode {
  const mode = override ?? DEFAULT_JARVIS_KERNEL_MODE;
  if (mode !== 'legacy' && mode !== 'shadow' && mode !== 'kernel') {
    throw new JarvisKernelModeError('invalid_kernel_mode', 'Invalid JARVIS kernel mode.');
  }
  return mode;
}
