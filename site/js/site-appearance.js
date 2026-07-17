(function () {
  'use strict';

  var STORAGE_KEY = 'vibespace-site-appearance';
  var root = document.documentElement;
  var choices = ['default', 'vibespace'];

  function normalise(value) {
    return choices.indexOf(value) !== -1 ? value : null;
  }

  function readStored() {
    try { return normalise(window.localStorage.getItem(STORAGE_KEY)); }
    catch (_) { return null; }
  }

  function readQuery() {
    return normalise(new URLSearchParams(window.location.search).get('appearance'));
  }

  function syncControls(value) {
    document.querySelectorAll('[data-appearance-choice]').forEach(function (button) {
      var selected = button.getAttribute('data-appearance-choice') === value;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.classList.toggle('active', selected);
    });
  }

  function syncThemeColor(value) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', value === 'vibespace' ? '#E9D4B7' : '#2E2823');
  }

  function syncUrl(value) {
    var url = new URL(window.location.href);
    url.searchParams.set('appearance', value);
    window.history.replaceState(window.history.state, '', url.toString());
  }

  function relayoutOrigami() {
    function layout() {
      var world = document.getElementById('vibespaceOrigamiWorld');
      var controller = world && world.__vibespaceScrollWorld;
      if (controller && typeof controller.layout === 'function') controller.layout();
    }
    window.requestAnimationFrame(function () {
      layout();
      window.requestAnimationFrame(layout);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }

  function apply(value, options) {
    var next = normalise(value) || 'default';
    var settings = options || {};
    root.dataset.siteAppearance = next;
    syncControls(next);
    syncThemeColor(next);

    if (settings.persist !== false) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    }
    if (settings.syncUrl !== false) syncUrl(next);
    if (next === 'vibespace') relayoutOrigami();
    return next;
  }

  function initialise() {
    var initial = normalise(root.dataset.siteAppearance) || readQuery() || readStored() || 'default';
    apply(initial, { persist: false, syncUrl: false });

    document.querySelectorAll('[data-appearance-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-appearance-choice'));
      });
    });
  }

  window.VibeSpaceSiteAppearance = {
    get: function () { return normalise(root.dataset.siteAppearance) || 'default'; },
    set: function (value, options) { return apply(value, options); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
