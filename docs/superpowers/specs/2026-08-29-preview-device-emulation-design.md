# Preview Device Emulation Design

## Goal

Make VibeSpace Preview Studio and the Workbench HTML preview display generated sites at truthful, generation-specific phone, tablet, laptop, desktop, and custom CSS viewport dimensions. Selecting iPhone 13 must produce a 390 x 844 CSS viewport at DPR 3, not a visually scaled window whose media queries see the scaled size.

## Root cause

The catalog contains only a few broad presets, and the native Preview Studio currently sends the visually scaled rectangle to the child WebView as its real window size. Consequently, page layout and media queries see the display rectangle rather than the selected device viewport. DPR, touch, screen metrics, and orientation are currently metadata only.

## Architecture

`previewDevices.ts` remains the single catalog authority and adds stable, generation-specific presets while preserving every existing ID for saved layouts. It also derives a serializable emulation contract from a preset, orientation, logical viewport, and display scale.

Preview Studio passes the contract through `previewBridge.ts`. On Windows, `preview.rs` applies WebView2 DevTools Protocol device metrics and touch emulation: logical width/height and DPR define the page environment, while the CDP scale fits it into the existing visual surface. The command reapplies metrics when device, orientation, zoom, or bounds change. Non-Windows behavior remains honest and retains exact logical sizing rather than claiming unsupported full emulation.

Workbench's iframe preview continues using exact logical iframe dimensions with CSS transform scaling, but consumes the same catalog rather than a duplicate list. Laptop entries are labeled as logical screen/layout presets because browser chrome means hardware does not define one universal browser viewport.

## Compatibility and safety

- Keep existing preset IDs (`iphone-se`, `iphone-15`, `iphone-15-pro-max`, `pixel`, `ipad-mini`, `ipad-pro-11`, `ipad-pro-13`, `small-laptop`, `macbook`, desktop IDs, `responsive`, `custom`).
- Add generation-specific IDs without rewriting persisted state.
- Do not spoof authentication, credentials, or production services.
- Do not start, stop, attach to, or navigate the live VibeSpace app during implementation.
- No Computer Use; local unit/component/Rust verification only until native acceptance is explicitly authorized.

## Acceptance

- iPhone 13 portrait derives 390 x 844, DPR 3, mobile/touch true; landscape swaps dimensions and orientation.
- Visual zoom changes only CDP scale/native surface size, never logical viewport dimensions.
- Preview create and bounds updates carry the same validated emulation contract.
- Existing saved preset IDs still resolve.
- Workbench picker uses the shared catalog and iframe layout keeps exact logical dimensions.
- Invalid dimensions, DPR, or scale are rejected or normalized before native execution.
