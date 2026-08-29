# PR31 Pet native recovery coordination

## 2026-08-22 — Claim and reproduced root cause

- Agent/task: `VS-CODEX-PET-NATIVE-RECOVERY-20260822` / `PR31-PET-NATIVE-ZOMBIE-WINDOW-RECOVERY`.
- Branch/base: `integration/UnifiedChungus-final` at `3063b84130c7f02dc09130fb472056eba88a854b`; shared dirty work preserved.
- Exact scope: native `pets.rs`, this ledger, and this agent lock.
- Native VibeSpace WebView evidence: `pet_show_overlay` returned `created: false`, `visible: false`, reason `visibility_check_failed`; `pet_is_overlay_visible` returned false; Win32 enumeration found no pet top-level window for the live `jarvis.exe`. The registered Tauri label therefore points at a failed/stale native window, and every existing renderer retry reuses that same unusable entry.
- Repair boundary: discard only the failed `pet-overlay` WebView after a native show/visibility failure. The existing bounded retries then recreate it. No user data, app settings, external windows, or panel state is touched.

## 2026-08-22 — native rejection checkpoint

- A Pet-only stale-window destroy attempt passed its focused Rust unit test and the official Tauri app rebuilt successfully, but native acceptance failed after restart.
- Official app evidence: `jarvis.exe` PID 14452 returned `created: false`, `visible: false`, `reason: visibility_check_failed`; `pet_is_overlay_visible` remained false. App-scoped Win32 inspection found the VibeSpace main window plus only 14×14 framework hosts, not the expected 144×144 `VibeSpace Pet` surface. The health supervisor continued retrying.
- The attempted `pets.rs` implementation was removed and that source is restored exactly to HEAD. No failed repair is committed or claimed.
- Remaining boundary: stale label removal intersects the global `lib.rs` window-close policy, currently owned by another active lane. A future claimed fix must permit destruction/replacement of only the failed `pet-overlay` registration, then rerun official-app visibility/topmost/focus QA.
