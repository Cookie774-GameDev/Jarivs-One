# PR31 Faster Agents In-Place Whip + Music Studio Plan

## Coordination

- Agent/task: `VS-CODEX-WHIP-MUSIC-STUDIO-20260823` / `PR31-WHIP-IN-PLACE-AND-MUSIC-STUDIO`
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch/upstream: `integration/UnifiedChungus-final` / `origin/UnifiedChungus`
- Starting HEAD: `fcc9e6d6844b7354f0410fab357f1c64f6778cb0`
- Starting state: shared dirty worktree preserved; no merge, rebase, or cherry-pick state observed.
- Exact owned scope: recorded in `.agent-coordination.lock/VS-CODEX-WHIP-MUSIC-STUDIO-20260823.txt`.
- QA constraint: focused automated tests and static/cloud verification only. Do not open or manually drive VibeSpace.

## Verified Starting Evidence

### Faster Agents

- The released implementation opens a large second-stage modal around the whip instead of keeping the terminal grid as the working surface.
- Terminal selection is duplicated into modal cards. The real terminal panes are only styled after DOM lookup and are not the selection controls.
- `WhipCanvas` contains a visible `Crack now` button, contrary to the requested pointer-only OpenWhip interaction.
- Each crack sound reuses one audio element per sound and forcibly rewinds it. A new crack can interrupt an in-flight sound, and playback rejection has no warmed fallback path.
- Physics runs 20 constraint passes on every display frame regardless of elapsed time, making behavior frame-rate dependent and capable of feeling inconsistent under load.
- Upstream reference: <https://github.com/GitFrog1111/OpenWhip>, previously pinned at commit `83b976d7695934362b558b6340cb576c3b5656bb` under its MIT license.

### Music

- Input: `C:\Users\viper\Downloads\Music` contains 64 MP3 files totaling 335,678,213 bytes.
- Existing ambient playback supports one looping hosted track and five hard-coded catalog entries. It has no saved sequence, trim, speed, reorder, local import, or multi-clip transport.
- Current music storage is an unrelated public R2 bucket. This task will use a new music-only bucket and retain exact object/manifest integrity evidence.
- Cloudflare R2 pricing reference: <https://developers.cloudflare.com/r2/pricing/>. As checked 2026-08-23, Standard includes 10 GB-month storage, 1M Class A and 10M Class B requests monthly, with free R2 egress. The 0.336 GB seed library fits the storage allowance, but no implementation can guarantee a permanent $0 bill if limits or pricing change or traffic exceeds allowances.
- Bucket creation reference: <https://developers.cloudflare.com/r2/buckets/create-buckets/>. R2 buckets are private by default.

## Slice 1 — In-Place Faster Agents

1. Start with failing regression tests for real-pane selection, no duplicate terminal chooser, no `Crack now` button, pointer-only whip mode, selected-ref-only delivery, dismissal without delivery, and deterministic time-step behavior.
2. Make the full terminal page the interaction surface: dim all panes, select by clicking the actual pane, light only selected panes, and use a compact instruction/status strip rather than a second terminal UI.
3. Enter whip mode in the same terminal page. Render only the OpenWhip canvas and compact phrase/settings controls without replacing the grid. Pointer movement cracks; click/Escape ends the session.
4. Stabilize animation with bounded elapsed-time integration and reduce avoidable work. Pool independent audio voices so rapid cracks do not rewind each other; prime audio on an authorized gesture and report bounded failures without blocking terminal delivery.
5. Run focused tests after each behavior change and record results below.

## Slice 2 — Music Studio + Cloud Library

1. Generate a deterministic sanitized manifest for all 64 input MP3s with sizes and SHA-256 hashes; never commit source audio or credentials.
2. Create a new Standard R2 bucket, upload exact objects plus manifest, verify remote count/bytes/hash metadata, keep the bucket private, and expose playback only through a bounded music-delivery Worker with cache headers, range support, allowlisted manifest keys, CORS, and no secret-bearing URLs.
3. Add a responsive Music Studio in Ambient settings: searchable library, click-to-preview, ordered timeline, drag/button reorder, trim-in/trim-out, playback speed, remove, import local MP3/audio, loop, save/reset, transport, elapsed/duration display, and accessible keyboard controls.
4. Persist only project metadata and cloud IDs. User-imported tracks remain local-device objects by default and are never silently uploaded. Revoke object URLs and release audio resources on replacement/unmount.
5. Extend ambient playback to play the saved clip sequence continuously when enabled, including 24/7 mode, without creating competing audio engines.
6. Add unit/component tests for manifest sanitization, catalog integrity, persistence migration/fail-closed parsing, trim/speed/reorder, sequential/loop playback, local URL cleanup, range delivery, cache policy, and error recovery.

## Acceptance Matrix

| Area            | Required proof                                                                         | Result                                                  |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Whip routing    | Run lands on existing terminal page; no duplicate terminal page/modal                  | PASS — focused component/route contracts                |
| Selection       | Actual panes select; max 10; only selected panes undim                                 | PASS — focused DOM + store tests                        |
| Delivery        | One crack queues one phrase to exact selected refs only                                | PASS — exact ref payload test                           |
| Whip UX         | No synthetic crack button; same-page pointer whip; click/Escape exits                  | PASS — focused component tests                          |
| Stability       | Bounded time steps; overlapping sound pool; delivery survives audio failure            | PASS — focused pacing/audio tests                       |
| Cloud inventory | New bucket; 64 objects + manifest; exact bytes/hashes                                  | PASS — 64/64 live HEAD size checks                      |
| Cost guard      | Standard class; seed size within current free storage allowance; no permanent-$0 claim | PASS — 335,678,213 bytes in Standard                    |
| Studio          | Preview/list/order/trim/speed/import/loop/save controls                                | PASS — focused component/store tests                    |
| Ambience        | Saved project can run in ambient-only or 24/7 mode                                     | PASS — shared-engine host/playback tests                |
| Accessibility   | Keyboard operation, labels, focus, non-color selected state, reduced motion            | PASS — semantic controls and focused component coverage |
| Regression      | Focused suites, typecheck/build when feasible                                          | PASS with unrelated typecheck blocker documented        |

## Defect / Findings Queue

- `RESOLVED`: `TileGrid` exposes the exact leaf ID as `data-terminal-drop-pane-id`; `TerminalsPage` builds each target `TerminalRef` from that same leaf ID, so real-pane selection maps one-to-one without a second chooser.
- `RESOLVED`: deployed Worker returned a real `206`, exact `Content-Range: bytes 0-1023/5830053`, 1,024-byte body, Tauri CORS, and immutable cache policy.
- `RESOLVED`: the two “Play No Games” files are byte-identical, but sequence-plus-hash IDs and distinct object keys preserve both deterministic catalog rows without collision.
- `EXPECTED LIMITATION`: imported local files cannot survive an app restart unless the user reselects them; the saved project retains a clearly marked missing-local placeholder rather than uploading private audio.

## Checkpoints / Commits

- 2026-08-23 preflight: scope claimed at `fcc9e6d6`; no exact active-lock overlap; 37.3 GB C: free; 64 MP3 / 335,678,213-byte source inventory; source edits not yet started.
- 2026-08-23 Faster Agents slice: replaced the duplicate large modal/card chooser with direct real-pane selection and a compact instruction strip; kept the OpenWhip canvas over the existing terminal grid; removed `Crack now`; added click/Escape dismissal, bounded frame catch-up, and three independent audio voices per crack sound. Focused 7-file / 13-test matrix PASS after formatting. Final full typecheck contains no owned diagnostic and stops only on five pre-existing, actively owned SiYuan diagnostics (`siyuanContextMapIntegration.ts`, `siyuanRlmProduction.test.ts`, and `siyuanRlmRepository.test.ts`).
- 2026-08-23 Faster Agents commit: `e999edec4b04ad11fa45c497407066e611ac2887` (`fix(terminals): keep OpenWhip on selected panes`). Staged Gitleaks and diff checks PASS.
- 2026-08-23 cloud activation: created private Standard bucket `vibespace-music-library`; uploaded 64 MP3 objects plus `catalog/manifest.json`; live 64/64 HEAD responses matched each expected byte size. Deployed `vibespace-music-delivery` at <https://vibespace-music-delivery.vibespace-viper.workers.dev>, exact final Worker version `bc7f34ba-a1fa-4a54-8f66-fcd56dd6d0ad`. Live range/CORS/cache verification PASS.
- 2026-08-23 Music Studio implementation: searchable 64-song library, click preview, add local audio, ordered continuous sequence, up/down reorder, trim start/end, 0.5x–2x speed, remove/clear, loop, save, and ambient/24-7 activation use the existing single `AmbientAudioEngine`. Persisted local rows intentionally restore as missing-local placeholders and are never silently uploaded.
- Final fresh verification: combined Whip + music app matrix 14 files / 29 tests PASS; cloud scripts 4/4 PASS; Worker 3/3 plus typecheck and dry-run PASS; live cloud 64/64 exact-size HEAD checks and range row PASS; frontend Vite production build PASS (4,957 modules, 49.61s). Full repository TypeScript check has no owned diagnostic and remains blocked by four active SiYuan test diagnostics outside scope. No native/manual/browser app control was used per the user's QA constraint.
- Music implementation commit: `7ec0569a7665647d0929074034f0668c2a408ef2` (`feat(ambient): add cloud music studio`). Exact 24-file scope passed staged diff checks and Gitleaks before commit.
- Remaining truthful limits: native/manual visual and audible QA was not run by user instruction. Local imported audio stays available for the current app session; after restart the saved slot is visibly marked for re-selection because VibeSpace does not silently upload personal files. Cloudflare's current free allocation covers this 0.336 GB seed library, but traffic, future uploads, or pricing changes can create charges after free allowances.
- Final verification and released-lock entry: pending.
