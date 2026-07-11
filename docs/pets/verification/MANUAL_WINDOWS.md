# Manual Windows verification (Pixel Pets)

These checks require a Windows desktop session with the Tauri app running.  
**Do not mark as passed unless actually performed.**

| Check | Status | Notes |
|-------|--------|-------|
| Sleeping pet click opens panel + wake concurrent | **NOT RUN** (manual) | Requires `tauri dev` interactive |
| Drag does not open panel (threshold >6px) | Covered by unit velocity tests; interactive **NOT RUN** | |
| One pet-overlay instance | Unit: host claim; interactive **NOT RUN** | |
| One mini-panel instance (re-click focuses) | Unit: lifecycle restore; interactive **NOT RUN** | |
| Monitor disconnect recovery | Unit: clamp/recover helpers in Rust; multi-monitor **NOT RUN** | |
| DPI 100% | **NOT RUN** | |
| DPI 125% | **NOT RUN** | |
| DPI 150% | **NOT RUN** | |
| DPI 200% | **NOT RUN** | |
| Live terminal transfer main ↔ panel | Presentation unit tests PASS; live PTY interactive **NOT RUN** | |
| Streaming chat while panel minimized | Unit: sessions survive; interactive **NOT RUN** | |
| Tauri packaged build | Run when CI/agent environment allows | |

## How to run interactive smoke

```powershell
cd app
npm run tauri:dev
# Click pet → panel opens
# Idle until sleep → click once → panel + wake
# Drag left/right → walk anims
# Settings DPI / multi-monitor as available
```
