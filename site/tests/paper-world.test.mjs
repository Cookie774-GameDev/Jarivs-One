import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "..");
const indexPath = path.join(site, "index.html");
const cssPath = path.join(site, "css", "site-appearance.css");
const desktopPath = path.join(site, "js", "desktop-os.js");
const motionPath = path.join(site, "js", "motion.js");
const html = readFileSync(indexPath, "utf8");
const desktop = readFileSync(desktopPath, "utf8");
const motion = readFileSync(motionPath, "utf8");

test("index exposes the mature VibeSpace appearance without replacing the Origami mount", () => {
  assert.match(html, /class="site-appearance-switch"[^>]*role="group"/);
  assert.match(html, /data-appearance-choice="default"/);
  assert.match(html, /data-appearance-choice="vibespace"/);
  assert.match(html, /class="vibe-fold-frame"[^>]*aria-hidden="true"/);
  assert.match(html, /class="vibe-fold-spine"/);
  assert.match(
    html,
    /id="vibespaceOrigamiWorld"[^>]*data-cinematic-ready="true"/,
  );
  assert.match(html, /src="js\/scroll-world-engine\.js"/);
  assert.match(html, /src="js\/origami-scroll-world\.js"/);
});

test("appearance stylesheet is present and loaded after the existing visual layers", () => {
  assert.ok(existsSync(cssPath), "css/site-appearance.css should exist");
  const origamiIndex = html.indexOf('href="css/origami-scroll-world.css"');
  const paperIndex = html.indexOf('href="css/site-appearance.css"');
  assert.ok(origamiIndex >= 0, "Origami stylesheet should remain loaded");
  assert.ok(paperIndex > origamiIndex, "site-appearance.css must be the final visual layer");
  assert.doesNotMatch(html, /href="css\/paper-world\.css"/);
});

test("appearance stylesheet defines the reference-derived system and safeguards", () => {
  assert.ok(existsSync(cssPath), "css/site-appearance.css should exist");
  const css = readFileSync(cssPath, "utf8");
  for (const color of [
    "#E9D4B7",
    "#F8E9D1",
    "#FFF7E8",
    "#3B2A20",
    "#DF846F",
    "#947DB7",
    "#879A7C",
    "#7F98AA",
    "#C98C42",
    "#302E4D",
  ]) {
    assert.ok(css.includes(color), `${color} should be defined`);
  }
  assert.match(css, /html\[data-site-appearance="vibespace"\]/);
  assert.match(css, /\.vibe-fold-spine/);
  assert.match(css, /\.vibe-stage-stack/);
  assert.match(css, /clip-path\s*:/);
  assert.match(css, /@media\s*\(max-width:\s*620px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
});

test("Living Desktop exposes a persistent macOS and Windows shell switch", () => {
  assert.match(html, /class="desktop-shell-switch"[^>]*role="group"/);
  assert.match(html, /class="desktop-shell-option[^\"]*"[^>]*data-shell="mac"/);
  assert.match(html, /class="desktop-shell-option[^\"]*"[^>]*data-shell="windows"/);
  assert.match(desktop, /vs-desktop-shell/);
  assert.match(desktop, /frame\.dataset\.shell/);
  assert.match(desktop, /aria-pressed/);
  assert.match(desktop, /initShellSwitch\(\)/);
});

test("the Living OS device switch stays visible at desktop and mobile sizes", () => {
  assert.match(html, /id="simTabs"/);
  assert.match(html, /data-sim="desktop"/);
  assert.match(html, /data-sim="phone"/);
  assert.ok(existsSync(cssPath), "css/site-appearance.css should exist");
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /html\[data-site-appearance="vibespace"\]\s+\.sim-tabs/);
  assert.match(motion, /aria-selected/);
  assert.match(motion, /aria-hidden/);
});
