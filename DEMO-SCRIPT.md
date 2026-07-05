# VibeSpace Demo Script — 90 seconds to "I need to install this"

## Setup
Open `site/index.html` in a browser. The site loads with a boot animation (2s) then the desktop simulator appears with a phone beside it (or tabbed on mobile).

## 90-second walkthrough

### 0–15s: Desktop Terminal
1. After boot, a Terminal window auto-opens
2. Click the terminal input field
3. Type `help` → press Enter → see all commands
4. Type `jarvis` → see boot sequence with 6 feature checkmarks
5. Type `hive fast` → see Hive stack output with timing

### 15–30s: Spawn terminals + Skills
1. Click the `+` button on the terminal tab bar → new tab spawns with slide animation
2. Switch back to first tab
3. Type `skills` → see 6 skills listed with descriptions
4. Type `vibe` → ASCII art easter egg

### 30–45s: Chat with Jarvis
1. Click the Chat icon in the dock (💬)
2. Type "tell me about voice" → Jarvis replies about local Kokoro
3. Type `/skills` → skills catalog appears with purple chips
4. Type "what about calls?" → Jarvis clarifies voice ≠ phone call

### 45–60s: Phone — Unlock + Call Jarvis
1. On the phone (right side or Phone tab on mobile), tap the lock screen to unlock
2. Tap the Calls app (cyan phone icon)
3. Tap the call button next to Jarvis
4. Watch the call connect → live captions type out Jarvis explaining hands-free voice
5. Tap the red end-call button

### 60–75s: Phone — Messages
1. Go back to home (tap bottom bar)
2. Open Messages app
3. Tap "Sage" thread
4. Type "research" → Sage replies about context maps
5. Tap back arrow → returns to thread list

### 75–90s: Phone — Browser + Incoming Call
1. Open Browser app → GitHub repo card loads with live star count from API
2. Tap "Open on GitHub ↗" (links to real repo)
3. Go home → tap the Jarvis icon (bottom-left, copper) → simulates Jarvis calling you
4. Answer the incoming call banner → Jarvis says your build failed at 2am

## Closing
Scroll down to the Download section. Three OS cards with copy buttons. One-line installers. The visitor has now used a terminal, chatted with Jarvis, made a phone call, sent messages, browsed GitHub, and played a game — all without downloading anything.

## Key moments that sell
- **Boot animation** → "this feels like a real product"
- **Typing `help` in terminal** → "I can actually interact"
- **Jarvis call with live captions** → "the calling feature is real"
- **Incoming call simulation** → "wait, the AI can call ME?"
- **GitHub stars in browser** → "this is a real open-source project"

## Acceptance criteria checklist
| # | Test | Status |
|---|------|--------|
| 1 | Terminal → type help → works | ✅ |
| 2 | Spawn 3 terminal tabs | ✅ |
| 3 | Change clock in Settings → menu bar updates | ✅ |
| 4 | Play minigame to completion | ✅ |
| 5 | Phone: send iMessage, get reply, go back | ✅ |
| 6 | Phone: call Jarvis, live captions, end call | ✅ |
| 7 | Phone: Jarvis incoming call simulation | ✅ |
| 8 | Phone: call NPC, unique dialogue | ✅ |
| 9 | Phone browser shows GitHub repo | ✅ (API fallback) |
| 10 | Hero animations on load feel premium | ✅ |
| 11 | Mobile usable (phone tab) | ✅ |
| 12 | Lighthouse perf ≥ 80 mobile | ⏳ (verify in browser) |
