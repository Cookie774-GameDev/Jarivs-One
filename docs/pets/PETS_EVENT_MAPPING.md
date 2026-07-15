# Pet event mapping

Verified implementation base: local `main` through `f62fc62`.

The Pet subscribes to existing local application signals. It does not create chats, PTYs, agents, notifications, or update jobs. Events contain only a validated kind, bounded opaque ID/source, timestamp, and protocol version; prompt text, messages, terminal output, commands, and credentials are excluded.

| Existing source                      | Pet event                                | Logical reaction              |     Priority |  Duration |
| ------------------------------------ | ---------------------------------------- | ----------------------------- | -----------: | --------: |
| `jarvis:run-state` running/streaming | `chat.started` / `chat.streaming`        | working                       |           40 |     2.4 s |
| `jarvis:done-notification`           | `chat.completed`                         | success                       |           60 |     2.4 s |
| `terminal://exit` code 0/nonzero     | `terminal.completed` / `terminal.failed` | success/error                 |       60/100 | 2.4/3.2 s |
| Agent Zustand run state              | agent started/blocked/completed/failed   | working/blocked/success/error | 40/90/60/100 | 2.4-3.2 s |
| `jarvis:update-available`            | `app.update_available`                   | notification                  |           30 |     2.4 s |
| tray hide / page resume              | `app.tray_entered` / `app.resume`        | idle/welcome                  |           30 |     2.4 s |
| `beforeunload`                       | `app.shutdown`                           | idle                          |          110 |     1.2 s |

The event broker deduplicates the newest 256 published and consumed IDs. Higher-priority active reactions suppress lower-priority arrivals until expiry. A temporary reaction restores the underlying drag/panel/sleep/shutdown-aware animation rather than forcing idle.

The shipped Axo and Glitch atlases remain unchanged. Logical states map onto the existing approved animations (`welcome`, `idlePrimary`, and `idleFun`) while accessibility exposes the precise logical status.
