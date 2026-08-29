export function contextJobPollDelay(input: {
  readonly visible: boolean;
  readonly running: boolean;
}): number | null {
  if (!input.visible) return null;
  return input.running ? 750 : 5_000;
}
