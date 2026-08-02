export type KernelSmokeConfigInput = {
  devBuild: boolean;
  explicitFlag: string | undefined;
};

export function isKernelSmokeEnabled(input: KernelSmokeConfigInput): boolean {
  return input.devBuild === true && input.explicitFlag === '1';
}
