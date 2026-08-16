(function () {
  'use strict';

  var ROOT_ID = 'vibespaceOrigamiWorld';
  var MEDIA_ROOT = 'images/origami-scroll';
  var CINEMATIC_ROOT = MEDIA_ROOT + '/work/higgsfield-test';

  var sections = [
    {
      id: 'network', label: 'Network', displayNumber: 1,
      still: MEDIA_ROOT + '/source/scene-01-network.png',
      clip: 'images/origami-scroll/work/higgsfield-test/dives/scene-01-network.mp4',
      accent: '#dd7d62', scroll: 1.7, linger: 0.28,
      eyebrow: 'A world that thinks with you', title: 'Your ideas become a place.',
      body: 'VibeSpace connects every tool, thought, and conversation inside one living creative system.',
      tags: ['Connected intelligence', 'One creative world', 'Always in flow']
    },
    {
      id: 'voice', label: 'Jarvis Voice', displayNumber: 2,
      still: MEDIA_ROOT + '/source/scene-02-jarvis-voice.png',
      clip: 'images/origami-scroll/work/higgsfield-test/dives/scene-02-jarvis-voice.mp4',
      accent: '#d96f5b', scroll: 1.65, linger: 0.3,
      eyebrow: 'Conversation, with presence', title: 'Speak. It understands.',
      body: 'Jarvis listens with context, responds with personality, and turns natural conversation into momentum.',
      tags: ['Natural voices', 'Live context', 'Hands-free control']
    },
    {
      id: 'terminal', label: 'Terminal', displayNumber: 3,
      still: MEDIA_ROOT + '/source/scene-03-terminal-workshop.png',
      clip: 'images/origami-scroll/work/higgsfield-test/dives/scene-03-terminal-workshop.mp4',
      accent: '#8b67ac', scroll: 1.7, linger: 0.28,
      eyebrow: 'Power without the friction', title: 'Build at the speed of thought.',
      body: 'A visual command workshop turns complex tools into a clear, responsive place to create and ship.',
      tags: ['Agentic building', 'Live terminal', 'Creative automation']
    },
    {
      id: 'actions', label: 'Actions', displayNumber: 4,
      still: MEDIA_ROOT + '/source/scene-04-jarvis-actions.png',
      clip: 'images/origami-scroll/work/higgsfield-test/dives/scene-04-jarvis-actions.mp4',
      accent: '#de8467', scroll: 1.6, linger: 0.32,
      eyebrow: 'Intent becomes action', title: 'It remembers what comes next.',
      body: 'Plans, calls, reminders, and workflows move together—quietly orchestrated around your day.',
      tags: ['Smart scheduling', 'Connected actions', 'Proactive assistance']
    },
    {
      id: 'memory', label: 'Deep Context', displayNumber: 5,
      still: MEDIA_ROOT + '/source/scene-05-context-memory.png',
      clip: 'images/origami-scroll/work/higgsfield-test/dives/scene-05-context-memory.mp4',
      accent: '#6f9c83', scroll: 1.85, linger: 0.36,
      eyebrow: 'Memory with meaning', title: 'Nothing important gets lost.',
      body: 'Documents, projects, and past decisions flow into a shared context that becomes more useful over time.',
      tags: ['Long-term memory', 'Project context', 'Knowledge graph']
    },
    {
      id: 'workspace-outro', label: 'Deep Context', displayNumber: 5,
      showInNavigation: false,
      still: MEDIA_ROOT + '/source/scene-05-outro-workspace.png',
      clip: 'images/origami-scroll/work/higgsfield-test/dives/scene-05-outro-workspace.mp4',
      accent: '#dd795f', scroll: 1.7, linger: 0.22,
      eyebrow: 'One space, shaped around you', title: 'Welcome to your Living OS.',
      body: 'A personal world for creating, communicating, and getting things done—without losing the human feeling.',
      cta: {
        primary: { label: 'Download VibeSpace', href: '#download' },
        secondary: { label: 'Explore features', href: '#features' }
      }
    }
  ];

  var connectorDefinitions = [
    { clip: 'images/origami-scroll/work/higgsfield-test/connectors/scene-01-to-02.mp4' },
    { clip: 'images/origami-scroll/work/higgsfield-test/connectors/scene-02-to-03.mp4' },
    { clip: 'images/origami-scroll/work/higgsfield-test/connectors/scene-03-to-04.mp4' },
    { clip: 'images/origami-scroll/work/higgsfield-test/connectors/scene-04-to-05.mp4' },
    { clip: 'images/origami-scroll/work/higgsfield-test/connectors/scene-05-to-outro.mp4' }
  ];
  var connectors = connectorDefinitions.map(function (definition) { return definition.clip; });

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    // Only reduced-motion skips the scrub engine. Touch / coarse-pointer devices still
    // get the cinematic path — the engine already hardens phone seeking. Gating on
    // coarse pointer was forcing a static image stack on common Windows touch laptops.
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cinematicReady = root.dataset.cinematicReady === 'true';
    var canMount = typeof window.mountScrollWorld === 'function';

    if (!cinematicReady || reduced || !canMount) {
      root.classList.add('origami-world--fallback');
      root.dataset.mode = reduced ? 'reduced-motion' : !canMount ? 'engine-missing' : 'media-unavailable';
      return;
    }

    root.classList.add('origami-world--cinematic');
    root.dataset.mode = 'cinematic';
    var instance = window.mountScrollWorld(root, {
      brand: false,
      nav: false,
      atmosphere: true,
      hint: 'scroll to enter VibeSpace',
      visibleSectionCount: 5,
      diveScroll: 1.65,
      connScroll: 1.0,
      crossfade: 0.12,
      sections: sections,
      connectors: connectors
    });
    root.__vibespaceScrollWorld = instance;

    // Keep segment math aligned after late layout shifts (hero simulators, fonts, images).
    var relayoutTimer = 0;
    function relayout() {
      if (!instance || typeof instance.layout !== 'function') return;
      window.clearTimeout(relayoutTimer);
      relayoutTimer = window.setTimeout(function () { instance.layout(); }, 60);
    }
    window.addEventListener('load', relayout);
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(relayout);
      // Watch content above the world so late-growing hero chrome can't desync scrub.
      var prev = root.previousElementSibling;
      if (prev) ro.observe(prev);
    }
    // Warm the first clips in HTTP cache so the first dive is ready when the pin hits.
    [sections[0] && sections[0].clip, connectors[0], sections[1] && sections[1].clip]
      .filter(Boolean)
      .forEach(function (url) {
        try { fetch(url, { credentials: 'same-origin' }).catch(function () {}); } catch (e) {}
      });
    if (instance && typeof instance.read === 'function') instance.read();
  }

  window.VibeSpaceOrigamiWorld = { init: init, sections: sections, connectors: connectors };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
