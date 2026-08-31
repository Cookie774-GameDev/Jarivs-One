import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({
  chromium,
  jarvisPid: Number(process.env.JARVIS_PID ?? '9084'),
  cdpPort: 9223,
});
try {
  const page = attachment.page;
  if (process.env.OPEN_MODEL === '1') {
    if (!(await page.getByRole('listbox').isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Choose model' }).click();
    }
    await page.getByRole('listbox').waitFor({ state: 'visible' });
    if (process.env.EXPAND_OPENCODE_GO === '1') {
      const expand = page.getByRole('listbox').getByRole('button', { name: 'Expand Opencode Go Models' });
      await expand.waitFor({ state: 'visible' });
      await expand.click();
      await page.getByRole('listbox').getByRole('option').filter({ hasText: 'DeepSeek V4 Flash Vision Exp' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    }
  }
  const state = await page.evaluate(async () => {
    const [{ useAuthStore }, { db }, { resolveDefaultWriteDir }] = await Promise.all([
      import('/src/stores/auth.ts'),
      import('/src/lib/db/index.ts'),
      import('/src/lib/actions/defaultWriteDir.ts'),
    ]);
    const auth = useAuthStore.getState();
    const project = auth.projectId ? await db.projects.get(auth.projectId) : null;
    return ({
    url: location.href,
    title: document.title,
    visibility: document.visibilityState,
    bodyText: document.body.innerText.replace(/\s+/gu, ' ').trim().slice(0, 2_000),
    buttons: [...document.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label') || button.textContent?.trim())
      .filter(Boolean)
      .slice(0, 120),
    testIds: [...document.querySelectorAll('[data-testid]')]
      .map((node) => node.getAttribute('data-testid'))
      .filter(Boolean)
      .slice(0, 120),
    auth: {
      workspaceId: auth.workspaceId,
      projectId: auth.projectId,
      chatModelSelection: auth.chatModelSelection,
    },
    project,
    defaultWriteDir: await resolveDefaultWriteDir(),
    listboxOptions: [...document.querySelectorAll('[role="option"]')]
      .map((node) => node.textContent?.replace(/\s+/gu, ' ').trim())
      .filter(Boolean),
  });
  });
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
