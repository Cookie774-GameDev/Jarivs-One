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
  await page.waitForTimeout(1_200);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    document.getElementById("vibespaceOrigamiWorld")?.__vibespaceScrollWorld?.layout();
  });
  await page.waitForTimeout(200);
  return page;
}

async function getChainState(page) {
  return page.evaluate(() => {
    const root = document.getElementById("vibespaceOrigamiWorld");
    const instance = root.__vibespaceScrollWorld;
    return {
      mode: root.dataset.mode,
      sectionCount: instance.sections.length,
      segmentCount: instance.segments.length,
      clips: instance.segments.map((segment) => segment.clip),
      firstStart: instance.segments[0].start,
      firstEnd: instance.segments[0].end,
      connectorStart: instance.segments[1].start,
      connectorEnd: instance.segments[1].end
    };
  });
}

async function forceScroll(page, top) {
  await page.evaluate((scrollTop) => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    document.documentElement.scrollTop = scrollTop;
    document.body.scrollTop = scrollTop;
    window.scrollTo({ top: scrollTop, left: 0, behavior: "instant" });
  }, top);
  await page.waitForFunction(
    (scrollTop) => Math.abs(window.scrollY - scrollTop) < 5,
    top,
    { timeout: 10_000 }
  );
}

async function scrollAndReadActiveVideo(page, top) {
  await forceScroll(page, top);
  await page.waitForTimeout(1_500);
  return page.evaluate(() => {
    const root = document.getElementById("vibespaceOrigamiWorld");
    const visible = [...root.querySelectorAll(".sw-scene")]
      .map((scene) => ({
        scene,
        opacity: Number.parseFloat(scene.style.opacity || "0")
      }))
      .sort((a, b) => b.opacity - a.opacity)[0];
    const video = visible?.scene.querySelector("video");
    return {
      active: root.classList.contains("sw-is-active"),
      scrollY: window.scrollY,
      rootTop: root.getBoundingClientRect().top + window.scrollY,
      segmentStart: root.__vibespaceScrollWorld.segments[0].start,
      segmentEnd: root.__vibespaceScrollWorld.segments[0].end,
      opacity: visible?.opacity ?? 0,
      currentTime: video?.currentTime ?? -1,
      duration: video?.duration ?? Number.NaN,
      seekableEnd: video?.seekable.length ? video.seekable.end(0) : 0,
      videoSource: video?.currentSrc || "",
      title: root.querySelector(".sw-copy[style*='opacity: 1'] .sw-copy__title")?.textContent
        || [...root.querySelectorAll(".sw-copy")].find((copy) => Number.parseFloat(copy.style.opacity || "0") > 0.5)?.querySelector(".sw-copy__title")?.textContent
        || ""
    };
  });
}

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktop = await openPage(desktopContext);
const chain = await getChainState(desktop);

assert.equal(chain.mode, "cinematic");
assert.equal(chain.sectionCount, 6);
assert.equal(chain.segmentCount, 11);
assert.ok(chain.clips.every((clip) => clip.includes("images/origami-scroll/work/higgsfield-test/")));

const dive = await scrollAndReadActiveVideo(
  desktop,
  chain.firstStart + (chain.firstEnd - chain.firstStart) * 0.25
);
assert.ok(dive.active, JSON.stringify(dive));
assert.ok(dive.opacity > 0.9, JSON.stringify(dive));
assert.ok(dive.currentTime > 1, JSON.stringify(dive));
assert.ok(dive.duration > 4.9, JSON.stringify(dive));
assert.ok(dive.seekableEnd > 4.9, JSON.stringify(dive));
assert.match(dive.videoSource, /^blob:/);
await desktop.screenshot({ path: path.join(site, "artifacts", "vibespace-index-origami-desktop.png") });

const connector = await scrollAndReadActiveVideo(
  desktop,
  chain.connectorStart + (chain.connectorEnd - chain.connectorStart) * 0.55
);
assert.ok(connector.active, JSON.stringify(connector));
assert.ok(connector.currentTime > 1, JSON.stringify(connector));
assert.ok(connector.duration > 4.9, JSON.stringify(connector));
assert.ok(connector.seekableEnd > 4.9, JSON.stringify(connector));
assert.match(connector.videoSource, /^blob:/);

const featuresTop = await desktop.locator("#features").evaluate((element) => (
  element.getBoundingClientRect().top + window.scrollY
));
await forceScroll(desktop, featuresTop + 100);
await desktop.waitForTimeout(500);
assert.ok(await desktop.locator("#features").isVisible());
await desktopContext.close();

const mobileContext = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true
});
const mobile = await openPage(mobileContext);
const mobileChain = await getChainState(mobile);
await forceScroll(
  mobile,
  mobileChain.firstStart + (mobileChain.firstEnd - mobileChain.firstStart) * 0.25
);
await mobile.waitForTimeout(1_500);
const mobileLayout = await mobile.evaluate(() => {
  const root = document.getElementById("vibespaceOrigamiWorld");
  const title = [...root.querySelectorAll(".sw-copy")]
    .find((copy) => Number.parseFloat(copy.style.opacity || "0") > 0.5)
    ?.querySelector(".sw-copy__title")
    ?.getBoundingClientRect();
  return {
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    active: root.classList.contains("sw-is-active"),
    title: title ? { left: title.left, right: title.right, top: title.top, bottom: title.bottom } : null
  };
});

assert.ok(mobileLayout.active, JSON.stringify(mobileLayout));
assert.ok(mobileLayout.scrollWidth <= mobileLayout.viewportWidth + 1, JSON.stringify(mobileLayout));
assert.ok(mobileLayout.title, JSON.stringify(mobileLayout));
assert.ok(mobileLayout.title.left >= 0 && mobileLayout.title.right <= mobileLayout.viewportWidth + 1, JSON.stringify(mobileLayout));
await mobile.screenshot({ path: path.join(site, "artifacts", "vibespace-index-origami-iphone.png") });
await mobileContext.close();

assert.deepEqual(pageErrors, []);
assert.deepEqual(consoleErrors, []);
assert.deepEqual(localFailures, []);

await browser.close();
console.log(JSON.stringify({ ok: true, chain, dive, connector, mobileLayout }, null, 2));
