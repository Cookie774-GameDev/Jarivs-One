/* phone-os.js - VibeSpace phone simulator */
(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var repoUrl = "https://github.com/Cookie774-GameDev/VibeSpace";
  var apiRepoUrl = "https://api.github.com/repos/Cookie774-GameDev/VibeSpace";

  var phone;
  var statusBarTime;
  var batteryFill;
  var screenStack = [];
  var currentContact = null;
  var currentUtterance = null;
  var callTimer = null;
  var callSeconds = 0;
  var incomingCallTimer = null;
  var msgThreads = {};
  var photos = [];
  var flappyState = null;
  var snakeState = null;
  var browserCache = null;

  function init() {
    phone = document.getElementById("phoneOS");
    if (!phone || !window.VSDialogue) return;

    statusBarTime = phone.querySelector(".sb-time");
    batteryFill = phone.querySelector(".phone-battery-fill");

    setupBattery();
    updateTime();
    setInterval(updateTime, 1000);

    bindNavigation();
    bindPhoneActions();
    buildCallList();
    buildMessageList();
    initPhotos();
    initDialPad();
    initGames();
    renderAllBrowsers();

    if (!sessionStorage.getItem("vs-incoming-call-done") && !reduce) {
      incomingCallTimer = setTimeout(simulateIncomingCall, 30000);
    }

    if (window.VSIconsInject) window.VSIconsInject(phone);
  }

  function setupBattery() {
    if (!batteryFill || reduce) return;
    var level = 82;
    setInterval(function () {
      level = level > 18 ? level - 0.4 : 82;
      batteryFill.style.width = level + "%";
    }, 4000);
  }

  function bindNavigation() {
    var lock = phone.querySelector(".phone-lock");
    var homeIndicator = phone.querySelector(".phone-home-indicator");
    var homeButton = phone.querySelector(".phone-home-button");

    if (lock) {
      lock.addEventListener("click", unlockPhone);
      lock.addEventListener("touchstart", unlockPhone, { passive: true });
    }
    if (homeIndicator) homeIndicator.addEventListener("click", goHome);
    if (homeButton) homeButton.addEventListener("click", goHome);

    phone.querySelectorAll(".phone-app-icon").forEach(function (icon) {
      icon.addEventListener("click", function () {
        if (icon.dataset.action === "simulate-incoming") {
          simulateIncomingCall();
          return;
        }
        openApp(icon.dataset.app);
      });
    });

    document.addEventListener("click", function (e) {
      if (!phone.contains(e.target)) return;
      if (e.target.classList.contains("phone-back-btn")) goBack();
      if (e.target.closest(".phone-incoming-banner")) answerIncomingCall();
      if (e.target.classList.contains("phone-browser-go")) openGitHubPage();
    });
  }

  function bindPhoneActions() {
    var defaultSpeaker = phone.querySelector(".call-btn.speaker");
    if (defaultSpeaker) defaultSpeaker.classList.add("active");

    phone.addEventListener("click", function (e) {
      var actionEl = e.target.closest("[data-phone-action]");
      if (!actionEl) return;

      var action = actionEl.dataset.phoneAction;
      if (action === "call-jarvis") startCall("jarvis");
      if (action === "incoming-call") simulateIncomingCall();
      if (action === "open-camera") openApp("camera");
      if (action === "take-photo") takePhoto();
      if (action === "camera-flip") showToast("Switched lens");
      if (action === "camera-mode") showToast("Portrait mode ready");
      if (action === "start-flappy") startFlappyGame();
      if (action === "start-snake") startSnakeGame();
    });

    phone.querySelectorAll(".call-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.classList.contains("end")) endCall();
        if (btn.classList.contains("mute")) toggleMute(btn);
        if (btn.classList.contains("speaker")) toggleSpeaker(btn);
      });
    });
  }

  function updateTime() {
    if (!statusBarTime) return;
    var customTime = sessionStorage.getItem("vs-phone-time");
    var d = customTime ? new Date(customTime) : new Date();
    if (isNaN(d)) d = new Date();

    var hours = d.getHours();
    var minutes = d.getMinutes();
    var stamp = (hours % 12 || 12) + ":" + (minutes < 10 ? "0" : "") + minutes;

    statusBarTime.textContent = stamp;

    var lockTime = phone.querySelector(".phone-lock-time");
    var lockDate = phone.querySelector(".phone-lock-date");
    if (lockTime) lockTime.textContent = stamp;
    if (lockDate) {
      var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      lockDate.textContent = days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();
    }
  }

  function unlockPhone() {
    var lock = phone.querySelector(".phone-lock");
    var home = phone.querySelector(".phone-home-screen");
    if (!lock || !home) return;
    lock.classList.add("hidden-left");
    lock.classList.remove("active");
    home.classList.remove("hidden-right");
    home.classList.add("active");
    screenStack = [home];
  }

  function openApp(appId) {
    var target = phone.querySelector('.phone-app-screen[data-app="' + appId + '"]');
    var home = phone.querySelector(".phone-home-screen");
    if (!target || !home) return;

    if (screenStack.length === 0) unlockPhone();

    phone.querySelectorAll(".phone-app-screen").forEach(function (screen) {
      if (screen !== target) {
        screen.classList.remove("active");
        screen.classList.add("hidden-right");
      }
    });

    home.classList.add("hidden-left");
    home.classList.remove("active");
    target.classList.remove("hidden-right", "hidden-left");
    target.classList.add("active");
    screenStack = [home, target];

    if (appId === "settings") initSettings();
    if (appId === "notes") initNotes();
    if (appId === "vibecast") initVibeCast();
    if (appId === "notifications") initNotifications();
    if (appId === "photos") renderPhotos();
    if (appId === "safari" || appId === "chrome" || appId === "browser") renderAllBrowsers();
  }

  function goBack() {
    var chatView = phone.querySelector(".msg-chat-view");
    var listView = phone.querySelector(".msg-list-view");
    if (chatView && chatView.classList.contains("active")) {
      chatView.classList.remove("active");
      chatView.classList.add("hidden-right");
      if (listView) listView.classList.remove("hidden-left");
      return;
    }

    if (screenStack.length <= 1) {
      goHome();
      return;
    }

    var current = screenStack.pop();
    current.classList.remove("active");
    current.classList.add("hidden-right");

    var previous = screenStack[screenStack.length - 1];
    previous.classList.remove("hidden-left", "hidden-right");
    previous.classList.add("active");
  }

  function goHome() {
    stopSpeech();
    var callScreen = phone.querySelector(".phone-call-screen");
    if (callScreen && callScreen.classList.contains("active")) endCall(false);

    phone.querySelectorAll(".phone-app-screen").forEach(function (screen) {
      screen.classList.remove("active");
      screen.classList.add("hidden-right");
    });

    var home = phone.querySelector(".phone-home-screen");
    if (!home) return;
    home.classList.remove("hidden-left", "hidden-right");
    home.classList.add("active");
    screenStack = [home];
  }

  function buildCallList() {
    var list = phone.querySelector(".call-list");
    if (!list) return;
    var contacts = window.VSDialogue.getAllContacts();

    list.innerHTML = contacts.map(function (contact) {
      return '<div class="call-contact" data-call="' + contact.id + '">' +
        '<div class="cc-avatar" style="background:' + contact.color + '">' + contact.avatar + "</div>" +
        '<div class="cc-info"><div class="cc-name">' + contact.name + "</div>" +
        '<div class="cc-role">' + contact.role + "</div></div>" +
        '<button class="cc-call-btn" aria-label="Call ' + contact.name + '" data-ic="call"></button>' +
        "</div>";
    }).join("");

    list.querySelectorAll(".call-contact").forEach(function (row) {
      row.addEventListener("click", function () {
        startCall(row.dataset.call);
      });
    });
  }

  function startCall(contactId) {
    var contact = window.VSDialogue.getContact(contactId);
    var callScreen = phone.querySelector(".phone-call-screen");
    if (!contact || !callScreen) return;

    currentContact = contact;
    stopSpeech();

    var avatar = callScreen.querySelector(".call-avatar-ring");
    var nameEl = callScreen.querySelector(".call-name");
    var statusEl = callScreen.querySelector(".call-status");
    var timerEl = callScreen.querySelector(".call-timer");
    var captions = callScreen.querySelector(".call-captions");

    avatar.style.background = "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 35%), " + contact.color;
    avatar.textContent = contact.avatar;
    nameEl.textContent = contact.name;
    statusEl.textContent = "calling...";
    timerEl.textContent = "00:00";
    captions.innerHTML = "";

    callScreen.classList.add("active");
    phone.classList.add("phone-shake");
    setTimeout(function () { phone.classList.remove("phone-shake"); }, 700);

    if (callTimer) clearInterval(callTimer);
    setTimeout(function () {
      statusEl.textContent = "connected";
      callSeconds = 0;
      callTimer = setInterval(function () {
        callSeconds += 1;
        var mm = Math.floor(callSeconds / 60);
        var ss = callSeconds % 60;
        timerEl.textContent = (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
      }, 1000);
      playCallDialogue(contact, captions);
    }, 1300);
  }

  function playCallDialogue(contact, captions) {
    var lines = contact.callLines || [];
    var index = 0;

    function next() {
      if (index >= lines.length || !currentContact || currentContact.id !== contact.id) return;
      var line = lines[index++];
      var bubble = document.createElement("div");
      bubble.className = "caption-line them";
      captions.appendChild(bubble);
      bubble.classList.add("show");

      if (reduce) {
        bubble.textContent = line;
        speakLine(line);
        captions.scrollTop = captions.scrollHeight;
        setTimeout(next, 2300);
        return;
      }

      var cursor = 0;
      var tick = setInterval(function () {
        cursor += 1;
        bubble.textContent = line.slice(0, cursor);
        captions.scrollTop = captions.scrollHeight;
        if (cursor >= line.length) {
          clearInterval(tick);
          bubble.textContent = line;
          speakLine(line);
          setTimeout(next, 2300);
        }
      }, 28);
    }

    next();
  }

  function speakLine(text) {
    if (!("speechSynthesis" in window)) return;
    if (phone.querySelector(".call-btn.mute").classList.contains("active")) return;

    stopSpeech();
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = 1;
    currentUtterance.pitch = 1;
    currentUtterance.volume = phone.querySelector(".call-btn.speaker").classList.contains("active") ? 1 : 0.75;
    window.speechSynthesis.speak(currentUtterance);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    currentUtterance = null;
  }

  function toggleMute(btn) {
    btn.classList.toggle("active");
    if (btn.classList.contains("active")) {
      stopSpeech();
      showToast("Call muted");
    } else {
      showToast("Mute off");
    }
  }

  function toggleSpeaker(btn) {
    btn.classList.toggle("active");
    showToast(btn.classList.contains("active") ? "Speaker on" : "Speaker off");
  }

  function endCall(showEndedToast) {
    var callScreen = phone.querySelector(".phone-call-screen");
    if (callScreen) callScreen.classList.remove("active");
    if (callTimer) clearInterval(callTimer);
    callTimer = null;
    callSeconds = 0;
    stopSpeech();
    if (showEndedToast !== false) showToast(currentContact ? "Call ended with " + currentContact.name : "Call ended");
    currentContact = null;
  }

  function simulateIncomingCall() {
    if (incomingCallTimer) {
      clearTimeout(incomingCallTimer);
      incomingCallTimer = null;
    }
    sessionStorage.setItem("vs-incoming-call-done", "1");
    var banner = phone.querySelector(".phone-incoming-banner");
    if (!banner) return;
    banner.classList.add("show");
    phone.classList.add("phone-shake");
    setTimeout(function () { phone.classList.remove("phone-shake"); }, 700);
    setTimeout(function () { banner.classList.remove("show"); }, 8000);
  }

  function answerIncomingCall() {
    var banner = phone.querySelector(".phone-incoming-banner");
    if (banner) banner.classList.remove("show");
    startCall("jarvis");
  }

  function buildMessageList() {
    var list = phone.querySelector(".msg-list");
    if (!list) return;
    var contacts = window.VSDialogue.getAllContacts();

    list.innerHTML = contacts.map(function (contact) {
      if (!msgThreads[contact.id]) {
        msgThreads[contact.id] = [{ text: contact.defaultReply, side: "them" }];
      }
      return '<div class="msg-thread" data-msg="' + contact.id + '">' +
        '<div class="mt-avatar" style="background:' + contact.color + '">' + contact.avatar + "</div>" +
        '<div class="mt-info"><div class="mt-name">' + contact.name + "</div>" +
        '<div class="mt-preview">' + contact.defaultReply.slice(0, 48) + "...</div></div></div>";
    }).join("");

    list.querySelectorAll(".msg-thread").forEach(function (thread) {
      thread.addEventListener("click", function () {
        openMessageThread(thread.dataset.msg);
      });
    });
  }

  function openMessageThread(contactId) {
    var contact = window.VSDialogue.getContact(contactId);
    var listScreen = phone.querySelector('.phone-app-screen[data-app="messages"]');
    var listView = listScreen.querySelector(".msg-list-view");
    var chatView = listScreen.querySelector(".msg-chat-view");
    var titleEl = chatView.querySelector(".phone-nav-title");
    var bubbles = chatView.querySelector(".msg-bubbles");
    var input = chatView.querySelector(".msg-input");
    var sendBtn = chatView.querySelector(".msg-send");
    if (!contact) return;

    titleEl.textContent = contact.name;
    bubbles.innerHTML = "";
    msgThreads[contactId].forEach(function (msg, index) {
      var bubble = document.createElement("div");
      bubble.className = "msg-bubble " + msg.side;
      bubble.textContent = msg.text;
      bubbles.appendChild(bubble);
      setTimeout(function () { bubble.classList.add("show"); }, reduce ? 0 : index * 70);
    });

    listView.classList.add("hidden-left");
    chatView.classList.remove("hidden-right");
    chatView.classList.add("active");
    bubbles.scrollTop = bubbles.scrollHeight;

    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;

      var ownBubble = document.createElement("div");
      ownBubble.className = "msg-bubble you show";
      ownBubble.textContent = text;
      bubbles.appendChild(ownBubble);
      msgThreads[contactId].push({ text: text, side: "you" });
      input.value = "";
      bubbles.scrollTop = bubbles.scrollHeight;

      setTimeout(function () {
        var reply = window.VSDialogue.getReply(contactId, text);
        var replyBubble = document.createElement("div");
        replyBubble.className = "msg-bubble them show";
        bubbles.appendChild(replyBubble);
        msgThreads[contactId].push({ text: reply, side: "them" });

        if (reduce) {
          replyBubble.textContent = reply;
          return;
        }

        var cursor = 0;
        var tick = setInterval(function () {
          cursor += 1;
          replyBubble.textContent = reply.slice(0, cursor);
          bubbles.scrollTop = bubbles.scrollHeight;
          if (cursor >= reply.length) clearInterval(tick);
        }, 18);
      }, 500);
    }

    sendBtn.onclick = sendMessage;
    input.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    };
  }

  function renderAllBrowsers() {
    phone.querySelectorAll(".phone-browser-body").forEach(function (body) {
      renderBrowser(body);
    });
  }

  function renderBrowser(body) {
    if (!body) return;
    body.classList.add("browser-shell");

    if (browserCache) {
      fillBrowser(body, browserCache);
      return;
    }

    body.innerHTML = '<div class="gh-skeleton" style="height:56px"></div>' +
      '<div class="gh-skeleton" style="height:112px"></div>' +
      '<div class="gh-skeleton" style="height:38px"></div>';

    fetch(apiRepoUrl)
      .then(function (res) { return res.json(); })
      .then(function (repo) {
        return fetch(apiRepoUrl + "/releases/latest")
          .then(function (res) { return res.json(); })
          .catch(function () { return {}; })
          .then(function (release) {
            browserCache = {
              name: repo.full_name || "Cookie774-GameDev/VibeSpace",
              description: repo.description || "The AI workspace where every model, agent, voice, and task lives under one roof.",
              stars: repo.stargazers_count || 0,
              forks: repo.forks_count || 0,
              language: repo.language || "TypeScript",
              updated: repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : "recently",
              topics: repo.topics && repo.topics.length ? repo.topics : ["ai", "desktop", "voice", "agents"],
              version: release.tag_name || "latest",
              created: repo.created_at ? new Date(repo.created_at).getFullYear() : "2025"
            };
            fillBrowser(body, browserCache);
            phone.querySelectorAll(".phone-browser-body").forEach(function (panel) {
              if (panel !== body) fillBrowser(panel, browserCache);
            });
          });
      })
      .catch(function () {
        browserCache = {
          name: "Cookie774-GameDev/VibeSpace",
          description: "The AI workspace where every model, agent, voice, and task lives under one roof.",
          stars: "Live",
          forks: "Repo",
          language: "TypeScript",
          updated: "recently",
          topics: ["ai", "desktop", "voice", "agents"],
          version: "latest",
          created: "2025"
        };
        fillBrowser(body, browserCache);
      });
  }

  function fillBrowser(body, data) {
    var topicHtml = data.topics.map(function (topic) {
      return '<span style="display:inline-block;padding:4px 8px;margin:0 6px 6px 0;border-radius:999px;background:rgba(88,166,255,0.14);color:#c9d1d9;font-size:10px;font-weight:700">' + topic + "</span>";
    }).join("");

    body.innerHTML = '<div style="padding:14px;border:1px solid #30363d;border-radius:16px;background:#0d1117">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
      '<div><div style="font-size:12px;color:#8b949e;margin-bottom:4px">GitHub</div>' +
      '<div style="font-size:17px;color:#f0f6fc;font-weight:700;line-height:1.25">' + data.name + "</div></div>" +
      '<div style="padding:6px 10px;border-radius:999px;background:#161b22;color:#58a6ff;font-size:10px;font-weight:700">' + data.version + "</div></div>" +
      '<div style="margin-top:10px;font-size:12px;color:#c9d1d9;line-height:1.55">' + data.description + "</div>" +
      '<div style="margin-top:10px">' + topicHtml + "</div>" +
      '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">' +
      metricCard("Stars", data.stars) + metricCard("Forks", data.forks) + metricCard("Lang", data.language) + metricCard("Since", data.created) +
      "</div>" +
      '<div style="margin-top:12px;padding:10px 12px;border-radius:12px;background:#161b22;border:1px solid #21262d;color:#8b949e;font-size:11px">Last updated ' + data.updated + ". Open the full GitHub page for the live repo view.</div>" +
      '<a class="gh-link" href="' + repoUrl + '" target="_blank" rel="noopener">Open live GitHub page</a>' +
      "</div>";
  }

  function metricCard(label, value) {
    return '<div style="min-width:56px;padding:8px 10px;border-radius:12px;background:#161b22;border:1px solid #21262d">' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8b949e">' + label + "</div>" +
      '<div style="font-size:13px;color:#f0f6fc;font-weight:700;margin-top:4px">' + value + "</div></div>";
  }

  function openGitHubPage() {
    window.open(repoUrl, "_blank", "noopener");
  }

  function initDialPad() {
    var display = phone.querySelector(".dialpad-display");
    if (!display) return;

    phone.querySelectorAll(".dial-key").forEach(function (key) {
      key.onclick = function () {
        if (display.textContent.length < 14) display.textContent += key.dataset.key;
      };
    });

    var callBtn = phone.querySelector(".dial-call-btn");
    if (callBtn) {
      callBtn.onclick = function () {
        if (!display.textContent.trim()) return;
        showToast("Dialing " + display.textContent + "...");
        setTimeout(function () { startCall("jarvis"); }, 450);
      };
    }
  }

  function initSettings() {
    var timeInput = phone.querySelector(".ps-time-input");
    if (timeInput) {
      timeInput.value = sessionStorage.getItem("vs-phone-time") || "";
      timeInput.onchange = function () {
        sessionStorage.setItem("vs-phone-time", timeInput.value);
        updateTime();
        showToast("Phone time updated");
      };
    }
  }

  function initPhotos() {
    var stored = sessionStorage.getItem("vs-phone-photos");
    if (stored) {
      try {
        photos = JSON.parse(stored);
      } catch (err) {
        photos = [];
      }
    }

    if (!photos.length) {
      photos = [
        { label: "Desk", gradient: "linear-gradient(135deg,#B5613A,#8f4422)" },
        { label: "Build", gradient: "linear-gradient(135deg,#6F8F66,#3d5c35)" },
        { label: "Repo", gradient: "linear-gradient(135deg,#4285F4,#1a5cc7)" },
        { label: "Voice", gradient: "linear-gradient(135deg,#B98AE8,#7b4faf)" },
        { label: "Jarvis", gradient: "linear-gradient(135deg,#E8B860,#c4943a)" },
        { label: "Ship", gradient: "linear-gradient(135deg,#4DD8E8,#1f96a3)" }
      ];
      persistPhotos();
    }
    renderPhotos();
  }

  function renderPhotos() {
    var grid = phone.querySelector(".photos-grid");
    var feature = phone.querySelector(".photo-feature-preview");
    if (!grid || !feature) return;

    feature.style.background = photos[0] ? photos[0].gradient : "linear-gradient(135deg,#4DD8E8,#B98AE8,#E8B860)";

    grid.innerHTML = photos.map(function (photo, index) {
      return '<button class="photo-tile" type="button" data-photo-index="' + index + '" data-label="' + photo.label + '" style="background:' + photo.gradient + ';border:none"></button>';
    }).join("");

    grid.querySelectorAll(".photo-tile").forEach(function (tile) {
      tile.addEventListener("click", function () {
        var photo = photos[parseInt(tile.dataset.photoIndex, 10)];
        feature.style.background = photo.gradient;
        showToast("Opened " + photo.label);
      });
    });
  }

  function takePhoto() {
    var labels = ["Sunset", "Workspace", "Launch", "UI", "Repo", "Build"];
    var palette = [
      "linear-gradient(135deg,#F55036,#c4321a)",
      "linear-gradient(135deg,#10A37F,#0a7a5e)",
      "linear-gradient(135deg,#4DD8E8,#1f96a3)",
      "linear-gradient(135deg,#E8B860,#c4943a)",
      "linear-gradient(135deg,#B98AE8,#7b4faf)"
    ];
    var photo = {
      label: labels[Math.floor(Math.random() * labels.length)],
      gradient: palette[Math.floor(Math.random() * palette.length)]
    };
    photos.unshift(photo);
    photos = photos.slice(0, 12);
    persistPhotos();
    renderPhotos();
    showToast("Photo captured");
  }

  function persistPhotos() {
    sessionStorage.setItem("vs-phone-photos", JSON.stringify(photos));
  }

  function initGames() {
    var flappyGame = phone.querySelector(".flappy-game");
    if (flappyGame) {
      flappyGame.addEventListener("click", function () {
        if (flappyState && flappyState.running) flappyFlap();
      });
    }

    snakeState = {
      canvas: phone.querySelector(".snake-canvas"),
      direction: "right",
      nextDirection: "right",
      interval: null,
      score: 0,
      cells: 12,
      snake: [{ x: 2, y: 6 }, { x: 1, y: 6 }],
      food: { x: 8, y: 6 }
    };
    renderSnake();

    phone.querySelectorAll(".snake-btn[data-dir]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSnakeDirection(btn.dataset.dir);
      });
    });
  }

  function startFlappyGame() {
    var root = phone.querySelector(".flappy-game");
    if (!root) return;

    if (flappyState && flappyState.raf) cancelAnimationFrame(flappyState.raf);

    flappyState = {
      root: root,
      bird: root.querySelector(".flappy-bird"),
      topPipe: root.querySelector(".pipe-top"),
      bottomPipe: root.querySelector(".pipe-bottom"),
      overlay: root.querySelector(".flappy-overlay"),
      scoreEl: phone.querySelector(".flappy-score"),
      raf: null,
      running: true,
      velocity: 0,
      y: 98,
      pipeX: 180,
      gapTop: 70,
      score: 0,
      passed: false
    };

    if (flappyState.scoreEl) flappyState.scoreEl.textContent = "0";
    flappyState.overlay.textContent = "Tap anywhere in the game to flap.";

    stepFlappy();
  }

  function flappyFlap() {
    if (!flappyState) return;
    flappyState.velocity = -5.4;
  }

  function stepFlappy() {
    if (!flappyState || !flappyState.running) return;

    flappyState.velocity += 0.28;
    flappyState.y += flappyState.velocity;
    flappyState.pipeX -= 2.8;

    if (flappyState.pipeX < -42) {
      flappyState.pipeX = 216;
      flappyState.gapTop = 42 + Math.random() * 88;
      flappyState.passed = false;
    }

    if (!flappyState.passed && flappyState.pipeX + 42 < 52) {
      flappyState.passed = true;
      flappyState.score += 1;
      if (flappyState.scoreEl) flappyState.scoreEl.textContent = String(flappyState.score);
    }

    var gapBottom = flappyState.gapTop + 76;
    flappyState.bird.style.top = flappyState.y + "px";
    flappyState.bird.style.transform = "rotate(" + Math.max(-25, Math.min(60, flappyState.velocity * 8)) + "deg)";
    flappyState.topPipe.style.right = (216 - flappyState.pipeX) + "px";
    flappyState.bottomPipe.style.right = (216 - flappyState.pipeX) + "px";
    flappyState.topPipe.style.height = flappyState.gapTop + "px";
    flappyState.bottomPipe.style.height = (230 - gapBottom) + "px";

    if (
      flappyState.y < 0 ||
      flappyState.y > 206 ||
      ((flappyState.pipeX < 82 && flappyState.pipeX + 42 > 52) &&
      (flappyState.y < flappyState.gapTop - 18 || flappyState.y + 24 > gapBottom))
    ) {
      flappyState.running = false;
      flappyState.overlay.textContent = "Game over. Tap Play to restart.";
      cancelAnimationFrame(flappyState.raf);
      return;
    }

    flappyState.raf = requestAnimationFrame(stepFlappy);
  }

  function startSnakeGame() {
    if (!snakeState) return;
    if (snakeState.interval) clearInterval(snakeState.interval);

    snakeState.direction = "right";
    snakeState.nextDirection = "right";
    snakeState.score = 0;
    snakeState.snake = [{ x: 2, y: 6 }, { x: 1, y: 6 }];
    snakeState.food = randomFood();
    updateSnakeScore();
    renderSnake();

    snakeState.interval = setInterval(function () {
      snakeState.direction = snakeState.nextDirection;
      var head = Object.assign({}, snakeState.snake[0]);
      if (snakeState.direction === "up") head.y -= 1;
      if (snakeState.direction === "down") head.y += 1;
      if (snakeState.direction === "left") head.x -= 1;
      if (snakeState.direction === "right") head.x += 1;

      if (hitSnakeWall(head) || hitSnakeBody(head)) {
        clearInterval(snakeState.interval);
        snakeState.interval = null;
        showToast("Snake crashed");
        return;
      }

      snakeState.snake.unshift(head);
      if (head.x === snakeState.food.x && head.y === snakeState.food.y) {
        snakeState.score += 1;
        updateSnakeScore();
        snakeState.food = randomFood();
      } else {
        snakeState.snake.pop();
      }
      renderSnake();
    }, 220);
  }

  function setSnakeDirection(dir) {
    if (!snakeState) return;
    var opposite = {
      up: "down",
      down: "up",
      left: "right",
      right: "left"
    };
    if (opposite[dir] === snakeState.direction) return;
    snakeState.nextDirection = dir;
  }

  function randomFood() {
    var food;
    do {
      food = {
        x: Math.floor(Math.random() * snakeState.cells),
        y: Math.floor(Math.random() * snakeState.cells)
      };
    } while (snakeState.snake.some(function (segment) {
      return segment.x === food.x && segment.y === food.y;
    }));
    return food;
  }

  function hitSnakeWall(head) {
    return head.x < 0 || head.y < 0 || head.x >= snakeState.cells || head.y >= snakeState.cells;
  }

  function hitSnakeBody(head) {
    return snakeState.snake.some(function (segment) {
      return segment.x === head.x && segment.y === head.y;
    });
  }

  function renderSnake() {
    if (!snakeState || !snakeState.canvas) return;
    var ctx = snakeState.canvas.getContext("2d");
    var cell = snakeState.canvas.width / snakeState.cells;

    ctx.clearRect(0, 0, snakeState.canvas.width, snakeState.canvas.height);
    ctx.fillStyle = "#182224";
    ctx.fillRect(0, 0, snakeState.canvas.width, snakeState.canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (var i = 0; i <= snakeState.cells; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, snakeState.canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(snakeState.canvas.width, i * cell);
      ctx.lineTo(snakeState.canvas.width, i * cell);
      ctx.stroke();
    }

    ctx.fillStyle = "#d68a4e";
    ctx.fillRect(snakeState.food.x * cell + 4, snakeState.food.y * cell + 4, cell - 8, cell - 8);

    snakeState.snake.forEach(function (segment, index) {
      ctx.fillStyle = index === 0 ? "#9cc68b" : "#7aa869";
      ctx.fillRect(segment.x * cell + 3, segment.y * cell + 3, cell - 6, cell - 6);
    });
  }

  function updateSnakeScore() {
    var scoreEl = phone.querySelector(".snake-score");
    if (scoreEl) scoreEl.textContent = String(snakeState.score);
  }

  function showToast(message) {
    var toast = phone.querySelector(".phone-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  function initNotes() {
    var list = phone.querySelector(".notes-list");
    var stored = sessionStorage.getItem("vs-phone-notes");
    var notes = stored ? JSON.parse(stored) : [
      { title: "Ship auth fix", body: "Token refresh is patched. Critic approved the diff.", color: "#E0925C" },
      { title: "Voice ideas", body: "Wake word in hands-free mode only. Keep Kokoro local.", color: "#9CC68B" },
      { title: "Hive tuning", body: "Fast stack drafts. Critic refines. Ship after smoke test.", color: "#B98AE8" }
    ];
    sessionStorage.setItem("vs-phone-notes", JSON.stringify(notes));

    list.innerHTML = notes.map(function (note) {
      return '<div class="notif-card" style="border-left:3px solid ' + note.color + '">' +
        '<div style="font-weight:700;font-size:14px;color:var(--fg)">' + note.title + "</div>" +
        '<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4">' + note.body + "</div></div>";
    }).join("");
  }

  function initVibeCast() {
    var body = phone.querySelector(".vibecast-body");
    if (!body) return;
    var vibes = [
      { temp: "72", label: "Peak Vibe", desc: "Everything is shipping. Council is aligned." },
      { temp: "68", label: "Cozy Focus", desc: "Deep work mode. Jarvis is on standby." },
      { temp: "65", label: "Late Night", desc: "Builds are noisy. Voice is still calm." }
    ];
    var vibe = vibes[Math.floor(Math.random() * vibes.length)];
    body.innerHTML = '<div style="font-family:Fraunces,serif;font-size:48px;font-weight:300;color:var(--copper-soft);line-height:1">' + vibe.temp + '</div>' +
      '<div style="font-size:13px;color:var(--faint);margin-bottom:20px">vibes in the workspace</div>' +
      '<div style="font-size:20px;font-weight:600;color:var(--fg);font-family:Fraunces,serif;margin-bottom:8px">' + vibe.label + "</div>" +
      '<div style="font-size:13px;color:var(--muted);line-height:1.6;max-width:220px;margin:0 auto">' + vibe.desc + "</div>";
  }

  function initNotifications() {
    var list = phone.querySelector(".notif-list");
    if (!list) return;
    var items = [
      "Build succeeded across all panes",
      "Jarvis queued a morning summary",
      "Critic approved your auth patch",
      "Hive fast stack finished in 200ms"
    ];
    list.innerHTML = items.map(function (item) {
      return '<div class="notif-card"><div style="font-size:12px;color:var(--muted)">' + item + "</div></div>";
    }).join("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
