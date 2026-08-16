(function () {
  'use strict';

  var STORAGE_KEY = 'vibespace-site-appearance';
  var DEFAULT_APPEARANCE = 'default';
  var VIBESPACE_APPEARANCE = 'vibespace';
  var choices = [DEFAULT_APPEARANCE, VIBESPACE_APPEARANCE];

  function isAppearance(value) {
    return choices.indexOf(value) !== -1;
  }

  function pauseWorld(root) {
    if (!root) return;
    root.querySelectorAll('video').forEach(function (video) {
      try { video.pause(); } catch (error) {}
    });
  }

  function relayoutWorld(root) {
    requestAnimationFrame(function () {
      if (window.VibeSpaceOrigamiWorld && typeof window.VibeSpaceOrigamiWorld.layout === 'function') {
        window.VibeSpaceOrigamiWorld.layout();
      }

      var instance = root && (root.__vibespaceScrollWorld || root.__scrollWorldInstance);
      if (instance && typeof instance.layout === 'function') instance.layout();
      if (instance && typeof instance.read === 'function') instance.read();
    });
  }

  function activateWorld(root) {
    if (!root) return;
    root.dataset.cinematicReady = 'true';
    root.classList.remove('origami-world--fallback');

    if (!root.__vibespaceScrollWorld && window.VibeSpaceOrigamiWorld) {
      delete root.dataset.initialized;
      window.VibeSpaceOrigamiWorld.init();
    }

    relayoutWorld(root);
  }

  function updateUrl(appearance) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('appearance', appearance);
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (error) {}
  }

  function init() {
    var root = document.documentElement;
    var world = document.getElementById('vibespaceOrigamiWorld');
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-site-appearance-choice]'));
    var themeColor = document.querySelector('meta[name="theme-color"]');
    var appearance = isAppearance(root.dataset.siteAppearance)
      ? root.dataset.siteAppearance
      : DEFAULT_APPEARANCE;

    function render(nextAppearance, options) {
      options = options || {};
      appearance = isAppearance(nextAppearance) ? nextAppearance : DEFAULT_APPEARANCE;
      root.dataset.siteAppearance = appearance;

      buttons.forEach(function (button) {
        var selected = button.dataset.siteAppearanceChoice === appearance;
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });

      if (themeColor) {
        themeColor.setAttribute('content', appearance === VIBESPACE_APPEARANCE ? '#E9D4B7' : '#2E2823');
      }

      if (appearance === VIBESPACE_APPEARANCE) {
        activateWorld(world);
      } else {
        if (world) world.dataset.cinematicReady = 'false';
        pauseWorld(world);
      }

      if (options.persist) {
        try { localStorage.setItem('vibespace-site-appearance', appearance); } catch (error) {}
      }
      if (options.share) updateUrl(appearance);

      if (options.announce) {
        window.dispatchEvent(new CustomEvent('vibespace:appearancechange', {
          detail: { appearance: appearance },
        }));
      }
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        render(button.dataset.siteAppearanceChoice, {
          persist: true,
          share: true,
          announce: true,
        });
      });
    });

    render(appearance);
    window.VibeSpaceSiteAppearance = {
      get: function () { return appearance; },
      set: function (nextAppearance) {
        render(nextAppearance, { persist: true, share: true, announce: true });
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
