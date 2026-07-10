/* icons.js — VibeSpace custom SVG line icons
 * Replaces emoji with hand-crafted inline SVGs.
 * Add data-ic="name" to any element and this will inject the SVG.
 */
(function () {
  "use strict";
  var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
  var E = "</svg>";

  var ICONS = {
    // Product feature icons
    terminal: S + '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M6 9l3 3-3 3"/><path d="M12 15h5"/>' + E,
    chat: S + '<path d="M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H9l-5 4V6a1 1 0 011-1z"/>' + E,
    voice: S + '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>' + E,
    call: S + '<path d="M5 4h3l2 5-2 1a11 11 0 005 5l1-2 5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>' + E,
    council: S + '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 8l2.5 7"/><path d="M16 8l-2.5 7"/><path d="M8.5 7h7"/>' + E,
    skills: S + '<path d="M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v4h4"/><path d="M8 12h7"/><path d="M8 15h5"/>' + E,
    memory: S + '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 3v3"/><path d="M16 3v3"/>' + E,
    inspector: S + '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/>' + E,
    kanban: S + '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v10"/><path d="M15 4v7"/>' + E,
    tasks: S + '<path d="M4 7l2 2 4-4"/><path d="M4 15l2 2 4-4"/><path d="M14 6h6"/><path d="M14 14h6"/>' + E,
    hive: S + '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="14" r="2.5"/><path d="M6 8.5v3a2 2 0 002 2h1"/><path d="M18 8.5v3a2 2 0 01-2 2h-1"/><path d="M9.5 14h3"/>' + E,
    browser: S + '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18"/><path d="M12 3a14 14 0 000 18"/>' + E,
    dialpad: S + '<circle cx="6" cy="6" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="18" cy="6" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/><circle cx="6" cy="18" r="1"/><circle cx="12" cy="18" r="1"/><circle cx="18" cy="18" r="1"/>' + E,
    settings: S + '<circle cx="12" cy="12" r="3"/><path d="M12 2l1.5 3.5L17 4l-1 3.5L19.5 9 16 11l1 4-3.5-1L12 17l-1.5-3L8 15l1-4-3.5-1L8 7.5 7 4l3.5 1.5z"/>' + E,
    game: S + '<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M7 12h4"/><path d="M9 10v4"/><circle cx="15" cy="11" r="0.5"/><circle cx="17" cy="13" r="0.5"/>' + E,
    appstore: S + '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l4-6 4 6"/><path d="M8 12h8"/>' + E,
    computer: S + '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 16h6"/><path d="M12 16v3"/>' + E,
    phone: S + '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4"/><path d="M12 18v0.5"/>' + E,
    lock: S + '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>' + E,
    mute: S + '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0011 4"/><path d="M3 3l18 18"/>' + E,
    speaker: S + '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6"/><path d="M19 7a8 8 0 010 10"/>' + E,
    endcall: S + '<path d="M5 4h3l2 5-2 1a11 11 0 005 5l1-2 5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/><path d="M3 21L21 3"/>' + E,
    pin: S + '<path d="M9 3h6l-1 6 3 2v2H7v-2l3-2z"/><path d="M12 13v8"/>' + E,
    star: S + '<path d="M12 3l2.5 6.5L21 10l-5 4.5L17.5 21 12 17.5 6.5 21 8 14.5 3 10l6.5-.5z"/>' + E,
    download: S + '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 19h14"/>' + E,
    arrow: S + '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>' + E,
    os_win: S + '<rect x="3" y="5" width="18" height="13" rx="1"/><path d="M3 9h18"/><path d="M7 5v3"/><path d="M17 5v3"/>' + E,
    os_mac: S + '<rect x="3" y="4" width="18" height="14" rx="1.5"/><path d="M3 11h18"/><circle cx="6" cy="7.5" r="0.5"/>' + E,
    os_linux: S + '<circle cx="12" cy="8" r="4"/><path d="M8 12a8 8 0 008 0"/><path d="M10 16h4"/><path d="M8 19l2-3"/><path d="M16 19l-2-3"/>' + E,
    // New desktop apps
    inspector2: S + '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 9v12"/><path d="M12 13h6"/><path d="M12 16h4"/>' + E,
    skills2: S + '<path d="M12 2l3 6 6 .5-4.5 4 1.5 6L12 15l-6 3.5 1.5-6L3 8.5 9 8z"/>' + E,
    hive2: S + '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8"/><path d="M18 8v8"/><path d="M8 6h8"/><path d="M8.5 14h7"/>' + E,
    notes: S + '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v4h4"/><path d="M8 11h8"/><path d="M8 14h6"/><path d="M8 17h4"/>' + E,
    weather: S + '<path d="M8 16a4 4 0 010-8 5 5 0 019.6-1.5A4 4 0 0118 16z"/><circle cx="12" cy="20" r="1" fill="currentColor"/>' + E,
    notifications: S + '<path d="M12 3a5 5 0 015 5v4l2 3H5l2-3V8a5 5 0 015-5z"/><path d="M10 18a2 2 0 004 0"/>' + E,
    trash: S + '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>' + E,
    send: S + '<path d="M3 12l18-7-7 18-3-7-8-4z"/>' + E,
    refresh: S + '<path d="M4 12a8 8 0 0114-5l2 2"/><path d="M20 12a8 8 0 01-14 5l-2-2"/><path d="M18 4v5h-5"/><path d="M6 20v-5h5"/>' + E,
    // New phone apps
    photos: S + '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M4 16l4-4 3 3 3-4 6 7"/>' + E,
    camera: S + '<path d="M12 8a5 5 0 100 10 5 5 0 000-10z"/><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 4l1-2h6l1 2"/>' + E,
    flappy: S + '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 12l3-3 3 3-3 3z"/><path d="M8 9l1-3"/><path d="M16 12l-1 2"/><path d="M16 12h1"/>' + E,
    snake: S + '<path d="M4 6h12a2 2 0 012 2v8a2 2 0 01-2 2H4"/><circle cx="6" cy="8" r="1.5"/><circle cx="6" cy="14" r="1.5"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/>' + E,
    safari: S + '<circle cx="12" cy="12" r="9"/><path d="M12 8l4 8-8-4 4-4z"/><path d="M12 6v2"/><path d="M12 14v4"/><path d="M6 12h2"/><path d="M14 12h4"/>' + E,
    chrome: S + '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3l5.5 9.5"/><path d="M5.5 7.5L12 12"/><path d="M5.5 16.5L12 12"/><path d="M12 21l-5.5-9.5"/><path d="M18.5 16.5L12 12"/>' + E
  };

  function injectInto(root) {
    (root || document).querySelectorAll("[data-ic]").forEach(function (el) {
      var name = el.dataset.ic;
      var svg = ICONS[name];
      if (svg && !el.querySelector("svg")) {
        el.innerHTML = svg;
        var s = el.querySelector("svg");
        if (s) { s.style.width = "1em"; s.style.height = "1em"; }
      }
    });
  }

  window.VSIconsInject = injectInto;

  function inject() { injectInto(document); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  var retries = 20;
  var retryTick = setInterval(function () {
    if (retries-- <= 0) { clearInterval(retryTick); return; }
    injectInto(document);
  }, 500);
})();