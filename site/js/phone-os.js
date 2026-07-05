/* phone-os.js — VibeSpace Phone simulator
 * Lock screen → home → 6 apps: Calls, Messages, Browser, Dial, Settings, App Store
 */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;

  var phone, screen, content, statusBarTime, batteryFill;
  var screenStack = []; // stack of active screen layers
  var currentContact = null;
  var callTimer = null;
  var callSeconds = 0;
  var incomingCallTimer = null;
  var msgThreads = {}; // contactId -> [{text, side}]

  function init() {
    phone = document.getElementById("phoneOS");
    if (!phone) return;
    screen = phone.querySelector(".phone-screen");
    content = phone.querySelector(".phone-content");
    statusBarTime = phone.querySelector(".sb-time");
    batteryFill = phone.querySelector(".phone-battery-fill");

    // Battery animation
    if (batteryFill && !reduce) {
      var bat = 82;
      setInterval(function () {
        bat = bat > 15 ? bat - 0.3 : 82;
        batteryFill.style.width = bat + "%";
      }, 4000);
    }

    // Time update
    updateTime();
    setInterval(updateTime, 1000);

    // Lock screen swipe up
    var lockScreen = phone.querySelector(".phone-lock");
    if (lockScreen) {
      lockScreen.addEventListener("click", unlockPhone);
    }

    // Home indicator
    var homeIndicator = phone.querySelector(".phone-home-indicator");
    if (homeIndicator) {
      homeIndicator.addEventListener("click", goHome);
    }

    // App icon clicks
    phone.querySelectorAll(".phone-app-icon").forEach(function (icon) {
      icon.addEventListener("click", function () {
        openApp(icon.dataset.app);
      });
    });

    // Simulate incoming call button
    var simBtn = phone.querySelector("[data-action='simulate-incoming']");
    if (simBtn) simBtn.addEventListener("click", simulateIncomingCall);

    // Auto incoming call after 30s (once per session)
    if (!sessionStorage.getItem("vs-incoming-call-done") && !reduce) {
      incomingCallTimer = setTimeout(simulateIncomingCall, 30000);
    }

    // Build call list
    buildCallList();
    // Build message list
    buildMessageList();
    // Load browser
    loadGitHubBrowser();
  }

  function updateTime() {
    if (!statusBarTime) return;
    var customTime = sessionStorage.getItem("vs-phone-time");
    var d = customTime ? new Date(customTime) : new Date();
    if (isNaN(d)) d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    statusBarTime.textContent = (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m;

    // Lock screen time
    var lockTime = phone.querySelector(".phone-lock-time");
    if (lockTime) lockTime.textContent = (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m;
    var lockDate = phone.querySelector(".phone-lock-date");
    if (lockDate) {
      var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      lockDate.textContent = days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();
    }
  }

  function unlockPhone() {
    var lock = phone.querySelector(".phone-lock");
    if (!lock || lock.classList.contains("hidden-left")) return;
    lock.classList.add("hidden-left");
    var home = phone.querySelector(".phone-home-screen");
    home.classList.remove("hidden-right");
    home.classList.add("active");
    screenStack = [home];
  }

  function goHome() {
    // Close call if active
    var callScreen = phone.querySelector(".phone-call-screen");
    if (callScreen && callScreen.classList.contains("active")) {
      endCall();
    }
    // Hide all app screens
    phone.querySelectorAll(".phone-app-screen").forEach(function (s) {
      s.classList.remove("active");
      s.classList.add("hidden-right");
    });
    // Show home
    var home = phone.querySelector(".phone-home-screen");
    if (home) {
      home.classList.remove("hidden-left", "hidden-right");
      home.classList.add("active");
      screenStack = [home];
    }
  }

  function openApp(appId) {
    var screen = phone.querySelector('.phone-app-screen[data-app="' + appId + '"]');
    if (!screen) return;
    // Hide home
    var home = phone.querySelector(".phone-home-screen");
    home.classList.add("hidden-left");
    home.classList.remove("active");
    // Show app
    screen.classList.remove("hidden-right", "hidden-left");
    screen.classList.add("active");
    screenStack = [home, screen];

    // App-specific init
    if (appId === "browser") loadGitHubBrowser();
    if (appId === "settings") initSettings();
    if (appId === "notes") initNotes();
    if (appId === "vibecast") initVibeCast();
    if (appId === "notifications") initNotifications();
  }

  function goBack() {
    if (screenStack.length <= 1) { goHome(); return; }
    var current = screenStack.pop();
    current.classList.add("hidden-right");
    current.classList.remove("active");
    var prev = screenStack[screenStack.length - 1];
    prev.classList.remove("hidden-left", "hidden-right");
    prev.classList.add("active");
  }

  // Wire back buttons
  document.addEventListener("click", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("phone-back-btn")) {
      goBack();
    }
  });

  // ============ CALLS APP ============
  function buildCallList() {
    var list = phone.querySelector(".call-list");
    if (!list) return;
    var contacts = VSDialogue.getAllContacts();
    list.innerHTML = contacts.map(function (c) {
      return '<div class="call-contact" data-call="' + c.id + '">' +
        '<div class="cc-avatar" style="background:' + c.color + '">' + c.avatar + '</div>' +
        '<div class="cc-info"><div class="cc-name">' + c.name + '</div>' +
        '<div class="cc-role">' + c.role + '</div></div>' +
        '<button class="cc-call-btn" aria-label="Call ' + c.name + '" data-ic="call"></button>' +
        '</div>';
    }).join("");
    list.querySelectorAll(".call-contact").forEach(function (el) {
      el.addEventListener("click", function () {
        startCall(el.dataset.call);
      });
    });
  }

  function startCall(contactId) {
    var c = VSDialogue.getContact(contactId);
    if (!c) return;
    currentContact = c;
    var callScreen = phone.querySelector(".phone-call-screen");
    var avatar = callScreen.querySelector(".call-avatar-ring");
    var nameEl = callScreen.querySelector(".call-name");
    var statusEl = callScreen.querySelector(".call-status");
    var timerEl = callScreen.querySelector(".call-timer");
    var captions = callScreen.querySelector(".call-captions");

    avatar.style.background = "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 35%), " + c.color;
    avatar.textContent = c.avatar;
    nameEl.textContent = c.name;
    statusEl.textContent = "calling...";
    timerEl.textContent = "00:00";
    captions.innerHTML = "";

    callScreen.classList.add("active");
    phone.classList.add("phone-shake");
    setTimeout(function () { phone.classList.remove("phone-shake"); }, 800);

    // After 1.5s, connect and start dialogue
    setTimeout(function () {
      statusEl.textContent = "connected";
      callSeconds = 0;
      callTimer = setInterval(function () {
        callSeconds++;
        var mm = Math.floor(callSeconds / 60);
        var ss = callSeconds % 60;
        timerEl.textContent = (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
      }, 1000);
      playCallDialogue(c, captions);
    }, 1500);
  }

  function playCallDialogue(c, captions) {
    var lines = c.callLines;
    var idx = 0;
    function nextLine() {
      if (idx >= lines.length) return;
      var line = lines[idx++];
      var div = document.createElement("div");
      div.className = "caption-line them";
      captions.appendChild(div);
      div.classList.add("show");
      if (!reduce) {
        div.classList.add("typing");
        // Typewriter
        var i = 0;
        var tick = setInterval(function () {
          div.textContent = line.slice(0, ++i);
          if (i >= line.length) {
            clearInterval(tick);
            div.classList.remove("typing");
            div.textContent = line;
            captions.scrollTop = captions.scrollHeight;
            setTimeout(nextLine, 1800);
          }
        }, 20);
      } else {
        div.textContent = line;
        captions.scrollTop = captions.scrollHeight;
        setTimeout(nextLine, 1800);
      }
    }
    nextLine();
  }

  function endCall() {
    var callScreen = phone.querySelector(".phone-call-screen");
    callScreen.classList.remove("active");
    if (callTimer) { clearInterval(callTimer); callTimer = null; }
    callSeconds = 0;
    showToast(currentContact ? "Call ended — " + currentContact.name : "Call ended");
    currentContact = null;
  }

  // Wire call control buttons
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.classList) return;
    if (e.target.classList.contains("call-btn") && e.target.classList.contains("end")) endCall();
  });

  // ============ INCOMING CALL ============
  function simulateIncomingCall() {
    if (incomingCallTimer) { clearTimeout(incomingCallTimer); incomingCallTimer = null; }
    sessionStorage.setItem("vs-incoming-call-done", "1");
    var banner = phone.querySelector(".phone-incoming-banner");
    if (!banner) return;
    banner.classList.add("show");
    phone.classList.add("phone-shake");
    setTimeout(function () { phone.classList.remove("phone-shake"); }, 800);
    // Auto-dismiss after 8s if not answered
    setTimeout(function () {
      if (banner.classList.contains("show")) banner.classList.remove("show");
    }, 8000);
  }

  // Wire incoming banner
  document.addEventListener("click", function (e) {
    if (!e.target) return;
    if (e.target.closest(".phone-incoming-banner")) {
      var banner = phone.querySelector(".phone-incoming-banner");
      banner.classList.remove("show");
      startCall("jarvis");
    }
  });

  // ============ MESSAGES APP ============
  function buildMessageList() {
    var list = phone.querySelector(".msg-list");
    if (!list) return;
    var contacts = VSDialogue.getAllContacts();
    list.innerHTML = contacts.map(function (c) {
      var preview = c.defaultReply.slice(0, 45) + "...";
      if (!msgThreads[c.id]) msgThreads[c.id] = [{ text: c.defaultReply, side: "them" }];
      return '<div class="msg-thread" data-msg="' + c.id + '">' +
        '<div class="mt-avatar" style="background:' + c.color + '">' + c.avatar + '</div>' +
        '<div class="mt-info"><div class="mt-name">' + c.name + (c.pinned ? ' <span class="mt-pin" data-ic="pin"></span>' : '') + '</div>' +
        '<div class="mt-preview">' + preview + '</div></div></div>';
    }).join("");
    list.querySelectorAll(".msg-thread").forEach(function (el) {
      el.addEventListener("click", function () {
        openMessageThread(el.dataset.msg);
      });
    });
  }

  function openMessageThread(contactId) {
    var c = VSDialogue.getContact(contactId);
    if (!c) return;
    var chatView = phone.querySelector(".msg-chat-view");
    var titleEl = chatView.querySelector(".phone-nav-title");
    var bubbles = chatView.querySelector(".msg-bubbles");
    titleEl.textContent = c.name;
    bubbles.innerHTML = "";

    // Show existing messages
    var msgs = msgThreads[contactId] || [];
    msgs.forEach(function (m, i) {
      var div = document.createElement("div");
      div.className = "msg-bubble " + m.side;
      div.textContent = m.text;
      bubbles.appendChild(div);
      setTimeout(function () { div.classList.add("show"); }, reduce ? 0 : i * 100);
    });
    bubbles.scrollTop = bubbles.scrollHeight;

    // Show chat view (replace list)
    var listScreen = phone.querySelector('.phone-app-screen[data-app="messages"]');
    var listLayer = listScreen.querySelector(".msg-list-view");
    listLayer.classList.add("hidden-left");
    chatView.classList.remove("hidden-right");
    chatView.classList.add("active");

    // Wire input
    var input = chatView.querySelector(".msg-input");
    var sendBtn = chatView.querySelector(".msg-send");
    var backBtn = chatView.querySelector(".msg-back-btn");

    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;
      var youDiv = document.createElement("div");
      youDiv.className = "msg-bubble you";
      youDiv.textContent = text;
      bubbles.appendChild(youDiv);
      setTimeout(function () { youDiv.classList.add("show"); }, 10);
      input.value = "";
      bubbles.scrollTop = bubbles.scrollHeight;
      msgThreads[contactId].push({ text: text, side: "you" });

      // NPC reply
      setTimeout(function () {
        var reply = VSDialogue.getReply(contactId, text);
        var themDiv = document.createElement("div");
        themDiv.className = "msg-bubble them";
        bubbles.appendChild(themDiv);
        themDiv.classList.add("show");
        if (!reduce) {
          var i = 0;
          var tick = setInterval(function () {
            themDiv.textContent = reply.slice(0, ++i);
            bubbles.scrollTop = bubbles.scrollHeight;
            if (i >= reply.length) {
              clearInterval(tick);
              themDiv.textContent = reply;
            }
          }, 15);
        } else {
          themDiv.textContent = reply;
        }
        msgThreads[contactId].push({ text: reply, side: "them" });
        bubbles.scrollTop = bubbles.scrollHeight;
      }, 600);
    }

    sendBtn.onclick = sendMessage;
    input.onkeydown = function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
    };

    backBtn.onclick = function () {
      chatView.classList.remove("active");
      chatView.classList.add("hidden-right");
      listLayer.classList.remove("hidden-left");
    };
  }

  // ============ BROWSER APP ============
  function loadGitHubBrowser() {
    var body = phone.querySelector(".phone-browser-body");
    if (!body) return;
    if (body.dataset.loaded) return;
    body.dataset.loaded = "1";

    body.innerHTML = '<div style="text-align:center;padding:40px 24px;color:var(--faint);font-size:12px">Loading GitHub&hellip;</div>';

    fetch("https://api.github.com/repos/Cookie774-GameDev/VibeSpace")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var stars = data.stargazers_count || 0;
        var forks = data.forks_count || 0;
        var desc = data.description || "The AI workspace where every model, agent, voice, and task lives under one roof.";
        var lang = data.language || "TypeScript";
        var updated = data.updated_at ? new Date(data.updated_at).toLocaleDateString() : "recently";
        var name = data.full_name || "Cookie774-GameDev/VibeSpace";
        var topics = data.topics && data.topics.length ? data.topics : ["ai","terminal","voice","agents","desktop","tauri"];
        var created = data.created_at ? new Date(data.created_at).getFullYear() : "2025";

        fetch("https://api.github.com/repos/Cookie774-GameDev/VibeSpace/releases/latest")
          .then(function (r) { return r.json(); })
          .then(function (rel) {
            var ver = rel.tag_name || "v0.1.45";
            renderGitHub(body, name, desc, stars, forks, lang, ver, updated, topics, created);
          })
          .catch(function () {
            renderGitHub(body, name, desc, stars, forks, lang, "v0.1.45", updated, topics, created);
          });
      })
      .catch(function () {
        renderGitHub(body, "Cookie774-GameDev/VibeSpace",
          "The AI workspace where every model, agent, voice, and task lives under one roof.",
          "—", "—", "TypeScript", "v0.1.45", "recently", ["ai","terminal","voice","agents","desktop","tauri"], "2025");
      });

    // Also attempt an iframe (GitHub may block via X-Frame-Options; we keep the API fallback as primary)
    // We do NOT rely on iframe; the API render is always shown.
  }

  function renderGitHub(body, name, desc, stars, forks, lang, ver, updated, topics, created) {
    var topicHTML = topics.map(function (t) {
      return '<span style="display:inline-block;padding:3px 8px;margin:2px;border-radius:99px;background:rgba(43,181,196,0.08);border:1px solid rgba(43,181,196,0.2);color:var(--cyan);font-size:10px;font-weight:600">' + t + '</span>';
    }).join("");

    body.innerHTML =
      // Header strip
      '<div style="background:#0d1117;padding:14px;border-radius:12px 12px 0 0;margin:0 -16px;border-bottom:1px solid #21262d">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<svg viewBox="0 0 16 16" width="18" height="18" fill="#f0f6fc" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' +
          '<span style="color:#f0f6fc;font-size:16px;font-weight:600">GitHub</span>' +
        '</div>' +
      '</div>' +
      // Repo card
      '<div style="padding:14px 0">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
          '<span style="color:#58a6ff;font-size:13px;font-weight:600">' + name.split("/")[0] + '/</span>' +
          '<span style="color:#58a6ff;font-size:13px;font-weight:700">' + name.split("/")[1] + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#8b949e;line-height:1.5;margin-bottom:10px">' + desc + '</div>' +
        // Topics
        '<div style="margin-bottom:12px">' + topicHTML + '</div>' +
        // Meta row
        '<div style="display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11px;color:#8b949e;margin-bottom:12px">' +
          '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:#f1e05a"></span> ' + lang + '</span>' +
          '<span style="display:flex;align-items:center;gap:4px"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg> ' + stars + ' stars</span>' +
          '<span style="display:flex;align-items:center;gap:4px"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-.878a2.25 2.25 0 111.5 2.122v-.878a.75.75 0 00-1.5 0v.878a2.25 2.25 0 11-3 0v-.878a.75.75 0 00-1.5 0v.878a2.25 2.25 0 11-3 0v-.878a.75.75 0 00-1.5 0v.878a2.25 2.25 0 111.5-2.122z"/></svg> ' + forks + ' forks</span>' +
        '</div>' +
        // About / Readme preview
        '<div style="border:1px solid #21262d;border-radius:8px;overflow:hidden;margin-bottom:10px">' +
          '<div style="background:#161b22;padding:8px 12px;color:#c9d1d9;font-size:11px;font-weight:600;border-bottom:1px solid #21262d">README.md</div>' +
          '<div style="padding:12px;font-size:12px;color:#c9d1d9;line-height:1.5">' +
            '<strong style="color:#f0f6fc">VibeSpace</strong> &mdash; The AI workspace where every model, agent, voice, and task lives under one roof.<br>' +
            '<br>' +
            '<span style="color:#58a6ff">Built with Tauri 2 + Rust + React. Local-first. BYOK. Apache 2.0.</span><br>' +
            '<br>' +
            'Features: Multi-model chat, agent council, terminal swarm, Jarvis voice, AI calling, skills catalog, Inspector, Kanban, Hive stacks.<br>' +
            '<br>' +
            'Status: <span style="color:#3fb950">shipping v0.1.45</span> &middot; Updated ' + updated + ' &middot; Since ' + created +
          '</div>' +
        '</div>' +
        // Buttons
        '<a class="gh-link" href="https://github.com/Cookie774-GameDev/VibeSpace" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:8px;padding:9px;border-radius:8px;background:linear-gradient(135deg,#238636,#2ea043);color:#fff;font-weight:600;font-size:12px;text-decoration:none">Open full repo on GitHub &#8599;</a>' +
        '<a href="https://github.com/Cookie774-GameDev/VibeSpace/releases/latest" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:6px;padding:8px;border-radius:8px;background:#161b22;border:1px solid #30363d;color:#58a6ff;font-weight:600;font-size:11px;text-decoration:none">Download v' + ver.replace("v","") + ' release &#8599;</a>' +
      '</div>';
  }

  // ============ DIAL PAD ============
  function initDialPad() {
    var display = phone.querySelector(".dialpad-display");
    var keys = phone.querySelectorAll(".dial-key");
    keys.forEach(function (k) {
      k.onclick = function () {
        var val = display.textContent;
        if (val.length < 12) display.textContent = val + k.dataset.key;
      };
    });
    var callBtn = phone.querySelector(".dial-call-btn");
    if (callBtn) callBtn.onclick = function () {
      var num = display.textContent.trim();
      if (num) {
        showToast("Dialing " + num + "...");
        setTimeout(function () { startCall("jarvis"); }, 500);
      }
    };
  }

  // ============ SETTINGS ============
  function initSettings() {
    var timeInput = phone.querySelector(".ps-time-input");
    if (timeInput) {
      timeInput.value = sessionStorage.getItem("vs-phone-time") || "";
      timeInput.onchange = function () {
        sessionStorage.setItem("vs-phone-time", timeInput.value);
        updateTime();
        showToast("Time updated");
      };
    }
  }

  // ============ DIAL PAD INIT ============
  document.addEventListener("DOMContentLoaded", initDialPad);

  // ============ TOAST ============
  function showToast(msg) {
    var toast = phone.querySelector(".phone-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2500);
  }

  // ============ NOTES APP ============
  var phoneNotes = [];
  function initNotes() {
    var list = phone.querySelector(".notes-list");
    if (!list) return;
    var stored = sessionStorage.getItem("vs-phone-notes");
    if (stored) { try { phoneNotes = JSON.parse(stored); } catch (e) {} }
    if (phoneNotes.length === 0) {
      phoneNotes = [
        { title: "Ship auth fix", body: "Token refresh logic — Builder patched, Critic approved. Ship before standup.", color: "#E0925C" },
        { title: "Voice ideas", body: "Wake word only in hands-free mode. Add Friday preset for fast tactical. Kokoro is free.", color: "#9CC68B" },
        { title: "Hive tuning", body: "Fast stack: Groq + Cerebras = 200ms. Quality stack adds Critic review step = 3.4s.", color: "#B98AE8" }
      ];
      sessionStorage.setItem("vs-phone-notes", JSON.stringify(phoneNotes));
    }
    renderNotes();

    var newBtn = phone.querySelector(".phone-new-note");
    if (newBtn) {
      newBtn.onclick = function () {
        phoneNotes.unshift({ title: "New note", body: "Tap to edit...", color: "#4DD8E8" });
        sessionStorage.setItem("vs-phone-notes", JSON.stringify(phoneNotes));
        renderNotes();
        showToast("Note created");
      };
    }

    function renderNotes() {
      if (!list) return;
      if (phoneNotes.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--faint);padding:40px 20px;font-size:14px">No notes yet. Tap + to create one.</div>';
        return;
      }
      list.innerHTML = phoneNotes.map(function (n, i) {
        return '<div class="notif-card" data-note="' + i + '" style="border-left:3px solid ' + n.color + '">' +
          '<div style="font-weight:700;font-size:14px;color:var(--fg)">' + n.title + '</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4">' + n.body + '</div>' +
        '</div>';
      }).join("");
      list.querySelectorAll("[data-note]").forEach(function (el) {
        el.addEventListener("click", function () {
          var idx = parseInt(el.dataset.note);
          showToast("Note: " + phoneNotes[idx].title);
        });
      });
    }
  }

  // ============ VIBECAST APP ============
  function initVibeCast() {
    var body = phone.querySelector(".vibecast-body");
    if (!body) return;
    var vibes = [
      { temp: "72", label: "Peak Vibe", desc: "Everything is shipping. Council is in sync. Terminals are green.", mood: "sage" },
      { temp: "68", label: "Cozy Focus", desc: "Deep work mode. Jarvis on standby. Memory is grounded.", mood: "copper" },
      { temp: "65", label: "Late Night", desc: "2am energy. Midnight Coder online. Build might fail. Jarvis will call.", mood: "plum" },
      { temp: "75", label: "Hive Flow", desc: "Models stacking perfectly. Fast draft, quality refine, critic approved.", mood: "cyan" }
    ];
    var vibe = vibes[Math.floor(Math.random() * vibes.length)];
    var moodColor = vibe.mood === "sage" ? "#9CC68B" : vibe.mood === "copper" ? "#E0925C" : vibe.mood === "plum" ? "#B98AE8" : "#4DD8E8";

    body.innerHTML =
      '<div style="font-family:Fraunces,serif;font-size:48px;font-weight:300;color:' + moodColor + ';line-height:1">' + vibe.temp + '</div>' +
      '<div style="font-size:13px;color:var(--faint);margin-bottom:20px">vibes in the workspace</div>' +
      '<div style="font-size:20px;font-weight:600;color:var(--fg);font-family:Fraunces,serif;margin-bottom:8px">' + vibe.label + '</div>' +
      '<div style="font-size:13px;color:var(--muted);line-height:1.6;max-width:220px;margin:0 auto">' + vibe.desc + '</div>' +
      '<div style="margin-top:24px;display:flex;gap:8px;justify-content:center">' +
        '<button class="vc-refresh" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--copper-soft);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">Refresh vibe</button>' +
      '</div>' +
      '<div style="margin-top:16px;font-size:11px;color:var(--faint);font-family:Fraunces,serif;font-style:italic">VibeCast — like weather, but for your build</div>';

    body.querySelector(".vc-refresh").addEventListener("click", function () {
      initVibeCast();
      showToast("Vibe refreshed");
    });
  }

  // ============ NOTIFICATIONS APP ============
  function initNotifications() {
    var list = phone.querySelector(".notif-list");
    if (!list) return;
    var notifs = [
      { app: "Terminal", icon: "terminal", msg: "Build succeeded — all 3 panes green", time: "2m ago", color: "#9CC68B" },
      { app: "Jarvis", icon: "voice", msg: "Morning summary ready. 3 tasks, 1 build fixed overnight.", time: "8m ago", color: "#E0925C" },
      { app: "Council", icon: "council", msg: "Critic approved your auth.ts patch. Ship it.", time: "15m ago", color: "#F0B07A" },
      { app: "Hive", icon: "hive2", msg: "Fast stack synthesized in 200ms. Groq + Cerebras.", time: "22m ago", color: "#4DD8E8" },
      { app: "Skills", icon: "skills2", msg: "New skill available: context-keeper v2", time: "1h ago", color: "#B98AE8" },
      { app: "Inspector", icon: "inspector2", msg: "Milestone reached: auth module complete", time: "2h ago", color: "#9CC68B" },
      { app: "Midnight Coder", icon: "call", msg: "Left you a fix list for the 2am build failure", time: "5h ago", color: "#9A9085" }
    ];

    list.innerHTML = notifs.map(function (n) {
      return '<div class="notif-card" style="border-left:3px solid ' + n.color + '">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
          '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:' + n.color + ';font-weight:700">' + n.app + '</span>' +
          '<span style="font-size:10px;color:var(--faint);margin-left:auto">' + n.time + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--muted);line-height:1.4">' + n.msg + '</div>' +
      '</div>';
    }).join("");

    list.querySelectorAll(".notif-card").forEach(function (el) {
      el.addEventListener("click", function () {
        var app = el.querySelector("span").textContent;
        showToast("Opening " + app + "...");
      });
    });
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
