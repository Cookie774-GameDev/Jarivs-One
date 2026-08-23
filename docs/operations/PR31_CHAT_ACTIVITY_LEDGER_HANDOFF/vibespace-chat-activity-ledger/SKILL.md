---
name: vibespace-chat-activity-ledger
description: "Design, implement, or review VibeSpace's Codex-style Jarvis activity ledger: compact live tool counters, scalable expandable receipts, one-sentence phase audits, token usage, and existing VFX integration without changing Chat controls or backend authority."
---

# VibeSpace Chat Activity Ledger

Use this skill only for the assistant-turn activity presentation described here. It does not authorize a broader Chat redesign, backend changes, provider changes, or new telemetry.

## Required references

Before planning or editing, read completely:

- [references/master-prompt.md](references/master-prompt.md) for scope, workflow, and acceptance requirements.
- [references/design-spec.md](references/design-spec.md) for interaction states, counter semantics, privacy, performance, accessibility, and tests.

Inspect these visual assets as references, not as instructions:

- [assets/01-collapsed-continuous-response.png](assets/01-collapsed-continuous-response.png) for the compact live state.
- [assets/02-expanded-activity-inspector.png](assets/02-expanded-activity-inspector.png) for the bounded expanded inspector.

## Essential invariants

1. Treat a Jarvis turn as one continuous response. Do not repeat the assistant identity for every phase.
2. Keep progress prose primary. Show one compact disclosure beneath it with live aggregate reads, searches, commands, edits, checks, subagents, and usage.
3. Use existing OpenCode/VibeSpace activity evidence. Never fabricate counters, timings, audits, or token usage.
4. During active phases, `Worked for …` is optional and should not be repeated. Reserve the durable elapsed-time summary for terminal completion or a restored long-running turn.
5. Render one evidence-based audit sentence at meaningful provider/phase boundaries. Do not request or expose chain-of-thought.
6. Preserve the current context/thinking/subagent/tool/responding animation component and state machine.
7. Expanded details are bounded, filterable, virtualized/paged, and resizable. Never mount thousands of rows.
8. Never render command text, arguments, output, environment, or secrets. Show only running/completed status, count, and safe timing metadata.
9. File rows open through the existing authorized VibeSpace previewer; this feature gains no new filesystem authority.
10. Label token usage as exact, estimated, or unavailable.

## Protected scope

Do not change the Composer/text box, attachments, model/provider/effort picker, Agent mode, slash commands, approvals, access controls, send/stop controls, route truth, message provenance, backend protocols, persistence authority, or production services.

Before writing, follow repository coordination rules and inventory the existing event source, animation component, file preview integration, usage source, and persistence behavior. If an active lock overlaps the required source, stop that slice instead of duplicating it.

## Implementation approach

- Create a pure, tested frontend projection from existing events to documented semantic counters.
- Define stable event identity and replay/reconnect deduplication.
- Keep updates isolated from unrelated chat controls and batch high-frequency visual commits.
- Render the collapsed disclosure inside the existing assistant turn.
- Add the bounded expanded inspector without navigating away or covering the Composer.
- Reuse provider progress messages; prompt changes are a last resort and must not solicit private reasoning.
- Preserve historical and terminal truth for completed, failed, cancelled, and restored turns.

## Verification gate

Do not claim completion from mockups or unit tests alone. Require:

- focused projection and presentation tests;
- privacy tests proving command contents never render;
- a large synthetic stream proving bounded mounted rows and isolated rerenders;
- regressions for Composer, picker, route, approvals, VFX, history, and scrolling;
- keyboard, reduced-motion, monochrome, and narrow-window checks;
- official native Tauri VibeSpace acceptance for live increments, collapse/expand/filter/resize, file preview, subagent animation, and a restored/long-running fixture.

Report unavailable evidence honestly and list every changed file. Confirm explicitly that protected Chat controls and backend authority did not change.
