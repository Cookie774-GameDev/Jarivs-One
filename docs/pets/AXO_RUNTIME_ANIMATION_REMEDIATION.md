# Normal Axo Runtime Animation Remediation

Date: 2026-07-12
Agent: `AGENT-20260712-160313-AXO2`
Branch: `agent/pixel-pets-axolotl`
Starting commit: `18ffc7ee3700c29cd5861b202a3d73868d5351f1`
Implementation commit: `4c78efaa9445059622ffa47a1a3793293fd7aa86`

## Outcome

The normal cream Axo atlases now preserve the articulated motion in the approved source videos. The shared PixiJS player, state machine, scheduler, drag classifier, manifest, atlas JSON, and Glitch character were not changed.

This remediation is intentionally Axo-only. It does not modify application UI, window contracts, Pet selection, saved position, mini-panel behavior, chat, terminals, voice, activity, settings, Supabase, Stripe, billing, authentication, deployment, releases, migrations, or production data.

## Root cause

The Pixi runtime was not frozen. Instrumented playback showed one application, canvas, ticker, and sprite, with frame indices and texture rectangles advancing correctly.

The defect was in `tools/pets/rebuild_canonical_axo.py`. The previous generator replaced every decoded source-video frame with the same static layered cream master, then copied only whole-sprite translation and scale from the motion frame. That removed articulated leg, arm, tail, gill, face, direction, seated-sleep, and wake motion. Small global shifts still produced distinct image hashes, so the prior uniqueness test did not detect the failure.

The normal Axo sleeping-loop atlas had the same standing master instead of the seated pose present in the approved sleep video. The supplied direction clips themselves were correctly named and mapped: `walking_cycle_left` faces/moves left, and `walking_in_place` faces/moves right. No manifest swap or global mirroring was justified.

## Repair

`tools/pets/rebuild_canonical_axo.py` was replaced with a deterministic, source-video-driven Axo generator that:

- verifies the SHA-256 of all six approved source videos before decoding;
- keys green-screen pixels without generically deleting black or white character pixels;
- removes only border-connected neutral checker/black/white background regions;
- retains the connected Axo and rejects remote background sparkles and shadow artifacts;
- uses one stable crop for each source video and nearest-neighbor resampling;
- emits hard alpha (`0` or `255`) and zero RGB below transparent pixels;
- writes exact 128 px cells and exact nearest-neighbor 256 px counterparts;
- preserves existing atlas JSON rectangles, frame names, counts, timing, direction, and V-logo orientation;
- regenerates bounded Axo contact sheets for review;
- hashes the complete Glitch tree before and after generation and aborts if any Glitch file changes.

The generator does not rewrite the 136-layer extraction, archival PSD/ORA, manifest, source layers, original videos, atlas JSON, animation manifest, or Glitch assets.

## Runtime contract retained

No runtime TypeScript file changed. Existing drag thresholds remain:

- walk entry: 14 px/s
- walk exit: 5 px/s
- direction hysteresis: 100 ms
- stop delay: 160 ms
- minimum walking hold: 180 ms
- velocity smoothing: 0.32

Existing animation FPS values remain bounded between 4 and 24 FPS. The repaired states retain these frame contracts:

| State | Frames | FPS | Source behavior |
|---|---:|---:|---|
| `welcome` | 60 | 7.5 | Complete greeting articulation |
| `idlePrimary` | 48 | 5.9 | Primary breathing/gill/tail idle |
| `idleFun` | 60 | 7.5 | Complete special idle expression |
| `walkLeft` | 20 | 7.2 | Faces and walks left |
| `walkRight` | 20 | 7.2 | Faces and walks right |
| `sleepTransition` | 120 | 7.0 | Standing through seated sleep transition |
| `sleepingLoop` | 40 | 4.5 | Stable seated sleep loop |
| `wakeFromSleep` | 8 | 12.0 | Reverse-sampled complete transition to standing |

The stable sleep loop samples source frames 185 through 238 of 240 (7.708 through 9.917 seconds at 24 FPS). Its final measured loop seam is:

- mean RGB difference: 9.634
- alpha mismatch: 0.005615
- adjacent median RGB difference: 5.874
- adjacent median alpha mismatch: 0.003113

## Files changed

- `tools/pets/rebuild_canonical_axo.py`
- `app/src/features/pets/petAnimationFrames.test.ts`
- normal Axo PNG atlases only for the eight states listed above, at `@1x` and `@2x`
- normal Axo contact sheets under `app/src/assets/pets/characters/vibespace-axolotl/previews`
- review contact sheets under `docs/pets/contact-sheets`
- `docs/pets/evidence/axo-sleeping-loop-contact-sheet.png`
- `docs/pets/evidence/axo-runtime-animation-verification.webm`
- this remediation report

No Axo animation manifest or atlas JSON file changed because investigation proved their mapping, rectangles, counts, and timing were correct.

## Regression coverage

`petAnimationFrames.test.ts` now normalizes each frame's alpha silhouette before comparison. This rejects translation/scale-only copies of a static master while allowing legitimate whole-character movement. It also measures the sleeping-loop seam in both visible RGB and alpha space.

The test-first evidence was:

- pose test RED: `welcome` normalized silhouette score 0.106, below required 0.18;
- sleep seam RED: mean RGB difference 26.201, above allowed 15;
- both tests GREEN after the source-frame rebuild and stable-loop range selection.

## Runtime evidence

The real debug route used the same Pixi player and generated assets as the application. It verified:

- `welcome` completed into primary idle;
- primary idle wrapped continuously;
- special idle completed and returned to primary idle;
- left and right walking wrapped continuously;
- real rightward pointer movement selected `walkRight`;
- real leftward pointer movement selected `walkLeft`;
- the complete tired transition entered the sleeping loop;
- the sleeping loop wrapped indefinitely;
- the first wake transition returned to idle;
- the unchanged Glitch transition entered and wrapped its sleeping loop.

Evidence recording: `docs/pets/evidence/axo-runtime-animation-verification.webm` (VP9, 1280x720, 4 FPS, 46.25 seconds, 540,563 bytes).

The development Tauri command built and launched the correct worktree executable at `app/src-tauri/target/debug/jarvis.exe`. The native Pet creation path ran. An immediate visibility query occurred before the WebView was ready and returned false, so native standalone overlay visibility is not claimed from that query; the same served frontend build was independently exercised through the real Pixi debug route.

## Verification record

The following commands were run and their output checked during this remediation:

- focused baseline: 20/20 tests passed;
- focused Axo/Pixi/identity/alpha/manifest/Glitch/state/drag/timer suite: 39/39 passed;
- complete Pet suite: 138/138 passed;
- TypeScript typecheck: passed;
- production frontend build: passed with existing Vite dynamic-import/chunk warnings;
- release-manifest test: 1/1 passed;
- asset audit: all eight counts/FPS/layouts matched; alpha was hard-only; transparent RGB was zero; every `@2x` cell was an exact nearest-neighbor enlargement;
- deterministic rebuild audit: rerunning the complete six-video/eight-state generator reproduced all 33 generated atlas/contact-sheet files byte-for-byte (33/33 SHA-256 hashes identical);
- Glitch freeze test: passed;
- Glitch aggregate SHA-256: `981accde753428bf2a07bc5edeb773ff90c9a44bb3f9ce2180765a54c40cb494` across 37 files;
- runtime scan: no MP4 path is referenced by Pet runtime or assets;
- `git diff --check`: no whitespace errors (existing Windows line-ending warnings remain).

The full frontend suite was not completely green: 1,025/1,026 tests passed. The one failure is an existing, unrelated billing inconsistency in `src/features/billing/planLimits.test.ts`: the test expects Starter call minutes `14`, while unchanged HEAD/runtime marketing data specifies `22`. Billing files are outside this task and were not modified.

`npm --prefix app run tauri:build` completed the frontend build, Rust release compilation, MSI bundle, and NSIS bundle. The command then exited 1 at the updater-signing step because a public key is configured but `TAURI_SIGNING_PRIVATE_KEY` is intentionally unavailable. No private key was requested, printed, persisted, or fabricated.

Generated local bundle evidence (not committed or installed):

| Bundle | Bytes | SHA-256 |
|---|---:|---|
| `VibeSpace_0.1.48_x64_en-US.msi` | 60,514,304 | `C22D77B7CBC40043AC8AE33B8DF8055B932FCD3D3F229A3BD1AA5E4B1CE5B3CC` |
| `VibeSpace_0.1.48_x64-setup.exe` | 46,186,210 | `693FF21620571BB0DD35BBA49AACF25642D67B30D34299A1CAB2022B896920B9` |

There is no `lint` script in `app/package.json`; a separate lint command was therefore unavailable.

## Warnings and remaining manual gates

- The unrelated billing expectation prevents a truthful all-frontend-tests-pass claim.
- Updater signing requires an authorized release operator and the protected private key.
- The generated installers were not installed; signed packaged-install and real desktop-overlay validation remain manual release gates.
- Existing Vite chunk/dynamic-import warnings and Rust dead-code warnings remain.
- Two initial read-only native window probes were noisy because of a PowerShell reserved-variable collision and a legacy C# compiler syntax limitation. A third probe enumerated the native main VibeSpace window. None changed application state.
- The first evidence encode failed because browser screenshots contained JPEG bytes with temporary `.png` names. Renaming those temporary files to `.jpg` produced the verified WebM.

## Security and compatibility

- Source assets are read-only and checksum-gated.
- No secrets or source video bytes are placed in logs or committed.
- No MP4 is loaded at runtime.
- Transparent pixels contain zero RGB, preventing hidden color fringes.
- Glitch is frozen and unchanged.
- No network, database, payment, authentication, deployment, release, migration, or production operation was performed.
- The unrelated `install/install.ps1` deletion and all unrelated dirty files are preserved exactly and excluded from staging.

## Rollback

After the remediation commit is created, revert that focused commit with:

```powershell
git revert 4c78efaa9445059622ffa47a1a3793293fd7aa86
```

This restores the prior normal Axo PNG atlases, generator, tests, contact sheets, and evidence without changing Pet runtime contracts or unrelated files. Do not use `git reset --hard`, broad checkout, `git add -A`, or any command that includes the protected installer deletion or another agent's files.
