/* Interactive VibeSpace system model.
 * This progressively upgrades two redundant static marketing sections while
 * preserving the existing, fully interactive calling demo below them. */
(function () {
  'use strict';

  var voiceSection = document.getElementById('voice');
  var staticCallingSection = document.getElementById('calling');
  var callingDemoSection = document.getElementById('calling-demo');

  if (!voiceSection || !staticCallingSection || !callingDemoSection) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stageNames = ['Intent', 'Context', 'Jarvis', 'Models', 'Tools', 'Review', 'Result'];
  var stageTypes = ['input', 'context', 'jarvis', 'models', 'tools', 'review', 'result'];

  var scenarios = {
    build: {
      label: 'Fix a failed build',
      shortLabel: 'Build repair',
      source: 'Chat + project',
      request: '“The build broke after the auth change. Find it, fix it, test it, and show me the evidence.”',
      steps: [
        {
          title: 'Intent enters one workspace',
          copy: 'A typed request, voice turn, scheduled trigger, or phone call lands in the same project-aware workspace instead of becoming another disconnected thread.',
          signal: 'Intent captured',
          chips: ['Source · Chat', 'Project · VibeSpace', 'Priority · High'],
          log: ['Request normalized', 'Project scope attached', 'No tool has run yet']
        },
        {
          title: 'Context is assembled before action',
          copy: 'VibeSpace scopes the active project, recent changes, stored memory, tasks, and relevant files so every collaborator starts from the same grounded context.',
          signal: 'Context ready',
          chips: ['Recent diff', 'Project memory', 'Active task'],
          log: ['Branch context found', 'Auth change identified', 'Relevant memory loaded']
        },
        {
          title: 'Jarvis plans and routes the work',
          copy: 'Jarvis turns the request into visible work: inspect the failure, isolate the cause, patch narrowly, test the change, and stop for approval before anything ships.',
          signal: 'Plan created',
          chips: ['Scout', 'Builder', 'Critic'],
          log: ['Boundary · site + auth', 'Risk · sign-in regression', 'Approval gate · enabled']
        },
        {
          title: 'Specialists reason in parallel',
          copy: 'A researcher traces the failure, a coder proposes the smallest safe patch, and a critic challenges assumptions and edge cases. Their roles stay visible.',
          signal: 'Council active',
          chips: ['Trace failure', 'Draft patch', 'Challenge edge cases'],
          log: ['Researcher found failing path', 'Coder drafted focused change', 'Critic requested offline case']
        },
        {
          title: 'Tools execute with a visible trail',
          copy: 'Terminal agents inspect files, run the narrowest test first, then broader checks. Commands, output, and ownership remain inspectable rather than hidden.',
          signal: 'Tools running',
          chips: ['PTY terminals', 'Targeted test', 'Broader checks'],
          log: ['auth.test · pass', 'type-check · pass', 'build · pass']
        },
        {
          title: 'Evidence reaches the human gate',
          copy: 'The proposed diff, test evidence, known risks, and rollback path arrive together. VibeSpace waits for a person to approve the meaningful action.',
          signal: 'Approval required',
          chips: ['Diff review', 'Test evidence', 'Rollback ready'],
          log: ['Scope verified', 'No unrelated files', 'Waiting for approval']
        },
        {
          title: 'The result feeds the next request',
          copy: 'The fix ships with a concise summary, task updates, and durable project memory so the next conversation starts from what actually changed.',
          signal: 'Workflow complete',
          chips: ['Result delivered', 'Task updated', 'Memory saved'],
          log: ['Build restored', 'Evidence attached', 'Context retained']
        }
      ]
    },
    research: {
      label: 'Research and plan',
      shortLabel: 'Launch research',
      source: 'Voice + web',
      request: '“Compare our deployment options, challenge the trade-offs, and turn the evidence into a launch plan.”',
      steps: [
        {
          title: 'A broad question becomes a clear brief',
          copy: 'Voice or chat captures the goal, decision deadline, constraints, and expected deliverable without forcing the user to organize separate model tabs.',
          signal: 'Brief captured',
          chips: ['Goal · compare', 'Output · launch plan', 'Deadline · today'],
          log: ['Question normalized', 'Decision criteria requested', 'Research scope bounded']
        },
        {
          title: 'Existing knowledge is brought forward',
          copy: 'Project notes, architecture, prior decisions, cost assumptions, and user preferences are gathered before outside research begins.',
          signal: 'Context ready',
          chips: ['Architecture', 'Prior decisions', 'Constraints'],
          log: ['Current host found', 'Backend split retained', 'Commercial constraints loaded']
        },
        {
          title: 'Jarvis decomposes the decision',
          copy: 'Jarvis creates a research plan: verify current platform capabilities, compare operational trade-offs, identify migration risk, and produce a recommendation with caveats.',
          signal: 'Plan created',
          chips: ['Verify', 'Compare', 'Recommend'],
          log: ['Primary sources required', 'Freshness check enabled', 'Decision matrix queued']
        },
        {
          title: 'Models take distinct analytical roles',
          copy: 'Researchers collect evidence, a strategist frames the decision, and a critic searches for missing costs, weak assumptions, and alternative interpretations.',
          signal: 'Council active',
          chips: ['Evidence', 'Strategy', 'Critique'],
          log: ['Sources cross-checked', 'Trade-offs scored', 'Counter-case added']
        },
        {
          title: 'Tools turn sources into working material',
          copy: 'Browser research, repository inspection, calculators, documents, and structured notes feed one traceable evidence set instead of scattered copy-paste.',
          signal: 'Evidence assembled',
          chips: ['Official docs', 'Repo facts', 'Cost model'],
          log: ['Claims linked to sources', 'Unknowns marked', 'Assumptions separated']
        },
        {
          title: 'The recommendation is stress-tested',
          copy: 'VibeSpace checks the recommendation against constraints, highlights unresolved risk, and keeps irreversible steps behind an explicit approval gate.',
          signal: 'Recommendation reviewed',
          chips: ['Risks', 'Unknowns', 'Rollback'],
          log: ['Migration risk scored', 'Fallback documented', 'No production action taken']
        },
        {
          title: 'A decision-ready plan is delivered',
          copy: 'The output combines the recommendation, evidence, phased steps, verification checks, and rollback plan—then remembers the decision for future work.',
          signal: 'Plan complete',
          chips: ['Recommendation', 'Phases', 'Memory saved'],
          log: ['Decision memo ready', 'Next actions sequenced', 'Context retained']
        }
      ]
    },
    capture: {
      label: 'Voice to action',
      shortLabel: 'Voice capture',
      source: 'Voice + schedule',
      request: '“Tomorrow morning, remind me to review the failed sign-in test with the team and attach the project context.”',
      steps: [
        {
          title: 'Natural speech becomes structured intent',
          copy: 'Local voice capture turns the spoken request into text, while preserving the user’s meaning instead of requiring form fields during the moment.',
          signal: 'Voice captured',
          chips: ['Local voice', 'Tomorrow morning', 'Team review'],
          log: ['Speech transcribed', 'Date phrase detected', 'Action verb identified']
        },
        {
          title: 'The right project context is attached',
          copy: 'VibeSpace links the active project, the failed sign-in test, related tasks, and recent discussion so the reminder is useful when it returns.',
          signal: 'Context ready',
          chips: ['Sign-in test', 'Project thread', 'Related task'],
          log: ['Failure trace found', 'Team context attached', 'Duplicate check clear']
        },
        {
          title: 'Jarvis extracts the action safely',
          copy: 'Jarvis separates title, timing, participants, priority, and supporting context, then shows the proposed action before it is scheduled.',
          signal: 'Action drafted',
          chips: ['Title', 'Due time', 'Context bundle'],
          log: ['Action fields parsed', 'Ambiguity · low', 'Confirmation requested']
        },
        {
          title: 'Models resolve ambiguity only when needed',
          copy: 'Language reasoning checks whether “tomorrow morning” and “with the team” are sufficiently clear, asking a follow-up only when the action would otherwise be unreliable.',
          signal: 'Meaning verified',
          chips: ['Time intent', 'Participants', 'Priority'],
          log: ['Local timezone applied', 'Team scope inferred', 'No follow-up required']
        },
        {
          title: 'The schedule and task tools prepare the action',
          copy: 'The reminder, task, and context link are assembled in the workspace. Nothing is silently sent or changed outside the user-approved scope.',
          signal: 'Action prepared',
          chips: ['Reminder', 'Task', 'Project link'],
          log: ['Draft reminder created', 'Task context linked', 'External send · none']
        },
        {
          title: 'The user approves the meaningful change',
          copy: 'A compact confirmation shows what will happen, when it will happen, and which context will be included before the schedule is committed.',
          signal: 'Approval required',
          chips: ['What', 'When', 'Context'],
          log: ['Preview shown', 'Scope unchanged', 'Waiting for approval']
        },
        {
          title: 'The action returns with the full story',
          copy: 'At the chosen time, the reminder arrives with the failed test, related task, and discussion context—then the completed action becomes part of memory.',
          signal: 'Action complete',
          chips: ['Reminder ready', 'Context attached', 'Memory updated'],
          log: ['Schedule confirmed', 'Context preserved', 'Future lookup enabled']
        }
      ]
    }
  };

  function icon(type) {
    var icons = {
      input: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M6.5 11.5v.5a5.5 5.5 0 0 0 11 0v-.5M12 17.5V21M9 21h6"/></svg>',
      context: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
      jarvis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.5 5.1L18 9l-4.5 1.9L12 16l-1.5-5.1L6 9l4.5-1.9L12 2Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></svg>',
      models: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><path d="M3 20c.4-3.2 2.1-5 5-5 1.9 0 3.2.8 4 2.2.8-1.4 2.1-2.2 4-2.2 2.9 0 4.6 1.8 5 5"/></svg>',
      tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></svg>',
      review: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.2 8.4-8 10-4.8-1.6-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
      result: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m8 12 2.5 2.5L16 9M8 5V3M16 5V3"/></svg>'
    };
    return icons[type] || icons.jarvis;
  }

  function stageButton(index) {
    var type = stageTypes[index];
    return '<button class="vs-stage-node" type="button" data-vs-stage="' + index + '" style="--vs-x:' + [8, 25, 43, 63, 63, 79, 92][index] + '%;--vs-y:' + [50, 19, 50, 19, 81, 50, 50][index] + '%" aria-label="Inspect stage ' + (index + 1) + ': ' + stageNames[index] + '">' +
      '<span class="vs-stage-index">0' + (index + 1) + '</span>' +
      '<span class="vs-stage-icon">' + icon(type) + '</span>' +
      '<span class="vs-stage-copy"><strong>' + stageNames[index] + '</strong><small>' + ['Request', 'Memory', 'Orchestrator', 'Council', 'Execution', 'Human gate', 'Outcome'][index] + '</small></span>' +
      '<span class="vs-stage-state" aria-hidden="true"></span>' +
    '</button>';
  }


  voiceSection.classList.add('vs-system-section');
  voiceSection.setAttribute('aria-labelledby', 'vs-system-title');
  voiceSection.innerHTML =
    '<div class="sec-head reveal in">' +
      '<div class="kicker">Inside VibeSpace</div>' +
      '<h2 id="vs-system-title">One request. <em>A whole system responds.</em></h2>' +
      '<p class="lead">Choose a real workflow, press Run, and follow the request through context, orchestration, specialist models, visible tools, human review, and memory.</p>' +
      '<div class="vs-system-proof" aria-label="System principles">' +
        '<span><i></i>Local-first context</span>' +
        '<span><i></i>Visible orchestration</span>' +
        '<span><i></i>Human approval gates</span>' +
      '</div>' +
    '</div>' +
    '<div class="vs-system-shell" id="vsSystemModel" role="region" aria-label="Interactive model of the VibeSpace workflow">' +
      '<div class="vs-system-toolbar">' +
        '<div class="vs-system-live"><span class="vs-system-live-dot" aria-hidden="true"></span><span>VibeSpace orchestration<small>Interactive system model</small></span></div>' +
        '<div class="vs-system-actions">' +
          '<button class="vs-system-action" type="button" data-vs-action="reset">Reset</button>' +
          '<button class="vs-system-action primary" type="button" data-vs-action="play" aria-pressed="false">Run workflow</button>' +
        '</div>' +
      '</div>' +
      '<div class="vs-scenario-bar">' +
        '<span class="vs-scenario-label">Choose a workflow</span>' +
        '<div class="vs-scenario-tabs" role="tablist" aria-label="Workflow scenarios">' +
          '<button class="vs-scenario-tab" type="button" role="tab" data-vs-scenario="build" aria-selected="true">Fix a failed build</button>' +
          '<button class="vs-scenario-tab" type="button" role="tab" data-vs-scenario="research" aria-selected="false" tabindex="-1">Research &amp; plan</button>' +
          '<button class="vs-scenario-tab" type="button" role="tab" data-vs-scenario="capture" aria-selected="false" tabindex="-1">Voice → action</button>' +
        '</div>' +
      '</div>' +
      '<div class="vs-request-strip">' +
        '<span class="vs-request-mark" aria-hidden="true">›_</span>' +
        '<div class="vs-request-copy"><span>Current request</span><strong data-vs-request></strong></div>' +
        '<span class="vs-request-source" data-vs-source></span>' +
      '</div>' +
      '<div class="vs-system-map" aria-label="Seven-stage VibeSpace workflow">' +
        '<svg class="vs-system-connectors" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="vs-system-path" data-vs-path="0" d="M80 260 C135 260 170 99 250 99"/>' +
          '<path class="vs-system-path" data-vs-path="1" d="M250 99 C330 99 350 260 430 260"/>' +
          '<path class="vs-system-path" data-vs-path="2" d="M430 260 C500 260 540 99 630 99"/>' +
          '<path class="vs-system-path" data-vs-path="3" d="M630 99 C700 150 700 370 630 421"/>' +
          '<path class="vs-system-path" data-vs-path="4" d="M630 421 C705 421 720 260 790 260"/>' +
          '<path class="vs-system-path" data-vs-path="5" d="M790 260 L920 260"/>' +
          '<path class="vs-memory-loop" d="M920 278 C910 492 280 500 250 120"/>' +
        '</svg>' +
        stageNames.map(function (_, index) { return stageButton(index); }).join('') +
      '</div>' +
      '<div class="vs-system-detail">' +
        '<article class="vs-detail-card" aria-live="polite" aria-atomic="true">' +
          '<div class="vs-detail-top"><div><span class="vs-detail-eyebrow" data-vs-eyebrow></span><h3 class="vs-detail-title" data-vs-title></h3></div><span class="vs-detail-signal" data-vs-signal></span></div>' +
          '<p class="vs-detail-copy" data-vs-copy></p>' +
          '<div class="vs-detail-chips" data-vs-chips></div>' +
        '</article>' +
        '<aside class="vs-log-card">' +
          '<div><div class="vs-progress-head"><span>Workflow progress</span><strong data-vs-progress-label></strong></div><div class="vs-progress-track"><span class="vs-progress-fill" data-vs-progress></span></div></div>' +
          '<div><div class="vs-log-title">Live trace <span data-vs-trace-status></span></div><ol class="vs-log-list" data-vs-log></ol></div>' +
        '</aside>' +
      '</div>' +
      '<div class="vs-system-foot">' +
        '<span>Select any node to inspect it. Run animates the full path; Pause stops it instantly.</span>' +
        '<div class="vs-stage-dots" aria-label="Workflow stage shortcuts">' +
          stageNames.map(function (name, index) { return '<button class="vs-stage-dot" type="button" data-vs-dot="' + index + '" aria-label="Go to ' + name + '"></button>'; }).join('') +
        '</div>' +
      '</div>' +
    '</div>';

  staticCallingSection.remove();
  callingDemoSection.id = 'calling';
  callingDemoSection.classList.add('calling-demo-section');
  callingDemoSection.setAttribute('data-original-section-id', 'calling-demo');

  var model = document.getElementById('vsSystemModel');
  if (!model) return;

  var scenarioKeys = Object.keys(scenarios);
  var scenarioButtons = Array.prototype.slice.call(model.querySelectorAll('[data-vs-scenario]'));
  var stageButtons = Array.prototype.slice.call(model.querySelectorAll('[data-vs-stage]'));
  var stageDots = Array.prototype.slice.call(model.querySelectorAll('[data-vs-dot]'));
  var paths = Array.prototype.slice.call(model.querySelectorAll('[data-vs-path]'));
  var playButton = model.querySelector('[data-vs-action="play"]');
  var resetButton = model.querySelector('[data-vs-action="reset"]');
  var requestEl = model.querySelector('[data-vs-request]');
  var sourceEl = model.querySelector('[data-vs-source]');
  var eyebrowEl = model.querySelector('[data-vs-eyebrow]');
  var titleEl = model.querySelector('[data-vs-title]');
  var signalEl = model.querySelector('[data-vs-signal]');
  var copyEl = model.querySelector('[data-vs-copy]');
  var chipsEl = model.querySelector('[data-vs-chips]');
  var progressEl = model.querySelector('[data-vs-progress]');
  var progressLabelEl = model.querySelector('[data-vs-progress-label]');
  var traceStatusEl = model.querySelector('[data-vs-trace-status]');
  var logEl = model.querySelector('[data-vs-log]');

  var currentScenario = 'build';
  var currentStage = 0;
  var playing = false;
  var stepTimer = null;

  function stopPlayback(completed) {
    playing = false;
    if (stepTimer) window.clearTimeout(stepTimer);
    stepTimer = null;
    playButton.setAttribute('aria-pressed', 'false');
    playButton.textContent = completed ? 'Run again' : 'Run workflow';
    traceStatusEl.textContent = completed ? 'complete' : 'paused';
  }

  function renderLog(items) {
    logEl.innerHTML = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item;
      logEl.appendChild(li);
    });
  }

  function renderStage(index, options) {
    var settings = options || {};
    var scenario = scenarios[currentScenario];
    var step = scenario.steps[index];
    currentStage = index;

    stageButtons.forEach(function (button, buttonIndex) {
      button.classList.toggle('is-active', buttonIndex === index);
      button.classList.toggle('is-complete', buttonIndex < index);
      if (buttonIndex === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    stageDots.forEach(function (dot, dotIndex) {
      dot.classList.toggle('is-active', dotIndex === index);
      dot.classList.toggle('is-complete', dotIndex < index);
    });
    paths.forEach(function (path, pathIndex) {
      path.classList.toggle('is-active', pathIndex === index - 1);
      path.classList.toggle('is-complete', pathIndex < index - 1);
    });

    eyebrowEl.textContent = 'Stage ' + (index + 1) + ' of ' + stageNames.length + ' · ' + stageNames[index];
    titleEl.textContent = step.title;
    signalEl.textContent = step.signal;
    copyEl.textContent = step.copy;
    chipsEl.innerHTML = '';
    step.chips.forEach(function (chip) {
      var span = document.createElement('span');
      span.className = 'vs-detail-chip';
      span.textContent = chip;
      chipsEl.appendChild(span);
    });
    renderLog(step.log);
    progressEl.style.width = (((index + 1) / stageNames.length) * 100).toFixed(3) + '%';
    progressLabelEl.textContent = (index + 1) + ' / ' + stageNames.length;
    if (!playing) traceStatusEl.textContent = index === stageNames.length - 1 ? 'complete' : 'inspecting';

    if (settings.focus) stageButtons[index].focus({ preventScroll: true });
  }

  function renderScenario(key) {
    currentScenario = key;
    var scenario = scenarios[key];
    requestEl.textContent = scenario.request;
    sourceEl.textContent = scenario.source;
    scenarioButtons.forEach(function (button) {
      var selected = button.getAttribute('data-vs-scenario') === key;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    renderStage(0);
    traceStatusEl.textContent = 'ready';
  }

  function queueNextStage() {
    if (!playing) return;
    var delay = reduceMotion ? 2100 : 1550;
    stepTimer = window.setTimeout(function () {
      if (!playing) return;
      if (currentStage >= stageNames.length - 1) {
        stopPlayback(true);
        return;
      }
      renderStage(currentStage + 1);
      queueNextStage();
    }, delay);
  }

  function startPlayback() {
    if (currentStage >= stageNames.length - 1) renderStage(0);
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    playButton.textContent = 'Pause';
    traceStatusEl.textContent = 'running';
    queueNextStage();
  }

  function togglePlayback() {
    if (playing) stopPlayback(false);
    else startPlayback();
  }

  function moveFocus(items, currentIndex, delta) {
    var next = (currentIndex + delta + items.length) % items.length;
    items[next].focus();
    items[next].click();
  }

  scenarioButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      stopPlayback(false);
      renderScenario(button.getAttribute('data-vs-scenario'));
    });
    button.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveFocus(scenarioButtons, index, 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(scenarioButtons, index, -1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        scenarioButtons[0].focus();
        scenarioButtons[0].click();
      } else if (event.key === 'End') {
        event.preventDefault();
        scenarioButtons[scenarioButtons.length - 1].focus();
        scenarioButtons[scenarioButtons.length - 1].click();
      }
    });
  });

  stageButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      stopPlayback(false);
      renderStage(index);
    });
    button.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        stopPlayback(false);
        var next = (index + 1) % stageButtons.length;
        renderStage(next, { focus: true });
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        stopPlayback(false);
        var previous = (index - 1 + stageButtons.length) % stageButtons.length;
        renderStage(previous, { focus: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        stopPlayback(false);
        renderStage(0, { focus: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        stopPlayback(false);
        renderStage(stageButtons.length - 1, { focus: true });
      }
    });
  });

  stageDots.forEach(function (dot, index) {
    dot.addEventListener('click', function () {
      stopPlayback(false);
      renderStage(index);
    });
  });

  playButton.addEventListener('click', togglePlayback);
  resetButton.addEventListener('click', function () {
    stopPlayback(false);
    renderScenario(currentScenario);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && playing) stopPlayback(false);
  });

  renderScenario(currentScenario);

  // Start once when the model enters view, but never override reduced-motion users.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var hasAutoStarted = false;
    var modelObserver = new IntersectionObserver(function (entries) {
      if (!hasAutoStarted && entries[0].isIntersecting && entries[0].intersectionRatio >= 0.45) {
        hasAutoStarted = true;
        window.setTimeout(function () {
          if (!playing && currentStage === 0) startPlayback();
        }, 600);
        modelObserver.disconnect();
      }
    }, { threshold: [0.45] });
    modelObserver.observe(model);
  }
})();
