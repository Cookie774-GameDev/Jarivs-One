# Pet verification report

Verification date: 2026-07-12, America/Chicago. Branch: local `main`.

## Passed gates

| Gate                            | Result                                                                   |
| ------------------------------- | ------------------------------------------------------------------------ |
| Focused runtime/motion          | 6 files / 25 tests passed                                                |
| Focused startup/panel lifecycle | 5 files / 31 tests passed                                                |
| Full Pet frontend suite         | 35 files / 165 tests passed                                              |
| TypeScript typecheck            | passed                                                                   |
| Production frontend build       | passed; 3,699 modules transformed                                        |
| Rust Pet module                 | 6/6 passed                                                               |
| Rust library                    | 26/26 passed                                                             |
| `cargo check`                   | passed                                                                   |
| Release-manifest test           | 1/1 passed                                                               |
| Production dependency audit     | zero vulnerabilities with `--omit=dev`                                   |
| Live development startup        | Vite listened on 5173; `target\\debug\\jarvis.exe` launched as PID 33824 |

## Broad-suite exception

The full frontend run completed 1,300 passing tests and one failing test across 236 files. The deterministic failure is unrelated to Pet code:

`src/lib/ai/runtime.test.ts` expects a `User identity` / `Viper` / default-write-folder block that the current AI runtime prompt does not provide. An isolated rerun reproduced the same one failure with 22 other tests passing. This task did not edit the AI runtime or identity prompt.

## Warnings retained

- Vite esbuild/oxc deprecation and dynamic/static-import warnings.
- Vite main-chunk size warning above 700 kB.
- Existing Rust dead-code warnings.
- Existing jsdom canvas notices and React ref/`act(...)` test warnings.
- Full development audit: one high Vite and one moderate esbuild finding; the production-only audit is clean.

## Manual Windows release gates

The following were not claimed as automated passes: transparent-corner click-through against another application, focus retention over another foreground application, multi-monitor mixed-DPI drag/recovery, taskbar relocation, lock/unlock, sleep/resume, display disconnect, signed installed-build startup registration, signed updater relaunch, secure desktop/UAC behavior, and long-session CPU/GPU/memory capture.
