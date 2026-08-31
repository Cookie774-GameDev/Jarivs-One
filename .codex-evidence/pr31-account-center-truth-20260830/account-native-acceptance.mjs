import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const endpoint = process.env.VIBESPACE_CDP_ENDPOINT ?? 'http://127.0.0.1:9223';
const evidenceDir = path.resolve(
  process.env.VIBESPACE_ACCOUNT_EVIDENCE_DIR ??
    '.codex-evidence/pr31-account-center-truth-20260830/live',
);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });

try {
  const contexts = browser.contexts();
  check(contexts.length === 1, `Expected one official WebView context, found ${contexts.length}.`);
  const pages = contexts[0]
    .pages()
    .filter((candidate) => candidate.url().startsWith('http://tauri.localhost/'));
  check(pages.length === 1, `Expected one official main WebView, found ${pages.length}.`);
  const page = pages[0];
  const initialUrl = page.url();
  const initialViewport = page.viewportSize();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  if ((await page.locator('.mc7f-account-page').count()) === 0) {
    await page.getByRole('button', { name: 'Open account' }).click();
  }
  await page.locator('.mc7f-account-page').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();

  await page.getByText('Account Center', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Profile', level: 2 }).waitFor();
  await page.getByRole('heading', { name: 'Local data ownership', level: 3 }).waitFor();
  await page.getByText(/offline data-ownership namespace/i).waitFor();
  await page.getByText(/not a password or recovery secret/i).waitFor();
  await page.getByRole('button', { name: 'Copy local user id' }).waitFor();

  const signedIn = (await page.getByText('Signed in', { exact: true }).count()) > 0;
  const signedOut = (await page.getByText('Signed out', { exact: true }).count()) > 0;
  check(signedIn !== signedOut, 'Account session badge is ambiguous.');
  const securityHeading = page.getByRole('heading', { name: 'Account security', level: 3 });
  await securityHeading.waitFor();
  let sessionHeadingOrder = 'signed-out';
  let passwordFormBoundary = 'signed-out';
  if (signedIn) {
    const activeSessionHeading = page.getByRole('heading', {
      name: 'Active cloud session',
      level: 4,
    });
    await activeSessionHeading.waitFor();
    sessionHeadingOrder = await page.evaluate(() => {
      const security = [...document.querySelectorAll('h3')].find(
        (heading) => heading.textContent?.trim() === 'Account security',
      );
      const session = [...document.querySelectorAll('h4')].find(
        (heading) => heading.textContent?.trim() === 'Active cloud session',
      );
      return security &&
        session &&
        security.compareDocumentPosition(session) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 'h3-before-h4'
        : 'invalid';
    });
    check(sessionHeadingOrder === 'h3-before-h4', 'Security heading order is not semantic.');
    const changePassword = page.getByRole('button', { name: 'Change password' });
    await changePassword.click();
    await page.getByLabel('New account password').waitFor();
    await page.getByLabel('Confirm account password').waitFor();
    check(
      await page.getByRole('button', { name: 'Save new password' }).isDisabled(),
      'Empty password save must be disabled.',
    );
    await changePassword.click();
    check(
      (await page.getByLabel('New account password').count()) === 0,
      'Password form did not cancel cleanly.',
    );
    passwordFormBoundary = 'opened-and-cancelled-without-mutation';
  } else {
    await page.getByText('Sign in to change your cloud account password.').waitFor();
    check(
      (await page.getByRole('button', { name: 'Change password' }).count()) === 0,
      'Signed-out password mutation is exposed.',
    );
  }

  await page.getByRole('tab', { name: 'Status' }).click();
  await page.getByRole('heading', { name: 'Status', level: 2, exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Cloud plan usage', level: 3 }).waitFor();
  const usageProjection = signedIn
    ? await Promise.race([
        page
          .getByText(/Checked at/i)
          .waitFor({ timeout: 8_000 })
          .then(() => 'verified-receipt'),
        page
          .getByText('Usage unavailable', { exact: true })
          .waitFor({ timeout: 8_000 })
          .then(() => 'unavailable'),
      ])
    : await page
        .getByText('Sign in to view usage', { exact: true })
        .waitFor({ timeout: 8_000 })
        .then(() => 'signed-out');

  await page.getByRole('tab', { name: 'Support' }).click();
  await page.getByRole('heading', { name: 'Support', level: 2, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Copy support email address' }).waitFor();
  await page.getByRole('button', { name: 'Copy security email address' }).waitFor();
  await page.getByRole('button', { name: 'Open documentation' }).waitFor();
  await page.getByRole('button', { name: 'Read open-source license' }).waitFor();

  const originalViewport = initialViewport ?? { width: 1280, height: 900 };
  await page.setViewportSize({ width: 720, height: 900 });
  const containment = await page.locator('.mc7f-account-page').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  check(
    containment.scrollWidth <= containment.clientWidth + 1 &&
      containment.bodyScrollWidth <= containment.bodyClientWidth + 1,
    `Account overflowed at narrow width: ${JSON.stringify(containment)}`,
  );

  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  const supportTab = page.getByRole('tab', { name: 'Support' });
  await supportTab.focus();
  check(
    await supportTab.evaluate((element) => document.activeElement === element),
    'Keyboard focus was not visible/reachable under forced colors.',
  );
  await page.screenshot({
    path: path.join(evidenceDir, 'account-support-narrow-forced-colors.png'),
  });
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await page.setViewportSize(originalViewport);

  const receipt = {
    status: 'passed',
    endpoint,
    initialUrl,
    acceptedUrl: page.url(),
    title: await page.title(),
    signedIn,
    sessionHeadingOrder,
    passwordFormBoundary,
    usageProjection,
    containment,
    consoleErrors,
    pageErrors,
    capturedAt: new Date().toISOString(),
  };
  check(pageErrors.length === 0, `Page errors observed: ${pageErrors.join(' | ')}`);
  await writeFile(
    path.join(evidenceDir, 'account-native-acceptance.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
