import {
  routes,
  changeRoute,
  transitionWorkflow,
  workflowCopy,
  planSummary,
  clampMap,
} from './cinematic-state.mjs';
import { createVoice } from './cinematic-voice.mjs';
const $ = (id) => document.getElementById(id);
const all = (selector) => [...document.querySelectorAll(selector)];
const on = (id, event, callback) => $(id)?.addEventListener(event, callback);
const gsap = window.gsap;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches,
  scenes = null,
  dirty = true,
  last = 0,
  sound = false,
  audio;
const voice = createVoice();
window.__cinematic = { frames: 0, activeScenes: 0, webgl: 'loading' };
function cue() {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, audio.currentTime + 0.08);
    gain.gain.setValueAtTime(0.025, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.13);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    sound = false;
  }
}
function press(selector, value, key) {
  all(selector).forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset[key] === value)),
  );
  cue();
  dirty = true;
}
function setMotion(value) {
  paused = value;
  document.documentElement.classList.toggle('motion-paused', paused);
  $('motion-toggle')?.setAttribute('aria-pressed', String(paused));
  if ($('motion-toggle')) $('motion-toggle').textContent = paused ? 'Motion paused' : 'Motion on';
  dirty = true;
}
setMotion(paused);
reduced.addEventListener('change', (event) => setMotion(event.matches));
on('motion-toggle', 'click', () => setMotion(!paused));
on('sound-toggle', 'click', () => {
  sound = !sound;
  $('sound-toggle').setAttribute('aria-pressed', String(sound));
  $('sound-toggle').textContent = sound ? 'Sound on' : 'Sound off';
  if (sound) cue();
  else {
    audio?.close();
    audio = null;
  }
});
document.addEventListener('visibilitychange', () => {
  dirty = true;
  if (document.hidden) {
    audio?.suspend();
  }
});
const menu = document.querySelector('.menu-toggle');
function closeMenu() {
  menu?.setAttribute('aria-expanded', 'false');
  if ($('mobile-menu')) $('mobile-menu').hidden = true;
}
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  $('mobile-menu').hidden = !open;
});
all('.mobile-menu a').forEach((link) => link.addEventListener('click', closeMenu));
all('.chapter-menu a').forEach((link) =>
  link.addEventListener('click', () => {
    document.querySelector('.chapter-menu').open = false;
  }),
);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menu.focus();
  }
});
addEventListener(
  'resize',
  () => {
    if (innerWidth > 800) closeMenu();
    dirty = true;
  },
  { passive: true },
);
addEventListener('scroll', () => (dirty = true), { passive: true });
addEventListener('pointermove', () => (dirty = true), { passive: true });

let routeState = { route: 'openai', conversation: 'atlas-release' };
all('[data-route]').forEach((button) =>
  button.addEventListener('click', () => {
    routeState = changeRoute(routeState, button.dataset.route);
    const route = routes[routeState.route];
    press('[data-route]', routeState.route, 'route');
    $('route-name').textContent = route.name;
    $('route-mode').textContent = route.mode;
    $('route-detail').textContent = route.detail;
    $('hive-stages').hidden = routeState.route !== 'hive';
    if (gsap && !paused)
      gsap.fromTo('.route-thread', { y: 5 }, { y: 0, duration: 0.3, overwrite: true });
  }),
);
let workflow = 'ready';
function step(event) {
  workflow = transitionWorkflow(workflow, event);
  const order = ['ready', 'research', 'build', 'review', 'approval', 'complete', 'declined'];
  const index = order.indexOf(workflow);
  $('workflow-title').textContent = workflowCopy[workflow][0];
  $('workflow-description').textContent = workflowCopy[workflow][1];
  $('workflow-number').textContent = String(Math.min(index, 5)).padStart(2, '0');
  $('workflow-next').hidden = index >= 4;
  $('workflow-next').textContent = workflow === 'ready' ? 'Start the walkthrough →' : 'Continue →';
  $('workflow-approval').hidden = workflow !== 'approval';
  all('[data-step]').forEach((el) => {
    el.classList.toggle('active', el.dataset.step === workflow);
    el.classList.toggle('done', order.indexOf(el.dataset.step) < index);
  });
  all('[data-lane]').forEach(
    (el, i) =>
      (el.textContent =
        workflow === 'declined'
          ? '› action declined'
          : workflow === 'complete'
            ? i === 0
              ? '✓ checklist attached'
              : '› ready'
            : index === 0
              ? '› waiting for direction'
              : i < index
                ? [
                    '› brief + criteria attached',
                    '› release checklist drafted',
                    '› review checks complete',
                    '› awaiting your approval',
                  ][i]
                : '› waiting for direction'),
  );
  cue();
}
on('workflow-next', 'click', () => {
  step('next');
  if (workflow === 'approval') $('workflow-approve').focus();
});
on('workflow-reset', 'click', () => {
  step('reset');
  $('workflow-next').focus();
});
on('workflow-approve', 'click', () => {
  step('approve');
  $('workflow-reset').focus();
});
on('workflow-decline', 'click', () => {
  step('decline');
  $('workflow-reset').focus();
});
const nodes = {
  brief: [
    'PROJECT SOURCE',
    'Project brief',
    'The goal, audience and constraints for this release. Attached to the active conversation and the Researcher.',
  ],
  criteria: [
    'REVIEW SOURCE',
    'Release criteria',
    'The release boundary and acceptance checks. The Reviewer uses these criteria to inspect the proposed checklist.',
  ],
  chat: [
    'ACTIVE THREAD',
    'Active conversation',
    'The brief, model responses and agent results share this conversation. Switching the model route keeps this context attached.',
  ],
  memory: [
    'PROJECT MEMORY',
    'Saved decision',
    'The reviewed decision belongs to Project Atlas memory, ready to inform the next task in this project.',
  ],
};
all('[data-node]').forEach((button) =>
  button.addEventListener('click', () => {
    press('[data-node]', button.dataset.node, 'node');
    const [kind, name, description] = nodes[button.dataset.node];
    $('context-kind').textContent = kind;
    $('context-name').textContent = name;
    $('context-description').textContent = description;
  }),
);
let map = { x: 0, y: 0, zoom: 1 };
all('[data-map]').forEach((button) =>
  button.addEventListener('click', () => {
    const action = button.dataset.map;
    if (action === 'reset') map = { x: 0, y: 0, zoom: 1 };
    else if (action === 'in') map.zoom += 0.1;
    else if (action === 'out') map.zoom -= 0.1;
    else map.x += action === 'left' ? -35 : 35;
    map = clampMap(map);
    $('map-pan').style.transform = `translate(${map.x}px,${map.y}px) scale(${map.zoom})`;
    $('map-zoom').textContent = Math.round(map.zoom * 100) + '%';
  }),
);
const layers = [
  'Chats, tasks and memory stay on the machine by default.',
  'Provider keys use the operating-system keychain. They are not stored in this website.',
  'Route through your own provider connections or a supported local model using Ollama.',
  'Cloud sync is optional. Telemetry is off by default; hosted services have their own allowances.',
];
all('[data-layer]').forEach((button) =>
  button.addEventListener('click', () => {
    press('[data-layer]', button.dataset.layer, 'layer');
    $('layer-description').textContent = layers[+button.dataset.layer];
    scenes?.selectLayer(+button.dataset.layer);
  }),
);
all('[data-plan]').forEach((button) =>
  button.addEventListener('click', () => {
    const id = button.dataset.plan,
      p = planSummary(id);
    press('[data-plan]', id, 'plan');
    all('[data-plan-card]').forEach((card) =>
      card.classList.toggle('selected', card.dataset.planCard === id),
    );
    $('plan-summary-title').textContent = `${p.name} / $${p.total} monthly total`;
    $('plan-summary-detail').textContent =
      `$20 Access + $${p.addon} feature plan. ${p.credits.toLocaleString('en-US')} shared credits. ` +
      (p.minutes
        ? `Up to ${p.minutes.toLocaleString('en-US')} Jarvis Call minutes or ${p.sms.toLocaleString('en-US')} SMS texts.`
        : 'Jarvis Call, SMS and cloud sync are not included.');
  }),
);
on('recompose', 'click', () => {
  const value = $('recompose').getAttribute('aria-pressed') !== 'true';
  $('recompose').setAttribute('aria-pressed', String(value));
  $('recompose').textContent = value ? 'Explore the layers ↗' : 'Bring it together ↗';
  scenes?.recompose(value);
  dirty = true;
  cue();
});
const dialog = $('media-dialog');
let opener;
all('[data-lightbox]').forEach((button) =>
  button.addEventListener('click', () => {
    opener = button;
    $('media-caption').textContent = button.dataset.caption;
    $('media-image').src = button.dataset.lightbox;
    dialog.showModal();
  }),
);
on('media-close', 'click', () => dialog.close());
dialog?.addEventListener('close', () => opener?.focus());
on('media-image', 'error', () => {
  $('media-caption').textContent +=
    ' Image could not load. The text demonstrations remain available.';
});

const assembly = { value: 100 };
function assemble() {
  const amount = paused ? 1 : assembly.value / 100;
  const windowEl = $('workspace-window');
  if (!windowEl) return;
  windowEl.style.transform = `translateY(${(1 - amount) * 45}px) rotateX(${(1 - amount) * 9}deg) scale(${0.9 + amount * 0.1})`;
  all('.fragment').forEach((el, i) => {
    el.style.opacity = String(1 - amount);
    el.style.translate = `${(i === 0 ? -1 : 1) * (1 - amount) * 25}px ${(1 - amount) * -20}px`;
  });
  $('assembly-range').value = String(Math.round(assembly.value));
  $('assembly-status').textContent =
    assembly.value > 95 ? 'One connected workspace' : `${Math.round(assembly.value)}% assembled`;
}
on('assembly-range', 'input', (event) => {
  gsap?.killTweensOf(assembly);
  assembly.value = +event.target.value;
  assemble();
});
if (gsap && window.ScrollTrigger) {
  gsap.registerPlugin(window.ScrollTrigger);
  window.ScrollTrigger.create({
    trigger: '.workspace-stage',
    start: 'top 95%',
    end: 'top 24%',
    onUpdate: (self) => {
      if (!paused) {
        assembly.value = self.progress * 100;
        assemble();
      }
    },
  });
}
function tick(time) {
  if (document.hidden) return;
  const visible = all('.scene-slot').some((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  });
  const voiceVisible =
    $('voice-state') &&
    (() => {
      const r = $('voice-state').getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    })();
  if (!dirty && (paused || (!visible && !(voice.active && voiceVisible)))) return;
  if (time - last < 1 / 40 && !dirty) return;
  last = time;
  scenes?.render(time, !paused);
  if (voiceVisible) voice.tick(time, !paused);
  window.__cinematic.frames++;
  window.__cinematic.activeScenes = scenes?.active || 0;
  dirty = false;
}
if (gsap) gsap.ticker.add(tick);
else {
  let handle;
  const frame = (ms) => {
    tick(ms / 1000);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  addEventListener('pagehide', () => cancelAnimationFrame(handle), { once: true });
}
// Critical HTML and fonts paint before the optional spatial enhancement downloads.
const enhance = () =>
  import('./cinematic-scenes.mjs')
    .then(({ createScenes }) => {
      scenes = createScenes();
      window.__cinematic.webgl = 'ready';
      dirty = true;
    })
    .catch(() => {
      window.__cinematic.webgl = 'fallback';
    });
if ('requestIdleCallback' in window) requestIdleCallback(enhance, { timeout: 1200 });
else setTimeout(enhance, 200);
addEventListener(
  'pagehide',
  () => {
    voice.stop();
    audio?.close();
  },
  { once: true },
);
document.documentElement.dataset.interactive = 'ready';
