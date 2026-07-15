# Pixel Pets — Final Implementation Report

**Agent:** `AGENT-20260711-111338-PX7L`
**Branch:** `agent/pixel-pets-axolotl`
**Draft PR:** https://github.com/Cookie774-GameDev/VibeSpace/pull/19
**Status:** In progress toward full amendment (PixiJS + Tauri windows + mini-panel parity)

## Architecture

```
┌──────────────── main ─────────────────┐
│  PetHost → show pet-overlay (Tauri)   │
│  Presentation ownership store sync    │
└───────────────┬───────────────────────┘
                │ typed protocol (validated)
     ┌──────────┴──────────┐
     ▼                     ▼
┌ pet-overlay ┐     ┌ pet-mini-panel ──────┐
│ PixiJS App  │     │ Chats / Terminals /  │
│ transparent │     │ Activity             │
│ always-on-  │     │ lifecycle + confirm  │
│ top, drag   │     │ max 4 terminals      │
└─────────────┘     └──────────────────────┘
```

- **Motion source:** six offline MP4s → transparent PNG frames → `@1x`/`@2x` atlases (never played as video).
- **Renderer:** real **PixiJS `Application`** (`PixiAtlasPlayer`) with nearest-neighbor textures, hard alpha, bottom-center anchors.
- **Windows:** `pet-overlay` + `pet-mini-panel` (least-privilege capabilities).
- **Browser fallback:** embedded `PetOverlay` + `PetMiniPanel` when not in Tauri.

## PixiJS lifecycle

1. `PixiAtlasPlayer.init(host)` creates **one** `Application` (second init reuses).
2. `load(atlasJson, png)` builds frame `Texture`s with `SCALE_MODES.NEAREST`.
3. Ticker advances frames; one-shots call `onComplete`.
4. `dispose()` removes ticker, destroys textures/sprite/app, clears host — live app count decrements.

## Tauri windows

| Label | Size | Flags | URL |
|-------|------|-------|-----|
| `pet-overlay` | 144×144 | transparent, frameless, alwaysOnTop, skipTaskbar | `?view=pet-overlay` |
| `pet-mini-panel` | 430×560 (min 360×360) | resizable, alwaysOnTop | `?view=pet-mini-panel` |

**Commands:** `pet_show_overlay`, `pet_set_overlay_position`, `pet_open_or_focus_panel`, `pet_minimize_panel`, `pet_hide_panel`, `pet_is_panel_visible`, `pet_save_panel_geometry`, `pet_validate_action`.

**Geometry:** persisted under app data `pets/window-geometry.json`; monitor disconnect falls back to primary; positions clamped to work area (taskbar inset).

## Capability permissions

- `capabilities/pet-overlay.json` — window geometry + events only.
- `capabilities/pet-mini-panel.json` — window controls + dialog; no shell open / unrestricted fs.
- `default.json` lists pet windows for shared core IPC where needed.

## Window protocol

See `app/src/features/pets/petWindowProtocol.ts`. Envelopes require `v=1`, session id, allowed action, allowed source→dest route. Malformed / unauthorized messages rejected.

## Chat / terminal ownership

- `petPresentation.ts`: move changes **owner** only (same `chatId` / `ptyId`).
- `beginChatRequest` blocks duplicate outbound requests while one is active.
- Max **4** terminal presentations on pet panel; exact message:
  `The Pet panel supports up to 4 terminals. Return or close one before adding another.`
- Minimize/close snapshot: streaming chats + running PTYs remain (`assertSessionsSurvivePanelClose`).

## Activity

- Typed `SafeActivityEvent` with stable-id dedupe.
- `sanitizeActivitySummary` redacts tokens/secrets/paths.
- Unread increments while panel unfocused; cleared on open.

## Animation state priority

See `petStateMachine.ts` — welcome 90 → walk 80 → wake 75 → sleepTransition 70 → sleepingLoop 65 → idleFun 40 → idlePrimary 10.

## Source video mapping

| Runtime | Source MP4 |
|---------|------------|
| walkRight | Axolotl_walking_in_place_animation_202607111701*.mp4 |
| walkLeft | Axolotl_walking_cycle_left_202607111648*.mp4 |
| idlePrimary | Axolotl_character_breathing_and_*202607111640*.mp4 |
| idleFun | Axolotl_character_2nd idle_animation_1080p_202607111636*.mp4 |
| welcome | Axolotl_character_pixel_art_Welcome Animtion*.mp4 |
| sleepTransition / sleepingLoop | Axolotl_transitions_to_sleep_202607111658*.mp4 |
| wakeFromSleep | derived short transition (8 frames) |

## Identity repairs

Documented in `docs/pets/qa/IDENTITY_QA.md` with durable contact sheets under `docs/pets/contact-sheets/`.

## Testing

```powershell
cd app
npm run test -- --run src/features/pets
npm run typecheck
npm run build
cd src-tauri
cargo test pets --lib
```

Manual Windows DPI / multi-monitor checks: `docs/pets/verification/MANUAL_WINDOWS.md`.

## Security effects

- Pet windows cannot use unrestricted shell or broad filesystem APIs via their capability files.
- Protocol rejects unauthorized routes and session mismatches.
- Activity never surfaces raw secrets / full command lines.

## Remaining genuine limitations

- **Interactive Windows smoke and DPI multi-monitor checks must be run on the operator desktop** (`npm run tauri:dev`) — see `USER_TEST_GUIDE.md` and `verification/INTERACTIVE_STATUS.md`. Agent automation cannot complete GUI smoke.
- Packaged `npm run tauri:build` may take a long time / need Windows toolchain; run locally and record artifact path.
- Generation abort controllers live in the webview that started the request; the other window still sees Dexie stream updates.
- Per-frame PSD face-layer recompose is not fully automated; contact-sheet QA is durable under `docs/pets/`.

## Rollback

```powershell
git checkout agent/pixel-pets-axolotl
git log --oneline -10
git revert <hash-range>
# or reset branch to pre-blocker commit c108a2a if not yet shared further
```

**Do not merge PR #19 until verification is accepted.**
