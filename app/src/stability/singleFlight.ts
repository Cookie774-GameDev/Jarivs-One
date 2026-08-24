export function createSingleFlightRunner(task: () => Promise<void>) {
  let active: Promise<void> | null = null;
  let stopped = false;

  return {
    run(): Promise<void> {
      if (stopped) return Promise.resolve();
      if (active) return active;
      const flight = Promise.resolve()
        .then(task)
        .finally(() => {
          if (active === flight) active = null;
        });
      active = flight;
      return flight;
    },
    stop(): void {
      stopped = true;
    },
  };
}
