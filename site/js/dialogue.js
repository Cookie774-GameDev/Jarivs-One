/* dialogue.js — VibeSpace NPC dialogue engine
 * Shared between desktop chat app and phone messages/calls.
 * Each contact: id, name, avatar, color, role, callLines[], messageReplies{}
 */
(function (global) {
  "use strict";

  var CONTACTS = [
    {
      id: "jarvis",
      name: "Jarvis",
      avatar: "J",
      color: "#d68a4e",
      role: "Voice assistant",
      callLines: [
        "Hey, it's Jarvis. I'm the hands-free voice module inside VibeSpace — not the product name, just the assistant.",
        "You can talk to me with Mod+Space push-to-talk. Local Kokoro voices are free and unlimited, no API key needed.",
        "Wake word only activates in hands-free mode, so I won't eavesdrop. Composer mic is separate from my voice panel.",
        "I can search your files, summarize docs, create tasks, and call you when a build fails. Want me to set something up?",
        "Right — closing the voice panel stops my streaming TTS instantly. Clean shutdown, no ghost audio."
      ],
      messageReplies: {
        voice: "I run on local Kokoro — free, unlimited, no key. Mod+Space opens my panel. Wake word only in hands-free mode.",
        call: "AI calling is separate from me! Phone calls use Twilio PSTN on paid plans. In-app WebRTC is free. I'm the voice module inside the app.",
        terminal: "I can spawn terminal agents — Scout, Builder, Reviewer. They coordinate through a Rust-backed ledger. Want to see?",
        skills: "Type /skills in chat to browse the catalog. SkillEditor has markdown preview. Built-in and custom skills in one library.",
        memory: "My memory persists across chats, voice, files, and tasks. Context is scoped per project. Local-first, always.",
        help: "Try asking about: voice, call, terminal, skills, memory, hive, or models. I'll explain each feature.",
        hi: "Hello there! I'm Jarvis, your in-app voice assistant. Ask me about voice, calls, terminals, skills, or memory.",
        hello: "Hey! Jarvis here. What can I tell you about — voice, calling, terminals, skills, memory, or Hive?"
      },
      defaultReply: "I'm Jarvis — the voice assistant inside VibeSpace. Ask me about voice, calls, terminals, skills, memory, or Hive stacks. I'll explain how each one works.",
      pinned: true
    },
    {
      id: "sage",
      name: "Sage",
      avatar: "S",
      color: "#8fb87e",
      role: "Research agent",
      callLines: [
        "Sage here. I'm the research agent in the council — I read docs, synthesize findings, and cite evidence.",
        "Context maps are my specialty. Every source I touch gets scoped to your project, so nothing leaks across workspaces.",
        "When you ask a question, I pull from persistent memory first. No re-explaining context every session.",
        "I hand my findings to Coder or Critic depending on the task. The council doesn't work in silos.",
        "Local-first means your research stays on your machine. Cloud sync is optional. Your keys, your data."
      ],
      messageReplies: {
        research: "I read docs, synthesize, cite evidence, and compare competitors. Everything gets scoped to your project's context map.",
        context: "Context maps are project-scoped persistent memory. I pull from them first so you never re-explain your codebase.",
        memory: "Memory persists across chats, voice, files, and tasks. I use it to ground every research pass in what you've already done.",
        docs: "I read documentation, extract key points, and cite sources. Findings flow to Coder for implementation or Critic for review."
      },
      defaultReply: "I'm Sage, the research agent. I read docs, cite evidence, and keep context maps scoped to your project. Ask me about research, context, or memory."
    },
    {
      id: "builder",
      name: "Builder",
      avatar: "B",
      color: "#a472f0",
      role: "Coder agent",
      callLines: [
        "Builder. I map the smallest safe diff and run it through the terminal swarm.",
        "OpenCode and Claude Code both work in my PTY grid. I pick roles — Scout scans, I build, Reviewer checks.",
        "Terminal agent coordination uses a Rust-backed ledger. Client locks prevent two agents editing the same file.",
        "Scrollback survives restarts. Your terminal history is durable — nothing lost on crash or update.",
        "I deliver agent prompt payloads that are mode-aware. Build mode, review mode, scout mode — each gets different briefing."
      ],
      messageReplies: {
        terminal: "I run real PTY shells in a tile grid. Scout, Builder, Reviewer roles. OpenCode and Claude Code both work. Scrollback is durable.",
        code: "I map the smallest safe diff before touching files. Agent coordination uses a Rust ledger with client locks. No two agents edit the same file.",
        opencode: "OpenCode runs in my terminal grid alongside Claude Code. Both are first-class. Agent prompts are mode-aware.",
        swarm: "The swarm is a tile grid of PTY terminals. Each pane has a role. The Rust ledger coordinates who does what. Durable scrollback."
      },
      defaultReply: "I'm Builder, the coder agent. I run terminal swarms with Scout/Builder/Reviewer roles. Ask me about terminals, code, OpenCode, or the swarm."
    },
    {
      id: "critic",
      name: "The Critic",
      avatar: "!",
      color: "#e8a96b",
      role: "Review agent",
      callLines: [
        "The Critic. I find gaps, risks, and missing tests before anything ships.",
        "Hive review stacks route through me last. Fast models draft, quality models refine, I judge the final output.",
        "If your diff is missing a test case, I block the merge. No exceptions. Ship clean or don't ship.",
        "I synthesize the council's work into one answer. Researcher found docs, Coder built it, I verify it holds up.",
        "My favorite catch? Edge case: null token. Builder forgot it once. Once."
      ],
      messageReplies: {
        hive: "Hive stacks route across models — Fast, Balanced, Quality, High, Custom. I get the final output. I judge whether it ships.",
        review: "I find gaps, risks, missing tests. I block merges that aren't clean. I synthesize the council's work into one verified answer.",
        test: "Missing test case? Blocked. Edge case unhandled? Blocked. I'm the gate between 'looks done' and 'is done'.",
        stack: "Hive stack presets: Fast, Balanced, Quality, High, Custom. Each routes your message to different models. I review the synthesis."
      },
      defaultReply: "I'm The Critic. I review Hive stacks, find missing tests, and block unclean merges. Ask me about hive, review, tests, or stacks."
    },
    {
      id: "devrel",
      name: "DevRel Bot",
      avatar: "D",
      color: "#34d6e6",
      role: "Community",
      callLines: [
        "DevRel Bot here! VibeSpace is Apache 2.0 open source. Fork it, inspect it, ship your own build.",
        "GitHub has the full source, releases, issues, and changelog. Everything ships in public.",
        "The core is free forever. Local-first, BYOK. You bring the keys, we bring the workspace.",
        "Star the repo if you vibe with it. Stars help other builders find us.",
        "Issues are public. PRs are welcome. We keep shipping — check the changelog for v0.1.45 highlights."
      ],
      messageReplies: {
        github: "github.com/Cookie774-GameDev/VibeSpace — source, releases, issues, changelog. All public. Apache 2.0.",
        open: "Apache 2.0 open source. Fork it, inspect it, ship your own build. The core is free forever.",
        star: "Star the repo! It helps other vibe coders find us. Every star is a high-five.",
        license: "Apache 2.0. One of the most permissive open source licenses. Commercial use, modification, distribution — all fine.",
        contribute: "PRs welcome! Check the issues tab for good first issues. The changelog shows what we're working on."
      },
      defaultReply: "I'm DevRel Bot! VibeSpace is Apache 2.0 open source on GitHub. Ask me about github, open source, stars, license, or contributing."
    },
    {
      id: "midnight",
      name: "Midnight Coder",
      avatar: "M",
      color: "#6b6357",
      role: "Night owl",
      callLines: [
        "Midnight Coder. 2am, build fails, I'm still here. That's why AI calling exists.",
        "Jarvis called me last Tuesday at 2am. Build broke in auth.ts. He read the traceback, named the file, left me a morning fix list.",
        "I was asleep. My phone rang. Jarvis said 'build failed, traceback points to line 42, want me to draft a patch?' I said yes and went back to sleep.",
        "That's the PSTN path — real phone call via Twilio. Paid plans get minutes. Free plan gets in-app WebRTC.",
        "The morning fix list was waiting in my tasks. I shipped it before coffee. That's the vibe."
      ],
      messageReplies: {
        call: "AI calling saved my night. Build failed at 2am, Jarvis called my phone, read the traceback, left a fix list. I shipped before coffee.",
        night: "2am build failures are my specialty. Jarvis calls via Twilio PSTN on paid plans. In-app WebRTC is free. Either way, I sleep better.",
        failure: "Build fails? Jarvis reads the traceback, names the file, suggests a fix. He can call your phone or ping you in-app.",
        phone: "Real phone call via Twilio. My phone rang at 2am. Jarvis said the word. I went back to sleep. Fix list was waiting at 7am."
      },
      defaultReply: "I'm Midnight Coder. I work at 2am and Jarvis calls me when builds fail. Ask me about calls, night coding, failures, or the phone path."
    },
    {
      id: "mom",
      name: "Mom",
      avatar: "M",
      color: "#d68a4e",
      role: "Family",
      callLines: [
        "Hi sweetie! Are you eating? That AI thing you built — is it going well?",
        "I'm proud of you. Open source, you said? That means people can see your work? That's brave.",
        "Call me more often, okay? And drink water. Building software is hard work.",
        "I told the neighbors about your app. They didn't understand but they nodded politely.",
        "Love you. Keep shipping — that's what you always say, right?"
      ],
      messageReplies: {
        hi: "Hi sweetie! Are you eating? I'm proud of you and your AI workspace thing.",
        mom: "Yes, it's me, your mother. Call me more often, okay?",
        work: "Your father says open source is very impressive. I'm not sure what it means but I'm proud.",
        food: "Eat something! You can't build software on coffee alone. Have you tried the leftover soup?"
      },
      defaultReply: "Hi sweetie! Are you eating? Drink water. I'm proud of your AI workspace. Call me more often!",
      pinned: false
    }
  ];

  var INCOMING_CALL_SCRIPT = [
    "Incoming call from Jarvis...",
    "Hey — it's Jarvis. Your build just failed.",
    "Traceback points to auth.ts line 42. Token refresh logic is broken.",
    "Want me to draft a patch? I can have Builder on it in 30 seconds.",
    "I'll leave a fix list in your tasks either way. Go back to sleep.",
    "Call ended. Fix list saved to Tasks."
  ];

  function getContact(id) {
    return CONTACTS.find(function (c) { return c.id === id; });
  }

  function getReply(contactId, userText) {
    var c = getContact(contactId);
    if (!c || !c.messageReplies) return "Hmm, I'm not sure how to help with that.";
    var text = userText.toLowerCase();
    var keys = Object.keys(c.messageReplies);
    for (var i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) !== -1) return c.messageReplies[keys[i]];
    }
    return c.defaultReply || "Interesting. Tell me more.";
  }

  function getAllContacts() {
    return CONTACTS.slice();
  }

  global.VSDialogue = {
    CONTACTS: CONTACTS,
    INCOMING_CALL_SCRIPT: INCOMING_CALL_SCRIPT,
    getContact: getContact,
    getReply: getReply,
    getAllContacts: getAllContacts
  };
})(window);
