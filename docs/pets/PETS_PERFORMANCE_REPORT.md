# Pet performance report

## Implemented controls

- One Pixi application, canvas, and ticker is reused for a mounted overlay; character and animation changes replace atlas playback rather than create another renderer.
- Character swaps unload the previous character atlas set after the replacement is ready.
- The native overlay is fixed at 144 x 144 physical pixels around the 128 x 128 presentation surface. No desktop-sized transparent window is created.
- The topmost health check runs every 45 seconds and only reasserts an already-visible overlay. It never shows or focuses a hidden window.
- Panel opening/minimizing/closing transitions are bounded to 140 ms and disabled when the operating system requests reduced motion.
- Off/Reduced/Calm/Normal/Playful policies bound playback and idle-fun frequency. Off pauses the player; hidden/unmounted windows dispose timers, listeners, and renderers.
- Runtime-event history is bounded to 256 IDs; local payloads are capped at 512 characters.
- The Pet panel keeps the existing shared chat and PTY surfaces mounted. Moving presentation ownership does not duplicate a model stream or terminal backend.

## Measured automated evidence

- Production build transformed 3,699 modules and completed in 32.60 seconds on the verification machine.
- Pet suite: 35 files / 165 tests in 40.14 seconds.
- Runtime Pet asset tree: 531 files, 37,203,664 bytes on disk. Runtime loading is per selected character/animation, not an eager load of this entire tree.
- Existing build warning: the main application chunk remains approximately 989.84 kB minified, above the configured 700 kB warning threshold. This predates the focused Pet remediation and was not hidden.

## Remaining physical measurements

Long-session private memory, GPU utilization, drag frame pacing, mixed-DPI monitor transitions, sleep/resume throttling, and listener counts under repeated native window recreation require a Windows performance capture outside unit-test/jsdom coverage. No numeric claim is made for those measurements in this report.
