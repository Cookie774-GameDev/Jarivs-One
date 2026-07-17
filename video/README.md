# VibeSpace 30-second Remotion promo

A 1920×1080, 30 fps, exactly 30-second product film for VibeSpace. The composition uses the repository's existing app captures from `docs/screenshots/` and labels them as real product previews. All other visuals are frame-driven paper/origami motion graphics.

## Preview and render

From the repository root:

```bash
npm --prefix video install
npm run video:studio
npm run video:render
```

The MP4 is written to `video/out/vibespace-promo.mp4`.

Create the closing-frame poster with:

```bash
npm run video:still
```

## Storyboard

| Time | Beat |
|---|---|
| 0:00–0:05 | VibeSpace brand reveal and product promise |
| 0:05–0:10 | 21+ model providers flowing into one workspace |
| 0:10–0:15 | Ten-pane terminal swarm and one-approval orchestration |
| 0:15–0:20 | Ctrl+Space dictation and Jarvis voice |
| 0:20–0:25 | Scheduled Jarvis Actions and Context Map |
| 0:25–0:30 | Local-first closing message and call to action |

## Media policy

The composition intentionally contains no simulated live interactions and no unlicensed music. Product imagery comes from the repository's real capture workflow. Add a cleared audio asset only when distribution rights are confirmed.
