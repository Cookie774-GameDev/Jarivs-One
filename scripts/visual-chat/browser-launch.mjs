export function buildBrowserLaunchAttempts({ browserExecutable, environment = process.env } = {}) {
  const environmentExecutable = environment.VIBESPACE_BROWSER_EXECUTABLE?.trim();
  const configuredExecutable = environmentExecutable || browserExecutable?.trim();
  const attempts = [];
  if (configuredExecutable) {
    attempts.push({
      source: environmentExecutable ? 'VIBESPACE_BROWSER_EXECUTABLE' : 'browserExecutable',
      options: { executablePath: configuredExecutable },
    });
  }
  attempts.push(
    { source: 'msedge', options: { channel: 'msedge' } },
    { source: 'chrome', options: { channel: 'chrome' } },
    { source: 'playwright-chromium', options: {} },
  );
  return attempts;
}

export async function loadChromiumType() {
  return (await import('playwright-core')).chromium;
}

export async function launchResolvedBrowser({
  browserExecutable,
  environment = process.env,
  chromiumType,
} = {}) {
  const chromium = chromiumType ?? (await loadChromiumType());
  const failures = [];
  for (const attempt of buildBrowserLaunchAttempts({ browserExecutable, environment })) {
    try {
      const browser = await chromium.launch({ headless: true, ...attempt.options });
      return { browser, source: attempt.source, launchOptions: attempt.options };
    } catch (error) {
      failures.push(`${attempt.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No supported browser could be launched.\n${failures.join('\n')}`);
}
