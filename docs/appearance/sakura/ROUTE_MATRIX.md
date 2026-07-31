# Future Sakura route matrix

Current production routing is owned by `app/src/components/layout/PageRouter.tsx`. All work
below is pending; route behavior and data are out of scope for Sakura.

| Route/surface | Current production module | Intensity | Future treatment | Required regression |
|---|---|---:|---|---|
| Chat | `app/src/features/chat` | open/standard | scene opening, Night messages, composer | send, stream, cancel, models, agents, attachments, STT/TTS |
| Agents/detail | `app/src/features/agents` | standard | orchestration cards | create/select/detail behavior |
| Projects/detail | `app/src/features/projects` | standard | hierarchy and panels | project/chat navigation |
| Terminals | `app/src/features/terminals/TerminalsPage` | quiet | outer Night chrome; terminal-owned content | PTY/input/ANSI/cache/resizing |
| Workbench | `app/src/features/workbench` | standard | calm orchestration canvas | graph actions, save, context menus |
| Canvas | `app/src/features/canvas` | quiet | Sakura-owned chrome only | user content unchanged; cached state |
| Preview Studio | `app/src/features/preview` | quiet | surrounding chrome only | preview content/cache unchanged |
| Browser | `app/src/features/browser` | quiet | VibeSpace-owned chrome only | remote webview content untouched |
| Kanban | `app/src/features/kanban` | standard | paper-like cards on Night surface | drag/update/filter behavior |
| Schedule | `app/src/features/schedule` | standard | Gold next-action accents | create/edit/run/retry behavior |
| Context | `app/src/features/context` | standard | layered context panels | attachments/map/GitHub context |
| Skills | `app/src/features/skills` | quiet | compact list/card semantics | enable/inspect behavior |
| Benchmarks | `app/src/features/benchmarks` | quiet | data-first surfaces | run/results behavior |
| History | `app/src/features/history` | quiet | readable timeline | search/open/export behavior |
| Tools | `app/src/features/tools` | quiet | semantic controls | bridge/invocation behavior |
| Files | `app/src/features/files` | quiet | tree/editor chrome | open/save/path behavior |
| Account | `app/src/features/account` | quiet | restrained Night panels | auth/account/privacy behavior |
| Settings | `app/src/features/settings` | quiet | Appearance plus generic semantic controls | persistence, keyboard, all sections |
| Billing/plans/access | settings/account-owned surfaces | quiet | readable status and Gold attention | test mode, entitlements, grace/lock |
| Dialog/tooltip/toast/menu | `app/src/components/ui/**` and portals | quiet | opaque-safe elevated material | focus trap, dismissal, layering |
| Browser Chat/operator | browser-owned VibeSpace chrome | quiet | chrome only | provider page isolation |
| Pixel Pet overlay | pet-owned view | none | no Sakura scene/background | transparency and pointer behavior |

Visual captures later include Chat, JARVIS expanded, Prompt Forge, Context Map, Terminal,
Workbench, Kanban, Schedule, Agents, Skills, Tools, Files, History, Canvas chrome, Browser
Chat/operator chrome, Settings Appearance, Account, Usage, Billing/Plans, access lock, dialog,
tooltip, toast, narrow window, and reduced motion.

The route fixture must use real production components with deterministic local/test-only data.
Prototype mock words, counts, conversations, credentials, provider status, and actions must not
ship.
