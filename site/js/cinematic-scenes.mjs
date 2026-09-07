import * as THREE from '../vendor/three.module.min.js';

// One transparent renderer serves all spatial chapters. DOM owns layout and controls.
export function createScenes() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  const gl = renderer.getContext(),
    debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /SwiftShader|llvmpipe|Software/i.test(gpu);
  renderer.setPixelRatio(
    software ? 0.65 : Math.min(devicePixelRatio, innerWidth < 600 ? 1.25 : 1.5),
  );
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.className = 'cinematic-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.body.append(renderer.domElement);
  const slots = [...document.querySelectorAll('.scene-slot')];
  const live = new Map();
  const pointer = { x: 0, y: 0 };
  let width = innerWidth,
    height = innerHeight,
    lost = false,
    selected = 0,
    assembled = false;
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = 1024;
  lightCanvas.height = 512;
  const ctx = lightCanvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
  [
    [0, '#1b1510'],
    [0.12, '#30241b'],
    [0.2, '#fff5df'],
    [0.29, '#41352c'],
    [0.48, '#201b16'],
    [0.6, '#eee5d3'],
    [0.7, '#716653'],
    [1, '#171511'],
  ].forEach(([p, c]) => gradient.addColorStop(p, c));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#fff4db';
  ctx.fillRect(100, 40, 500, 45);
  const environment = new THREE.CanvasTexture(lightCanvas);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  const brushCanvas = document.createElement('canvas');
  brushCanvas.width = 512;
  brushCanvas.height = 512;
  const brush = brushCanvas.getContext('2d');
  brush.fillStyle = '#808080';
  brush.fillRect(0, 0, 512, 512);
  // Fine machined grain, deterministic so each visit preserves the same material.
  for (let y = 0; y < 512; y++) {
    const shade = 116 + Math.round(Math.sin(y * 127.1) * 13);
    brush.fillStyle = `rgb(${shade},${shade},${shade})`;
    brush.fillRect(0, y, 512, 1);
  }
  const grain = new THREE.CanvasTexture(brushCanvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(2, 4);

  function make(slot) {
    const kind = slot.dataset.scene;
    const scene = new THREE.Scene();
    scene.environment = environment;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 9.5);
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.HemisphereLight(0xffe2b8, 0x211910, 2));
    const key = new THREE.DirectionalLight(0xffe5c0, 5);
    key.position.set(-3, 5, 6);
    scene.add(key);
    const edge = new THREE.DirectionalLight(0xffffff, 2);
    edge.position.set(5, 0, -2);
    scene.add(edge);
    const shape = new THREE.Shape();
    [
      [-1.68, 1.55],
      [-0.92, 1.55],
      [0, -0.68],
      [0.92, 1.55],
      [1.68, 1.55],
      [0.33, -1.7],
      [-0.33, -1.7],
    ].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.13,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      curveSegments: 4,
    });
    const layers = [];
    const count = kind === 'ivory' ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: kind === 'ivory' ? 0xe9e2d2 : i % 2 ? 0x9b502c : 0xc78351,
        metalness: kind === 'ivory' ? 0.08 : 0.92,
        roughness: kind === 'ivory' ? 0.55 : 0.28,
        envMapIntensity: 1.5,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = -i * 0.24;
      mesh.position.x = i * 0.055;
      if (kind !== 'ivory') {
        material.bumpMap = grain;
        material.bumpScale = 0.007;
      }
      layers.push(mesh);
      group.add(mesh);
    }
    if (kind === 'signal') {
      layers.forEach((mesh, i) => {
        mesh.material.wireframe = true;
        mesh.material.transparent = true;
        mesh.material.opacity = i === 0 ? 0.85 : 0.15;
      });
      const points = [];
      for (let i = 0; i < 34; i++) {
        const side = i % 2 ? 1 : -1;
        const y = (i / 34 - 0.5) * 5;
        points.push(new THREE.Vector3(side * 7, y, -3), new THREE.Vector3(side * 1.1, y * 0.3, 0));
      }
      group.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0xc9915c, transparent: true, opacity: 0.38 }),
        ),
      );
    }
    group.rotation.set(-0.12, -0.38, -0.08);
    const entry = {
      scene,
      camera,
      group,
      layers,
      key,
      kind,
      born: performance.now() / 1000,
      spread: 1,
    };
    live.set(slot, entry);
    slot.classList.add('scene-ready');
    return entry;
  }
  function dispose(slot, entry) {
    const geometries = new Set();
    entry.scene.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) obj.material.dispose();
    });
    geometries.forEach((g) => g.dispose());
    live.delete(slot);
    slot.classList.remove('scene-ready');
  }
  function render(time, moving) {
    if (lost) return;
    if (width !== innerWidth || height !== innerHeight) {
      width = innerWidth;
      height = innerHeight;
      renderer.setSize(width, height);
    }
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const slot of slots) {
      const r = slot.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= height || !r.width) {
        if (live.has(slot)) dispose(slot, live.get(slot));
        continue;
      }
      const e = live.get(slot) || make(slot);
      e.camera.aspect = r.width / r.height;
      e.camera.updateProjectionMatrix();
      e.camera.position.z = r.width / r.height < 0.8 ? 11.5 : 9.2;
      const float = moving ? Math.sin(time * 0.55) * 0.035 : 0;
      e.group.rotation.y = -0.38 + (moving ? pointer.x * 0.17 : 0);
      e.group.rotation.x = -0.12 + (moving ? pointer.y * 0.08 : 0);
      e.group.position.y = float;
      e.key.position.x = -3 + (moving ? pointer.x * 2 : 0);
      const entrance = moving ? Math.max(0, 1 - (performance.now() / 1000 - e.born) / 1.1) : 0;
      const departure = moving
        ? THREE.MathUtils.clamp(-slot.closest('section').getBoundingClientRect().top / height, 0, 1)
        : 0;
      e.spread = moving
        ? THREE.MathUtils.lerp(e.spread, assembled ? 0 : 1, 0.09)
        : assembled
          ? 0
          : 1;
      e.layers.forEach((mesh, i) => {
        if (['copper', 'ivory', 'signal'].includes(e.kind)) {
          mesh.position.z = -i * (0.24 + entrance * 0.4 + departure * 0.55);
          mesh.position.y = i * (entrance * 0.12 + departure * 0.2);
          mesh.position.x = i * (0.055 + departure * 0.2);
        }
        if (e.kind === 'layers') {
          mesh.position.set(i * 0.18 - 0.36, (i - 2) * 0.38, -i * 0.38);
          mesh.material.emissive.setHex(i === selected ? 0x211107 : 0);
        }
        if (e.kind === 'finale') {
          const spread = e.spread;
          mesh.position.set(i * 0.12 * spread, (i - 2) * 0.16 * spread, -i * (0.18 + 0.2 * spread));
        }
      });
      renderer.setViewport(r.left, height - r.bottom, r.width, r.height);
      renderer.setScissor(
        Math.max(0, r.left),
        Math.max(0, height - r.bottom),
        Math.min(width, r.right) - Math.max(0, r.left),
        Math.min(height, r.bottom) - Math.max(0, r.top),
      );
      renderer.render(e.scene, e.camera);
    }
    renderer.setScissorTest(false);
  }
  function onPointer(event) {
    pointer.x = (event.clientX / innerWidth) * 2 - 1;
    pointer.y = (event.clientY / innerHeight) * 2 - 1;
  }
  addEventListener('pointermove', onPointer, { passive: true });
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    slots.forEach((s) => s.classList.remove('scene-ready'));
    renderer.domElement.style.display = 'none';
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    lost = false;
    live.forEach((entry, slot) => dispose(slot, entry));
    renderer.domElement.style.display = '';
    dispatchEvent(new Event('resize'));
  });
  return {
    render,
    selectLayer(n) {
      selected = n;
    },
    recompose(value) {
      assembled = value;
    },
    get active() {
      return live.size;
    },
    destroy() {
      live.forEach((e, s) => dispose(s, e));
      environment.dispose();
      grain.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      removeEventListener('pointermove', onPointer);
    },
  };
}
