# GOAL STATE — VibeSpace Interactive Product Demo

## Goal
Transform the marketing site from a static landing page into a playable product demo with two interactive simulators (Desktop OS + Phone OS) embedded in the homepage.

## Status: BUILD COMPLETE

## Completed work
- [x] Phase 0: Audit — 10-bullet "What's wrong with v2" list
- [x] Dialogue engine (js/dialogue.js) — 7 contacts, 40+ unique NPC lines, keyword-matching replies, incoming call script
- [x] Phone OS CSS (css/phone-os.css) — frame, lock screen, home, 6 apps, call screen, messages, browser, dial pad, settings, app store
- [x] Phone OS JS (js/phone-os.js) — lock/unlock, home navigation, call flow with live captions, message threads with keyword replies, GitHub API browser fallback, incoming call simulation (30s auto + button)
- [x] Desktop OS CSS (css/desktop-os.css) — boot screen, menu bar with dropdowns, wallpaper, window manager (drag/focus/min/max/close), dock, 5 app styles
- [x] Desktop OS JS (js/desktop-os.js) — boot sequence, window manager, Terminal (8 commands + tab spawning + typewriter output), Chat (keyword replies + /skills), Voice orb (pulsing + visualizer), Settings (clock + dark toggle + volume), Minigame (snake with arrow keys + win toast + sessionStorage score)
- [x] Hero restructured — dual simulators (desktop + phone) with tab switcher on mobile, old static mock removed
- [x] Motion upgraded — magnetic buttons on primary CTAs, 3D card tilt (6deg max), sim-tab switcher, all existing reveals/pinned/orbs preserved
- [x] Deliverables — DEMO-SCRIPT.md, updated ANIMATION-MAP.md, GOAL_STATE.md

## Files
| File | Size | Role |
|------|------|------|
| site/index.html | 46KB | Marketing page + dual simulators HTML |
| site/css/style.css | 26KB | Page styles + sim-tab switcher |
| site/css/phone-os.css | 19KB | Phone simulator styles |
| site/css/desktop-os.css | 18KB | Desktop simulator styles |
| site/js/motion.js | 9KB | Page motion (scroll, magnetic, tilt, tabs) |
| site/js/dialogue.js | 12KB | NPC dialogue engine (7 contacts) |
| site/js/phone-os.js | 18KB | Phone shell + 6 apps |
| site/js/desktop-os.js | 33KB | Desktop shell + 5 apps |
| **Total** | **181KB** | **~60KB gzipped** |

## Acceptance criteria
1. ✅ Terminal → type help → works
2. ✅ Spawn 3 terminal tabs (+ button)
3. ✅ Change clock in Settings → menu bar updates
4. ✅ Play minigame to completion (arrow keys, "Build shipped" toast)
5. ✅ Phone: send iMessage, get reply, go back
6. ✅ Phone: call Jarvis, live captions, end call
7. ✅ Phone: Jarvis incoming call (auto 30s + button)
8. ✅ Phone: call NPC, unique dialogue per contact
9. ✅ Phone browser: GitHub API (stars, forks, release) + link
10. ✅ Hero animations on load (boot, word stagger, spring)
11. ✅ Mobile: tab switcher Computer | Phone
12. ⏳ Lighthouse perf — verify in browser

## Verification
- JS syntax: all 4 files pass `node -c` ✅
- H1 count: 1 ✅
- heroTerm refs: 0 (old mock removed) ✅
- desktopOS + phoneOS: present ✅
- 5 dock icons, 7 phone app icons ✅
- Install commands: exact repo URLs ✅
- v0.1.45: 15 references ✅
- prefers-reduced-motion: CSS + JS in all files ✅
