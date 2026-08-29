# PR31 — Desktop Pet Overlay and Panel Reliability Plan

**Status:** implementation handoff
**Target checkout:** `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
**Target branch:** `integration/UnifiedChungus-final`
**Prepared:** 2026-08-22
**Current planning base:** `f9f2151f441bf4758df1a13905efac06e1664c33`

## 1. Product outcome

The VibeSpace Pet is a real desktop companion, not an element trapped inside the VibeSpace shell. In an ordinary Windows desktop session it must be a single, small, transparent, clickable, draggable native window above VibeSpace, browser video, and other normal desktop applications. Clicking the Pet opens one working Pet Panel containing the existing chat, terminal, and activity presentations. The Panel must retain its correct state while the main app is hidden/minimized and must not duplicate chats, terminal sessions, requests, windows, or animation players.

The companion must be visibly alive and reliable: no unexplained black rectangle, unexpected disappearance, frozen/stuttering animation, duplicate Pet, dead click, or broken panel. A deliberate static fallback is acceptable only when it is explicit and still shows the Pet correctly; a silent fallback which turns a desktop companion into an in-app widget is not.

### Real platform boundary

A normal Tauri/Win32 topmost window can be above ordinary apps, browser video, and **windowed or borderless-fullscreen** games. It cannot guarantee drawing over a game running in true exclusive fullscreen, the Windows secure desktop/UAC prompt, or other privileged compositor surfaces. This plan must not promise unsupported injection, capture, or anti-cheat-hostile techniques. For a game test, record whether it is windowed/borderless (supported) or exclusive fullscreen (expected platform limitation).

## 2. Audit findings to verify before a fix

These are source-level observations; the implementation agent must reproduce each relevant one in the official native app and retain the actual outcome rather than treating them as a pre-approved diagnosis.

| Observation | Evidence | Consequence |
| --- | --- | --- |
| Native mode is intended to create a detached `pet-overlay` window. | `app/src-tauri/src/pets.rs` dynamically builds a transparent, frameless, `always_on_top`, `skip_taskbar` window and pins its HWND topmost. | The intended architecture can meet desktop-overlay behavior without a browser overlay. Dynamic construction is valid; absence from static `tauri.conf.json` is not itself a defect. |
| The native show command returns before creation/show has definitively succeeded. | `pet_show_overlay` schedules work onto the main thread and logs creation/show errors inside callbacks. | The renderer can observe a successful invoke while no usable overlay exists. |
| Renderer-side bridge suppresses invocation errors. | `app/src/features/pets/petTauriBridge.ts` catches `invoke` failures and returns `null`. | A user and the Pet Host cannot distinguish unavailable native bridge, create failure, permission/capability error, or visibility race. |
| The host intentionally falls back to an inline Pet after a short native visibility check. | `PetHost.tsx` calls `showPetOverlay`, waits, then chooses `useInlineFallback` when `isPetOverlayVisible()` is false. | The fallback Pet is bounded by VibeSpace's own window stacking and cannot appear above YouTube, other apps, or a game. This exactly conflicts with the requested desktop behavior. |
| Detached overlay click has a fragile failed-panel path. | `PetOverlayWindow.tsx` calls `openOrFocusPetMiniPanel`; `petTauriBridge.ts` describes a main-host fallback, but the canonical path deliberately does not dispatch the event that `PetHost` listens for. | If native panel creation/show fails, a detached Pet can restore itself without a user-visible panel or actionable error. |
| The Pet Panel is designed to be native and topmost. | `pets.rs` creates `pet-mini-panel`; the same topmost pin/watchdog covers visible Pet windows. | The Panel should be tested as its own native window, not as an internal modal. |
| Renderer safety tests exist, but official Windows desktop acceptance was recorded as not run. | `docs/pets/verification/MANUAL_WINDOWS.md` and `INTERACTIVE_STATUS.md`. | Existing unit coverage cannot prove app-over-app topmost behavior, actual click routing, GPU transparency, or game interaction. |

## 3. Non-negotiable contracts

1. **One native overlay in Tauri.** A Tauri run has at most one visible `pet-overlay` and one `pet-mini-panel`. Browser/app-only fallback is separate, explicitly labeled behavior and never pretends to satisfy desktop overlay.
2. **Truthful command results.** `show`, `hide`, `open panel`, and `reassert topmost` return an exact typed outcome. They must never report success merely because a callback was scheduled.
3. **No silent fallback.** A native creation, visibility, WebView, GPU, or permission failure exposes a concise, sanitized diagnostic and a user-actionable retry. It must not quietly draw the Pet in the main shell.
4. **Click works.** A tap/click under the existing drag threshold opens/focuses the Panel; a drag only moves/snaps the Pet. A sleeping Pet first wakes and opens exactly one Panel. Repeated clicks are single-flight.
5. **Presentation ownership remains stable.** Chat, active stream, terminal, terminal ownership, activity state, and saved geometry are not recreated, sent twice, or lost when opening/minimizing/closing the Panel.
6. **Topmost without focus theft.** The floating Pet reasserts topmost without activating itself. The Panel may focus only after the user opens it. Never change the foreground external app simply to keep the sprite visible.
7. **Visual robustness.** Transparency is scoped to the detached overlay only. A renderer init error, texture error, context loss, or reduced-motion setting must produce an intentional static image/failure state—not an opaque black square, blank transparent hit target, runaway frame loop, or stuck animation.
8. **No hidden computer control.** The Pet must not read, capture, alter, or send content from other apps. It can float above an external app and accept a user click; it cannot automate that app.
9. **No unrelated regressions.** Preserve current characters, animation priorities, drag/snap behavior, MonoChrome/reduced-motion rules, Pet privacy constraints, panel terminal limit, and app lifecycle behavior unless a precisely tested change is required.

## 4. Preflight and coordination

Before editing any source, the implementation agent must:

1. Work only from `C:\Users\viper\VibeSpace-UnifiedChungus-Final` on `integration/UnifiedChungus-final`. Record current `HEAD`, upstream, dirty paths, disk capacity, and merge/rebase/cherry-pick state.
2. Read root `AGENTS.md`, `.agent-coordination.lock/owner.txt`, every active lock relevant to `app/src-tauri/src/lib.rs`, Pet files, shared App files, and the relevant tail of `docs/AGENT_COORDINATION_PR31.md`.
3. Preserve all existing work. Never reset, clean, stash, rebase, switch the shared branch, delete artifacts, edit another agent's lock, or stage an unrelated dirty file.
4. Claim one narrow source-and-test slice in an agent-scoped lock and append-only coordination entry before each source edit. Source likely spans native Pet commands, `PetHost`, bridge/protocol, overlay/panel windows, and Pixi player; do not claim it all until the dependency map shows it is unowned.
5. Verify a newly built executable is the current source/commit before manual product acceptance. The installed `C:\Users\viper\AppData\Local\Jarvis One\jarvis.exe` may not match this checkout, so it is never proof for a source change without recorded build provenance.
6. Do not touch model/provider work, Context Gateway, terminal core, Supabase, Stripe, Cloudflare, credentials, billing, deployment, game processes, or Windows settings.

## 5. Architecture to preserve and complete

```text
Main VibeSpace window
  PetHost (coordination only)
       │ typed native result + typed window event
       ▼
Native Pet Overlay — transparent, 144×144, non-activating, topmost
  PetOverlay / one Pixi player / explicit static fallback
       │ validated cross-window request + correlation id
       ▼
Native Pet Panel — topmost only while visible, focus on deliberate open
  existing Chat / Terminal / Activity presentations
       │ presentation ownership state only
       └──────────────────────────────► main storage/services
```

The primary data flow must be native-command/result first. Shared `localStorage` or DOM custom events can remain a convenience for same-window state, but they cannot be the only cross-window delivery path. Use the already defined validated Pet window protocol/Tauri event boundary for an overlay-to-main fallback request and acknowledgement.

## 6. Delivery phases

### Phase 0 — Establish a native reproduction and observability baseline

Do not begin by changing colors, z-index, or watchdog timing. First identify where the chain fails:

```text
settings enabled
→ PetHost requests show
→ native overlay build
→ visible + correctly sized + transparent
→ HWND topmost pin
→ overlay renderer ready
→ click gesture
→ panel build/show/focus
→ panel visible + owner state attached
```

Add a narrowly scoped, privacy-safe diagnostic snapshot/trace only if current commands cannot report these states. It may include window label, `created`, `visible`, `minimized`, `topmostApplied`, size, monitor identity, renderer kind, static-fallback reason category, and sanitized native error category. It must not log screen content, external application titles, user paths, chat/terminal text, API keys, raw GPU traces, or HWND values in persisted telemetry.

Record a native baseline on the official app: app-only/inline status, native overlay status, whether a normal external window covers it, click outcome, and precise observed error. A baseline that cannot run is `BLOCKED`, not a pass.

### Phase 1 — Make native overlay outcome deterministic

Replace the fire-and-forget success shape with a small typed result such as:

```ts
type PetOverlayShowResult = {
  mode: 'native-overlay' | 'app-only';
  created: boolean;
  visible: boolean;
  topmostApplied: boolean;
  rendererReady: boolean | null;
  reason?: 'native_unavailable' | 'window_create_failed' | 'show_failed' | 'visibility_timeout';
};
```

Adapt exact repository types rather than adding a duplicate authority. The native command must await/synchronize its main-thread creation and show work sufficiently to report an honest result. Preserve WebView2's required post-create ordering; do not introduce unsafe blocking on the UI thread. A bounded result timeout must retain the error category and never report `visible: true` without verification.

On the TypeScript side, propagate a typed failure to `PetHost`/settings diagnostics. Stop using `null` as a catch-all success-like result. Maintain safe retries with single-flight protection and a bounded retry policy—one immediate race retry plus one explicit user retry is sufficient; no endless every-frame/re-render spawning.

**Acceptance:** forced/native create failure reaches a visible “Desktop Pet unavailable—Retry” state; successful native mode reports `visible` and an actual separate Pet window; the main shell does not render an imitation desktop Pet.

### Phase 2 — Fix panel open and cross-window fallback

Make `openOrFocusPetMiniPanel` return a similarly truthful `PetPanelOpenResult` after a visible/unminimized panel is confirmed. It needs correlation/single-flight identity so double-clicks and overlay/main concurrent requests converge on one panel.

When a detached overlay cannot open the Panel, send a validated `panel:open_fallback` request to the main Pet Host through the typed protocol/Tauri event bridge. The main host replies with acknowledged success/failure. Do not rely on a DOM event scoped to the overlay's WebView. On failure, keep the Pet visible, clear stale `panelOpen` flags, and display a concise retry state. Never hide both Pet and Panel.

Test all routes:

- first Pet click opens one native Panel;
- re-click focuses the same Panel;
- sleeping click wakes and opens one Panel;
- drag does not open Panel;
- native panel failure routes to an explicitly labeled app-only panel only if the user permits it, otherwise remains visible with retry;
- close/minimize restores one overlay and does not leave stale panel flags;
- a failed open does not leak a window, listener, timer, or Pixi app.

### Phase 3 — Topmost behavior under normal Windows compositor rules

Retain the native `SetWindowPos(HWND_TOPMOST, …, SWP_NOACTIVATE)` hardening and Tauri `set_always_on_top(true)` only for visible, unminimized Pet windows. Do not increase blind polling to mask an unknown lifecycle defect.

Use event-driven reassertion after show/restore/monitor change and a bounded watchdog as a backstop. Track when it applies and verify that it does not steal focus, move the window, alter position, create duplicate windows, or run after shutdown. Restore/validate transparency at the same guarded boundary without resetting user-selected appearance.

Handle monitor/DPI changes through existing clamp/recovery helpers. A missing monitor should move the Pet to a valid primary-monitor work area and retain usable geometry without jumping every second.

**Acceptance:** the Pet remains above a normal VibeSpace window, another ordinary desktop window, and a browser playing a video; Panel is above the same windows after click; external app retains focus until the user opens the Panel. Exclusive fullscreen is recorded as an expected limitation, not treated as a regression or “fixed” using injection.

### Phase 4 — Rendering, animation, and black/blank resilience

Audit `PixiAtlasPlayer`, `PetOverlay`, atlas loading, character changes, device-pixel-ratio selection, context cleanup, and reduced-motion/static paths before touching animation timing. Check specifically for:

- more than one live Pixi application for a single overlay;
- undisposed textures/tickers/listeners after hide/show, character switch, Panel open/close, or failed init;
- a renderer initialisation rejection that leaves an opaque canvas or no visible sprite;
- duplicate requestAnimationFrame loops, stale closures, and reinitialization during state updates;
- overlay transparency styles being applied to the main window;
- static fallback becoming black/blank because its image/asset failed;
- animation scheduler continuing after unmount/shutdown or stopping after a normal unrelated app focus change.

Use a deliberate visible static frame for recoverable renderer failure, marked in diagnostics with a generic `render_fallback` reason. Do not block Pet click/drag solely because animated rendering failed. For unrecoverable asset integrity failure, show a compact VibeSpace error/repair action rather than a black overlay. Preserve the existing animation state-machine priority order, pixel-art image rendering, character asset mapping, and MonoChrome rules.

Set performance budgets before optimization: one overlay player, no per-frame React state updates except existing bounded diagnostics, no permanent CPU polling beyond the justified native watchdog, and no frame-rate-dependent state transitions. Measure idle CPU/GPU symptoms and show/hide stability on representative hardware; do not call a visual delay a performance fix.

### Phase 5 — Lifecycle, settings, and panel presentations

Review Pet enabled/overlay visibility/panel mode/position lock/reduced-motion settings with the native lifecycle. State transitions must be explicit:

```text
disabled → hidden
enabled + desktop mode → native overlay shown
overlay click → panel opening → panel visible / overlay hidden
panel minimize or close → overlay shown
app hide-to-tray → only intentional background Pet state remains
app exit → overlay and panel hidden, watchdog/renderer released
renderer failure → static Pet plus diagnostic, interaction remains available
```

Do not change the user's explicit visibility setting on an unrelated state update. Remove any stale panel-open storage signal only after the corresponding native result is known.

For chat, terminal, and activity presentations, exercise existing ownership/restore contracts instead of creating a second protocol. Validate active streaming chat, an idle chat, one running terminal, terminal max limit, Panel minimize, Panel close, reopen, main-window hide, and Pet reappearance. No user message, terminal input, request, or activity event may be duplicated or dropped.

## 7. Automated verification matrix

Start each behavioral repair with a focused failing test. Keep tests deterministic; mock native boundaries at the unit layer and reserve actual desktop behavior for the official native app.

| Area | Required automated proof |
| --- | --- |
| Native command result | create/show error is returned as failure; success requires visible state; race/retry bounded; no unobserved callback error becomes success |
| Bridge | typed error/result propagation; no `null` ambiguity; single-flight show/open; one explicit retry; stale request ignored |
| Host fallback | Tauri failed native overlay does not silently render an in-app desktop substitute; explicit app-only route only when selected; state flags settle correctly |
| Overlay click | click/drag threshold; sleeping first click; re-click; keyboard/accessibility activation where supported; no duplicate panel |
| Cross-window protocol | invalid source/action/session rejected; overlay→main fallback acknowledged; stale/repeated message harmless |
| Native topmost | visible/unminimized windows only; no activation/move/resize; watchdog stops/refrains after hidden shutdown |
| Geometry/DPI | persisted geometry valid; disconnect/reconnect clamps to valid monitor; no off-screen Pet/Panel |
| Rendering | exactly one Pixi app/player; tickers/textures/listeners disposed; init/load/context failure picks explicit static/error state; no black fallback |
| Accessibility | transparent Pet remains clickable; Panel trigger text/labels; focus state; high contrast/MonoChrome; reduced motion; no color-only status |
| Presentations | chat/terminal owner preserved through open/minimize/close/reopen; no duplicate stream/request/input; terminal limit unchanged |
| Regression | existing Pet test suite plus changed focused native/renderer tests, format/type/build checks as capacity permits |

Run repository-required checks only when disk capacity permits and record exact command/output: `npm run typecheck`, `npm --prefix app run test`, `npm run test:release-manifest`, `npm run build`, and `cargo check --manifest-path app/src-tauri/Cargo.toml`. A current C: capacity check is mandatory before a Rust/full build. Never delete caches, builds, user files, or other agents’ data to free space.

## 8. Official native acceptance matrix

Use the official full native VibeSpace app built from the intended commit. Keep it open during the matrix. Do not substitute a browser copy of VibeSpace, Playwright, DevTools, screenshots alone, or a prior installed binary with unknown provenance.

| Scenario | Expected result | Status field to record |
| --- | --- | --- |
| Start enabled Pet on desktop | one transparent native Pet, not an inline VibeSpace element | commit, binary path/hash, native result, actual |
| Main VibeSpace foreground/background | Pet stays visible without stealing focus | actual, focus observation |
| Browser video / YouTube in a normal browser window | Pet remains above it and clickable; video/browser is never controlled | actual, browser state |
| Ordinary external desktop app | Pet remains above it and click opens Panel | actual |
| Windowed/borderless game | Pet remains above it if Windows compositor permits | game display mode, actual |
| Exclusive-fullscreen game | document expected unsupported compositor limitation | game display mode, `EXPECTED LIMITATION` |
| Pet click / sleeping Pet click / drag | exactly one Panel, wake behavior, no panel on drag | panel count, actual |
| Panel chat/activity | current Chat/Activity presentation opens and reopens accurately | expected/actual |
| Panel terminal | terminal remains live; input and output not duplicated | terminal ID/actual (sanitized) |
| Panel minimize / close / app hide / exit | one Pet restoration or intentional hide; no phantom windows | actual |
| Theme, MonoChrome, reduced motion | alpha background correct, sprite visible, motion policy respected | actual |
| GPU/asset recovery case | static/Error state is visible and interactive, no black rectangle | sanitized reason, actual |
| Multi-monitor/DPI | position remains usable and topmost without focus theft | monitor/DPI/actual |

For every row record timestamp, commit SHA, exact model/build provenance, expected result, actual result, screenshots only when safe, and sanitized diagnostics. Use `PASS`, `FAIL`, `BLOCKED`, or `EXPECTED LIMITATION`; never retroactively rename an unrun row as pass.

## 9. Working method: keep fixing, do not fake a finish

Maintain a small failure queue in the implementation ledger. If a small UI defect occurs while testing a broader scenario, add it to the current owned slice, fix it with a targeted regression, rerun that row, and continue through the matrix. Do not abandon the entire Pet task after the first visual issue.

Do not stack speculative fixes. After each failed hypothesis, inspect the exact boundary/result. After three failed root-cause attempts or a design conflict that would require app injection, desktop privilege escalation, a broad architecture replacement, or overwriting an active agent's scope, stop that lane and document the evidence/decision required.

## 10. Commit and handoff protocol

Suggested independently reviewable commits:

1. `fix(pets): report verified desktop overlay outcome`
2. `fix(pets): make overlay panel open failure recoverable`
3. `fix(pets): stabilize visible native pet topmost lifecycle`
4. `fix(pets): make renderer fallback visible and disposable`
5. `test(pets): cover native overlay reliability matrix`
6. `docs(pets): record native acceptance evidence`

Names are examples, not a reason to combine unrelated changes. Before each commit: inspect owned diff, run the focused suite, run formatter/diff checks, stage only exact owned paths, and record test results. Do not stage unrelated dirty files. After every completed slice add a coordination checkpoint with base/resulting SHA, files, tests, native evidence, residual risk, and released locks. The final native acceptance row is a release requirement, not a claim based on source inspection.

## 11. GPT-5.6-oriented implementation prompt

The following prompt is intentionally outcome-first and avoids repeating generic “think harder” instructions. It follows the official OpenAI guidance to state the result, evidence bar, safe autonomy, and stop conditions once. The exact public OpenAI documentation reviewed is [Model guidance — GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices). The current official page names `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`; it does not document a model named “GPT-5 Turbo Text Solo,” so do not claim that exact identity unless the agent host independently exposes it.

```text
Role
You are the implementation owner for VibeSpace PR31 Pet desktop-overlay reliability. Work as a careful native desktop engineer in a shared, dirty repository.

Goal
Deliver a real VibeSpace Pet that appears as one transparent native desktop overlay above normal Windows apps, browser video, and windowed/borderless games; clicking it opens one reliable native Pet Panel with the existing Chat, Terminals, and Activity presentations. Eliminate silent fallback, dead clicks, unexplained black/blank Pet state, duplicate windows, animation freezes/stutter, and state loss without changing unrelated systems.

Success criteria
- In native Tauri mode, an enabled Desktop Pet is a verified separate pet-overlay window, not an element inside the VibeSpace main shell.
- Native show/open commands return truthful typed outcomes after visible state is verified; errors are sanitized and actionable.
- A click opens/focuses exactly one Panel; drag does not. Panel failure keeps the Pet visible and gives a retry/fallback state instead of doing nothing.
- Existing Chat/Terminal/Activity state survives Panel minimize, close, reopen, and main-window hide without duplicate requests or terminal data.
- Pet rendering remains transparent, responsive, and interactive. Recoverable rendering failure shows an intentional static/error state, never a black or blank square.
- The official native VibeSpace app passes the documented desktop acceptance matrix for normal compositor cases. Exclusive fullscreen is documented as an expected Win32 limitation, not disguised as a pass.

Constraints
- Work only in C:\Users\viper\VibeSpace-UnifiedChungus-Final on integration/UnifiedChungus-final.
- Before every source edit, read AGENTS.md, owner.txt, active locks, relevant PR31 ledger entries, git status/HEAD/upstream, and this plan: docs/operations/PR31_PET_DESKTOP_OVERLAY_RELIABILITY_IMPLEMENTATION_PLAN.md.
- You are not alone in the repository. Preserve every other agent’s uncommitted work. Never reset, clean, stash, rebase, switch branch, overwrite a claimed file, stage unrelated changes, delete build/cache/user files, or modify credentials, billing, external services, games, or Windows settings.
- Create an agent-scoped exact-file lock and append coordination claim before each source slice. If a required file is locked, implement an independent slice or coordinate; never work around it with competing logic.
- No app/game injection, screen capture, external-app automation, anti-cheat workaround, or promise that a normal window can cover true exclusive fullscreen or UAC.
- Keep native command error details secret-safe. Do not log external app titles, user content, paths, handles, tokens, or raw GPU/provider output.

Evidence-first workflow
1. Confirm the running/built app is the current commit. Establish the baseline chain: settings → host request → native overlay creation → visible/topmost/transparent window → renderer ready → click → panel visible → presentations retained.
2. Start with the smallest failing test for the first measured break. Fix one boundary at a time, rerun focused tests, then record the result.
3. First make native command results truthful; then fix cross-window Panel fallback; then topmost lifecycle; then rendering/animation resilience; then presentation and full native verification.
4. Keep a compact failure queue. Fix a small discovered defect in the current owned slice and continue the wider matrix. Do not stop after finding one UI bug.
5. Use the official full native VibeSpace app for product/manual testing only. Unit tests and source inspection do not count as visual/topmost proof.

Verification
- Add focused tests for native outcome truth, bridge errors/single-flight, click-vs-drag, failed panel relay, visible/unminimized topmost behavior, renderer lifecycle/static fallback, and presentation survival.
- Run repository checks when disk space permits. Record exact command outcomes; classify unrelated failures without editing their owners’ systems.
- Execute and record every native matrix row as PASS, FAIL, BLOCKED, or EXPECTED LIMITATION. Do not invent results.

Commit and stop rules
- Commit each clean owned slice on integration/UnifiedChungus-final using explicit staging. Include tests, native evidence, exact SHA, risks, and lock release in the coordination checkpoint.
- Continue safe in-scope work without asking for routine source/test permission. Stop and report before external writes, destructive actions, broad scope expansion, or an active-lock conflict.
- If three root-cause attempts fail or meeting the request would require injection/privilege escalation/overwriting another agent, stop that lane and document the evidence and architectural decision needed.

Final response
Lead with what was actually verified. List commits, owned files, focused tests, native acceptance outcomes, expected platform limitations, and remaining blockers. Never state or imply that a row passed unless it was executed on the official native app built from the recorded commit.
```
