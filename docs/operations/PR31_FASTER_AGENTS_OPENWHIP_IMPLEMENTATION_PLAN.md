# PR31 Faster Agents / OpenWhip Implementation Plan

## Preflight

- Agent/task: `VS-CODEX-FASTER-AGENTS-20260822` / `PR31-FASTER-AGENTS-OPENWHIP`
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch/upstream: `integration/UnifiedChungus-final` / `origin/UnifiedChungus`
- Starting HEAD: `718fbed324b4b01465771e658ee2b25924b6b8f2`
- Free disk at claim: 364,888,064 bytes. Capacity temporarily improved enough for web verification; final observed free space after the web build was 524,705,792 bytes. No cache/build/file deletion was performed.
- OpenWhip source: <https://github.com/GitFrog1111/OpenWhip>, audited at commit `83b976d7695934362b558b6340cb576c3b5656bb`, package version 1.1.0, declared MIT license. Per user clarification, VibeSpace ports and attributes its whip physics, black/white spline rendering, five crack sounds, and exact seven-entry weighted phrase pool represented as five editable unique slots. The Electron shell, Win32 FFI, Alt-Tab, and global keyboard automation remain excluded; only terminal delivery is refined to use VibeSpace's exact selected terminal refs.
- User voice file verified present: `C:\Users\viper\Downloads\deepgram-aura-2-saturn-en-01a02c70-7c64-71d1-acf3-6aeef5640353.wav` (82,604 bytes). It is bundled as `/audio/faster-agents/select-your-snail.wav` so both browser and packaged app playback use the same stable local asset.

## Outcome

The Tools page contains a first-party **Faster Agents** card. Run navigates to the existing Terminals route, dims the workspace, announces “Select your Snail,” and presents every live pane. The user may select 1–10 panes; selected panes visibly undim/light up while unselected panes stay subdued. The selection opens a smooth pointer-driven whip. Each valid crack plays a sound and submits one of 1–5 user-editable phrases only to the selected refs through VibeSpace’s existing terminal command queue. This is provider-neutral and works with Claude, OpenCode, Codex, shells, and other interactive terminal programs.

## Safety and performance

- Never inject global OS keystrokes or focus another application.
- Never send to an unselected/stale pane; selection is bounded to 10 and cancellation sends nothing.
- One crack produces at most one queued phrase under a cooldown; no duplicated submits.
- Phrase length/count are bounded and persisted locally.
- Animation uses one requestAnimationFrame loop only while open, the upstream-bounded 28-point chain, capped device-pixel ratio, and cleanup of audio/canvas/listeners on close.
- Audio failure is non-fatal and visible; no remote runtime dependency.

## Test matrix

1. Tools card opens the flow and routes to Terminals.
2. Selector lists live panes, caps selection at 10, and exposes selected/undimmed state with non-color semantics and keyboard controls.
3. Phrase editor enforces 1–5 nonblank bounded phrases and persists safely.
4. Crack selection is deterministic under injected randomness, cooldown-safe, and never duplicates.
5. Every selected pane receives exactly one grouped terminal-queue command; unselected panes receive none.
6. Cancel/close/audio failure never sends text or leaks animation work.
7. OpenWhip attribution, upstream-derived physics/visual behavior, exact weighted defaults, and bundled local audio assets are present.
8. Focused tests after each behavior slice; browser Playwright and web build only per the user's final QA constraint.

## Browser Playwright evidence

Browser surface: local Vite development preview controlled only through Playwright. Native/full-app acceptance was intentionally not run per the user's latest instruction.

| Timestamp (CDT) | Commit | Browser row | Evidence | Result |
| --- | --- | --- | --- | --- |
| 2026-08-22 22:14 | pending | Tools discovery | `Preloaded tools` exposed accessible `Run Faster Agents`; activating it changed the visible route from Tools to Terminal. | PASS |
| 2026-08-22 22:14 | pending | Selection entry | Dialog exposed `Select your Snail`, one live pane, `0 / 10 selected`, and disabled Continue. Local voice asset returned HTTP 200 / 82,604 bytes; audible output was not human-verified. | PASS with audio caveat |
| 2026-08-22 22:15 | pending | Dim/light selection | Dim layer class was `bg-black/70`; selected real pane had `data-faster-agents-selected=true`, computed opacity `1`, filter `brightness(1.12) saturate(1.1)`, z-index `90`, accessible pressed state, and `1 / 10 selected`. | PASS |
| 2026-08-22 22:15 | pending | OpenWhip view | Confirm exposed a canvas labelled `OpenWhip Faster Agents whip area`, a 28-segment non-color description, and all five exact unique editable defaults: `FASTER`, `GO FASTER`, `Faster CLANKER`, `Work FASTER`, `Speed it up clanker`. | PASS |
| 2026-08-22 22:15 | pending | One selected delivery | `Crack now` produced one `Whip delivered` status for exactly `1 selected terminal`. Exact ref-only queue payload and cancellation behavior are covered by focused unit tests because browser mode truthfully reports `Terminal backend not available`. | PASS (browser boundary explicit) |
| 2026-08-22 22:16 | pending | Local upstream assets | Voice WAV and OpenWhip A–E MP3 files each returned HTTP 200. A–E sizes/hashes match upstream commit `83b976d`. | PASS |

## Automated verification

- Focused suite: 8 files / 24 tests PASS (`2026-08-22 22:16 CDT`). Covers Tools entry/routing, 1–10 exact refs, selection-required flow, exact weighted phrases, OpenWhip tuning, local audio player reuse/failure, selected-only grouped delivery, close-without-send, and existing terminal command behavior.
- Web production build: `npx vite build` PASS, 4,946 modules transformed, built in 1m53s (`2026-08-22 22:20 CDT`). Existing large-chunk/dynamic-import warnings remain unchanged.
- Asset integrity: bundled A–E hashes exactly match audited OpenWhip commit; all six feature audio URLs returned HTTP 200.
- `git diff --check` on the owned text scope: PASS; only the repository's existing LF→CRLF warning was emitted for the two touched tracked page files.
- Repository typecheck: BLOCKED by four pre-existing errors in `src/features/context/siyuanRlmProduction.test.ts` and `src/features/context/siyuanRlmRepository.test.ts`. No Faster Agents error appeared in the complete compiler output.
- Native/full app: NOT RUN by explicit user instruction; no native result is claimed.

## Findings queue

- `KNOWN-RISK`: Final C: free space is 524,705,792 bytes. Do not delete caches/builds without permission.
- `USER-CONSTRAINT`: Run acceptance only in the browser with Playwright; do not test the full/native app for this task.
- `RESOLVED-DESIGN`: OpenWhip’s OS automation is unsuitable; existing VibeSpace terminal refs/queue provide safer provider-neutral targeting.
- `RESOLVED`: Replaced the first-pass inspired whip with an attributed port of upstream commit `83b976d`, preserving its 28-segment Verlet physics, Catmull–Rom rendering, crack thresholds, exact weighted phrase set, and local A–E sounds.
- `EXPECTED-BROWSER-LIMITATION`: Browser mode cannot run a native PTY. Browser Playwright proved navigation, selection, dim/light styling, editor, canvas, and delivery acknowledgement; exact native terminal insertion was proven at the queue contract boundary, not falsely claimed as native acceptance.

## Commits

- Pending.
