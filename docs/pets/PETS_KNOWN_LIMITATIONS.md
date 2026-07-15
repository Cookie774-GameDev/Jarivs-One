# Pet known limitations and manual gates

- Windows, macOS, and Linux do not permit ordinary application overlays above secure desktop, UAC, lock screen, full-screen exclusive surfaces, or stronger system UI. The Pet targets normal desktop applications only.
- The click strategy is a tightly fitted 144 x 144 native window, one of the approved compatibility approaches. Per-pixel native hit testing is not installed; transparent-corner pass-through must be physically verified on the supported Windows/WebView2 build before release.
- Start with Windows can be changed only by an installed release build. Development builds intentionally report an error instead of writing a debug executable into the registry.
- No startup option is silently enabled. If disabled, VibeSpace and the Pet do not start at sign-in.
- Native window geometry recovery has automated pure/helper coverage, but monitor hot-plug, mixed scaling, taskbar relocation, and negative-coordinate layouts still require physical checks.
- `Animation level: Off` pauses the Pet renderer. The separate persisted sound setting is present for compatibility, but this remediation does not introduce a new Pet audio producer.
- Runtime reactions use the eight already-approved sprite animations; logical working/thinking/blocked/error/success states are not new sprite sheets.
- Physical reboot, signed installer/updater, sleep/resume, lock/unlock, and long-running resource measurements remain release gates.
- The repository-wide frontend suite has one unrelated deterministic AI runtime identity-context assertion failure, documented in `PETS_TEST_REPORT.md`.
