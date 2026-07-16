(function () {
  'use strict';

  var ROOT_ID = 'vibespaceOrigamiWorld';
  var MEDIA_ROOT = 'images/origami-scroll';

  var sections = [
    {
      id: 'network', label: 'Network', displayNumber: 1,
      still: MEDIA_ROOT + '/source/scene-01-network.png',
      clip: MEDIA_ROOT + '/dives/scene-01-network.mp4',
      accent: '#dd7d62', scroll: 1.7, linger: 0.28,
      eyebrow: 'VibeSpace Network', title: 'One connected world.',
      body: 'Every model, agent, voice, project, and task meets at one calm center.',
      tags: ['Models', 'Agents', 'Projects']
    },
    {
      id: 'voice', label: 'Jarvis Voice', displayNumber: 2,
      still: MEDIA_ROOT + '/source/scene-02-jarvis-voice.png',
      clip: MEDIA_ROOT + '/dives/scene-02-jarvis-voice.mp4',
      accent: '#d96f5b', scroll: 1.65, linger: 0.3,
      eyebrow: 'Jarvis Voice', title: 'Speak. Build. Keep moving.',
      body: 'Natural voice, live context, and a local-first assistant that stays with the work.',
      tags: ['Voice', 'Local-first', 'Hands-free']
    },
    {
      id: 'terminal', label: 'Terminal', displayNumber: 3,
      still: MEDIA_ROOT + '/source/scene-03-terminal-workshop.png',
      clip: MEDIA_ROOT + '/dives/scene-03-terminal-workshop.mp4',
      accent: '#8b67ac', scroll: 1.7, linger: 0.28,
      eyebrow: 'Terminal Workshop', title: 'A workshop for real agents.',
      body: 'Run coordinated terminals, inspect every command, and keep the whole build visible.',
      tags: ['Terminal swarm', 'Commands', 'Review']
    },
    {
      id: 'actions', label: 'Actions', displayNumber: 4,
      still: MEDIA_ROOT + '/source/scene-04-jarvis-actions.png',
      clip: MEDIA_ROOT + '/dives/scene-04-jarvis-actions.mp4',
      accent: '#de8467', scroll: 1.6, linger: 0.32,
      eyebrow: 'Jarvis Actions', title: 'Time becomes a tool.',
      body: 'Schedule work, approve actions, and let Jarvis carry the right task into the right moment.',
      tags: ['Schedule', 'Approvals', 'Automation']
    },
    {
      id: 'memory', label: 'Deep Context', displayNumber: 5,
      still: MEDIA_ROOT + '/source/scene-05-context-memory.png',
      clip: MEDIA_ROOT + '/dives/scene-05-context-memory.mp4',
      accent: '#6f9c83', scroll: 1.85, linger: 0.36,
      eyebrow: 'Deep Context', title: 'It remembers what matters.',
      body: 'Projects, documents, preferences, and personal knowledge become a living context garden.',
      tags: ['Memory', 'Documents', 'Personal context']
    },
    {
      id: 'workspace-outro', label: 'Deep Context', displayNumber: 5,
      showInNavigation: false,
      still: MEDIA_ROOT + '/source/scene-05-outro-workspace.png',
      clip: MEDIA_ROOT + '/dives/scene-05-outro-workspace.mp4',
      accent: '#dd795f', scroll: 1.7, linger: 0.22,
      eyebrow: 'Your VibeSpace', title: 'Everything comes together in your space.',
      body: 'One workspace that understands the work, the tools, and the person behind them.',
      cta: {
        primary: { label: 'Download VibeSpace', href: '#download' },
        secondary: { label: 'Explore features', href: '#features' }
      }
    }
  ];

  var connectors = [
    MEDIA_ROOT + '/connectors/scene-01-to-02.mp4',
    MEDIA_ROOT + '/connectors/scene-02-to-03.mp4',
    MEDIA_ROOT + '/connectors/scene-03-to-04.mp4',
    MEDIA_ROOT + '/connectors/scene-04-to-05.mp4',
    MEDIA_ROOT + '/connectors/scene-05-to-outro.mp4'
  ];

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
