/* VibeSpace website Phase 2
 * Progressive, dependency-free upgrades for the approved marketing sections.
 * All selectors and styles are scoped under the vs2-* namespace.
 */
(function () {
  'use strict';

  if (window.__VibeSpacePhase2Initialized) return;

  var ROOT_REPO = 'https://github.com/Cookie774-GameDev/VibeSpace';
  var API_REPO = 'https://api.github.com/repos/Cookie774-GameDev/VibeSpace';
  var reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var finePointerQuery = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;
  var cleanupStack = [];
  var visibilityCallbacks = [];

  function reducedMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }

  function registerCleanup(fn) {
    if (typeof fn === 'function') cleanupStack.push(fn);
    return fn;
  }

  function registerVisibility(fn) {
    if (typeof fn === 'function') visibilityCallbacks.push(fn);
    return function () {
      var index = visibilityCallbacks.indexOf(fn);
      if (index !== -1) visibilityCallbacks.splice(index, 1);
    };
  }

  function removeAllChildren(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function query(selector, root) {
    return (root || document).querySelector(selector);
  }

  function queryAll(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setAttributes(node, attributes) {
    Object.keys(attributes || {}).forEach(function (key) {
      var value = attributes[key];
      if (value === false || value === null || value === undefined) return;
      if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    });
    return node;
  }

  function externalLink(label, href, className) {
    var link = create('a', className || '', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function safeOpen(href) {
    var opened = window.open(href, '_blank', 'noopener,noreferrer');
    try { if (opened) opened.opener = null; } catch (_) {}
  }

  function boundedFetchJson(url, timeoutMs) {
    if (!window.fetch) return Promise.reject(new Error('fetch_unavailable'));
    var controller = window.AbortController ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, timeoutMs || 4200);
    return window.fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller ? controller.signal : undefined,
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('http_' + response.status);
      return response.json();
    }).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function clearTimers(timers) {
    while (timers.length) window.clearTimeout(timers.pop());
  }

  function schedule(timers, fn, delay) {
    var id = window.setTimeout(fn, delay);
    timers.push(id);
    return id;
  }

  function iconMarkup(name) {
    var common = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    var paths = {
      calls: '<path d="M7.2 3.7 4.8 4.9c-.8.4-1.2 1.3-1 2.2 1.2 6.4 6.2 11.4 12.6 12.6.9.2 1.8-.2 2.2-1l1.2-2.4c.3-.7.1-1.5-.5-1.9l-3-2.1c-.6-.4-1.4-.3-1.9.2l-1.1 1.1a11.8 11.8 0 0 1-3-3l1.1-1.1c.5-.5.6-1.3.2-1.9l-2.1-3c-.4-.6-1.2-.8-1.9-.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      messages: '<path d="M4 5.5h16v11H9l-4.8 3 .8-3.6A2 2 0 0 1 4 14.2V5.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
      safari: '<circle cx="12" cy="12" r="8.7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m14.7 8.1-1.6 5-3.8 2.8 1.6-5 3.8-2.8Z" fill="currentColor"/><circle cx="12" cy="12" r="1.15" fill="white"/>',
      chrome: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.3 7.5h8.2M16.5 4.9l-4.1 7.2M17.7 18.5l-4.1-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      photos: '<g fill="none" stroke="currentColor" stroke-width="1.35"><ellipse cx="12" cy="7" rx="2.3" ry="4"/><ellipse cx="12" cy="17" rx="2.3" ry="4"/><ellipse cx="7" cy="12" rx="4" ry="2.3"/><ellipse cx="17" cy="12" rx="4" ry="2.3"/><ellipse cx="8.5" cy="8.5" rx="2.3" ry="4" transform="rotate(-45 8.5 8.5)"/><ellipse cx="15.5" cy="15.5" rx="2.3" ry="4" transform="rotate(-45 15.5 15.5)"/></g><circle cx="12" cy="12" r="2" fill="currentColor"/>',
      camera: '<path d="M4 8h3l1.5-2h7L17 8h3v10H4V8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
      flappy: '<path d="M4.2 12.7c2.2-4.8 6.5-7.2 10.2-5.4 2.1 1 3.4 3 3.7 5.1l2.3 1.3-2.4 1c-.7 2.4-2.8 4.1-5.4 4.1-3.8 0-6.9-2.3-8.4-6.1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.5 12.2c2.8.4 4.5 1.8 5.3 4.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="14.7" cy="10.7" r=".9" fill="currentColor"/>',
      snake: '<path d="M5 7.2c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4s-1.8 4-4 4H9a4 4 0 0 0 0 8h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8.2" cy="6.5" r=".8" fill="currentColor"/><path d="m15 19.2 2.3-1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      notes: '<path d="M6 3.8h12v16.4H6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 8h6M9 11h6M9 14h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      alerts: '<path d="M6.5 16h11l-1.4-2.2V10a4.1 4.1 0 0 0-8.2 0v3.8L6.5 16Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10.3 18.4a2 2 0 0 0 3.4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      jarvis: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14.8 7v6.2a3 3 0 0 1-6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 3.2v2M12 18.8v2M20.8 12h-2M5.2 12h-2M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4M18.2 18.2l-1.4-1.4M7.2 7.2 5.8 5.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2.2 2.2"/>',
      vibecast: '<path d="M5 9.5a9.5 9.5 0 0 1 14 0M7.8 12.2a5.7 5.7 0 0 1 8.4 0M10.4 15a2.2 2.2 0 0 1 3.2 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="currentColor"/>',
      appstore: '<path d="m8 18 4-12 4 12M6.5 15.5h11M9.5 10.5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      dial: '<g fill="currentColor"><circle cx="7" cy="6" r="1.2"/><circle cx="12" cy="6" r="1.2"/><circle cx="17" cy="6" r="1.2"/><circle cx="7" cy="11" r="1.2"/><circle cx="12" cy="11" r="1.2"/><circle cx="17" cy="11" r="1.2"/><circle cx="7" cy="16" r="1.2"/><circle cx="12" cy="16" r="1.2"/><circle cx="17" cy="16" r="1.2"/><circle cx="12" cy="21" r="1.2"/></g>',
      browser: '<circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 12h17M12 3.2c2.3 2.4 3.5 5.3 3.5 8.8S14.3 18.4 12 20.8C9.7 18.4 8.5 15.5 8.5 12S9.7 5.6 12 3.2Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
      home: '<path d="m4.2 11.1 7.8-6.3 7.8 6.3v8H5.8v-8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.2 19v-5.2h5.6V19" fill="none" stroke="currentColor" stroke-width="1.7"/>',
      back: '<path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      external: '<path d="M13 5h6v6M19 5l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14v5H5V6h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
      refresh: '<path d="M19 8V4l-2 2a7.5 7.5 0 1 0 1.2 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      pause: '<path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      play: '<path d="m8 5 11 7-11 7V5Z" fill="currentColor"/>',
      restart: '<path d="M19 8V4l-2.3 2.3A7.5 7.5 0 1 0 19 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    };
    return '<svg ' + common + '>' + (paths[name] || paths.browser) + '</svg>';
  }

  function updateNavigationAnchor(oldHref, newHref) {
    queryAll('a[href="' + oldHref + '"]').forEach(function (link) {
      link.setAttribute('href', newHref);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Simplified one-button Jarvis / Context Map story                       */
  /* ---------------------------------------------------------------------- */

  function buildSystemStory(legacyVoice, legacyCalling, phoneSection) {
    if (!legacyVoice || query('.vs2-system-section')) return null;

    var section = create('section', 'vs2-section vs2-system-section');
    section.id = 'voice';
    section.innerHTML = [
      '<div class="vs2-section-head">',
        '<div class="vs2-kicker">How VibeSpace works</div>',
        '<h2>Tell Jarvis once. <em>Watch the whole workspace move.</em></h2>',
        '<p class="vs2-lead">One clear request becomes context, a safe plan, coordinated work, and a saved result. Jarvis runs the process while Context Map keeps every source, decision, and handoff connected.</p>',
      '</div>',
      '<div class="vs2-system-card">',
        '<div class="vs2-request-card">',
          '<div class="vs2-request-label"><span class="vs2-live-dot"></span> Example request</div>',
          '<blockquote>“Check the latest build, find the problem, fix it safely, and leave me a summary.”</blockquote>',
          '<button class="vs2-primary-button vs2-run-system" type="button">',
            '<span class="vs2-button-icon">' + iconMarkup('play') + '</span>',
            '<span>Run the system</span>',
          '</button>',
        '</div>',
        '<div class="vs2-system-visual" aria-live="polite">',
          '<div class="vs2-system-orbit" aria-hidden="true">',
            '<div class="vs2-orbit-ring vs2-orbit-ring-a"></div>',
            '<div class="vs2-orbit-ring vs2-orbit-ring-b"></div>',
            '<div class="vs2-orbit-core"><span>J</span><small>Jarvis</small></div>',
            '<span class="vs2-orbit-node n1">Files</span>',
            '<span class="vs2-orbit-node n2">GitHub</span>',
            '<span class="vs2-orbit-node n3">Notes</span>',
            '<span class="vs2-orbit-node n4">Agents</span>',
          '</div>',
          '<div class="vs2-system-status">',
            '<span class="vs2-status-eyebrow">Ready</span>',
            '<strong>Jarvis is waiting for your request.</strong>',
            '<p>Press Run to see the complete workflow in plain language.</p>',
          '</div>',
        '</div>',
        '<div class="vs2-system-steps" role="list" aria-label="VibeSpace workflow">',
          '<div class="vs2-system-step" role="listitem" data-step="0"><span>1</span><div><strong>You ask</strong><small>One request, voice or text</small></div></div>',
          '<div class="vs2-system-step" role="listitem" data-step="1"><span>2</span><div><strong>Context Map remembers</strong><small>Only the relevant sources</small></div></div>',
          '<div class="vs2-system-step" role="listitem" data-step="2"><span>3</span><div><strong>Jarvis chooses the route</strong><small>Subscription, API, or local</small></div></div>',
          '<div class="vs2-system-step" role="listitem" data-step="3"><span>4</span><div><strong>The team works</strong><small>Scoped agents and tools</small></div></div>',
          '<div class="vs2-system-step" role="listitem" data-step="4"><span>5</span><div><strong>Everything stays connected</strong><small>Verified, saved, and traceable</small></div></div>',
        '</div>',
        '<div class="vs2-system-progress" aria-hidden="true"><span></span></div>',
        '<div class="vs2-system-result" hidden>',
          '<span class="vs2-result-check">✓</span>',
          '<div><strong>Build repaired and verified.</strong><p>Summary saved to Context Map · Task moved to Done · Sources and tool activity attached.</p></div>',
        '</div>',
      '</div>',
      '<details class="vs2-explainer">',
        '<summary>What just happened?</summary>',
        '<div class="vs2-explainer-grid">',
          '<p><strong>Context Map</strong> found the build log, related files, previous decisions, and the latest repository activity—without dumping the whole project into the prompt.</p>',
          '<p><strong>Jarvis</strong> selected the best available connection, assigned scoped work, watched the tool activity, requested review, and saved the final result with provenance.</p>',
          '<p><strong>You stay in control.</strong> VibeSpace shows sources, tools, handoffs, and outputs—not private model chain-of-thought.</p>',
        '</div>',
      '</details>'
    ].join('');

    legacyVoice.parentNode.replaceChild(section, legacyVoice);

    if (legacyCalling && legacyCalling !== phoneSection && legacyCalling.parentNode) {
      legacyCalling.parentNode.removeChild(legacyCalling);
    }
    if (phoneSection) phoneSection.id = 'calling';
    updateNavigationAnchor('#calling-demo', '#calling');

    var steps = queryAll('.vs2-system-step', section);
    var statusEyebrow = query('.vs2-status-eyebrow', section);
    var statusTitle = query('.vs2-system-status strong', section);
    var statusCopy = query('.vs2-system-status p', section);
    var progress = query('.vs2-system-progress span', section);
    var result = query('.vs2-system-result', section);
    var runButton = query('.vs2-run-system', section);
    var runButtonLabel = query('.vs2-run-system span:last-child', section);
    var timers = [];
    var runId = 0;
    var running = false;

    var content = [
      { eyebrow: 'Request received', title: 'You ask once.', copy: 'Jarvis turns the request into a clear goal and keeps your original intent visible.' },
      { eyebrow: 'Context Map', title: 'The right memory arrives.', copy: 'Build logs, linked code, prior decisions, tasks, notes, and repository activity are ranked with source and freshness labels.' },
      { eyebrow: 'Connection routing', title: 'Jarvis chooses the safest route.', copy: 'A supported CLI subscription bridge, native API connection, or local model is selected without copying account credentials.' },
      { eyebrow: 'Coordinated work', title: 'Specialists receive scoped assignments.', copy: 'Builder and reviewer cards get only the context and tools they need. Jarvis watches handoffs and blocks unsafe completion.' },
      { eyebrow: 'Verified result', title: 'The answer becomes project memory.', copy: 'The fix, review result, source trail, and task status stay connected for the next request.' }
    ];

    function renderStep(activeIndex, complete) {
      steps.forEach(function (step, index) {
        step.classList.toggle('is-active', index === activeIndex && !complete);
        step.classList.toggle('is-complete', index < activeIndex || complete);
      });
      if (complete) {
        statusEyebrow.textContent = 'Complete';
        statusTitle.textContent = 'The workspace is up to date.';
        statusCopy.textContent = 'The result, evidence, and task state are now part of Context Map.';
        progress.style.width = '100%';
        result.hidden = false;
        runButtonLabel.textContent = 'Run again';
        runButton.disabled = false;
        runButton.setAttribute('aria-busy', 'false');
        running = false;
        section.classList.add('is-complete');
        section.classList.remove('is-running');
        return;
      }
      var item = content[activeIndex];
      statusEyebrow.textContent = item.eyebrow;
      statusTitle.textContent = item.title;
      statusCopy.textContent = item.copy;
      progress.style.width = (((activeIndex + 1) / content.length) * 100) + '%';
    }

    function reset() {
      runId += 1;
      clearTimers(timers);
      running = false;
      section.classList.remove('is-running', 'is-complete');
      steps.forEach(function (step) {
        step.classList.remove('is-active', 'is-complete');
      });
      statusEyebrow.textContent = 'Ready';
      statusTitle.textContent = 'Jarvis is waiting for your request.';
      statusCopy.textContent = 'Press Run to see the complete workflow in plain language.';
      progress.style.width = '0%';
      result.hidden = true;
      runButton.disabled = false;
      runButton.setAttribute('aria-busy', 'false');
      runButtonLabel.textContent = 'Run the system';
    }

    function run() {
      if (running) return;
      reset();
      running = true;
      var thisRun = runId;
      section.classList.add('is-running');
      runButton.disabled = true;
      runButton.setAttribute('aria-busy', 'true');
      runButtonLabel.textContent = 'Jarvis is running…';

      if (reducedMotion()) {
        renderStep(content.length, true);
        return;
      }

      content.forEach(function (_, index) {
        schedule(timers, function () {
          if (thisRun !== runId) return;
          renderStep(index, false);
        }, 260 + index * 1120);
      });
      schedule(timers, function () {
        if (thisRun !== runId) return;
        renderStep(content.length, true);
      }, 260 + content.length * 1120);
    }

    runButton.addEventListener('click', run);
    var unregisterVisibility = registerVisibility(function (hidden) {
      if (hidden && running) reset();
    });
    registerCleanup(function () {
      clearTimers(timers);
      unregisterVisibility();
      runButton.removeEventListener('click', run);
    });

    return {
      run: run,
      reset: reset,
      section: section,
      isRunning: function () { return running; }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Modern phone and mini apps                                             */
  /* ---------------------------------------------------------------------- */

  var PHONE_APPS = [
    { id: 'calls', name: 'Calls', tone: 'teal', caption: 'Modern call states, live captions, and contact-specific voice profiles.' },
    { id: 'messages', name: 'Messages', tone: 'sage', caption: 'Short conversations with the people and agents connected to VibeSpace.' },
    { id: 'safari', name: 'Safari', tone: 'blue', caption: 'A mini, read-only VibeSpace GitHub browser with safe external links.' },
    { id: 'chrome', name: 'Chrome', tone: 'chrome', caption: 'The same live repository experience with familiar Chrome-inspired controls.' },
    { id: 'photos', name: 'Photos', tone: 'photos', caption: 'A visual library of VibeSpace work, source maps, and captured moments.' },
    { id: 'camera', name: 'Camera', tone: 'graphite', caption: 'A stylized camera demo that adds captures to the local photo strip.' },
    { id: 'flappy', name: 'Flappy', tone: 'cyan', caption: 'A smoother VibeSpace bird game with pause, restart, touch, and keyboard controls.' },
    { id: 'snake', name: 'Snake', tone: 'green', caption: 'A responsive grid game with D-pad, arrow keys, score, and speed progression.' },
    { id: 'notes', name: 'Notes', tone: 'gold', caption: 'A lightweight local note surface for quick ideas.' },
    { id: 'alerts', name: 'Alerts', tone: 'coral', caption: 'Build, deadline, and agent notifications in one calm feed.' },
    { id: 'jarvis', name: 'Jarvis', tone: 'copper', caption: 'The mobile Jarvis surface for a quick project check-in.' },
    { id: 'settings', name: 'Settings', tone: 'slate', caption: 'Voice, connection, and phone demo preferences.' },
    { id: 'vibecast', name: 'VibeCast', tone: 'plum', caption: 'A compact project briefing and audio-show concept.' },
    { id: 'appstore', name: 'App Store', tone: 'indigo', caption: 'A small catalog of VibeSpace mini experiences.' },
    { id: 'dial', name: 'Dial', tone: 'mint', caption: 'A polished dial pad for the calling demonstration.' },
    { id: 'browser', name: 'Browser', tone: 'ocean', caption: 'A neutral route into the mini GitHub repository browser.' }
  ];

  var PHONE_CONTACTS = [
    { id: 'jarvis', name: 'Jarvis', initials: 'J', role: 'Workspace orchestrator', color: '#E0925C', voice: 'jarvis', line: 'The build is stable again. I saved the fix, reviewer notes, and source trail to Context Map.' },
    { id: 'sage', name: 'Sage', initials: 'S', role: 'Research specialist', color: '#8B7DB3', voice: 'sage', line: 'I mapped the strongest sources and marked the two claims that still need verification.' },
    { id: 'builder', name: 'Builder', initials: 'B', role: 'Implementation agent', color: '#5DA6B8', voice: 'builder', line: 'The patch is ready. Tests are passing in the focused website harness.' },
    { id: 'critic', name: 'The Critic', initials: 'C', role: 'Review and risk', color: '#B76D5A', voice: 'critic', line: 'I found one mobile overflow edge case. It is fixed, and the 390 pixel viewport is clear.' },
    { id: 'devrel', name: 'DevRel Bot', initials: 'D', role: 'Launch communication', color: '#D3A44D', voice: 'devrel', line: 'The product story is now simple enough to explain in one sentence.' },
    { id: 'midnight', name: 'Midnight Coder', initials: 'M', role: 'Late-night build partner', color: '#5963A9', voice: 'midnight', line: 'I kept the change site-only and left billing, Supabase, and the desktop application untouched.' },
    { id: 'mom', name: 'Mom', initials: 'M', role: 'Favorite person', color: '#B47F9A', voice: 'mom', line: 'Hi sweetheart. I just wanted to hear your voice. Remember to take a break and drink some water.' }
  ];

  var VOICE_PROFILES = {
    jarvis: { label: 'Cinematic British-inspired', lang: ['en-GB', 'en_GB'], names: ['Daniel', 'Arthur', 'Oliver', 'George', 'British', 'England'], rate: 0.92, pitch: 0.78 },
    sage: { label: 'Calm and thoughtful', lang: ['en-GB', 'en-US'], names: ['Moira', 'Serena', 'Tessa', 'Samantha'], rate: 0.9, pitch: 1.02 },
    builder: { label: 'Direct and energetic', lang: ['en-US', 'en-GB'], names: ['Alex', 'Aaron', 'Fred', 'Tom'], rate: 1.04, pitch: 0.94 },
    critic: { label: 'Precise and restrained', lang: ['en-GB', 'en-US'], names: ['Daniel', 'Karen', 'Rishi', 'Microsoft Ryan'], rate: 0.88, pitch: 0.88 },
    devrel: { label: 'Bright and conversational', lang: ['en-US', 'en-GB'], names: ['Samantha', 'Jenny', 'Aria', 'Zira'], rate: 1.02, pitch: 1.08 },
    midnight: { label: 'Low-key late-night', lang: ['en-US', 'en-GB'], names: ['Alex', 'Daniel', 'David', 'Mark'], rate: 0.86, pitch: 0.72 },
    mom: { label: 'Warm mature woman', lang: ['en-US', 'en-GB'], names: ['Susan', 'Samantha', 'Karen', 'Moira', 'Victoria', 'Tessa', 'Zira'], rate: 0.84, pitch: 0.96 }
  };

  var REPO_FALLBACK = {
    repo: {
      full_name: 'Cookie774-GameDev/VibeSpace',
      description: 'Local-first AI workspace with Jarvis, Context Map, agents, terminal swarms, voice, calls, skills, tasks, and memory.',
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 1,
      forks_count: 0,
      open_issues_count: 0,
      html_url: ROOT_REPO,
      license: { spdx_id: 'Apache-2.0' }
    },
    contents: [
      { name: '.github', type: 'dir', path: '.github' },
      { name: 'app', type: 'dir', path: 'app' },
      { name: 'docs', type: 'dir', path: 'docs' },
      { name: 'install', type: 'dir', path: 'install' },
      { name: 'site', type: 'dir', path: 'site' },
      { name: 'supabase', type: 'dir', path: 'supabase' },
      { name: 'AGENT_COORDINATION.md', type: 'file', path: 'AGENT_COORDINATION.md' },
      { name: 'CHANGELOG.md', type: 'file', path: 'CHANGELOG.md' },
      { name: 'LICENSE', type: 'file', path: 'LICENSE' },
      { name: 'README.md', type: 'file', path: 'README.md' }
    ],
    commits: [
      { sha: 'latest', html_url: ROOT_REPO + '/commits/main', commit: { message: 'Latest VibeSpace work', author: { name: 'VibeSpace', date: '' } } }
    ],
    pulls: [],
    issues: [],
    actions: [],
    releases: [],
    source: 'snapshot'
  };

  var repoCache = null;
  var repoPromise = null;

  function loadRepoData(force) {
    if (force) {
      repoCache = null;
      repoPromise = null;
    }
    if (repoCache) return Promise.resolve(repoCache);
    if (repoPromise) return repoPromise;

    var requests = [
      boundedFetchJson(API_REPO, 4200),
      boundedFetchJson(API_REPO + '/contents?ref=main', 4200),
      boundedFetchJson(API_REPO + '/commits?per_page=6', 4200),
      boundedFetchJson(API_REPO + '/pulls?state=open&per_page=6', 4200),
      boundedFetchJson(API_REPO + '/issues?state=open&per_page=10', 4200),
      boundedFetchJson(API_REPO + '/actions/runs?per_page=6', 4200),
      boundedFetchJson(API_REPO + '/releases?per_page=5', 4200)
    ];

    repoPromise = Promise.allSettled(requests).then(function (results) {
      var data = {
        repo: results[0].status === 'fulfilled' ? results[0].value : REPO_FALLBACK.repo,
        contents: results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : REPO_FALLBACK.contents,
        commits: results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : REPO_FALLBACK.commits,
        pulls: results[3].status === 'fulfilled' && Array.isArray(results[3].value) ? results[3].value : [],
        issues: results[4].status === 'fulfilled' && Array.isArray(results[4].value) ? results[4].value.filter(function (item) { return !item.pull_request; }) : [],
        actions: results[5].status === 'fulfilled' && results[5].value && Array.isArray(results[5].value.workflow_runs) ? results[5].value.workflow_runs : [],
        releases: results[6].status === 'fulfilled' && Array.isArray(results[6].value) ? results[6].value : [],
        source: results.some(function (result) { return result.status === 'fulfilled'; }) ? 'live' : 'snapshot'
      };
      repoCache = data;
      return data;
    }).catch(function () {
      repoCache = REPO_FALLBACK;
      return repoCache;
    }).finally(function () {
      repoPromise = null;
    });

    return repoPromise;
  }

  function appById(id) {
    return PHONE_APPS.filter(function (app) { return app.id === id; })[0] || PHONE_APPS[0];
  }

  function contactById(id) {
    return PHONE_CONTACTS.filter(function (contact) { return contact.id === id; })[0] || PHONE_CONTACTS[0];
  }

  function buildPhone(phoneSection) {
    if (!phoneSection) return null;
    phoneSection.className = 'vs2-section vs2-phone-section';
    phoneSection.innerHTML = [
      '<div class="vs2-section-head vs2-centered">',
        '<div class="vs2-kicker">VibeSpace in your pocket</div>',
        '<h2>A modern phone demo. <em>Everything has a purpose.</em></h2>',
        '<p class="vs2-lead">Open the apps, browse the VibeSpace repository, call a contact, or play a game. The same experience reflows for desktop, tablet, and mobile.</p>',
      '</div>',
      '<div class="vs2-phone-layout">',
        '<div class="vs2-phone-stage">',
          '<div class="vs2-phone-device" aria-label="Interactive VibeSpace phone">',
            '<div class="vs2-phone-speaker" aria-hidden="true"></div>',
            '<div class="vs2-phone-screen">',
              '<div class="vs2-phone-statusbar">',
                '<span class="vs2-phone-time">12:00</span>',
                '<div class="vs2-dynamic-island" aria-hidden="true"><span></span></div>',
                '<span class="vs2-phone-signal" aria-label="Connected"><i></i><i></i><i></i><b></b></span>',
              '</div>',
              '<div class="vs2-phone-viewport"></div>',
            '</div>',
            '<button class="vs2-physical-home" type="button" aria-label="Go to phone home screen"><span></span></button>',
          '</div>',
        '</div>',
        '<aside class="vs2-phone-guide" aria-live="polite">',
          '<span class="vs2-phone-guide-label">Now showing</span>',
          '<h3>Phone Home</h3>',
          '<p>Choose an app. The physical Home button always returns here.</p>',
          '<div class="vs2-phone-guide-features">',
            '<span>Live time</span><span>Touch ready</span><span>Keyboard ready</span><span>Safe fallbacks</span>',
          '</div>',
          '<div class="vs2-phone-guide-tip"><strong>Try this</strong><p>Open Safari or Chrome, switch repository tabs, then open a real GitHub destination.</p></div>',
        '</aside>',
      '</div>'
    ].join('');

    var viewport = query('.vs2-phone-viewport', phoneSection);
    var timeElement = query('.vs2-phone-time', phoneSection);
    var physicalHome = query('.vs2-physical-home', phoneSection);
    var guideTitle = query('.vs2-phone-guide h3', phoneSection);
    var guideCopy = query('.vs2-phone-guide > p', phoneSection);
    var currentApp = 'home';
    var appCleanup = null;
    var appVisibility = null;
    var photoCaptures = 0;

    function setGuide(appId) {
      if (appId === 'home') {
        guideTitle.textContent = 'Phone Home';
        guideCopy.textContent = 'Choose an app. The physical Home button always returns here.';
        return;
      }
      var app = appById(appId);
      guideTitle.textContent = app.name;
      guideCopy.textContent = app.caption;
    }

    function stopApp() {
      if (typeof appCleanup === 'function') {
        try { appCleanup(); } catch (_) {}
      }
      appCleanup = null;
      appVisibility = null;
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
    }

    function appShell(title, bodyClass) {
      viewport.innerHTML = [
        '<div class="vs2-phone-app vs2-phone-app-open">',
          '<div class="vs2-app-navbar">',
            '<button class="vs2-app-back" type="button" aria-label="Back to phone home">' + iconMarkup('back') + '</button>',
            '<strong>' + title + '</strong>',
            '<span class="vs2-app-nav-spacer"></span>',
          '</div>',
          '<div class="vs2-app-body ' + (bodyClass || '') + '"></div>',
        '</div>'
      ].join('');
      query('.vs2-app-back', viewport).addEventListener('click', showHome);
      return query('.vs2-app-body', viewport);
    }

    function showHome() {
      stopApp();
      currentApp = 'home';
      setGuide('home');
      viewport.innerHTML = [
        '<div class="vs2-phone-home">',
          '<div class="vs2-phone-widget">',
            '<div><span>Context Map</span><strong>Project memory is current</strong></div>',
            '<div class="vs2-widget-pulse"><i></i><i></i><i></i></div>',
          '</div>',
          '<div class="vs2-app-grid" role="list" aria-label="Phone applications"></div>',
          '<div class="vs2-phone-dock" aria-label="Phone dock"></div>',
        '</div>'
      ].join('');
      var grid = query('.vs2-app-grid', viewport);
      var dock = query('.vs2-phone-dock', viewport);
      PHONE_APPS.forEach(function (app, index) {
        var button = create('button', 'vs2-app-icon vs2-tone-' + app.tone);
        button.type = 'button';
        button.dataset.app = app.id;
        button.setAttribute('role', 'listitem');
        button.setAttribute('aria-label', 'Open ' + app.name);
        button.innerHTML = '<span class="vs2-app-glyph">' + iconMarkup(app.id) + '</span><small>' + app.name + '</small>';
        button.addEventListener('click', function () { openApp(app.id); });
        grid.appendChild(button);
        if (index < 4) {
          var dockButton = button.cloneNode(true);
          dockButton.removeAttribute('role');
          dockButton.addEventListener('click', function () { openApp(app.id); });
          dock.appendChild(dockButton);
        }
      });
    }

    function openApp(appId) {
      stopApp();
      currentApp = appId;
      setGuide(appId);
      if (appId === 'safari' || appId === 'chrome' || appId === 'browser') renderBrowser(appId);
      else if (appId === 'calls') renderCalls();
      else if (appId === 'messages') renderMessages();
      else if (appId === 'flappy') renderFlappy();
      else if (appId === 'snake') renderSnake();
      else if (appId === 'photos') renderPhotos();
      else if (appId === 'camera') renderCamera();
      else if (appId === 'dial') renderDial();
      else renderSimpleApp(appId);
    }

    function renderBrowser(appId) {
      var title = appId === 'chrome' ? 'Chrome' : (appId === 'safari' ? 'Safari' : 'Browser');
      var body = appShell(title, 'vs2-browser-app vs2-browser-' + appId);
      body.innerHTML = [
        '<div class="vs2-browser-toolbar">',
          '<button type="button" data-browser-action="back" aria-label="Browser back">' + iconMarkup('back') + '</button>',
          '<button type="button" data-browser-action="forward" aria-label="Browser forward"><span class="vs2-forward-icon">' + iconMarkup('back') + '</span></button>',
          '<button type="button" data-browser-action="refresh" aria-label="Refresh repository data">' + iconMarkup('refresh') + '</button>',
          '<div class="vs2-browser-address"><span class="vs2-browser-lock">●</span><span>github.com/Cookie774-GameDev/VibeSpace</span></div>',
          '<button type="button" data-browser-action="external" aria-label="Open repository in a new tab">' + iconMarkup('external') + '</button>',
        '</div>',
        '<div class="vs2-browser-repo-header">',
          '<div class="vs2-browser-avatar">VS</div>',
          '<div><strong>Cookie774-GameDev / VibeSpace</strong><small class="vs2-browser-source">Loading public repository…</small></div>',
        '</div>',
        '<div class="vs2-browser-tabs" role="tablist" aria-label="Repository views"></div>',
        '<div class="vs2-browser-content" tabindex="0"></div>'
      ].join('');

      var tabs = ['Overview', 'Code', 'README', 'Issues', 'Pulls', 'Actions', 'Releases', 'Commits'];
      var tabBar = query('.vs2-browser-tabs', body);
      var content = query('.vs2-browser-content', body);
      var source = query('.vs2-browser-source', body);
      var history = ['Overview'];
      var historyIndex = 0;
      var currentData = REPO_FALLBACK;
      var disposed = false;

      tabs.forEach(function (tabName) {
        var button = create('button', 'vs2-browser-tab', tabName);
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.dataset.tab = tabName;
        button.addEventListener('click', function () {
          navigate(tabName, true);
        });
        tabBar.appendChild(button);
      });

      function statusPill(label, kind) {
        var span = create('span', 'vs2-repo-pill ' + (kind || ''), label);
        return span;
      }

      function emptyState(titleText, copyText, href) {
        var wrap = create('div', 'vs2-browser-empty');
        wrap.appendChild(create('strong', '', titleText));
        wrap.appendChild(create('p', '', copyText));
        wrap.appendChild(externalLink('Open on GitHub ↗', href, 'vs2-browser-external-link'));
        return wrap;
      }

      function renderOverview(data) {
        var repo = data.repo || REPO_FALLBACK.repo;
        var wrap = create('div', 'vs2-repo-overview');
        var card = create('div', 'vs2-repo-card');
        card.appendChild(create('span', 'vs2-repo-overline', 'Public repository'));
        card.appendChild(create('h4', '', repo.full_name || 'Cookie774-GameDev/VibeSpace'));
        card.appendChild(create('p', '', repo.description || REPO_FALLBACK.repo.description));
        var pills = create('div', 'vs2-repo-pills');
        pills.appendChild(statusPill((repo.default_branch || 'main') + ' branch', 'branch'));
        pills.appendChild(statusPill(repo.language || 'TypeScript', 'language'));
        pills.appendChild(statusPill((repo.license && (repo.license.spdx_id || repo.license.name)) || 'Apache-2.0', 'license'));
        card.appendChild(pills);
        var stats = create('div', 'vs2-repo-stats');
        [
          ['Stars', repo.stargazers_count || 0],
          ['Forks', repo.forks_count || 0],
          ['Open', repo.open_issues_count || 0],
          ['Source', data.source === 'live' ? 'Live' : 'Snapshot']
        ].forEach(function (item) {
          var stat = create('div', '');
          stat.appendChild(create('span', '', item[0]));
          stat.appendChild(create('strong', '', item[1]));
          stats.appendChild(stat);
        });
        card.appendChild(stats);
        card.appendChild(externalLink('Open full repository ↗', ROOT_REPO, 'vs2-browser-external-link'));
        wrap.appendChild(card);

        var recent = create('div', 'vs2-repo-recent');
        recent.appendChild(create('h4', '', 'Recent activity'));
        (data.commits || []).slice(0, 3).forEach(function (commit) {
          var row = create('a', 'vs2-repo-row');
          row.href = commit.html_url || ROOT_REPO + '/commits/main';
          row.target = '_blank';
          row.rel = 'noopener noreferrer';
          var message = commit.commit && commit.commit.message ? commit.commit.message.split('\n')[0] : 'Repository update';
          var author = commit.commit && commit.commit.author ? commit.commit.author.name : 'VibeSpace';
          row.appendChild(create('span', '', message));
          row.appendChild(create('small', '', author));
          recent.appendChild(row);
        });
        wrap.appendChild(recent);
        content.appendChild(wrap);
      }

      function renderCode(data) {
        var list = create('div', 'vs2-repo-file-list');
        var head = create('div', 'vs2-repo-file-head');
        head.appendChild(create('strong', '', 'main'));
        head.appendChild(create('span', '', 'Public, read-only preview'));
        list.appendChild(head);
        (data.contents || REPO_FALLBACK.contents).slice(0, 18).forEach(function (item) {
          var row = externalLink('', ROOT_REPO + '/' + (item.type === 'dir' ? 'tree' : 'blob') + '/main/' + encodeURI(item.path || item.name), 'vs2-repo-file-row');
          var icon = create('span', 'vs2-file-kind', item.type === 'dir' ? '▰' : '▤');
          var name = create('strong', '', item.name || item.path || 'File');
          var type = create('small', '', item.type === 'dir' ? 'folder' : 'file');
          row.appendChild(icon);
          row.appendChild(name);
          row.appendChild(type);
          list.appendChild(row);
        });
        content.appendChild(list);
      }

      function renderReadme() {
        var readme = create('article', 'vs2-mini-readme');
        readme.innerHTML = [
          '<span class="vs2-repo-overline">README.md</span>',
          '<h4>VibeSpace</h4>',
          '<p>The cozy all-in-one AI workspace for vibe coders: multi-model chat, agent councils, terminal swarms, Jarvis voice, AI calling, Context Map, skills, memory, tasks, and Inspector.</p>',
          '<h5>Built around one connected workspace</h5>',
          '<ul><li>Local-first and BYOK</li><li>Context Map project intelligence</li><li>Subscription bridges, native APIs, and local models</li><li>Traceable agents, tools, and task state</li></ul>',
        ].join('');
        readme.appendChild(externalLink('Read the complete README ↗', ROOT_REPO + '#readme', 'vs2-browser-external-link'));
        content.appendChild(readme);
      }

      function renderItems(data, type) {
        var items;
        var href;
        var emptyTitle;
        var emptyCopy;
        if (type === 'Issues') {
          items = data.issues || [];
          href = ROOT_REPO + '/issues';
          emptyTitle = 'No public issues in this preview';
          emptyCopy = 'Open the full issue tracker for the latest state.';
        } else if (type === 'Pulls') {
          items = data.pulls || [];
          href = ROOT_REPO + '/pulls';
          emptyTitle = 'No open pull requests loaded';
          emptyCopy = 'The live endpoint may be empty or rate-limited.';
        } else if (type === 'Actions') {
          items = data.actions || [];
          href = ROOT_REPO + '/actions';
          emptyTitle = 'No workflow runs loaded';
          emptyCopy = 'Open Actions to inspect the current build and deployment state.';
        } else if (type === 'Releases') {
          items = data.releases || [];
          href = ROOT_REPO + '/releases';
          emptyTitle = 'No release data loaded';
          emptyCopy = 'Open Releases for installers, tags, and checksums.';
        } else {
          items = data.commits || [];
          href = ROOT_REPO + '/commits/main';
          emptyTitle = 'No commit data loaded';
          emptyCopy = 'Open the commit history for the latest updates.';
        }
        if (!items.length) {
          content.appendChild(emptyState(emptyTitle, emptyCopy, href));
          return;
        }
        var list = create('div', 'vs2-repo-event-list');
        items.slice(0, 8).forEach(function (item) {
          var row = externalLink('', item.html_url || href, 'vs2-repo-event');
          var titleText = item.title || item.name || item.display_title || (item.commit && item.commit.message && item.commit.message.split('\n')[0]) || 'Repository activity';
          var metaText = '';
          if (type === 'Actions') metaText = (item.status || 'unknown') + (item.conclusion ? ' · ' + item.conclusion : '');
          else if (type === 'Releases') metaText = item.tag_name || 'release';
          else if (type === 'Commits') metaText = item.sha ? item.sha.slice(0, 7) : 'commit';
          else metaText = item.state || 'open';
          row.appendChild(create('span', 'vs2-event-dot', ''));
          var copy = create('div', '');
          copy.appendChild(create('strong', '', titleText));
          copy.appendChild(create('small', '', metaText));
          row.appendChild(copy);
          list.appendChild(row);
        });
        list.appendChild(externalLink('View all on GitHub ↗', href, 'vs2-browser-external-link'));
        content.appendChild(list);
      }

      function render(tabName) {
        removeAllChildren(content);
        queryAll('.vs2-browser-tab', body).forEach(function (tabButton) {
          var selected = tabButton.dataset.tab === tabName;
          tabButton.classList.toggle('is-active', selected);
          tabButton.setAttribute('aria-selected', selected ? 'true' : 'false');
          tabButton.tabIndex = selected ? 0 : -1;
        });
        if (tabName === 'Overview') renderOverview(currentData);
        else if (tabName === 'Code') renderCode(currentData);
        else if (tabName === 'README') renderReadme();
        else renderItems(currentData, tabName);
        content.scrollTop = 0;
      }

      function navigate(tabName, push) {
        if (tabs.indexOf(tabName) === -1) tabName = 'Overview';
        if (push && history[historyIndex] !== tabName) {
          history = history.slice(0, historyIndex + 1);
          history.push(tabName);
          historyIndex = history.length - 1;
        }
        render(tabName);
      }

      queryAll('[data-browser-action]', body).forEach(function (button) {
        button.addEventListener('click', function () {
          var action = button.dataset.browserAction;
          if (action === 'external') safeOpen(ROOT_REPO);
          else if (action === 'refresh') {
            source.textContent = 'Refreshing public repository…';
            loadRepoData(true).then(function (data) {
              if (disposed) return;
              currentData = data;
              source.textContent = data.source === 'live' ? 'Live public data' : 'Offline snapshot';
              render(history[historyIndex]);
            });
          } else if (action === 'back' && historyIndex > 0) {
            historyIndex -= 1;
            render(history[historyIndex]);
          } else if (action === 'forward' && historyIndex < history.length - 1) {
            historyIndex += 1;
            render(history[historyIndex]);
          }
        });
      });

      navigate('Overview', false);
      loadRepoData(false).then(function (data) {
        if (disposed) return;
        currentData = data;
        source.textContent = data.source === 'live' ? 'Live public data' : 'Offline snapshot';
        render(history[historyIndex]);
      });

      appCleanup = function () {
        disposed = true;
      };
    }

    function chooseVoice(profileKey) {
      var profile = VOICE_PROFILES[profileKey] || VOICE_PROFILES.jarvis;
      var voices = [];
      try { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch (_) {}
      if (!voices || !voices.length) return null;
      var preferred = null;
      profile.names.some(function (name) {
        preferred = voices.filter(function (voice) {
          return String(voice.name || '').toLowerCase().indexOf(name.toLowerCase()) !== -1;
        })[0];
        return !!preferred;
      });
      if (preferred) return preferred;
      profile.lang.some(function (lang) {
        preferred = voices.filter(function (voice) {
          return String(voice.lang || '').toLowerCase().indexOf(lang.toLowerCase().replace('_', '-')) === 0;
        })[0];
        return !!preferred;
      });
      return preferred || voices[0] || null;
    }

    function speakContact(contact, text, onEnd) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        if (typeof onEnd === 'function') window.setTimeout(onEnd, 900);
        return null;
      }
      var profile = VOICE_PROFILES[contact.voice] || VOICE_PROFILES.jarvis;
      var utterance = new SpeechSynthesisUtterance(text);
      var voice = chooseVoice(contact.voice);
      if (voice) utterance.voice = voice;
      utterance.lang = voice && voice.lang ? voice.lang : profile.lang[0];
      utterance.rate = profile.rate;
      utterance.pitch = profile.pitch;
      utterance.volume = 1;
      utterance.onend = function () { if (typeof onEnd === 'function') onEnd(); };
      utterance.onerror = function () { if (typeof onEnd === 'function') onEnd(); };
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (_) {
        if (typeof onEnd === 'function') window.setTimeout(onEnd, 900);
      }
      return utterance;
    }

    function renderCalls() {
      var body = appShell('Calls', 'vs2-calls-app');
      var timers = [];
      var callRun = 0;
      var muted = false;
      var speaker = true;
      var currentContact = null;
      var callStart = 0;
      var timerInterval = null;

      function cleanupCall() {
        callRun += 1;
        clearTimers(timers);
        if (timerInterval) window.clearInterval(timerInterval);
        timerInterval = null;
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
      }

      function renderList() {
        cleanupCall();
        body.innerHTML = [
          '<div class="vs2-call-hero">',
            '<div><span>Voice ready</span><strong>Call a person or agent</strong><p>Captions always work. Device speech is used when available.</p></div>',
            '<button class="vs2-incoming-demo" type="button">Simulate Mom calling</button>',
          '</div>',
          '<div class="vs2-call-list" aria-label="Contacts"></div>'
        ].join('');
        var list = query('.vs2-call-list', body);
        PHONE_CONTACTS.forEach(function (contact, index) {
          var row = create('button', 'vs2-contact-row');
          row.type = 'button';
          row.dataset.contact = contact.id;
          row.innerHTML = '<span class="vs2-contact-avatar" style="--contact:' + contact.color + '">' + contact.initials + '</span><span class="vs2-contact-copy"><strong>' + contact.name + '</strong><small>' + contact.role + '</small></span><span class="vs2-contact-recency">' + (index === 0 ? 'now' : (index + 1) + 'm') + '</span><span class="vs2-contact-call">' + iconMarkup('calls') + '</span>';
          row.addEventListener('click', function () { renderContact(contact); });
          list.appendChild(row);
        });
        query('.vs2-incoming-demo', body).addEventListener('click', function () {
          renderIncoming(contactById('mom'));
        });
      }

      function renderContact(contact) {
        cleanupCall();
        var profile = VOICE_PROFILES[contact.voice] || VOICE_PROFILES.jarvis;
        body.innerHTML = [
          '<div class="vs2-contact-detail">',
            '<span class="vs2-contact-avatar large" style="--contact:' + contact.color + '">' + contact.initials + '</span>',
            '<h4>' + contact.name + '</h4>',
            '<p>' + contact.role + '</p>',
            '<span class="vs2-voice-profile">' + profile.label + ' voice profile</span>',
            '<small>Original browser/device synthesis profile. No actor voice is copied.</small>',
            '<div class="vs2-contact-actions">',
              '<button type="button" class="vs2-contact-action vs2-start-call">' + iconMarkup('calls') + '<span>Call</span></button>',
              '<button type="button" class="vs2-contact-action" data-contact-message>' + iconMarkup('messages') + '<span>Message</span></button>',
            '</div>',
            '<button class="vs2-inline-back" type="button">‹ All contacts</button>',
          '</div>'
        ].join('');
        query('.vs2-start-call', body).addEventListener('click', function () { startCall(contact); });
        query('[data-contact-message]', body).addEventListener('click', function () {
          openApp('messages');
        });
        query('.vs2-inline-back', body).addEventListener('click', renderList);
      }

      function renderIncoming(contact) {
        cleanupCall();
        body.innerHTML = [
          '<div class="vs2-incoming-call">',
            '<span class="vs2-call-state">Incoming VibeSpace call</span>',
            '<span class="vs2-contact-avatar huge" style="--contact:' + contact.color + '">' + contact.initials + '</span>',
            '<h4>' + contact.name + '</h4>',
            '<p>' + contact.role + '</p>',
            '<div class="vs2-incoming-actions">',
              '<button class="vs2-call-circle decline" type="button" aria-label="Decline call">×<small>Decline</small></button>',
              '<button class="vs2-call-circle answer" type="button" aria-label="Answer call">' + iconMarkup('calls') + '<small>Answer</small></button>',
            '</div>',
          '</div>'
        ].join('');
        query('.decline', body).addEventListener('click', renderList);
        query('.answer', body).addEventListener('click', function () { startCall(contact, true); });
      }

      function startCall(contact, answered) {
        cleanupCall();
        currentContact = contact;
        var thisRun = callRun;
        body.innerHTML = [
          '<div class="vs2-active-call" data-call-state="' + (answered ? 'connected' : 'dialing') + '">',
            '<span class="vs2-call-state">' + (answered ? 'Connected' : 'Calling…') + '</span>',
            '<span class="vs2-contact-avatar huge vs2-call-avatar" style="--contact:' + contact.color + '">' + contact.initials + '<i></i></span>',
            '<h4>' + contact.name + '</h4>',
            '<span class="vs2-call-duration">00:00</span>',
            '<div class="vs2-call-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>',
            '<div class="vs2-live-caption" aria-live="polite">' + (answered ? 'Connected. Listening…' : 'Establishing a secure demo call…') + '</div>',
            '<div class="vs2-call-controls">',
              '<button type="button" data-call-control="mute" aria-pressed="false"><span>◎</span><small>Mute</small></button>',
              '<button type="button" class="end" data-call-control="end"><span>×</span><small>End</small></button>',
              '<button type="button" data-call-control="speaker" aria-pressed="true"><span>◖</span><small>Speaker</small></button>',
            '</div>',
          '</div>'
        ].join('');
        var root = query('.vs2-active-call', body);
        var stateText = query('.vs2-call-state', root);
        var caption = query('.vs2-live-caption', root);
        var duration = query('.vs2-call-duration', root);

        function setState(state, label, captionText) {
          if (thisRun !== callRun || !root.isConnected) return;
          root.dataset.callState = state;
          stateText.textContent = label;
          caption.textContent = captionText;
        }

        function connect() {
          if (thisRun !== callRun) return;
          callStart = Date.now();
          setState('listening', 'Listening', 'You: “Give me the latest VibeSpace update.”');
          timerInterval = window.setInterval(function () {
            var seconds = Math.max(0, Math.floor((Date.now() - callStart) / 1000));
            duration.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
          }, 500);
          schedule(timers, function () {
            setState('thinking', 'Thinking', contact.name + ' is checking the connected workspace…');
          }, 1250);
          schedule(timers, function () {
            setState('speaking', 'Speaking', contact.line);
            if (speaker && !muted) {
              speakContact(contact, contact.line, function () {
                setState('listening', 'Listening', 'Your turn. Captions remain active.');
              });
            } else {
              schedule(timers, function () {
                setState('listening', 'Listening', 'Your turn. Captions remain active.');
              }, 1900);
            }
          }, 2450);
        }

        if (answered || reducedMotion()) connect();
        else schedule(timers, connect, 850);

        queryAll('[data-call-control]', root).forEach(function (button) {
          button.addEventListener('click', function () {
            var control = button.dataset.callControl;
            if (control === 'end') {
              cleanupCall();
              root.dataset.callState = 'ended';
              stateText.textContent = 'Call ended';
              caption.textContent = 'Call ended. Captions and speech stopped.';
              duration.textContent = duration.textContent;
              schedule(timers, renderList, reducedMotion() ? 0 : 650);
            } else if (control === 'mute') {
              muted = !muted;
              button.setAttribute('aria-pressed', muted ? 'true' : 'false');
              button.classList.toggle('is-active', muted);
              if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
            } else if (control === 'speaker') {
              speaker = !speaker;
              button.setAttribute('aria-pressed', speaker ? 'true' : 'false');
              button.classList.toggle('is-active', !speaker);
              if (!speaker && window.speechSynthesis) window.speechSynthesis.cancel();
            }
          });
        });
      }

      renderList();
      appVisibility = function (hidden) {
        if (hidden) {
          try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
        }
      };
      appCleanup = cleanupCall;
    }

    function renderMessages() {
      var body = appShell('Messages', 'vs2-messages-app');
      body.innerHTML = '<div class="vs2-message-list"></div>';
      var list = query('.vs2-message-list', body);
      PHONE_CONTACTS.slice(0, 6).forEach(function (contact, index) {
        var row = create('button', 'vs2-message-row');
        row.type = 'button';
        row.innerHTML = '<span class="vs2-contact-avatar" style="--contact:' + contact.color + '">' + contact.initials + '</span><span><strong>' + contact.name + '</strong><small>' + contact.line.slice(0, 46) + '…</small></span><time>' + (index + 1) + 'm</time>';
        row.addEventListener('click', function () { renderThread(contact); });
        list.appendChild(row);
      });

      function renderThread(contact) {
        body.innerHTML = [
          '<div class="vs2-thread-head"><span class="vs2-contact-avatar" style="--contact:' + contact.color + '">' + contact.initials + '</span><div><strong>' + contact.name + '</strong><small>Available</small></div></div>',
          '<div class="vs2-thread-bubbles"><div class="them">' + contact.line + '</div><div class="you">Thanks. Keep it linked to Context Map.</div></div>',
          '<form class="vs2-thread-composer"><input aria-label="Message ' + contact.name + '" placeholder="Message"><button type="submit">Send</button></form>',
          '<button class="vs2-inline-back" type="button">‹ Messages</button>'
        ].join('');
        var form = query('.vs2-thread-composer', body);
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var input = query('input', form);
          if (!input.value.trim()) return;
          var bubble = create('div', 'you', input.value.trim());
          query('.vs2-thread-bubbles', body).appendChild(bubble);
          input.value = '';
        });
        query('.vs2-inline-back', body).addEventListener('click', function () { openApp('messages'); });
      }
      appCleanup = function () {};
    }

    function renderPhotos() {
      var body = appShell('Photos', 'vs2-photos-app');
      body.innerHTML = [
        '<div class="vs2-photo-feature"><div class="vs2-photo-art art-context"><span>Context Map</span><strong>42 connected sources</strong></div></div>',
        '<div class="vs2-photo-grid">',
          '<button type="button" class="vs2-photo-art art-agents"><span>Agent handoff</span></button>',
          '<button type="button" class="vs2-photo-art art-build"><span>Build verified</span></button>',
          '<button type="button" class="vs2-photo-art art-voice"><span>Voice session</span></button>',
          '<button type="button" class="vs2-photo-art art-skill"><span>Skill editor</span></button>',
        '</div>',
        '<p class="vs2-photo-count">' + (5 + photoCaptures) + ' local demo images</p>'
      ].join('');
      appCleanup = function () {};
    }

    function renderCamera() {
      var body = appShell('Camera', 'vs2-camera-app');
      body.innerHTML = [
        '<div class="vs2-camera-preview"><div class="vs2-camera-gridlines"></div><span>VIBESPACE · PORTRAIT</span><div class="vs2-camera-subject"><i></i><strong>Context in focus</strong></div></div>',
        '<div class="vs2-camera-controls"><button type="button" data-camera-tone>Warm</button><button type="button" class="vs2-shutter" aria-label="Take photo"></button><button type="button" data-camera-flip>Flip</button></div>',
        '<p class="vs2-camera-status" aria-live="polite">Ready</p>'
      ].join('');
      query('.vs2-shutter', body).addEventListener('click', function () {
        photoCaptures += 1;
        var status = query('.vs2-camera-status', body);
        status.textContent = 'Captured · saved to Photos';
        query('.vs2-camera-preview', body).classList.add('is-captured');
        window.setTimeout(function () {
          var preview = query('.vs2-camera-preview', body);
          if (preview) preview.classList.remove('is-captured');
        }, 240);
      });
      query('[data-camera-tone]', body).addEventListener('click', function (event) {
        query('.vs2-camera-preview', body).classList.toggle('is-cool');
        event.currentTarget.textContent = event.currentTarget.textContent === 'Warm' ? 'Cool' : 'Warm';
      });
      query('[data-camera-flip]', body).addEventListener('click', function () {
        query('.vs2-camera-subject', body).classList.toggle('is-flipped');
      });
      appCleanup = function () {};
    }

    function renderDial() {
      var body = appShell('Dial', 'vs2-dial-app');
      body.innerHTML = '<div class="vs2-dial-number" aria-live="polite">&nbsp;</div><div class="vs2-dial-grid"></div><button class="vs2-dial-call" type="button">' + iconMarkup('calls') + '</button>';
      var number = query('.vs2-dial-number', body);
      var grid = query('.vs2-dial-grid', body);
      ['1','2','3','4','5','6','7','8','9','*','0','#'].forEach(function (digit) {
        var button = create('button', '', digit);
        button.type = 'button';
        button.addEventListener('click', function () {
          number.textContent = (number.textContent.trim() + digit).slice(0, 16) || '\u00a0';
        });
        grid.appendChild(button);
      });
      query('.vs2-dial-call', body).addEventListener('click', function () {
        openApp('calls');
      });
      appCleanup = function () {};
    }

    function renderSimpleApp(appId) {
      var app = appById(appId);
      var body = appShell(app.name, 'vs2-simple-app vs2-simple-' + appId);
      var templates = {
        notes: '<div class="vs2-note-card"><input value="Launch notes" aria-label="Note title"><textarea aria-label="Note body">Keep the story simple: one request, one orchestrator, one connected memory.</textarea><small>Saved locally in this demo</small></div>',
        alerts: '<div class="vs2-alert-feed"><div><span class="ok">✓</span><p><strong>Build recovered</strong><small>Reviewer approved the website patch</small></p><time>now</time></div><div><span>J</span><p><strong>Jarvis finished</strong><small>Summary saved to Context Map</small></p><time>2m</time></div><div><span>!</span><p><strong>Deadline tomorrow</strong><small>Launch checklist has 3 open tasks</small></p><time>1h</time></div></div>',
        jarvis: '<div class="vs2-jarvis-mobile"><div class="vs2-jarvis-orb">J<i></i></div><h4>Good evening.</h4><p>The project is healthy. One reviewer note remains on the mobile browser fallback.</p><button type="button">Run project check</button></div>',
        settings: '<div class="vs2-settings-list"><label><span>Live captions<small>Always available during demo calls</small></span><input type="checkbox" checked></label><label><span>Device voice<small>Uses installed browser voices</small></span><input type="checkbox" checked></label><label><span>Reduced motion<small>Follows your operating system</small></span><input type="checkbox" ' + (reducedMotion() ? 'checked' : '') + ' disabled></label></div>',
        vibecast: '<div class="vs2-vibecast"><div class="vs2-vibecast-cover"><span>VS</span><strong>The Shipping Log</strong><small>Episode 47 · Context that stays connected</small></div><button type="button">▶ Play 08:42 briefing</button></div>',
        appstore: '<div class="vs2-store-list"><div><span class="vs2-tone-copper">' + iconMarkup('jarvis') + '</span><p><strong>Jarvis Mobile</strong><small>Installed</small></p><button disabled>Open</button></div><div><span class="vs2-tone-cyan">' + iconMarkup('flappy') + '</span><p><strong>Flappy Vibe</strong><small>Installed</small></p><button disabled>Open</button></div><div><span class="vs2-tone-green">' + iconMarkup('snake') + '</span><p><strong>Snake</strong><small>Installed</small></p><button disabled>Open</button></div></div>'
      };
      body.innerHTML = templates[appId] || '<div class="vs2-simple-placeholder"><span class="vs2-app-glyph vs2-tone-' + app.tone + '">' + iconMarkup(app.id) + '</span><h4>' + app.name + '</h4><p>' + app.caption + '</p></div>';
      appCleanup = function () {};
    }

    function renderFlappy() {
      var body = appShell('Flappy Vibe', 'vs2-game-app vs2-flappy-app');
      body.innerHTML = [
        '<div class="vs2-game-head"><span>Score <strong data-score>0</strong></span><span>Best <strong data-best>0</strong></span></div>',
        '<canvas width="286" height="300" aria-label="Flappy Vibe game"></canvas>',
        '<div class="vs2-game-controls"><button type="button" data-game="start">Start</button><button type="button" data-game="pause">Pause</button><button type="button" data-game="restart">Restart</button></div>',
        '<p class="vs2-game-status" data-game-state="ready" aria-live="polite">Tap the canvas or press Space to flap.</p>'
      ].join('');
      var canvas = query('canvas', body);
      var context = canvas.getContext('2d');
      var scoreElement = query('[data-score]', body);
      var bestElement = query('[data-best]', body);
      var status = query('.vs2-game-status', body);
      var frame = null;
      var last = 0;
      var best = 0;
      var state = { running: false, paused: false, over: false, y: 142, velocity: 0, pipeX: 310, gapY: 120, score: 0, passed: false, hasFlapped: false, graceUntil: 0 };

      function setStatus(name, text) {
        status.dataset.gameState = name;
        status.textContent = text;
      }

      function resetGame() {
        state.running = false;
        state.paused = false;
        state.over = false;
        state.y = 142;
        state.velocity = 0;
        state.pipeX = 310;
        state.gapY = 105 + Math.random() * 70;
        state.score = 0;
        state.passed = false;
        state.hasFlapped = false;
        state.graceUntil = 0;
        scoreElement.textContent = '0';
        setStatus('ready', 'Tap the canvas or press Space to flap.');
        draw();
      }

      function draw() {
        var w = canvas.width;
        var h = canvas.height;
        var sky = context.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#304c62');
        sky.addColorStop(0.62, '#6aa6b1');
        sky.addColorStop(1, '#d7b179');
        context.fillStyle = sky;
        context.fillRect(0, 0, w, h);
        context.globalAlpha = 0.18;
        for (var i = 0; i < 6; i += 1) {
          context.fillStyle = '#fff';
          context.beginPath();
          context.arc(26 + i * 58, 45 + (i % 2) * 24, 18, 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
        context.fillStyle = '#395b47';
        var gap = 86;
        context.fillRect(state.pipeX, 0, 38, state.gapY - gap / 2);
        context.fillRect(state.pipeX - 4, state.gapY - gap / 2 - 13, 46, 13);
        context.fillRect(state.pipeX, state.gapY + gap / 2, 38, h - state.gapY - gap / 2 - 24);
        context.fillRect(state.pipeX - 4, state.gapY + gap / 2, 46, 13);
        context.fillStyle = '#183b2c';
        context.fillRect(0, h - 24, w, 24);
        context.save();
        context.translate(74, state.y);
        context.rotate(Math.max(-0.35, Math.min(0.6, state.velocity / 650)));
        context.fillStyle = '#f2a267';
        context.beginPath();
        context.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f7d9a6';
        context.beginPath();
        context.ellipse(-7, 4, 10, 6, -0.2, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#fff';
        context.beginPath(); context.arc(7, -4, 4, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#222';
        context.beginPath(); context.arc(8, -4, 1.7, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#e7bd4e';
        context.beginPath(); context.moveTo(15, 0); context.lineTo(27, 3); context.lineTo(15, 6); context.closePath(); context.fill();
        context.restore();
      }

      function endGame() {
        state.running = false;
        state.over = true;
        best = Math.max(best, state.score);
        bestElement.textContent = String(best);
        setStatus('over', 'Game over · press Restart or Space.');
      }

      function tick(timestamp) {
        if (!state.running || state.paused) return;
        var delta = Math.min(34, timestamp - (last || timestamp));
        last = timestamp;
        if (!state.hasFlapped && timestamp < state.graceUntil) {
          state.y = 142 + Math.sin(timestamp / 180) * 3;
          draw();
          frame = window.requestAnimationFrame(tick);
          return;
        }
        state.velocity += 0.00082 * delta * 1000;
        state.y += state.velocity * delta / 1000;
        state.pipeX -= 0.105 * delta;
        if (state.pipeX < -48) {
          state.pipeX = 310;
          state.gapY = 95 + Math.random() * 95;
          state.passed = false;
        }
        if (!state.passed && state.pipeX + 38 < 57) {
          state.passed = true;
          state.score += 1;
          scoreElement.textContent = String(state.score);
        }
        var gap = 86;
        var hitPipe = state.pipeX < 94 && state.pipeX + 38 > 56 && (state.y - 11 < state.gapY - gap / 2 || state.y + 11 > state.gapY + gap / 2);
        if (state.y < 10 || state.y > canvas.height - 35 || hitPipe) {
          endGame();
          draw();
          return;
        }
        draw();
        frame = window.requestAnimationFrame(tick);
      }

      function start() {
        if (state.over) resetGame();
        if (state.running && !state.paused) return;
        state.running = true;
        state.paused = false;
        if (!state.hasFlapped) {
          state.velocity = 0;
          state.graceUntil = performance.now() + 1800;
        }
        last = 0;
        setStatus('running', 'Flying · tap or press Space.');
        frame = window.requestAnimationFrame(tick);
      }

      function flap() {
        if (!state.running) start();
        state.hasFlapped = true;
        state.velocity = -290;
      }

      function pause() {
        if (!state.running) return;
        state.paused = !state.paused;
        if (state.paused) {
          if (frame) window.cancelAnimationFrame(frame);
          setStatus('paused', 'Paused');
        } else {
          last = 0;
          setStatus('running', 'Flying · tap or press Space.');
          frame = window.requestAnimationFrame(tick);
        }
      }

      function onKey(event) {
        if (event.code === 'Space' && currentApp === 'flappy') {
          event.preventDefault();
          flap();
        }
      }

      query('[data-game="start"]', body).addEventListener('click', start);
      query('[data-game="pause"]', body).addEventListener('click', pause);
      query('[data-game="restart"]', body).addEventListener('click', function () { resetGame(); start(); });
      canvas.addEventListener('pointerdown', flap);
      window.addEventListener('keydown', onKey);
      resetGame();

      appVisibility = function (hidden) {
        if (hidden && state.running && !state.paused) pause();
      };
      appCleanup = function () {
        state.running = false;
        if (frame) window.cancelAnimationFrame(frame);
        window.removeEventListener('keydown', onKey);
      };
    }

    function renderSnake() {
      var body = appShell('Snake', 'vs2-game-app vs2-snake-app');
      body.innerHTML = [
        '<div class="vs2-game-head"><span>Score <strong data-score>0</strong></span><span>Speed <strong data-speed>1×</strong></span></div>',
        '<canvas width="286" height="286" aria-label="Snake game"></canvas>',
        '<div class="vs2-snake-controls" aria-label="Snake direction controls">',
          '<button type="button" data-dir="up" aria-label="Move up">↑</button>',
          '<button type="button" data-dir="left" aria-label="Move left">←</button>',
          '<button type="button" data-dir="down" aria-label="Move down">↓</button>',
          '<button type="button" data-dir="right" aria-label="Move right">→</button>',
        '</div>',
        '<div class="vs2-game-controls"><button type="button" data-game="start">Start</button><button type="button" data-game="pause">Pause</button><button type="button" data-game="restart">Restart</button></div>',
        '<p class="vs2-game-status" data-game-state="ready" aria-live="polite">Use the D-pad, arrows, or WASD.</p>'
      ].join('');
      var canvas = query('canvas', body);
      var context = canvas.getContext('2d');
      var scoreElement = query('[data-score]', body);
      var speedElement = query('[data-speed]', body);
      var status = query('.vs2-game-status', body);
      var cell = 22;
      var cells = 13;
      var timer = null;
      var running = false;
      var paused = false;
      var snake = [];
      var direction = { x: 1, y: 0 };
      var nextDirection = { x: 1, y: 0 };
      var food = { x: 9, y: 6 };
      var score = 0;
      var speed = 1;

      function setStatus(name, text) {
        status.dataset.gameState = name;
        status.textContent = text;
      }

      function placeFood() {
        var attempts = 0;
        do {
          food = { x: Math.floor(Math.random() * cells), y: Math.floor(Math.random() * cells) };
          attempts += 1;
        } while (snake.some(function (part) { return part.x === food.x && part.y === food.y; }) && attempts < 80);
      }

      function fillRoundedRect(x, y, width, height, radius) {
        context.beginPath();
        if (typeof context.roundRect === 'function') {
          context.roundRect(x, y, width, height, radius);
        } else {
          var r = Math.min(radius, width / 2, height / 2);
          context.moveTo(x + r, y);
          context.arcTo(x + width, y, x + width, y + height, r);
          context.arcTo(x + width, y + height, x, y + height, r);
          context.arcTo(x, y + height, x, y, r);
          context.arcTo(x, y, x + width, y, r);
          context.closePath();
        }
        context.fill();
      }

      function draw() {
        context.fillStyle = '#17251f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = 'rgba(255,255,255,.045)';
        context.lineWidth = 1;
        for (var i = 0; i <= cells; i += 1) {
          context.beginPath(); context.moveTo(i * cell, 0); context.lineTo(i * cell, canvas.height); context.stroke();
          context.beginPath(); context.moveTo(0, i * cell); context.lineTo(canvas.width, i * cell); context.stroke();
        }
        context.fillStyle = '#e09363';
        context.beginPath();
        context.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.34, 0, Math.PI * 2);
        context.fill();
        snake.forEach(function (part, index) {
          context.fillStyle = index === 0 ? '#b5d490' : '#6f9b68';
          fillRoundedRect(part.x * cell + 2, part.y * cell + 2, cell - 4, cell - 4, 5);
          if (index === 0) {
            context.fillStyle = '#17251f';
            context.beginPath(); context.arc(part.x * cell + 14, part.y * cell + 7, 1.7, 0, Math.PI * 2); context.fill();
          }
        });
      }

      function intervalMs() {
        return Math.max(62, 150 - (speed - 1) * 14);
      }

      function startTimer() {
        if (timer) window.clearInterval(timer);
        timer = window.setInterval(tick, intervalMs());
      }

      function resetGame() {
        if (timer) window.clearInterval(timer);
        timer = null;
        running = false;
        paused = false;
        score = 0;
        speed = 1;
        snake = [{ x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        placeFood();
        scoreElement.textContent = '0';
        speedElement.textContent = '1×';
        setStatus('ready', 'Use the D-pad, arrows, or WASD.');
        draw();
      }

      function tick() {
        if (!running || paused) return;
        direction = nextDirection;
        var head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
        var collision = head.x < 0 || head.y < 0 || head.x >= cells || head.y >= cells || snake.some(function (part) { return part.x === head.x && part.y === head.y; });
        if (collision) {
          running = false;
          if (timer) window.clearInterval(timer);
          timer = null;
          setStatus('over', 'Game over · press Restart.');
          return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 1;
          scoreElement.textContent = String(score);
          var newSpeed = 1 + Math.floor(score / 4);
          if (newSpeed !== speed) {
            speed = newSpeed;
            speedElement.textContent = speed + '×';
            startTimer();
          }
          placeFood();
        } else {
          snake.pop();
        }
        draw();
      }

      function start() {
        if (running && !paused) return;
        running = true;
        paused = false;
        setStatus('running', 'Moving · collect the copper lights.');
        startTimer();
      }

      function pause() {
        if (!running) return;
        paused = !paused;
        setStatus(paused ? 'paused' : 'running', paused ? 'Paused' : 'Moving · collect the copper lights.');
      }

      function setDirection(x, y) {
        if (direction.x + x === 0 && direction.y + y === 0) return;
        nextDirection = { x: x, y: y };
        if (!running) start();
      }

      function onKey(event) {
        if (currentApp !== 'snake') return;
        var key = event.key.toLowerCase();
        var handled = true;
        if (key === 'arrowup' || key === 'w') setDirection(0, -1);
        else if (key === 'arrowdown' || key === 's') setDirection(0, 1);
        else if (key === 'arrowleft' || key === 'a') setDirection(-1, 0);
        else if (key === 'arrowright' || key === 'd') setDirection(1, 0);
        else handled = false;
        if (handled) event.preventDefault();
      }

      queryAll('[data-dir]', body).forEach(function (button) {
        button.addEventListener('click', function () {
          var dir = button.dataset.dir;
          if (dir === 'up') setDirection(0, -1);
          else if (dir === 'down') setDirection(0, 1);
          else if (dir === 'left') setDirection(-1, 0);
          else setDirection(1, 0);
        });
      });
      query('[data-game="start"]', body).addEventListener('click', start);
      query('[data-game="pause"]', body).addEventListener('click', pause);
      query('[data-game="restart"]', body).addEventListener('click', function () { resetGame(); start(); });
      window.addEventListener('keydown', onKey);
      resetGame();

      appVisibility = function (hidden) {
        if (hidden && running && !paused) pause();
      };
      appCleanup = function () {
        if (timer) window.clearInterval(timer);
        window.removeEventListener('keydown', onKey);
      };
    }

    function updateClock() {
      var now = new Date();
      var text = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      timeElement.textContent = text;
    }

    updateClock();
    var clockTimer = window.setInterval(updateClock, 1000);
    physicalHome.addEventListener('click', showHome);
    var unregisterVisibility = registerVisibility(function (hidden) {
      if (typeof appVisibility === 'function') appVisibility(hidden);
    });
    registerCleanup(function () {
      stopApp();
      window.clearInterval(clockTimer);
      physicalHome.removeEventListener('click', showHome);
      unregisterVisibility();
    });
    showHome();

    return {
      openApp: openApp,
      showHome: showHome,
      getCurrentApp: function () { return currentApp; },
      chooseVoice: chooseVoice,
      section: phoneSection
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Provider connection modes                                               */
  /* ---------------------------------------------------------------------- */

  function buildProviderSection(section) {
    if (!section) return null;
    section.className = 'vs2-section vs2-provider-section';
    section.innerHTML = [
      '<div class="vs2-section-head vs2-centered">',
        '<div class="vs2-kicker">AI connections</div>',
        '<h2>Use the AI access <em>you already have.</em></h2>',
        '<p class="vs2-lead">VibeSpace keeps three connection modes clear: official subscription bridges, native API or cloud connections, and local models. Jarvis chooses from the connections you approve.</p>',
      '</div>',
      '<div class="vs2-provider-demo" aria-label="Animated provider connection modes">',
        '<div class="vs2-provider-lanes">',
          '<article class="vs2-provider-lane mode-bridge">',
            '<div class="vs2-provider-mode"><span>A</span><div><strong>Subscription bridges</strong><small>Official installed CLIs · external-agent mode</small></div></div>',
            '<div class="vs2-provider-chips"><span>Codex CLI</span><span>Claude Code</span><span>Gemini CLI</span><span>Copilot CLI</span><span>OpenCode</span></div>',
            '<div class="vs2-provider-track"><i></i><i></i><i></i></div>',
          '</article>',
          '<article class="vs2-provider-lane mode-native">',
            '<div class="vs2-provider-mode"><span>B</span><div><strong>Native API &amp; cloud</strong><small>Full Jarvis provider mode · separately billed where applicable</small></div></div>',
            '<div class="vs2-provider-chips"><span>OpenAI</span><span>Anthropic</span><span>Gemini</span><span>xAI</span><span>DeepSeek</span><span>GLM</span><span>Bedrock</span><span>Vertex</span></div>',
            '<div class="vs2-provider-track"><i></i><i></i><i></i></div>',
          '</article>',
          '<article class="vs2-provider-lane mode-local">',
            '<div class="vs2-provider-mode"><span>C</span><div><strong>Local runtime</strong><small>Runs on your computer · no provider subscription quota</small></div></div>',
            '<div class="vs2-provider-chips"><span>Ollama</span><span>Local models</span><span>Offline</span></div>',
            '<div class="vs2-provider-track"><i></i><i></i><i></i></div>',
          '</article>',
        '</div>',
        '<div class="vs2-provider-core">',
          '<div class="vs2-core-halo h1"></div><div class="vs2-core-halo h2"></div>',
          '<div class="vs2-core-mark"><strong>J</strong><span>Jarvis route</span></div>',
          '<div class="vs2-core-status"><i></i> Approved connections only</div>',
        '</div>',
      '</div>',
      '<div class="vs2-provider-truth">',
        '<span class="vs2-truth-icon">✓</span>',
        '<p><strong>Truthful by design.</strong> The VibeSpace desktop app can detect supported tools through official, read-only status checks. This website is a visual demo—it does not scan your computer, read browser sessions, or turn a consumer subscription into an API license.</p>',
      '</div>'
    ].join('');
    return { section: section };
  }

  /* ---------------------------------------------------------------------- */
  /* Interactive agent assignments                                           */
  /* ---------------------------------------------------------------------- */

  var AGENTS = [
    {
      id: 'jarvis', name: 'Jarvis', role: 'Orchestrator', status: 'Directing', color: 'copper', progress: 92,
      task: 'Repair the failed build and keep the user’s intent intact.',
      context: ['Build #814 log', 'Context Map: auth flow', 'PR history', 'Launch task'],
      tools: ['Context retrieval', 'Agent routing', 'Task updates'],
      output: 'A reviewed plan, scoped assignments, and a final source-backed summary.'
    },
    {
      id: 'researcher', name: 'Researcher', role: 'Evidence & source map', status: 'Complete', color: 'plum', progress: 100,
      task: 'Find the smallest relevant source set and identify prior decisions.',
      context: ['Error signature', '3 linked notes', '2 prior fixes', 'GitHub commit'],
      tools: ['Search', 'Repository browser', 'Backlinks'],
      output: 'Seven ranked sources with provenance, freshness, and two risks.'
    },
    {
      id: 'builder', name: 'Builder', role: 'Implementation', status: 'Working', color: 'cyan', progress: 74,
      task: 'Patch the failing route without touching billing or unrelated application code.',
      context: ['Scoped files', 'Acceptance criteria', 'Research brief'],
      tools: ['Editor', 'Terminal', 'Focused tests'],
      output: 'A small reversible patch and its test evidence.'
    },
    {
      id: 'reviewer', name: 'Reviewer', role: 'Verification & risk', status: 'Queued', color: 'sage', progress: 28,
      task: 'Check behavior, mobile layout, accessibility, and the final diff.',
      context: ['Builder output', 'User request', 'Baseline behavior'],
      tools: ['Browser tests', 'Diff review', 'Risk checklist'],
      output: 'Approval, blocking findings, or a precise correction request.'
    }
  ];

  function buildAgentSection(section) {
    if (!section) return null;
    section.className = 'vs2-section vs2-agent-section';
    section.innerHTML = [
      '<div class="vs2-section-head">',
        '<div class="vs2-kicker">Jarvis-directed agents</div>',
        '<h2>Your team, <em>each with a clear assignment.</em></h2>',
        '<p class="vs2-lead">Click an agent to inspect the task, Context Map sources, approved tools, and expected output. Jarvis coordinates the handoffs while every specialist stays scoped.</p>',
      '</div>',
      '<div class="vs2-agent-workspace">',
        '<div class="vs2-agent-cards" role="list" aria-label="Agent assignments"></div>',
        '<article class="vs2-agent-detail" aria-live="polite">',
          '<div class="vs2-agent-detail-head"><span class="vs2-agent-avatar"></span><div><small>Selected agent</small><h3></h3><p></p></div><span class="vs2-agent-detail-status"></span></div>',
          '<div class="vs2-agent-task"><span>Current assignment</span><strong></strong></div>',
          '<div class="vs2-agent-detail-grid">',
            '<div><span>Context Map sources</span><ul data-agent-context></ul></div>',
            '<div><span>Approved tools</span><ul data-agent-tools></ul></div>',
          '</div>',
          '<div class="vs2-agent-output"><span>Expected output</span><p></p></div>',
          '<div class="vs2-agent-progress"><span></span><strong></strong></div>',
        '</article>',
      '</div>',
      '<p class="vs2-agent-note">This view shows assignments, sources, tools, status, and outputs—not private model chain-of-thought.</p>'
    ].join('');

    var cardsContainer = query('.vs2-agent-cards', section);
    var detail = query('.vs2-agent-detail', section);
    var currentAgent = null;

    AGENTS.forEach(function (agent) {
      var card = create('button', 'vs2-agent-card tone-' + agent.color);
      card.type = 'button';
      card.dataset.agent = agent.id;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML = [
        '<span class="vs2-agent-card-top"><span class="vs2-agent-mini-avatar">' + agent.name.charAt(0) + '</span><span class="vs2-agent-state"><i></i>' + agent.status + '</span></span>',
        '<span class="vs2-agent-card-copy"><strong>' + agent.name + '</strong><small>' + agent.role + '</small></span>',
        '<span class="vs2-agent-card-task">' + agent.task + '</span>',
        '<span class="vs2-agent-card-meta"><span>' + agent.context.length + ' sources</span><span>' + agent.tools.length + ' tools</span></span>',
        '<span class="vs2-agent-card-progress"><i style="width:' + agent.progress + '%"></i></span>'
      ].join('');
      card.addEventListener('click', function () { selectAgent(agent.id); });
      if (finePointerQuery && finePointerQuery.matches && !reducedMotion()) {
        card.addEventListener('pointermove', function (event) {
          var rect = card.getBoundingClientRect();
          var x = (event.clientX - rect.left) / rect.width - 0.5;
          var y = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.setProperty('--tilt-x', (-y * 5).toFixed(2) + 'deg');
          card.style.setProperty('--tilt-y', (x * 7).toFixed(2) + 'deg');
          card.style.setProperty('--glow-x', ((x + 0.5) * 100).toFixed(1) + '%');
          card.style.setProperty('--glow-y', ((y + 0.5) * 100).toFixed(1) + '%');
        });
        card.addEventListener('pointerleave', function () {
          card.style.removeProperty('--tilt-x');
          card.style.removeProperty('--tilt-y');
          card.style.removeProperty('--glow-x');
          card.style.removeProperty('--glow-y');
        });
      }
      cardsContainer.appendChild(card);
    });

    function fillList(list, items) {
      removeAllChildren(list);
      items.forEach(function (item) {
        var li = create('li', '', item);
        list.appendChild(li);
      });
    }

    function selectAgent(id) {
      var agent = AGENTS.filter(function (item) { return item.id === id; })[0] || AGENTS[0];
      currentAgent = agent;
      queryAll('.vs2-agent-card', section).forEach(function (card) {
        var selected = card.dataset.agent === agent.id;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      var avatar = query('.vs2-agent-avatar', detail);
      avatar.textContent = agent.name.charAt(0);
      avatar.className = 'vs2-agent-avatar tone-' + agent.color;
      query('h3', detail).textContent = agent.name;
      query('.vs2-agent-detail-head p', detail).textContent = agent.role;
      query('.vs2-agent-detail-status', detail).textContent = agent.status;
      query('.vs2-agent-task strong', detail).textContent = agent.task;
      fillList(query('[data-agent-context]', detail), agent.context);
      fillList(query('[data-agent-tools]', detail), agent.tools);
      query('.vs2-agent-output p', detail).textContent = agent.output;
      query('.vs2-agent-progress span', detail).style.width = agent.progress + '%';
      query('.vs2-agent-progress strong', detail).textContent = agent.progress + '%';
    }

    selectAgent('jarvis');
    return {
      select: selectAgent,
      selected: function () { return currentAgent && currentAgent.id; },
      section: section
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Inspector + Kanban workbench                                            */
  /* ---------------------------------------------------------------------- */

  function buildWorkbench(section) {
    if (!section) return null;
    section.className = 'vs2-section vs2-workbench-section';
    section.innerHTML = [
      '<div class="vs2-section-head vs2-centered">',
        '<div class="vs2-kicker">Inspector + Kanban</div>',
        '<h2>See the work. <em>See the task move with it.</em></h2>',
        '<p class="vs2-lead">The activity trace and board are two views of the same job. Run the sample task to watch sources, tools, review, and completion stay synchronized.</p>',
      '</div>',
      '<div class="vs2-workbench">',
        '<div class="vs2-inspector-panel">',
          '<div class="vs2-panel-bar"><div><span class="vs2-panel-light"></span><strong>Inspector</strong></div><button type="button" class="vs2-workbench-run">Run sample task</button></div>',
          '<div class="vs2-inspector-summary"><span>Selected</span><strong>Repair website mobile overflow</strong><small data-inspector-state>Waiting in queue</small></div>',
          '<div class="vs2-inspector-events" aria-live="polite"></div>',
          '<div class="vs2-inspector-evidence"><span>Linked evidence</span><div><b>7</b> sources</div><div><b>3</b> tools</div><div><b>1</b> reviewer</div></div>',
        '</div>',
        '<div class="vs2-kanban-panel">',
          '<div class="vs2-panel-bar"><div><span class="vs2-panel-light sage"></span><strong>Kanban</strong></div><span class="vs2-board-sync"><i></i> synced</span></div>',
          '<div class="vs2-kanban-board">',
            '<div class="vs2-kanban-column" data-column="queued"><header><span>Queued</span><b>1</b></header><div class="vs2-kanban-drop"></div></div>',
            '<div class="vs2-kanban-column" data-column="active"><header><span>Active</span><b>0</b></header><div class="vs2-kanban-drop"></div></div>',
            '<div class="vs2-kanban-column" data-column="review"><header><span>Review</span><b>0</b></header><div class="vs2-kanban-drop"></div></div>',
            '<div class="vs2-kanban-column" data-column="done"><header><span>Done</span><b>0</b></header><div class="vs2-kanban-drop"></div></div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    var runButton = query('.vs2-workbench-run', section);
    var events = query('.vs2-inspector-events', section);
    var inspectorState = query('[data-inspector-state]', section);
    var timers = [];
    var running = false;
    var stageIndex = 0;
    var stages = [
      { column: 'queued', state: 'Waiting in queue', event: 'Jarvis attached the user request and acceptance criteria.', type: 'context' },
      { column: 'active', state: 'Builder working', event: 'Context Map supplied the two relevant CSS rules and the 390 px browser capture.', type: 'source' },
      { column: 'active', state: 'Focused test running', event: 'Browser test checked width, touch targets, and horizontal overflow.', type: 'tool' },
      { column: 'review', state: 'Reviewer checking evidence', event: 'Reviewer compared the rendered phone against the requested mobile behavior.', type: 'review' },
      { column: 'done', state: 'Done · evidence saved', event: 'Task completed. Diff, screenshots, and source trail linked back to Context Map.', type: 'done' }
    ];
    var task = create('button', 'vs2-kanban-task');
    task.type = 'button';
    task.innerHTML = '<span class="vs2-task-tag">Website</span><strong>Repair mobile overflow</strong><small><span>Builder</span><span>7 sources</span></small><i></i>';
    task.dataset.stage = 'queued';

    function updateCounts() {
      queryAll('.vs2-kanban-column', section).forEach(function (column) {
        query('header b', column).textContent = String(queryAll('.vs2-kanban-task', column).length);
      });
    }

    function moveTask(columnName) {
      var target = query('[data-column="' + columnName + '"] .vs2-kanban-drop', section);
      if (target) target.appendChild(task);
      task.dataset.stage = columnName;
      updateCounts();
    }

    function addEvent(stage) {
      var event = create('div', 'vs2-inspector-event type-' + stage.type);
      event.innerHTML = '<span class="vs2-event-icon"></span><div><strong>' + stage.event + '</strong><small>' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + '</small></div>';
      events.appendChild(event);
      events.scrollTop = events.scrollHeight;
    }

    function reset() {
      clearTimers(timers);
      running = false;
      stageIndex = 0;
      runButton.disabled = false;
      runButton.textContent = 'Run sample task';
      inspectorState.textContent = 'Waiting in queue';
      removeAllChildren(events);
      addEvent(stages[0]);
      moveTask('queued');
      section.classList.remove('is-running', 'is-complete');
    }

    function applyStage(index) {
      var stage = stages[index];
      if (!stage) return;
      stageIndex = index;
      moveTask(stage.column);
      inspectorState.textContent = stage.state;
      addEvent(stage);
      task.classList.toggle('is-reviewing', stage.column === 'review');
      task.classList.toggle('is-done', stage.column === 'done');
      if (stage.column === 'done') {
        running = false;
        runButton.disabled = false;
        runButton.textContent = 'Run again';
        section.classList.remove('is-running');
        section.classList.add('is-complete');
      }
    }

    function run() {
      reset();
      running = true;
      section.classList.add('is-running');
      runButton.disabled = true;
      runButton.textContent = 'Running…';
      if (reducedMotion()) {
        stages.slice(1).forEach(function (_, index) { applyStage(index + 1); });
        return;
      }
      stages.slice(1).forEach(function (_, index) {
        schedule(timers, function () { applyStage(index + 1); }, 760 + index * 1050);
      });
    }

    task.addEventListener('click', function () {
      queryAll('.vs2-inspector-event', section).forEach(function (event) {
        event.classList.add('is-linked');
        window.setTimeout(function () { event.classList.remove('is-linked'); }, 620);
      });
    });
    runButton.addEventListener('click', run);
    moveTask('queued');
    addEvent(stages[0]);
    var unregisterVisibility = registerVisibility(function (hidden) {
      if (hidden && running) reset();
    });
    registerCleanup(function () {
      clearTimers(timers);
      unregisterVisibility();
    });

    return {
      run: run,
      reset: reset,
      getStage: function () { return task.dataset.stage; },
      section: section
    };
  }

  function handleVisibility() {
    var hidden = document.visibilityState === 'hidden';
    visibilityCallbacks.slice().forEach(function (callback) {
      try { callback(hidden); } catch (_) {}
    });
  }

  function initialise() {
    if (window.__VibeSpacePhase2Initialized) return;

    var legacyVoice = document.getElementById('voice') || query('.vs-system-section');
    var legacyCalling = document.getElementById('calling');
    var phoneSection = document.getElementById('calling-demo');
    if (!phoneSection && legacyCalling && (query('#jarvisCallDemo', legacyCalling) || query('.jarvis-call-demo', legacyCalling))) {
      phoneSection = legacyCalling;
      legacyCalling = null;
    }
    var providerSection = document.getElementById('hive');
    var agentSection = document.getElementById('council');
    var workbenchSection = document.getElementById('inspector');

    if (!legacyVoice && !phoneSection && !providerSection && !agentSection && !workbenchSection) return;
    window.__VibeSpacePhase2Initialized = true;
    document.documentElement.classList.add('vs2-ready');

    var story = buildSystemStory(legacyVoice, legacyCalling, phoneSection);
    var phone = buildPhone(phoneSection);
    var providers = buildProviderSection(providerSection);
    var agents = buildAgentSection(agentSection);
    var workbench = buildWorkbench(workbenchSection);

    document.addEventListener('visibilitychange', handleVisibility);
    registerCleanup(function () {
      document.removeEventListener('visibilitychange', handleVisibility);
    });

    window.VibeSpacePhase2 = {
      version: '2.0.0',
      story: story,
      phone: phone,
      providers: providers,
      agents: agents,
      workbench: workbench,
      voiceProfiles: VOICE_PROFILES,
      getRepoData: function (force) { return loadRepoData(!!force); },
      destroy: function () {
        while (cleanupStack.length) {
          try { cleanupStack.pop()(); } catch (_) {}
        }
        document.documentElement.classList.remove('vs2-ready');
        window.__VibeSpacePhase2Initialized = false;
      }
    };

    document.dispatchEvent(new CustomEvent('vibespace:phase2-ready', {
      detail: { version: window.VibeSpacePhase2.version }
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
