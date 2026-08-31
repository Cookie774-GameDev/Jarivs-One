export type InstantCommandDeadlineResult<T> =
  Readonly<{ status: 'completed'; value: T }> | Readonly<{ status: 'timed_out' }>;

export async function runWithInstantCommandDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 500,
): Promise<InstantCommandDeadlineResult<T>> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 500) {
    throw new Error('Instant Command deadline must be between 1 and 500 ms');
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<InstantCommandDeadlineResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort('instant_command_deadline');
      resolve(Object.freeze({ status: 'timed_out' as const }));
    }, timeoutMs);
  });
  try {
    const completion = operation(controller.signal).then((value) =>
      Object.freeze({ status: 'completed' as const, value }),
    );
    return await Promise.race([completion, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
