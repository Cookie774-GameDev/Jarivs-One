# Sakura deterministic visual test plan

Status: planned only. No browser capture or pixel-match claim exists in Phase A.

## Preconditions

MonoChrome B0 accepted; Sakura production slices integrated; isolated unused port and separate
app-data/IndexedDB/cache/log/browser profile; task-owned process IDs; protected localhost
untouched. Use real production components with deterministic local/test-only data.

## Viewports and modes

Primary 1440×900; also 1672×941, 1280×800, 1024×768, narrow desktop, and high DPI. Capture
normal, reduced motion, forced colors/high contrast where supported, and opaque fallback.

## Capture matrix

Use the route/surface list in `ROUTE_MATRIX.md`, including Chat, JARVIS expanded, Prompt Forge,
Context Map, Terminal, Workbench, Kanban, Schedule, Agents, Skills, Tools, Files, History,
Canvas chrome, Browser Chat/operator chrome, Settings Appearance, Account, Usage,
Billing/Plans, access lock, dialog, tooltip, toast, narrow, and reduced motion.

## Reference comparison

For the deterministic 1440×900 fixture, weight shell/scene 20%, top bar 8%, navigation 12%,
tabs 5%, central content 20%, messages 10%, composer 10%, inspector 10%, decoration 5%.
Track major edge delta, color delta, radius delta, fallback state, pixel diff, SSIM where
available, and manual review.

Targets are geometry within 4px, primary palette Delta E within 6, panel radius within 2px,
strong structural similarity, no clipping, and no inaccessible contrast. These are goals, not
passes until measured. `preview.png` is the full-page authority; future crops are diagnostic.
After any crop-focused adjustment, recapture the full page and reject local gains that harm
overall balance.

## Accessibility overlay

Record actual foreground/background compositing for every essential token, keyboard focus,
200% zoom, long content, loading/empty/error/retry, screen-reader names, reduced motion, and
forced colors. Use `ACCESSIBILITY.md` thresholds; never use visual similarity as a substitute.

## Evidence naming

Each artifact records commit SHA, platform/build, viewport/DPR, theme, route, state, mode,
timestamp, fixture ID, and command. Store only sanitized deterministic evidence. A missing or
unrun capture is `PENDING`, never `PASS`.
