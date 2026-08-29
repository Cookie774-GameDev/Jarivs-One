# PR31 — Unified Model, Agent, Skill, File, and Attachment Experience

**Status:** implementation handoff
**Target branch:** `integration/UnifiedChungus-final`
**Prepared:** 2026-08-22
**Scope:** VibeSpace native desktop application only

## 1. Outcome

Give every relevant VibeSpace surface one coherent, fast way to choose a model and an eligible effort level, while making the product feel intentional rather than decorative. Finish the agent and skill creation flow so Jarvis asks enough questions to create useful, project-specific artifacts. Make Files and chat attachments behave like reliable desktop features: browsing approved drives, creating/saving files, fast media previews, and safe local annotation.

This is **not** permission to replace the model catalog, provider routing, Context Gateway, OpenCode authentication, terminal bridge, or existing chat dispatch. Reuse their authoritative outputs. The user should receive the same quality and capabilities, with less duplicated UI and no fabricated availability, “Ultra”, provider, file, or test state.

## 2. Non-negotiable product contracts

1. **One model-selection contract.** Chat is the reference interaction: search, provider grouping, model metadata, selection confirmation, and keyboard behavior must be reusable rather than copied into each surface. A surface may filter models only for a proven capability boundary; it must explain an unavailable choice instead of silently substituting a route.
2. **Live provider/model truth wins.** The connected, authenticated catalog and its capability metadata remain the authority. Never infer that a model supports `Max` or `Ultra` from its name, provider, price, or a static guess. If the capability is unknown, do not offer it.
3. **No silent quality downgrade.** A selected model/effort either reaches the supported route unchanged or execution stops with an actionable reason. Do not secretly change provider, model, effort, tool entitlement, or context policy.
4. **Model changes update current UI truth without rewriting history.** The active chat header must reflect the currently selected route as soon as selection is confirmed. Existing messages retain the exact model/effort provenance with which they were sent or generated.
5. **Decorative effects never alter the message.** Gradient/bubble/organic visuals are CSS presentation only. Assistant text remains selectable, copyable, readable by assistive technology, and identical in the persisted message body.
6. **No fake testing.** Automated tests prove behavior; the official native VibeSpace application proves the visible product. Keep the app open while conducting the manual acceptance queue. Record failures and fix them in the current slice; do not stop the whole run for a small isolated defect or claim a test that was not performed.
7. **Desktop access is explicit and bounded.** “Workspace” may be labeled in plain language, but file access must still use native canonical-path checks and Tauri capabilities. A drive is visible only after the user has explicitly enabled it. No raw path traversal, hidden arbitrary drive discovery, accidental upload, or automatic destructive write.
8. **No third-party skill import by copy/paste.** Audit local provenance and license first. VibeSpace must own its compact skill-authoring guide and version it with its tests. The public [`obra/superpowers`](https://github.com/obra/superpowers) project is a useful MIT-licensed reference for skill-writing methodology, not a license to quietly bundle its entire tree or run its telemetry/installers. Preserve its license and attribution if any source material is ever incorporated.

## 3. Before any source edit: reconnaissance and ownership

The implementation agent must:

1. Read repository `AGENTS.md`, `.agent-coordination.lock/owner.txt`, all current active agent lock records, and the current relevant section of `docs/AGENT_COORDINATION_PR31.md`.
2. Record worktree, branch, `HEAD`, upstream, dirty paths, and any merge/rebase/cherry-pick state. The current branch is shared and already has concurrent uncommitted work—never reset, stash, clean, switch branches, or stage other agents’ files.
3. Audit the current reusable boundaries before choosing target files:
   - model catalog, capability/effort metadata, and route resolver;
   - `ModelPickerTypeahead` and each non-chat model selection consumer;
   - chat header/title and per-message provenance state;
   - agent manager/detail/picker, `agentProviderOptions`, skill store/editor/catalog, agent prompt payload, and runtime model resolution;
   - Files page/explorer/store/media limits/mutations, native file capability broker, temporary attachments, chat attachment previews, and drag-drop/paste handling.
4. Map each requested behavior to its true owner. Do not assume filenames from this plan are definitive.
5. Claim one non-overlapping, exact source-and-test slice in an agent-scoped lock and the append-only coordination ledger before editing. If a required file is claimed (notably shared Composer or live catalog code), implement another independent slice or coordinate with its owner. Do not edit around a lock by copying competing logic.
6. Use a separate, reviewable commit per coherent feature slice. Stage only owned paths and never commit credentials, provider catalogs fetched from a private account, user files, test prompts containing private data, or generated thumbnail caches.

## 4. Unified model selector and effort experience

### 4.1 Shared selector primitive

Create or extract a single presentational/interaction primitive based on the already-improved chat selector. It needs a typed input model, not a second catalog:

```ts
type SelectableModelRoute = {
  routeId: string;
  providerId: string;
  modelId: string;
  displayName: string;
  providerDisplayName: string;
  status: 'ready' | 'needs_connection' | 'unavailable';
  supportedEfforts: readonly EffortLevel[];
  capabilityReasons?: Record<string, string>;
};
```

The exact existing types should be extended rather than duplicated. The shared primitive must support:

- model/provider text search with stable keyboard navigation, Escape, Enter, and screen-reader labels;
- grouped, connected-provider results and the existing route identity rules;
- a compact trigger appropriate to each host surface;
- selected, hover, focus-visible, disabled, loading, empty, and connection-required states;
- a callback that returns the exact logical route and selected eligible effort, rather than allowing every host to re-parse a label;
- request cancellation/debouncing only in the UI search layer—never delay or alter provider dispatch;
- compact virtualization or progressive rendering if catalog size requires it, with no layout jump while typing.

Adopt it in every app surface that lets a user pick a chat-capable model: Chat, terminal agent launch/connected-agent controls, scheduled action/agent launch controls, and agent-run entry points. Existing non-chat selectors should converge gradually through small slices, not via a risky whole-app rewrite.

### 4.2 Effort levels: real capability gate first

Effort labels and icons are a visual representation of real route capability. Use the existing canonical effort vocabulary if it exists; otherwise establish one typed set such as `auto`, `fast`, `standard`, `deep`, `max`, and `ultra`, with a migration adapter for persisted older values.

- Show a small, consistent power icon and plain-language tooltip for every offered level. Icon alone is insufficient.
- `Fast` means lowest permitted reasoning/latency mode; it must not claim an unavailable provider fast mode.
- `Max` and `Ultra` are only selectable if the route’s authenticated live capability says so. The UI may commonly show Ultra for eligible Codex or Claude routes, but the provider name is not itself the rule.
- When a saved selection is no longer supported, preserve it as historical data, show an explicit `Unavailable on this connection` state for a new send, and require the user to choose a supported level. Never silently fall back.
- The selected model row and effort row share the same selected/focus visual tokens. Do not create a visually separate “effort picker” that feels like a different product.
- Store model route and effort as separate typed values. Do not encode effort into the display name or provider ID.

### 4.3 Deliberate Ultra presentation

The requested Ultra treatment should feel like premium craft, not a distracting AI-themed overlay:

- On the **eligible, selected Ultra control only**, use a subtle deep-purple root/vine edge treatment built from static gradients/pseudo-elements. It must not reduce contrast, shift layout, or look enabled when the route does not support Ultra.
- Add a short, optional 150–220 ms confirmation animation only on selection. Honor `prefers-reduced-motion`; never loop an animation.
- In the assistant bubble for messages actually produced through an eligible Ultra route, use a restrained gradient fill/highlight and slightly rounded “bubble” geometry. Keep the underlying text color readable with a solid-color fallback; no distorted glyphs, text shadows that impair reading, animated rainbow, or model-name impersonation.
- Monochrome/high-contrast mode removes the decorative hue while preserving an unambiguous selected/Ultra label and border.
- Test contrast, keyboard focus, reduced motion, assistive labels, copy/paste, code blocks, Markdown links, streaming tokens, error cards, and long messages. The visual treatment must not apply to user messages, system notices, or historical messages that lack verified effort provenance.

### 4.4 Chat title and provenance repair

Identify the one state authority that is responsible for the current selected route. When a user changes from (for example) GPT-5.6 Luna to another ready model:

1. selection confirmation updates the active route state;
2. the composer, header/title, accessibility label, and new-message metadata render that current route in the same update;
3. prior conversation and message-level provenance remain unchanged;
4. browser/native window labels and chat-list subtitle follow the explicit product rule—prefer `Current model: …` for active chat, not “started with …” after it changes.

Add a regression covering a new chat, a model change, an effort change, a send, a restored chat, and a route that becomes unavailable after refresh. Confirm no listener/stale closure makes the header remain on the first model.

## 5. Agents and custom skills

### 5.1 Simplify agent creation without hiding runtime truth

In the **custom agent creation form only**:

- remove the provider/model section;
- remove the reasoning-effort control;
- replace ambiguous memory choices with exactly:
  - `Project` — the selected project roots only;
  - `Workspace` — the user-approved local workspace roots; display `Workspace (approved computer folders)` rather than inaccurately promising unrestricted computer access.

At run time the agent resolves the current selected chat/launch model and only its supported effort. Runtime UI must disclose the resolved route and exact granted file scope in activity/provenance, but it must not reintroduce an editable provider/model field into agent creation. Existing saved configuration should migrate losslessly: retain legacy values as historical metadata, omit them from the editor, and resolve new runs through the current route policy. Do not break built-in agents or existing safe agent presets.

### 5.2 Jarvis-led creation flow

Before generating an agent or skill, Jarvis must conduct a short structured discovery conversation. It cannot create a generic artifact from only a title unless the user explicitly skips customization.

Required questions, adapted to the request:

1. What outcome and target audience define success?
2. What inputs, tools, folders, and external services are in scope?
3. What must the agent never do, and what needs approval?
4. What form should the result take, and how will it be checked?
5. What project/context/memory scope is appropriate?

Then show a compact proposal: name, purpose, triggered situations, permitted tools/files, approval boundaries, inputs/outputs, verification steps, and a preview. Creation requires confirmation. A `quick draft` route may prefill answers but still presents the proposal and safety boundary.

### 5.3 High-quality skill artifacts

Generate a VibeSpace-owned skill package—not a blob of echo text—with:

```text
<skill-slug>/
  SKILL.md                 # narrow trigger, workflow, guardrails, output contract
  references/              # only when durable context is genuinely needed
  scripts/                 # only when a repeatable executable check is necessary
  tests/ or examples/      # representative positive/negative checks when appropriate
  provenance.json          # creator, version, source/attribution, user-approved scope
```

Every generated `SKILL.md` should use a concise title/description, explicit trigger conditions, ordered workflow, tool/file/permission boundaries, failure and escalation conditions, and a verification/output contract. It must be tailored to the user’s answers (for example, a debate-coach skill specifies evidence standards, counterargument rules, tone, and stopping conditions; it does not merely repeat “be a good debater”).

Bundle an internal `Skill Authoring Guide` with each creation session or link it from the editor. The guide should teach progressive disclosure, narrow triggers, explicit inputs/outputs, references rather than needless duplicated prose, safe tool boundaries, no secret retention, and scenario tests. Audit any existing locally downloaded Superpowers material before reusing it. If the user wants an upstream integration later, do it as a separately reviewed, version-pinned, license-attributed dependency with update/telemetry policy—not as an implicit install.

Test questions-before-create, proposal accuracy, custom output quality, cancellation, validation errors, path safety, account/project isolation, save/reopen, and no automatic provider/permission escalation.

## 6. Files: desktop-quality browsing and editing

### 6.1 Approved drives and roots

The Files UI should begin with approved places, not a hard-coded C: root. Add an explicit drive/root chooser that can enable C: and D: when the user grants access. Persist the chosen roots in VibeSpace’s permission store and display them as `C:` / `D:` plus friendly known folders. The native side must canonicalize every read/write target, verify it is inside an approved root after resolving links, and enforce the existing file policy for every operation.

Never automatically expose system, credential, application-data, or other drives just because a drive letter exists. Show precise reasons when a path cannot be opened. Revoke access cleanly, including clearing thumbnail cache metadata for that root.

### 6.2 New, open, edit, and save

- Add `New file` in the active folder with a small type picker initially supporting `.txt` and `.md`.
- Reject illegal names, collisions, and out-of-root paths before a native write. Let the user replace only through an explicit confirmation.
- Open text through the existing editor boundary. Markdown gets a crisp editable code view with line numbers and any current preview affordance; plain text stays plain text. Do not put blurred decorative imagery behind editor text.
- Add clearly distinguishable `Save` (same approved path) and `Save as…` (approved-folder picker) operations. Dirty state, write error, concurrent modification, cancellation, and permission loss all need visible truthful states.
- Keep non-text items as previewable assets rather than attempting to edit binary contents in the text editor.

### 6.3 Fast grid previews and full-media view

Use a native or worker-backed thumbnail pipeline that is keyed by canonical path + modification time + size, bounded by a disk/memory budget, and invalidated after a mutation. It should:

- virtualize long grid/list views;
- prioritize visible rows, cancel scrolled-away work, and cap concurrent extraction;
- generate image thumbnails safely and request a first-frame/video poster only within existing media limits;
- show an immediate neutral skeleton/icon so the grid does not feel frozen;
- never synchronously decode large assets on the renderer main thread;
- provide an inspector/telemetry counter for cache hit, queued, failed, and skipped-too-large states without exposing file names in logs.

Double-clicking an image opens a VibeSpace modal/viewer with fit, zoom, keyboard close, accessible caption, and reliable full-resolution loading only on demand. It must reuse a safe local-object URL/cache and release resources when closed. Respect configured media size limits, and present a clear fallback for unsupported video/codecs.

### 6.4 Explorer scale

Add a per-explorer grid/icon size preference plus Ctrl+wheel adjustment when the Files surface has focus. Prevent the browser/page zoom from changing; clamp values, preserve keyboard behavior, debounce persistence, and provide a visible reset. List, grid, and dialog variants should share the same preference semantics where practical.

## 7. Chat attachments, drag/drop, and annotations

### 7.1 Reliable attachment intake

Unify picker, drag/drop, and paste around one local attachment intake service. It must:

- display a clear, accessible darkened drop target while eligible files are dragged over the chat;
- accept currently supported images, videos, text/documents, and other files through the same validation path;
- identify unsupported, oversized, duplicate, inaccessible, and out-of-policy items before they become message attachments;
- preserve local attachment previews and draft state across a failed send without automatically uploading elsewhere;
- create native temporary handles only inside approved boundaries and clean them through the existing lifecycle;
- keep slash attachment commands and the active Composer owner’s current behavior intact. Coordinate before touching Composer.

Paste of image data and filesystem file references needs the same success/error previews as drag/drop. Do not treat arbitrary clipboard text as a file path. A user must explicitly attach or send; attachments do not silently join a prompt just because they are visible in Files.

### 7.2 Preview and annotation

Clicking an attachment opens the same viewer used by Files. For images, add a deliberately narrow first editor:

- zoom/pan;
- crop selection;
- pencil/highlighter and simple shapes/circle;
- undo/redo;
- `Save copy` to an approved folder, or `Use annotated copy` in the draft.

Annotations must create a derived local asset and retain the original untouched. It needs an explicit warning before replacing a draft reference, readable color contrast, pointer/touch support, keyboard exit, and upper bounds for dimension/encoded size. Do not promise arbitrary image editing, OCR, or upload processing in this phase.

## 8. Delivery sequence and commits

Do not attempt a huge coupled rewrite. The recommended order is:

| Slice | Deliverable | Primary acceptance |
| --- | --- | --- |
| 0 | Audit, ownership map, current-state screenshots/observations, and test matrix | No overlapping edit; every required state owner identified |
| 1 | Shared selector contracts and one additional non-chat consumer | Exact route/effort returned; selection/search/a11y parity |
| 2 | Chat current-model header and verified effort capability state | New selection updates header; old messages remain historically correct |
| 3 | Ultra presentation tokens and message treatment | Eligible-only, readable, reduced-motion/monochrome clean |
| 4 | Agent form simplification plus current-route resolution | No provider/model/effort editor fields; runtime truth remains visible |
| 5 | Jarvis discovery, proposal, skill authoring guide/package validation | Questions precede creation; generated artifact is specific and safe |
| 6 | Approved C:/D: roots, new `.txt`/`.md`, save/save-as, crisp editor | Native boundary rejects out-of-scope/collision paths |
| 7 | Thumbnail/grid scale/media viewer | Visible-first responsive grid and viewer resource cleanup |
| 8 | Unified drag/drop/paste intake and image annotation copy | No accidental dispatch/upload; original image unchanged |
| 9 | Cross-feature native regression and release-ready evidence | All claimed rows executed honestly in official app |

Commit after each slice using only its owned files. Rebase/merge only when an authorized integration owner directs it; the shared branch may advance while this work proceeds.

## 9. Required verification matrix

Write focused tests before or alongside each change. Run the repository-required checks when capacity permits: `npm run typecheck`, `npm --prefix app run test`, `npm run test:release-manifest`, `npm run build`, and `cargo check --manifest-path app/src-tauri/Cargo.toml`. C: space is currently constrained, so record available space before large native/build runs, never delete caches or another agent’s output, and use the approved D: test area only if the repository policy permits it.

In the official native VibeSpace app (not a browser or a mocked DOM), keep a concise live checklist open and mark each case PASS / FAIL / BLOCKED with evidence:

1. Search/select a ready connected model in Chat, terminal launch, and one other consumer; route ID and title are correct.
2. Change model and effort mid-chat; header follows the current model while earlier message provenance stays unchanged.
3. Check each effort visibility state: unknown, unsupported, supported Fast, supported Max, supported Ultra; no false Ultra control.
4. Exercise Ultra selected, reduced-motion, monochrome/high-contrast, keyboard-only navigation, screen-reader labels, copy/paste, Markdown/code, and streaming response text.
5. Create an agent: verify there is no provider/model/effort editor and only Project/Workspace scope. Run it with a permitted current model and inspect truthful route/scope disclosure.
6. Create both an agent and a skill through Jarvis: prove questions, proposal, confirmation, a tailored artifact, validation, reopen/edit, and cancellation.
7. Enable only C:, browse/create/save a `.txt` and `.md`, then test an explicitly approved D: root. Attempt a path outside both; it must be blocked and explained.
8. Scroll a large image/video grid, change grid size with Ctrl+wheel, open/close viewer, and observe that thumbnails appear incrementally without lockup.
9. Drag, paste, picker-attach, preview, annotate, save copy, and send an image plus a permitted non-image. Test rejection paths for bad/oversize/duplicate input. Confirm no attachment is sent when the user cancels.
10. Repeat one normal non-Ultra model request and one file-using agent task after the UI changes. Confirm no changed route/effort, unexplained latency, or crash.

If a UI or integration defect appears, add it to the active slice’s failure list, fix it, rerun the affected focused tests and native row, then continue through the remaining matrix. Do not abandon the broad matrix because a small bug was found; do not loop forever on a provider/account/OS block—record the exact blocker and advance independent cases.

## 10. Performance and quality guardrails

- Selector open/search/choose must feel local; no new network request is permitted on every keystroke.
- Reuse the existing five-minute/provider-connection catalog refresh, cache, and route decisions. Model selection UI must not add a second provider fetch or Context/RLM retrieval.
- Measure UI work separately from model inference. Use input-to-render and selection-to-ready marks; compare a normal direct request with the same request using the unified surface. The UI must not contribute more than 20% of the same provider/harness baseline; aim materially below that threshold. Never add an artificial delay just to make a benchmark look better.
- Thumbnails/media decoding are lower priority than typing, scrolling, streaming, and terminal interaction. Cancel work that is no longer visible.
- Keep the main thread free of large image/video decoding, unbounded catalog grouping, or repeated derived-state scans.
- Track failures and fallback conditions. “Offline”, “unavailable”, “fast”, “Ultra”, “connected”, and “attached” must be evidence-backed runtime states, not optimistic labels.

## 11. Definition of done

This work is done only when each completed slice has an exact ownership record, focused regression coverage, clean scoped diff, and an honest official native VibeSpace result. The user receives a consistent model picker throughout the approved surfaces, capability-truthful effort controls, a current chat title, polished but accessible Ultra presentation, a simplified and intelligent agent/skill creator, and desktop file/attachment workflows that are fast, safe, and visibly working.

Unexecuted native/provider cases remain explicitly marked `BLOCKED` or `NOT RUN`; they never become a claimed pass through screenshots, mocks, unit tests, or text instructions.
