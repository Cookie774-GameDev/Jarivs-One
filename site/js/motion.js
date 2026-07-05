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

  // ---- Swarm panes reveal ----
  var swarmPanes = document.querySelectorAll(".swarm-pane");
  if (swarmPanes.length && !reduce) {
    var swarmIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en, idx) {
        if (en.isIntersecting) {
          setTimeout(function () { en.target.classList.add("in"); }, idx * 150);
          swarmIo.unobserve(en.target);
        }
      });
    }, { threshold: 0.15 });
    swarmPanes.forEach(function (p) { swarmIo.observe(p); });
  } else {
    swarmPanes.forEach(function (p) { p.classList.add("in"); });
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
