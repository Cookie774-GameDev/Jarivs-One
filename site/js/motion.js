/* VibeSpace site — motion controller
 * Vanilla JS + IntersectionObserver. No dependencies.
 * Respects prefers-reduced-motion.
 */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;

  // ---- Nav scroll blur + burger ----
  var nav = document.getElementById("nav");
  function onScroll() {
    if (nav) nav.classList.toggle("scrolled", scrollY > 12);
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var burger = document.getElementById("navBurger");
  var navLinks = document.getElementById("navLinks");
  if (burger && navLinks) {
    burger.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ---- Cursor glow (pointer:fine only) ----
  if (!reduce && matchMedia("(pointer:fine)").matches) {
    var glow = document.getElementById("cursor-glow");
    if (glow) {
      addEventListener("pointermove", function (e) {
        glow.style.opacity = "1";
        glow.style.left = e.clientX + "px";
        glow.style.top = e.clientY + "px";
      });
    }
  }

  // ---- IntersectionObserver reveal system ----
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal, .reveal-stagger, .agents-loop").forEach(function (el) {
    io.observe(el);
  });

  // ---- Hero entrance sequence ----
  function heroSequence() {
    var h1 = document.querySelector(".hero h1");
    var lead = document.querySelector(".hero .lead");
    var cta = document.querySelector(".hero-cta");
    var meta = document.querySelector(".hero-meta");

    // Stagger words in H1
    if (h1 && !reduce) {
      var words = h1.querySelectorAll(".word");
      words.forEach(function (w, i) {
        w.style.transitionDelay = i * 80 + "ms";
      });
    }
    var t0 = reduce ? 0 : 200;
    var t1 = reduce ? 0 : 500;
    var t2 = reduce ? 0 : 900;
    var t3 = reduce ? 0 : 1200;

    setTimeout(function () { if (h1) h1.classList.add("in"); }, t0);
    setTimeout(function () { if (lead) lead.classList.add("in"); }, t1);
    setTimeout(function () { if (cta) cta.classList.add("in"); }, t2);
    setTimeout(function () { if (meta) meta.classList.add("in"); }, t3);
  }

  // ---- Simulator tab switcher (mobile) ----
  document.querySelectorAll(".sim-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".sim-tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var sim = tab.dataset.sim;
      document.querySelectorAll(".sim-panel").forEach(function (p) {
        p.classList.toggle("active", p.id === "sim" + sim.charAt(0).toUpperCase() + sim.slice(1));
      });
    });
  });

  // ---- Magnetic buttons (primary CTAs) ----
  if (!reduce && matchMedia("(pointer:fine)").matches) {
    document.querySelectorAll(".btn.primary").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = "translate(" + x * 0.15 + "px," + y * 0.15 + "px) translateY(-2px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
  }

  // ---- 3D card tilt ----
  if (!reduce && matchMedia("(pointer:fine)").matches) {
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = "perspective(800px) rotateY(" + x * 6 + "deg) rotateX(" + -y * 6 + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  // ---- Install tabs + copy ----
  var COMMANDS = {
    windows: { prompt: "PS>", cmd: "irm https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.ps1 | iex" },
    macos: { prompt: "$", cmd: "curl -fsSL https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.sh | bash" },
    linux: { prompt: "$", cmd: "curl -fsSL https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.sh | bash" }
  };
  var installCmd = document.getElementById("installCmd");
  var installPrompt = document.getElementById("installPrompt");
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var c = COMMANDS[tab.dataset.os];
      if (!c || !installCmd) return;
      installPrompt.textContent = c.prompt;
      installCmd.textContent = c.cmd;
    });
  });

  // Copy buttons
  document.querySelectorAll(".copy, .copybtn").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var sel = btn.dataset.copyTarget;
      var el = sel ? document.getElementById(sel) : document.getElementById("installCmd");
      if (!el) return;
      try {
        await navigator.clipboard.writeText(el.textContent.trim());
        var old = btn.textContent;
        btn.textContent = "copied";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = old; btn.classList.remove("done"); }, 1300);
      } catch (e) {
        btn.textContent = "press Ctrl+C";
        setTimeout(function () { btn.textContent = old; }, 1300);
      }
    });
  });

  // ---- Pinned storytelling section ----
  var pinSteps = document.querySelectorAll(".pin-step");
  var pinDots = document.querySelectorAll(".pin-dot");
  var pinIndex = 0;
  function showPin(i) {
    if (i < 0 || i >= pinSteps.length) return;
    pinSteps.forEach(function (s, idx) { s.classList.toggle("active", idx === i); });
    pinDots.forEach(function (d, idx) { d.classList.toggle("active", idx === i); });
    pinIndex = i;
  }
  if (pinSteps.length > 0) {
    pinDots.forEach(function (d, idx) {
      d.addEventListener("click", function () { showPin(idx); });
    });
    // Auto-advance when section in view (scroll-jack lite)
    var pinSection = document.getElementById("story");
    if (pinSection && !reduce) {
      var autoTimer = null;
      var pinIo = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting && e[0].intersectionRatio > 0.4) {
          if (!autoTimer) {
            autoTimer = setInterval(function () {
              showPin((pinIndex + 1) % pinSteps.length);
            }, 2600);
          }
        } else {
          if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
        }
      }, { threshold: [0, 0.4, 0.6] });
      pinIo.observe(pinSection);
    }
  }

  // ---- Live swarm: 10 streaming terminals ----
  var liveSwarm = document.getElementById("liveSwarm");
  if (liveSwarm) {
    var swarmStarted = false;
    var swarmIo = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting && !swarmStarted) {
        swarmStarted = true;
        startLiveSwarm();
        swarmIo.unobserve(e[0].target);
      }
    }, { threshold: 0.1 });
    swarmIo.observe(liveSwarm);
  }

  function startLiveSwarm() {
    var panes = document.querySelectorAll(".live-swarm-pane");
    var tools = { codex: "codex", claude: "claude", opencode: "opencode" };
    var roles = { scout: "scout", builder: "builder", reviewer: "reviewer", critic: "critic" };

    var lineBank = {
      scout: [
        { t: "$ scout scan src/", c: "mu" },
        { t: "  scanning 247 files...", c: "" },
        { t: "  + 3 files changed", c: "ok" },
        { t: "    auth.ts:42 +12 -3", c: "" },
        { t: "    api.ts:8 -3", c: "" },
        { t: "    utils.ts:15 +5", c: "" },
        { t: "  -> routing to builder", c: "cu" },
        { t: "$ scout find --untested", c: "mu" },
        { t: "  6 files with < 50% coverage", c: "" },
        { t: "  auth.ts: 42% -> needs tests", c: "" },
        { t: "  + scout done, handing off", c: "ok" }
      ],
      builder: [
        { t: "$ builder patch auth.ts", c: "mu" },
        { t: "  + add token refresh logic", c: "ok" },
        { t: "  + add error boundary", c: "ok" },
        { t: "  + null guard on line 42", c: "ok" },
        { t: "  writing test: auth.test.ts", c: "" },
        { t: "  + test: refresh returns 200", c: "ok" },
        { t: "  + test: expired token handled", c: "ok" },
        { t: "  running tsc --noEmit...", c: "" },
        { t: "  + 0 errors, 0 warnings", c: "ok" },
        { t: "  -> ready for review", c: "cu" },
        { t: "$ builder run --format", c: "mu" },
        { t: "  prettier --write src/", c: "" },
        { t: "  + 3 files formatted", c: "ok" }
      ],
      reviewer: [
        { t: "$ reviewer diff auth.ts", c: "mu" },
        { t: "  checking +12 -3 lines...", c: "" },
        { t: "  ! missing test: null token", c: "err" },
        { t: "  ! edge: refresh on offline", c: "err" },
        { t: "  + good: error boundary added", c: "ok" },
        { t: "  + good: type-safe guard", c: "ok" },
        { t: "  -> 2 issues, blocking merge", c: "cu" },
        { t: "$ reviewer diff utils.ts", c: "mu" },
        { t: "  checking +5 lines...", c: "" },
        { t: "  + clean, approved", c: "ok" }
      ],
      critic: [
        { t: "$ critic synthesize", c: "mu" },
        { t: "  scanning council output...", c: "" },
        { t: "  scout: 3 files changed", c: "mu" },
        { t: "  builder: 4 patches applied", c: "mu" },
        { t: "  reviewer: 2 issues found", c: "mu" },
        { t: "  ! null token not handled", c: "err" },
        { t: "  ! offline refresh untested", c: "err" },
        { t: "  -> blocking ship", c: "cu" },
        { t: "  waiting for builder fix...", c: "" },
        { t: "  builder: null guard added", c: "ok" },
        { t: "  builder: offline test added", c: "ok" },
        { t: "  + all issues resolved", c: "ok" },
        { t: "  -> APPROVED, ship it", c: "ok" }
      ]
    };

    var toolPrefix = {
      codex: "$ codex",
      claude: "$ claude-code",
      opencode: "$ opencode"
    };

    panes.forEach(function (pane) {
      var tool = pane.dataset.tool;
      var role = pane.dataset.role;
      var paneIdx = pane.dataset.pane;
      var colorMap = { codex: "#E0925C", claude: "#B98AE8", opencode: "#4DD8E8" };

      // Build header
      pane.innerHTML =
        '<div class="lsp-head">' +
          '<span class="lsp-head-dot"></span>' +
          '<span class="lsp-head-tool">' + tool + '</span>' +
          '<span class="lsp-head-role">/' + role + ' #' + (parseInt(paneIdx) + 1) + '</span>' +
        '</div>' +
        '<div class="lsp-body"></div>';

      var body = pane.querySelector(".lsp-body");
      var lines = lineBank[role] || lineBank.scout;
      var lineIdx = 0;
      var lineCount = 0;

      function addLine() {
        // Cycle through the line bank
        var line = lines[lineIdx % lines.length];
        lineIdx++;

        // Add tool prefix to first line of each cycle
        var text = line.t;
        if (lineIdx % lines.length === 1) {
          var div = document.createElement("div");
          div.className = "lsp-ln pr";
          div.textContent = toolPrefix[tool] + " #" + (Math.floor(lineIdx / lines.length) + 1);
          body.appendChild(div);
        }

        var div = document.createElement("div");
        div.className = "lsp-ln " + (line.c || "");
        div.textContent = text;
        body.appendChild(div);

        // Keep max 40 lines visible (auto-scroll)
        while (body.children.length > 40) {
          body.removeChild(body.firstChild);
        }
        body.scrollTop = body.scrollHeight;

        lineCount++;
        // Stop after 60+ seconds (~120+ lines at 2/s)
        if (lineCount < 150) {
          // Random delay 400-1200ms for variety
          var delay = 300 + Math.random() * 700;
          setTimeout(addLine, delay);
        } else {
          // Add a final "done" line and blinking cursor
          var done = document.createElement("div");
          done.className = "lsp-ln ok";
          done.textContent = "+ session complete (" + lineCount + " lines)";
          body.appendChild(done);
          body.scrollTop = body.scrollHeight;

          // Restart after 5s pause
          setTimeout(function () {
            lineCount = 0;
            lineIdx = 0;
            body.innerHTML = "";
            addLine();
          }, 5000);
        }
      }

      // Stagger start per pane
      setTimeout(addLine, parseInt(paneIdx) * 200);
    });
  }

  // ---- Legacy swarm panes ----
  var swarmPanes = document.querySelectorAll(".swarm-pane");
  if (swarmPanes.length && !reduce) {
    var swarmIo2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en, idx) {
        if (en.isIntersecting) {
          setTimeout(function () { en.target.classList.add("in"); }, idx * 150);
          swarmIo2.unobserve(en.target);
        }
      });
    }, { threshold: 0.15 });
    swarmPanes.forEach(function (p) { swarmIo2.observe(p); });
  } else {
    swarmPanes.forEach(function (p) { p.classList.add("in"); });
  }

  // ---- Powerup animation (21+ providers) ----
  var powerup = document.getElementById("powerupSection");
  if (powerup) {
    var puIo = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) {
        powerup.classList.add("on");
        puIo.unobserve(e[0].target);
      }
    }, { threshold: 0.25 });
    puIo.observe(powerup);
  }

  // ---- Parallax on orbs (scroll-linked, rAF throttled) ----
  if (!reduce) {
    var orbs = document.querySelectorAll(".orb");
    var ticking = false;
    addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var y = scrollY;
          orbs.forEach(function (orb, i) {
            var speed = (i + 1) * 0.03;
            orb.style.transform = "translateY(" + y * speed * 15 + "px)";
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ---- Hide placeholder links ----
  document.querySelectorAll('a[href="#discord-placeholder"], a[href="#youtube-placeholder"]').forEach(function (a) {
    a.style.display = "none";
  });

  // ---- Boot ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", heroSequence);
  } else {
    heroSequence();
  }
})();
