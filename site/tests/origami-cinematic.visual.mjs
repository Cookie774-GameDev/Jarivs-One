import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const modulePath = process.argv[2];

if (!modulePath) {
  throw new Error("Pass the absolute Playwright module path as the first argument.");
}

const { chromium } = require(modulePath);
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "..");
const url = "http://127.0.0.1:5173/origami-cinematic.html";
const browser = await chromium.launch({ channel: "chrome", headless: true });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];

function watch(page) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "";
    const expectedBlobCancellation = request.url().startsWith("blob:") && errorText.includes("ERR_ABORTED");
    if (!expectedBlobCancellation) {
      failedRequests.push(`${request.method()} ${request.url()} ${errorText}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
}

async function openPage(context) {
  const page = await context.newPage();
  watch(page);
  page.setDefaultTimeout(30_000);
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(".world-stage");
  await page.waitForTimeout(1_200);
  return page;
}

async function scrollToProgress(page, maxScroll, progress, settle = 500) {
  await page.evaluate(
    ({ scrollTop }) => window.scrollTo(0, scrollTop),
    { scrollTop: maxScroll * progress }
  );
  await page.waitForTimeout(settle);
}

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktop = await openPage(desktopContext);

assert.equal(await desktop.locator(".route-button").count(), 6);
assert.equal(await desktop.locator(".scroll-chapter").count(), 6);
assert.equal(await desktop.locator(".video-layer").count(), 2);

const maxScroll = await desktop.evaluate(() => (
  document.getElementById("chapter-track").offsetHeight - window.innerHeight
));

await scrollToProgress(desktop, maxScroll, 0.105, 900);
const diveState = await desktop.evaluate(() => {
  const videos = [...document.querySelectorAll(".video-layer")];
  const active = videos.find((video) => Number.parseFloat(video.style.opacity || "0") > 0.5);
  return {
    activeTime: active?.currentTime ?? -1,
    activeDuration: active?.duration ?? Number.NaN,
    seekableEnd: active?.seekable.length ? active.seekable.end(0) : 0,
    meter: document.getElementById("meter-percent").textContent,
    sceneNumber: document.getElementById("scene-number").textContent
  };
});

assert.ok(Number.isFinite(diveState.activeDuration) && diveState.activeDuration > 4.9, JSON.stringify(diveState));
assert.ok(diveState.activeTime > 3.5, JSON.stringify(diveState));
assert.ok(diveState.seekableEnd > 4.9, JSON.stringify(diveState));
assert.match(diveState.meter, /\d+%/);
assert.equal(diveState.sceneNumber, "01 / 06");

await scrollToProgress(desktop, maxScroll, 0.85 / 6, 900);
const connectorState = await desktop.evaluate(() => {
  const videos = [...document.querySelectorAll(".video-layer")];
  const active = videos.find((video) => Number.parseFloat(video.style.opacity || "0") > 0.5);
  return {
    activeTime: active?.currentTime ?? -1,
    activeDuration: active?.duration ?? Number.NaN,
    seekableEnd: active?.seekable.length ? active.seekable.end(0) : 0,
    sceneNumber: document.getElementById("scene-number").textContent
  };
});

assert.ok(connectorState.activeTime > 2 && connectorState.activeTime < 3.2, JSON.stringify(connectorState));
assert.ok(connectorState.activeDuration > 4.9, JSON.stringify(connectorState));
assert.ok(connectorState.seekableEnd > 4.9, JSON.stringify(connectorState));
assert.equal(connectorState.sceneNumber, "01 / 06");

const seamSamples = [];
for (let scene = 0; scene < 5; scene += 1) {
  for (const local of [0.675, 0.992]) {
    await scrollToProgress(desktop, maxScroll, (scene + local) / 6, 320);
    const opacity = await desktop.locator("#seam-veil")
      .evaluate((element) => Number.parseFloat(element.style.opacity || "0"));
    seamSamples.push({ scene: scene + 1, local, opacity });
    assert.ok(opacity > 0.05, JSON.stringify(seamSamples));
  }
}

await scrollToProgress(desktop, maxScroll, 0.675 / 6, 500);
await desktop.screenshot({ path: path.join(site, "artifacts", "origami-seam-final.png") });

await scrollToProgress(desktop, maxScroll, 0.36, 900);
await desktop.screenshot({ path: path.join(site, "artifacts", "origami-desktop-final.png") });

await scrollToProgress(desktop, maxScroll, 1, 900);
assert.equal(await desktop.locator("#scene-number").textContent(), "06 / 06");
assert.ok(await desktop.locator("#scene-cta").isVisible());
await desktop.screenshot({ path: path.join(site, "artifacts", "origami-finale-final.png") });
await desktopContext.close();

async function verifyMobile(viewport, screenshotName, progress) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await openPage(context);
  const mobileMaxScroll = await page.evaluate(() => (
    document.getElementById("chapter-track").offsetHeight - window.innerHeight
  ));
  await scrollToProgress(page, mobileMaxScroll, progress, 900);

  const layout = await page.evaluate(() => {
    const title = document.getElementById("scene-title").getBoundingClientRect();
    const header = document.querySelector(".world-header").getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      title: { left: title.left, right: title.right, top: title.top, bottom: title.bottom },
      header: { left: header.left, right: header.right, top: header.top, bottom: header.bottom }
    };
  });

  assert.ok(layout.scrollWidth <= layout.viewportWidth + 1, JSON.stringify(layout));
  assert.ok(layout.title.left >= 0 && layout.title.right <= layout.viewportWidth + 1, JSON.stringify(layout));
  assert.ok(layout.title.top >= 0 && layout.title.bottom <= layout.viewportHeight + 1, JSON.stringify(layout));
  assert.ok(layout.header.left >= 0 && layout.header.right <= layout.viewportWidth + 1, JSON.stringify(layout));
  await page.screenshot({ path: path.join(site, "artifacts", screenshotName) });
  await context.close();
  return layout;
}

const portraitLayout = await verifyMobile(
  { width: 393, height: 852 },
  "origami-iphone-final.png",
  0.36
);
const landscapeLayout = await verifyMobile(
  { width: 852, height: 393 },
  "origami-iphone-landscape-final.png",
  0.36
);

assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.deepEqual(failedRequests, []);
assert.deepEqual(badResponses, []);

await browser.close();
console.log(JSON.stringify({
  ok: true,
  diveState,
  connectorState,
  seamSamples,
  portraitLayout,
  landscapeLayout
}, null, 2));
