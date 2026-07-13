# Axo Visible Playback Repair

Date: 2026-07-12

Branch: `agent/pixel-pets-axolotl`

Agent: `AGENT-20260711-111338-PX7L`

## Requested outcome

Fix the visibly frozen cream Axo on the exact rendered Pet canvas. Do not use changing counters, mocked Pixi tests, source atlases, hidden players, or native-window existence as substitutes for visible motion. Preserve Glitch artwork/timing and unrelated systems.

## Root cause

The overlay could launch the same animation twice during boot, while React StrictMode cleanup disposed and replaced the player during asynchronous `init` / atlas loading. A stale request could then update shared `initOnce` and `currentAnim` refs for a different player. The same-animation guard checked only the animation string, so it could skip a replacement player that had no valid loaded texture or running playback.

Character changes also disposed the entire Pixi Application. That prevented Axo and Glitch from being compared through the same Application/ticker/canvas and introduced another avoidable freeze boundary.

## Changes

- Added lifecycle-generation and animation-request cancellation around every asynchronous player operation.
- Removed the duplicate boot animation launch.
- Replaced the string-only same-animation guard with exact player-health validation: live Application, Sprite, parsed multi-frame atlas, matching playback/atlas key, attached and started ticker, valid texture, and canvas attached to the expected host.
- Kept one Pixi Application, ticker, Sprite, update function, and canvas across Axo/Glitch atlas swaps. The player is disposed only when the overlay is disabled or unmounted.
- Added texture rectangle, assignment, reset, Application identity, canvas identity, and ticker diagnostics.
- Added tested pause, resume, and restart controls.
- Added a development-only `?petDebug=1` controller for the real visible player. It is excluded from production behavior by `import.meta.env.DEV`.
- Added StrictMode stale-player and playback-health regression coverage.
- Did not change Glitch artwork, Glitch timing, Axo atlas PNG artwork, Supabase, Stripe, billing, authentication, migrations, deployments, releases, or unrelated UI.

## Exact visible-canvas evidence

The direct Pet surface was loaded from the isolated worktree at:

`http://localhost:5174/?view=pet-overlay&petDebug=1`

Ten idle captures at 500 ms intervals produced 10 unique PNG hashes. Human inspection showed clear gill, face, body, and arm motion.

All eight states were then forced through the same visible player. Successful capture sets reported:

| State | Unique exact-canvas captures | Visible evidence |
|---|---:|---|
| welcome | 5/6 | different opening/body poses |
| idlePrimary | 6/6 | breathing, face, gill, and body changes |
| idleFun | 5/6 | distinct expressive poses |
| walkLeft | 6/6 | full-body, feet, arm, and tail changes |
| walkRight | 5/6 | full-body, feet, arm, and tail changes |
| sleepTransition | 8/8 | advancing transition poses |
| sleepingLoop | 6/6 | visibly different sleeping poses |
| wakeFromSleep | 7/8 | wake frames followed by normal idle motion |

Every live diagnostic sample reported `character=vibespace-axolotl`, a changing real frame rectangle, and `ticker=started`.

The reviewed contact sheet is `docs/pets/axo-visible-contact-sheet.png`. Its 16 cells are screenshots cropped from the exact visible Pixi canvas, not source atlas cells.

## Same-player control and restart

Axo, Glitch, and Axo again all used `app=tex:1` and `canvas=tex:2`; only the character atlas package changed. The ticker remained started and frames advanced after both switches. No Glitch asset was modified.

After a full page/runtime reload, Axo recreated a fresh expected runtime (`app=tex:3`, `canvas=tex:4`) and welcome advanced to frame 30/60 with the ticker started.

## Five-minute stability gate

The restarted surface was sampled every 50 seconds for five minutes. All seven samples retained `app=tex:3`, `canvas=tex:4`, and `ticker=started`. Welcome completed, idle and idle-fun scheduled normally, and frames continued advancing through the final sample (`idlePrimary`, frame 13/48). No player/canvas replacement occurred during the interval.

## Automated verification

- Focused red test: failed as expected because `isPlaybackReady` did not exist.
- Focused player/playback gate after fix: 16/16 passed.
- StrictMode lifecycle regression: 1/1 passed.
- Expanded playback/diagnostics gate: 21/21 passed; TypeScript typecheck passed.
- Complete Pet suite: 30 files, 136/136 passed.
- Full frontend suite: **failed** with 196 files passed and 1 failed; 1023 tests passed and 1 failed. The unrelated existing failure is `src/features/billing/planLimits.test.ts`: expected Starter `callMinutes` 14, current value 22. Billing was not modified.
- Standalone TypeScript typecheck: passed.
- Production build: passed. Existing dynamic-import and large-chunk warnings remain.
- Exact task-file `git diff --check`: passed; Git reported expected LF-to-CRLF working-copy warnings.

## Warnings and remaining gates

- Browser screenshot transport timed out during two later capture attempts. Those attempts were discarded; earlier exact-canvas captures and the reviewed contact sheet are retained.
- The direct browser-rendered Pet surface was verified. Windows desktop automation was intentionally not used after the user requested continuation without it.
- The unrelated billing test failure prevents claiming a fully green repository-wide suite.
- Existing React `act(...)`, Vite dynamic-import, and bundle-size warnings remain outside this task.
- Native overlay window experiments from an interrupted prior pass remain unstaged and are not part of this repair commit.

## Security and privacy

Diagnostics contain only build provenance, public asset identifiers, animation state, numeric frame/ticker data, and local object IDs. No secrets, terminal content, chat content, credentials, production data, or external-service data are captured or persisted.

## Rollback

Revert the focused visible-playback commit. This restores the previous boot/character player lifecycle and removes the development-only controller, regression test, and QA artifacts. No database, cloud, billing, authentication, migration, deployment, or release rollback is required.
