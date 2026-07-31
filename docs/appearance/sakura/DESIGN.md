# Sakura Dusk production design contract

## Intent

The product subject is VibeSpace: a local-first desktop workspace for models, agents, voice,
terminals, and tasks. Sakura’s single job is to make that dense workspace feel calm and
cinematic without changing how it works.

The signature is one continuous cel-painted dusk scene behind disciplined Night Ink surfaces.
It is memorable because the app appears embedded in a coherent landscape, not because every
component is decorated.

## Composition

```text
┌──────────────────── existing production top bar ─────────────────────┐
│ navigation │ tabs + route canvas over bounded scene │ inspector      │
│            │ readable Night panels; route content wins │             │
└───────────────────────────────────────────────────────────────────────┘
```

The scene supplies atmosphere; semantic surfaces supply legibility. At narrow widths the
inspector yields first and navigation follows existing collapse behavior. The route canvas
must not acquire a new layout model.

## Design rules

1. Use five to seven broad scenic depth layers and preserve crisp silhouette edges.
2. Spend softness on distant atmosphere and lantern glow, not every card.
3. Keep the shell quiet: one active Pink rail, one warm action, sparse petals.
4. Put normal copy on proven dark semantic surfaces; do not treat image contrast as stable.
5. Use Fraunces only for major moments. Interface labels and dense controls remain sans.
6. Retain existing component semantics, hit targets, keyboard order, loading/error states, and
   copy. Sakura is appearance, not a new information architecture.
7. Render opaque fallbacks first. Transparency is optional enhancement.

## Product registry (future/pending)

After the MonoChrome gate, the future theme order is `jarvis`, `vibespace`, `default`,
`monochrome`, `sakura`. Label: **Sakura**. ID: `sakura`. Description: **Cel-painted dusk
workspace.** It is opt-in and does not alter legacy migrations.

Future command aliases are `sakura`, `sakura dusk`, and `dusk`; `blossom` is optional.
Autocomplete presents only Sakura. Commands and JARVIS actions must use the real validated
theme setter and persistence/sync paths. None of that is implemented in Phase A.

## Self-critique

The scene is deliberately the only bold device. Repeating petals, serif text, Japanese
characters, or pink gradients throughout the UI would turn a subject-specific direction into
theme decoration and reduce clarity. Those repetitions are therefore excluded.
