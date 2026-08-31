import * as THREE from './three.module.js';

// ---------- Core Setup ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e24);
scene.fog = new THREE.FogExp2(0x0a0e24, 0.016);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
camera.position.set(0, 8, 12);

// ---------- Lights ----------
const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x201530, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
scene.add(sun);
const rim = new THREE.PointLight(0x28c9ff, 300, 80, 2);
rim.position.set(-20, 12, -20);
scene.add(rim);

// ---------- Sky (stars) ----------
const starGeo = new THREE.BufferGeometry();
{
  const n = 1400; const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 300 + Math.random() * 150;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos((Math.random() * 2) - 1);
    arr[i*3] = r * Math.sin(ph) * Math.cos(th);
    arr[i*3+1] = r * Math.sin(ph) * Math.sin(th);
    arr[i*3+2] = r * Math.cos(ph);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
scene.add(stars);

// ---------- Ground ----------
const GRID = 120;
const groundMat = new THREE.MeshStandardMaterial({ color: 0x141a38, roughness: 0.9, metalness: 0.1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID, 1, 1), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(GRID, 60, 0x2c3a7a, 0x223060);
grid.position.y = 0.01;
scene.add(grid);

// floating platforms / deco
const platformMat = new THREE.MeshStandardMaterial({ color: 0x1b2450, roughness: 0.8, metalness: 0.2 });
for (let i = 0; i < 22; i++) {
  const s = 2 + Math.random() * 6;
  const p = new THREE.Mesh(new THREE.BoxGeometry(s, 0.6, s), platformMat);
  p.position.set((Math.random() - 0.5) * GRID * 0.85, 0.3, (Math.random() - 0.5) * GRID * 0.85);
  p.castShadow = true; p.receiveShadow = true;
  scene.add(p);
}

// ---------- Obstacles (rocks/trees) ----------
const rockMat = new THREE.MeshStandardMaterial({ color: 0x35406e, roughness: 1, metalness: 0.05 });
const treeMat = new THREE.MeshStandardMaterial({ color: 0x0f5a3c, roughness: 0.9 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2b1e, roughness: 1 });
for (let i = 0; i < 26; i++) {
  const x = (Math.random() - 0.5) * GRID * 0.9;
  const z = (Math.random() - 0.5) * GRID * 0.9;
  if (Math.hypot(x, z) < 4) continue;
  const kind = Math.random();
  if (kind < 0.5) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.4, 0), rockMat);
    rock.position.set(x, 0.6, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true; rock.receiveShadow = true;
    scene.add(rock);
  } else {
    const h = 2 + Math.random() * 2.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, h, 8), trunkMat);
    trunk.position.set(x, h / 2, z); trunk.castShadow = true; scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 8), treeMat);
    leaves.position.set(x, h + 0.9, z); leaves.castShadow = true; scene.add(leaves);
  }
}

// ---------- Player ----------
const player = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.9, 2),
  new THREE.MeshStandardMaterial({ color: 0x28c9ff, emissive: 0x0a3d66, roughness: 0.35, metalness: 0.5 })
);
player.castShadow = true;
scene.add(player);
const playerLight = new THREE.PointLight(0x39ffb0, 60, 14, 2);
scene.add(playerLight);

const pos = new THREE.Vector3(0, 0.9, 0);
const vel = new THREE.Vector3();
const clock = new THREE.Clock();

// ---------- Game State ----------
let state = 'menu';        // menu | play | over
let score = 0, best = 0, hp = 100;
try { best = parseInt(localStorage.getItem('vibeBest') || '0', 10); } catch (e) { best = 0; }
const bestEl = document.getElementById('best');
bestEl.textContent = 'BEST: ' + best;

let crystals = [];
let hazards = [];
let crystalsSpawned = 0;

// ---------- Input ----------
const keys = {};
const mouse = { x: 0, y: 0 };
let yaw = 0, pitch = -0.25, dashTime = 0;
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); doDash(); }
}, { passive: false });
document.addEventListener('keyup', e => keys[e.code] = false);
document.addEventListener('mousemove', e => {
  if (state !== 'play') return;
  yaw -= e.movementX * 0.0024;
  pitch -= e.movementY * 0.0024;
  pitch = Math.max(-1.2, Math.min(0.4, pitch));
});

function doDash() {
  if (state !== 'play' || dashTime > 0) return;
  dashTime = 0.28;
  const dir = moveDir();
  if (dir.lengthSq() > 0) vel.addScaledVector(dir.normalize(), 22);
  else {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    vel.addScaledVector(fwd, 22);
  }
}

function moveDir() {
  const d = new THREE.Vector3();
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (keys['KeyW']) d.add(fwd);
  if (keys['KeyS']) d.sub(fwd);
  if (keys['KeyD']) d.add(right);
  if (keys['KeyA']) d.sub(right);
  d.y = 0;
  return d;
}

// ---------- Spawning ----------
function spawnCrystal() {
  const c = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6),
    new THREE.MeshStandardMaterial({ color: 0x39ffb0, emissive: 0x0f7a52, roughness: 0.2, metalness: 0.4 })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.03, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x39ffb0, transparent: true, opacity: 0.5 })
  );
  let x = (Math.random() - 0.5) * GRID * 0.9;
  let z = (Math.random() - 0.5) * GRID * 0.9;
  if (Math.hypot(x, z) < 5) { x += 6; z += 6; }
  c.position.set(x, 2.2, z);
  ring.position.copy(c.position);
  c.userData.ring = ring;
  c.userData.baseY = 2.2;
  c.userData.spin = 0.5 + Math.random() * 1.5;
  c.userData.phase = Math.random() * Math.PI * 2;
  c.userData.value = 5;
  scene.add(c); scene.add(ring);
  crystals.push(c);
  crystalsSpawned++;
}

function spawnHazard() {
  const hue = Math.random();
  const h = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.6, 4),
    new THREE.MeshStandardMaterial({ color: hue < 0.5 ? 0xff5a6a : 0xff8a3a, emissive: 0x551018, roughness: 0.6, metalness: 0.3 })
  );
  let x = (Math.random() - 0.5) * GRID * 0.9;
  let z = (Math.random() - 0.5) * GRID * 0.9;
  if (Math.hypot(x, z) < 6) { x += 8; z += 8; }
  h.position.set(x, 1.4, z);
  h.userData.spin = 1 + Math.random() * 2;
  h.userData.yaw = Math.random() * Math.PI;
  h.userData.dmg = 10;
  scene.add(h);
  hazards.push(h);
}

function resetWorld() {
  for (const c of crystals) { scene.remove(c); scene.remove(c.userData.ring); }
  for (const h of hazards) scene.remove(h);
  crystals = []; hazards = []; crystalsSpawned = 0;
  for (let i = 0; i < 26; i++) spawnCrystal();
  for (let i = 0; i < 5; i++) spawnHazard();
}

// ---------- HUD ----------
const scoreEl = document.getElementById('score');
const hpFill = document.getElementById('hpfill');
const msgEl = document.getElementById('msg');
const overlay = document.getElementById('overlay');
const finalEl = document.getElementById('final');
const btn = document.getElementById('btnstart');

let msgTimer = 0;
function showMsg(t, dur = 1.6) {
  msgEl.textContent = t;
  msgEl.classList.add('show');
  msgTimer = dur;
}
function updateHud() {
  scoreEl.innerHTML = score + '<small>SCORE</small>';
  const pct = Math.max(0, Math.min(100, hp));
  hpFill.style.width = pct + '%';
  if (pct > 55) hpFill.style.background = 'linear-gradient(90deg,#39ffb0,#28c9ff)';
  else if (pct > 25) hpFill.style.background = 'linear-gradient(90deg,#ffd54a,#ffab3a)';
  else hpFill.style.background = 'linear-gradient(90deg,#ff5a6a,#ff2a4a)';
}

function startGame() {
  state = 'play'; score = 0; hp = 100;
  pos.set(0, 0.9, 0); vel.set(0, 0, 0);
  yaw = 0; pitch = -0.25;
  resetWorld();
  overlay.classList.add('hide');
  finalEl.classList.add('hidden');
  updateHud();
}
btn.addEventListener('click', startGame);

function gameOver() {
  state = 'over';
  if (score > best) { best = score; try { localStorage.setItem('vibeBest', String(best)); } catch (e) {} bestEl.textContent = 'BEST: ' + best; }
  finalEl.textContent = 'Score: ' + score + ' — Best: ' + best;
  finalEl.classList.remove('hidden');
  overlay.classList.remove('hide');
  overlay.querySelector('p').style.display = 'none';
}

// ---------- Main Loop ----------
const FIXED = 1 / 60;
let acc = 0, elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  acc += dt;
  while (acc >= FIXED) { step(FIXED); acc -= FIXED; }
  renderFrame();
}

function step(dt) {
  elapsed += dt;
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.remove('show'); }

  // ambient animation
  stars.rotation.y += dt * 0.005;
  rim.intensity = 280 + Math.sin(elapsed * 2) * 40;

  // input
  const dir = moveDir();
  if (dir.lengthSq() > 0) {
    vel.addScaledVector(dir.normalize(), 42 * dt);
    if (vel.length() > 16) vel.setLength(16);
  } else {
    vel.multiplyScalar(1 - Math.min(1, 8 * dt));
  }
  if (dashTime > 0) dashTime -= dt;

  pos.addScaledVector(vel, dt);

  // boundary clamp
  const B = GRID / 2 - 1.5;
  pos.x = Math.max(-B, Math.min(B, pos.x));
  pos.z = Math.max(-B, Math.min(B, pos.z));
  pos.y = 0.9;

  // player visual
  player.position.copy(pos);
  playerLight.position.set(pos.x, pos.y + 1.5, pos.z);
  const rotVel = vel.length();
  player.rotation.x += rotVel * 0.06 * (Math.sign(vel.z) || 1);
  player.rotation.z += rotVel * 0.04 * (Math.sign(vel.x) || 1);

  // crystals
  for (let i = crystals.length - 1; i >= 0; i--) {
    const c = crystals[i]; const r = c.userData.ring;
    c.rotation.y += c.userData.spin * dt;
    c.rotation.x += c.userData.spin * 0.5 * dt;
    c.position.y = c.userData.baseY + Math.sin(elapsed * 2 + c.userData.phase) * 0.25;
    r.rotation.z += 0.8 * dt; r.rotation.x += 0.4 * dt;
    if (pos.distanceTo(c.position) < 2.0) {
      score += c.userData.value;
      showMsg('+' + c.userData.value + '  CRYSTAL', 1.1);
      scene.remove(c); scene.remove(r);
      crystals.splice(i, 1);
      spawnCrystal();
      updateHud();
    }
  }

  // hazards
  for (const h of hazards) {
    h.rotation.y += h.userData.spin * dt;
    h.position.y = 1.4 + Math.sin(elapsed * 3 + h.userData.yaw) * 0.4;
    if (pos.distanceTo(h.position) < 1.8) {
      if (dashTime <= 0) { hp -= h.userData.dmg; updateHud(); }
      h.userData.dmg = 0;                       // so dash shields through
      const kick = pos.clone().sub(h.position).normalize().multiplyScalar(10);
      vel.add(kick);
      if (hp <= 0) { hp = 0; updateHud(); gameOver(); }
    }
  }

  // slow energy regen
  hp = Math.min(100, hp + 1.5 * dt);
  updateHud();
}

function renderFrame() {
  // camera follow
  const targetLook = new THREE.Vector3(pos.x, 1.5, pos.z);
  const camDist = 11;
  const camPos = new THREE.Vector3(
    targetLook.x + Math.sin(yaw) * Math.cos(pitch) * camDist,
    targetLook.y + Math.sin(-pitch) * camDist + 3.5,
    targetLook.z + Math.cos(yaw) * Math.cos(pitch) * camDist
  );
  camera.position.lerp(camPos, 0.12);
  camera.lookAt(targetLook);

  renderer.render(scene, camera);
}

// ---------- Resize ----------
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
onResize();

// initial world so menu looks alive
resetWorld();
updateHud();
tick();

// expose minimal state for automated tests
window.__game = {
  get state() { return state; },
  get score() { return score; },
  get hp() { return hp; },
  get playerPos() { return { x: pos.x, y: pos.y, z: pos.z }; },
  start: startGame,
  setKeys(k) { Object.assign(keys, k); },
  moveToward(x, z) { const t = new THREE.Vector3(x, 0, z); const d = t.sub(pos); d.y = 0; vel.addScaledVector(d.normalize(), 10); },
  seekCrystal() {
    if (!crystals.length) return false;
    let best = null, bd = Infinity;
    for (const c of crystals) { const d = pos.distanceTo(c.position); if (d < bd) { bd = d; best = c; } }
    if (best) this.moveToward(best.position.x, best.position.z);
    return { dist: bd, count: crystals.length };
  }
};
