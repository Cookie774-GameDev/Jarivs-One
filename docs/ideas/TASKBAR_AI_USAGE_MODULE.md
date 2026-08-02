# VibeSpace Taskbar AI Usage Module

**Status:** Implementation-ready feature specification  
**Target app:** VibeSpace desktop (Tauri + React/Vite)  
**Target repository file:** `docs/ideas/TASKBAR_AI_USAGE_MODULE.md`

## Reference image

Use the supplied screenshot for visual direction only. The functional rules in this document override the screenshot wherever they differ.

**Reference folder:**  
`C:\Users\viper\VibeSpaceOs\VibeSpace-IDEAS!\VibeSpace UI Themes\UsageModuleRefreance`

**Reference screenshot:**  
`C:\Users\viper\VibeSpaceOs\VibeSpace-IDEAS!\VibeSpace UI Themes\UsageModuleRefreance\ChatGPT Image Jul 31, 2026, 05_37_20 PM.png`

> The reference image shows four provider rows. The real compact module must show **only the top two provider usage bars at one time**.

---

## Goal

Add a tiny, live VibeSpace usage module that sits beside the operating-system taskbar and summarizes activity across connected AI providers without opening the full app.

It should automatically detect supported connections such as:

- API keys already connected inside VibeSpace
- AI connectors/plugins connected inside VibeSpace
- Supported terminal sessions or CLIs, including Codex when a usable local session is detected
- Any future provider that implements the shared usage-adapter interface

The module must never invent quota data. When a provider does not expose a usable quota or usage endpoint, show the available live activity data and clearly label quota as unavailable.

---

## Required experience

### 1. Compact taskbar module

- Keep the module permanently small; it must not grow into a large dashboard.
- Display no more than **two provider rows** in the normal live view.
- Use smaller typography, thicker but short progress bars, and tight spacing.
- Show the provider name, status, usage percentage or amount, and one compact activity metric.
- The reference image is style inspiration, not a requirement to copy every element.

Recommended maximum dimensions:

- **Collapsed strip:** approximately `280 × 36 px`
- **Expanded compact panel:** approximately `340 × 128 px`
- The panel must remain within a fixed maximum size. Management screens must scroll inside the same bounds or open the existing VibeSpace Settings page.

### 2. Taskbar placement

A custom cross-platform panel cannot safely inject arbitrary UI directly into every operating system's native taskbar. Implement it as a frameless, transparent, taskbar-adjacent Tauri window that visually behaves like part of the taskbar.

- Always stay attached to the active taskbar edge.
- Allow the user to drag it horizontally or vertically along that edge.
- Snap cleanly to the nearest valid taskbar position.
- Persist monitor, taskbar edge, and offset.
- Restore the saved position after restart, display changes, or monitor reconnects.
- Respect taskbar auto-hide and multi-monitor layouts.
- Do not modify or inject code into Windows Explorer, macOS Dock, or Linux panels.

### 3. Live status

The visible UI refreshes once per second.

Example status:

`Live · 35 API requests processing`

The `35` count is the real total of currently active requests registered across VibeSpace provider adapters. It is not a decorative number.

To remain lightweight:

- Update locally observed request activity immediately.
- Re-render the compact module at most once per second.
- Do **not** call every provider's remote usage API every second.
- Refresh remote quota snapshots on a safe provider-specific interval, normally every `15–60 seconds`, with caching, jitter, and exponential backoff.
- Reuse existing request events whenever VibeSpace itself sends the request.

### 4. Top-two provider ordering

Only rank `1` and rank `2` are shown in the normal module.

The user can:

- Open a fixed-size reorder mode from the module.
- Drag providers up or down in a scrollable list.
- Use keyboard controls as an accessible alternative to dragging.
- Immediately see the first two providers become the visible pair.
- Hide a provider without disconnecting its API key or connector.
- Restore the default order.

The ordering must persist locally and sync only when the user has explicitly enabled settings sync.

### 5. Minimal Settings controls

Add one compact section under:

`Settings → General → Taskbar Usage`

Include only:

1. **Show taskbar usage module** — master toggle
2. **Launch with VibeSpace** — keep the module available when the main window is closed
3. **Provider order** — drag-and-drop list; the first two are marked `Shown`
4. **Reset position** — returns the module to its default taskbar edge

Do not create a large new settings category.

---

## Compact UI states

### Normal

- Live indicator
- Total active requests
- Two provider rows
- Small collapse/expand control
- Optional pin/keep-visible control only when it has a real function

### No connections

Show:

`No AI providers connected`

Action:

`Open Connections`

### Connected, quota unavailable

Show real activity without a fabricated progress bar:

`Codex · Active · Quota unavailable`

### Stale data

If a quota snapshot is old, keep the last valid value but mark it:

`Updated 2m ago`

### Error

Show a small warning state and retain other working providers. One broken adapter must never break the entire module.

### Offline

Continue showing locally tracked activity and the most recent cached quota with an `Offline` label.

---

## Provider data contract

Every provider adapter should normalize its data into one shared shape:

```ts
export interface ProviderUsageSnapshot {
  providerId: string;
  displayName: string;
  connected: boolean;
  hidden: boolean;
  activeRequests: number;
  usageValue: number | null;
  usageLimit: number | null;
  usageUnit: 'requests' | 'tokens' | 'credits' | 'usd' | 'percent' | null;
  usagePercent: number | null;
  requestsPerMinute: number | null;
  updatedAt: number;
  freshness: 'live' | 'fresh' | 'stale' | 'offline' | 'error';
  source: 'local-events' | 'provider-api' | 'terminal-session' | 'cached';
  errorCode?: string;
}
```

Adapter behavior:

```ts
export interface ProviderUsageAdapter {
  id: string;
  detect(): Promise<boolean>;
  getCachedSnapshot(): ProviderUsageSnapshot | null;
  refreshQuota(signal: AbortSignal): Promise<ProviderUsageSnapshot>;
  subscribeToActivity(
    listener: (snapshot: ProviderUsageSnapshot) => void,
  ): () => void;
}
```

### Detection rules

- Prefer VibeSpace's existing provider/connector registry.
- Read only sanitized connection metadata from the frontend.
- Keep raw API keys in the OS keychain or existing secure backend.
- Terminal detection must identify supported local sessions without reading unrelated shell history.
- A detected session does not automatically mean quota data is available.
- Never scrape, estimate, or fabricate account limits merely to fill the progress bar.

---

## Architecture

### Frontend

Suggested feature boundary:

```text
app/src/features/taskbar-usage/
  TaskbarUsageWindow.tsx
  TaskbarUsageCompact.tsx
  TaskbarUsageReorder.tsx
  ProviderUsageRow.tsx
  taskbarUsageStore.ts
  providerUsageRegistry.ts
  providerUsageTypes.ts
  taskbarUsage.css
```

Responsibilities:

- Render only normalized snapshots.
- Keep the normal view limited to the first two visible providers.
- Persist ordering and visibility through the existing settings store.
- Throttle visual updates to one frame per second unless a user action requires an immediate render.
- Support reduced motion and keyboard reordering.

### Tauri backend

Suggested feature boundary:

```text
app/src-tauri/src/taskbar_usage/
  mod.rs
  window.rs
  placement.rs
  provider_bridge.rs
```

Responsibilities:

- Create and manage the frameless taskbar-adjacent window.
- Calculate taskbar/dock edge and usable work area.
- Persist and restore monitor/edge/offset safely.
- Expose sanitized provider activity events to the taskbar window.
- Keep the module alive when the main window is hidden, when enabled.
- Enforce a single module window.

### Data flow

```text
Existing provider requests / connectors / terminal adapters
                         ↓
             Provider usage adapters
                         ↓
        Normalized provider usage registry
                         ↓
      Cached snapshots + active request totals
                         ↓
       Tauri event channel / shared app store
                         ↓
          1 Hz compact taskbar rendering
```

---

## Visual rules

- Match the current VibeSpace dark theme and accent system.
- Use a crisp dark surface, subtle border, restrained glow, and no excessive blur.
- Keep provider colors as small accents only; do not turn the panel into a rainbow.
- Progress bars should be visually thicker than the reference bars but shorter in width.
- Avoid tiny unreadable text; compact does not mean illegible.
- Align percentages and metrics so values do not jump horizontally when updating.
- Use tabular numerals for live counts.
- Animate bar changes with a brief `120–180 ms` transition, disabled under reduced motion.
- Never resize the panel when numbers change.

---

## Performance budget

Target additional overhead while enabled:

- Idle CPU: below `0.5%` on a typical modern desktop
- Active CPU: normally below `1.5%`
- Additional memory: target below `35 MB`
- UI render cadence: maximum `1 Hz` for live metrics
- Network: no duplicate quota requests when the main app already has fresh data
- Provider failures: exponential backoff with a maximum retry interval
- Window: no continuous polling for position; respond to OS display/taskbar events where possible

If the system is under heavy load, skip intermediate visual ticks rather than queueing delayed renders.

---

## Privacy and security

- Never display or log API keys, authorization headers, refresh tokens, or account secrets.
- Never pass raw credentials into the taskbar webview.
- Use the existing OS keychain/security layer for provider authentication.
- Store only provider IDs, ordering, visibility, placement, and cached sanitized metrics.
- Redact provider errors before displaying or logging them.
- Turning off the module stops its background refresh timers.
- Hiding a provider affects presentation only; it does not disconnect the provider.

---

## Acceptance criteria

The feature is complete only when all of the following are true:

- [ ] A user can enable or disable the module from one Settings toggle.
- [ ] The module restores after restart when enabled.
- [ ] It remains within its fixed compact maximum size.
- [ ] Exactly two provider rows are visible in the normal view.
- [ ] Reordering providers immediately changes the visible top two.
- [ ] Ordering, hidden state, and taskbar position persist.
- [ ] The module can be dragged and snapped along the taskbar edge.
- [ ] The visible activity count updates once per second using real active requests.
- [ ] Remote quota APIs are not polled once per second.
- [ ] Missing quota data is labeled honestly instead of being estimated.
- [ ] One provider error does not affect other providers.
- [ ] No API key or secret reaches the UI or logs.
- [ ] The module behaves correctly with taskbar auto-hide and multiple monitors.
- [ ] Keyboard users can reorder providers without drag-and-drop.
- [ ] Reduced-motion mode removes nonessential animation.
- [ ] Automated tests cover ordering, top-two selection, persistence, stale data, and adapter failure.
- [ ] A real Windows desktop validation confirms placement, restart behavior, and low resource usage.

---

## Non-goals for the first version

- Full billing analytics or historical charts
- Editing provider API keys inside the compact module
- Showing more than two live provider rows simultaneously
- Unsafe native taskbar injection
- Guessing provider quotas from token counts
- Replacing the existing Connections or Provider Settings pages

---

## Implementation rule

Build this as a focused, lightweight companion surface using VibeSpace's existing provider registry, settings persistence, security layer, and request lifecycle events. Do not duplicate provider authentication or create a second independent connection system.
