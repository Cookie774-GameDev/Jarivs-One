import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const modulePath = process.argv[2];
if (!modulePath) throw new Error("Pass the absolute Playwright module path.");

const { chromium } = require(modulePath);
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "..");
const url = "http://127.0.0.1:5173/index.html";
const browser = await chromium.launch({ channel: "chrome", headless: true });

const localFailures = [];
const pageErrors = [];
const consoleErrors = [];

function watch(page) {
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const failedUrl = request.url();
    const errorText = request.failure()?.errorText || "";
    const expectedBlobCancellation = failedUrl.startsWith("blob:") && errorText.includes("ERR_ABORTED");
    if (failedUrl.startsWith("http://127.0.0.1:5173/") && !expectedBlobCancellation) {
      localFailures.push(`${request.method()} ${failedUrl} ${errorText}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1:5173/") && response.status() >= 400) {
      localFailures.push(`${response.status()} ${response.url()}`);
    }
  });
}

async function openPage(context) {
  const page = await context.newPage();
  watch(page);
  page.setDefaultTimeout(30_000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("load", { timeout: 120_000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForSelector("#vibespaceOrigamiWorld.sw-root");
  await page.waitForFunction(() => (
    document.getElementById("vibespaceOrigamiWorld")?.dataset.mode === "cinematic"
  ));
  await page.waitForFunction(() => document.getElementById("desktopOS")?.dataset.shell === "mac");
  await page.waitForTimeout(2_700);
  return page;
}

async function forceScroll(page, top) {
  await page.evaluate((scrollTop) => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo({ top: scrollTop, left: 0, behavior: "instant" });
  }, top);
  await page.waitForTimeout(300);
}

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const desktop = await openPage(desktopContext);

const initial = await desktop.evaluate(() => {
  const root = document.getElementById("vibespaceOrigamiWorld");
  const instance = root.__vibespaceScrollWorld;
  const hero = document.querySelector(".hero-grid").getBoundingClientRect();
  return {
    bodyClass: document.body.className,
    background: getComputedStyle(document.body).backgroundColor,
    viewportWidth: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    simTabsDisplay: getComputedStyle(document.getElementById("simTabs")).display,
    hero: { left: hero.left, right: hero.right, top: hero.top, bottom: hero.bottom },
    sectionCount: instance.sections.length,
    segmentCount: instance.segments.length,
    mode: root.dataset.mode,
    inactiveHintOpacity: getComputedStyle(root.querySelector(".sw-hint")).opacity,
  };
});

assert.match(initial.bodyClass, /paper-world/);
assert.equal(initial.background, "rgb(243, 223, 195)");
assert.equal(initial.simTabsDisplay, "flex");
assert.ok(initial.hero.left >= 0 && initial.hero.right <= initial.viewportWidth + 1, JSON.stringify(initial));
assert.ok(initial.scrollWidth <= initial.viewportWidth + 1, JSON.stringify(initial));
assert.equal(initial.mode, "cinematic");
assert.equal(initial.sectionCount, 6);
assert.equal(initial.segmentCount, 11);
assert.equal(initial.inactiveHintOpacity, "0");

await desktop.screenshot({ path: path.join(site, "artifacts", "paper-world-hero-desktop.png") });

await desktop.locator('.desktop-shell-option[data-shell="windows"]').click();
await desktop.waitForFunction(() => document.getElementById("desktopOS")?.dataset.shell === "windows");
const shellState = await desktop.evaluate(() => ({
  shell: document.getElementById("desktopOS").dataset.shell,
  stored: sessionStorage.getItem("vs-desktop-shell"),
  macPressed: document.querySelector('.desktop-shell-option[data-shell="mac"]').getAttribute("aria-pressed"),
  windowsPressed: document.querySelector('.desktop-shell-option[data-shell="windows"]').getAttribute("aria-pressed"),
}));
assert.deepEqual(shellState, {
  shell: "windows",
  stored: "windows",
  macPressed: "false",
  windowsPressed: "true",
});

await desktop.locator('.sim-tab[data-sim="phone"]').click();
await desktop.waitForFunction(() => document.getElementById("simPhone")?.classList.contains("active"));
const phoneTabState = await desktop.evaluate(() => ({
  phoneSelected: document.querySelector('[data-sim="phone"]').getAttribute("aria-selected"),
  phoneHidden: document.getElementById("simPhone").getAttribute("aria-hidden"),
  desktopHidden: document.getElementById("simDesktop").getAttribute("aria-hidden"),
  phoneDisplay: getComputedStyle(document.getElementById("simPhone")).display,
}));
assert.deepEqual(phoneTabState, {
  phoneSelected: "true",
  phoneHidden: "false",
  desktopHidden: "true",
  phoneDisplay: "block",
});

await desktop.locator(".phone-lock").click();
await desktop.waitForFunction(() => document.querySelector(".phone-home-screen")?.classList.contains("active"));
assert.ok(await desktop.locator('.phone-app-icon[data-app="calls"]').first().isVisible());
await desktop.locator('.sim-tab[data-sim="desktop"]').click();

const features = desktop.locator("#features");
await features.scrollIntoViewIfNeeded();
await desktop.waitForTimeout(500);
assert.ok(await features.isVisible());
assert.equal(await desktop.locator("#features .card").count(), 9);
await features.screenshot({ path: path.join(site, "artifacts", "paper-world-sections-desktop.png") });

const pricingTop = await desktop.locator("#pricing").evaluate((element) => (
  element.getBoundingClientRect().top + window.scrollY
));
await forceScroll(desktop, pricingTop - 60);
assert.ok(await desktop.locator("#pricing").isVisible());
assert.equal(await desktop.locator("#pricing .plan").count(), 4);
assert.ok(await desktop.locator("#faq details").count() >= 6);
await desktopContext.close();

const mobileContext = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const mobile = await openPage(mobileContext);
await forceScroll(mobile, 0);
await mobile.screenshot({ path: path.join(site, "artifacts", "paper-world-hero-mobile.png"), fullPage: false });
await mobile.locator('.sim-tab[data-sim="phone"]').click();
await mobile.waitForFunction(() => document.getElementById("simPhone")?.classList.contains("active"));
const mobileState = await mobile.evaluate(() => {
  const hero = document.querySelector(".hero-grid").getBoundingClientRect();
  const folio = document.querySelector(".living-os-folio").getBoundingClientRect();
  return {
    viewportWidth: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hero: { left: hero.left, right: hero.right },
    folio: { left: folio.left, right: folio.right },
    simTabsDisplay: getComputedStyle(document.getElementById("simTabs")).display,
  };
});
assert.ok(mobileState.scrollWidth <= mobileState.viewportWidth + 1, JSON.stringify(mobileState));
assert.ok(mobileState.hero.left >= 0 && mobileState.hero.right <= mobileState.viewportWidth + 1, JSON.stringify(mobileState));
assert.ok(mobileState.folio.left >= 0 && mobileState.folio.right <= mobileState.viewportWidth + 1, JSON.stringify(mobileState));
assert.equal(mobileState.simTabsDisplay, "flex");
const folioTop = await mobile.locator(".living-os-folio").evaluate((element) => (
  element.getBoundingClientRect().top + window.scrollY
));
await forceScroll(mobile, Math.max(0, folioTop - 42));
await mobile.screenshot({ path: path.join(site, "artifacts", "paper-world-iphone.png"), fullPage: false });
await mobileContext.close();

assert.deepEqual(pageErrors, []);
assert.deepEqual(consoleErrors, []);
assert.deepEqual(localFailures, []);

await browser.close();
console.log(JSON.stringify({ ok: true, initial, shellState, phoneTabState, mobileState }, null, 2));
