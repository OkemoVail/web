import { WebGLRenderer } from '../vendor/three.module.min.js';
import * as THREE from '../vendor/three.core.min.js';

// Aion 2 hero (2026-10-25). A field of graphite blocks works as a sound
// surface. Two "voices" tap out the three-dot typing rhythm of a chat, each
// tap sending a ring across the field. Then the red "2" is written top to
// bottom by blocks that drop from above, bounce and squash as they land on the
// field; the last landing sends a shockwave out. The camera moves from a low
// pass to a raised three-quarter view and the final frame holds. In the live
// WebGL version the pointer drags ripples through the field.
// Two instanced meshes share one shader: the field (every cell) and the caps
// (glyph cells only). All motion is computed in the vertex shader.

function easeInOut(value) {
  const t = Math.max(0, Math.min(1, value));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const defaultDependencies = {
  createRenderer: (options) => new WebGLRenderer(options),
  loadTimeline: async (signal) => {
    const response = await fetch(new URL('./lumen-timeline.json?v=aion2-fun', import.meta.url), { signal });
    if (!response.ok) throw new Error('Unable to load the Aion 2 timeline');
    return response.json();
  },
  loadFont: async () => {
    try { await document.fonts.load('900 200px Satoshi'); } catch (_) {}
  },
};

function abortError(message = 'Aion 2 scene initialization aborted') {
  return new DOMException(message, 'AbortError');
}

// Rasterise the glyph at the grid resolution (4x supersampled) and return the
// per-cell coverage plus a blurred copy used for the red light spill.
function glyphMask(cols, rows, glyph) {
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const size = glyph.size * rows * scale;
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.font = `900 ${size}px Satoshi, "Helvetica Neue", Arial, sans-serif`;
  const metrics = context.measureText(glyph.text || '2');
  const ascent = metrics.actualBoundingBoxAscent || size * 0.72;
  const descent = metrics.actualBoundingBoxDescent || 0;
  const x = (0.5 + glyph.cx) * canvas.width;
  const y = (0.5 + glyph.cz) * canvas.height + (ascent - descent) / 2;
  context.fillText(glyph.text || '2', x, y);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          sum += pixels[((row * scale + sy) * canvas.width + col * scale + sx) * 4 + 3];
        }
      }
      // Hard-ish threshold so the letterform reads as whole blocks.
      mask[row * cols + col] = sum / (scale * scale * 255) > 0.42 ? 1 : 0;
    }
  }
  const spill = new Float32Array(cols * rows);
  const radius = 4;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0;
      let weight = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const r = row + dy;
          const c = col + dx;
          if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
          const w = Math.exp(-(dx * dx + dy * dy) / (radius * radius * 0.5));
          sum += mask[r * cols + c] * w;
          weight += w;
        }
      }
      spill[row * cols + col] = sum / weight;
    }
  }
  return { mask, spill };
}

const PULSES = 12;
const TOUCHES = 8;

const vertexShader = /* glsl */ `
attribute vec2 aCell;
attribute float aGlyph;
attribute float aSpill;
attribute float aRand;
attribute float aDelay;
uniform float uTime;
uniform float uNow;
uniform float uCap;
uniform vec4 uPulses[${PULSES}];
uniform vec4 uPulse;
uniform vec4 uShockAt;
uniform vec4 uShock;
uniform vec4 uTouches[${TOUCHES}];
uniform vec4 uTouch;
uniform vec4 uDrop;
uniform vec2 uSpillWindow;
uniform float uGlyphHeight;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vWorld;
varying float vGlyph;
varying float vSpill;
varying float vWave;
varying float vForm;
varying float vHeight;

// One travelling ring: a crest with a shallow trough behind it, fading with
// time and distance. src = (x, z, startMs, amp), cfg = (speed, width, decay, amp).
float ring(vec2 p, vec4 src, vec4 cfg, float t) {
  float dt = t - src.z;
  if (dt <= 0.0 || src.w == 0.0) return 0.0;
  float d = distance(p, src.xy);
  float x = (d - cfg.x * dt) / cfg.y;
  float shape = exp(-x * x) - 0.45 * exp(-(x + 1.6) * (x + 1.6));
  float nearSource = mix(0.45, 1.0, smoothstep(0.0, 4.0, d));
  return shape * exp(-dt / cfg.z) * src.w * cfg.w * nearSource / (1.0 + d * 0.02);
}

float field(vec2 c) {
  float w = 0.0;
  for (int i = 0; i < ${PULSES}; i++) w += ring(c, uPulses[i], uPulse, uTime);
  w += ring(c, uShockAt, uShock, uTime);
  for (int i = 0; i < ${TOUCHES}; i++) w += ring(c, uTouches[i], uTouch, uNow);
  // Barely-there breathing so the held frame never looks frozen.
  w += 0.05 * sin(c.x * 0.21 + uTime * 0.0011) * sin(c.y * 0.17 - uTime * 0.0009);
  return w;
}

// Height above the field of a dropped cap s ms after it was released, plus a
// visibility flag. Falls under constant gravity, then two damped bounces.
vec2 drop(float s) {
  float fall = uDrop.y;
  float H = uDrop.z;
  float r = uDrop.w;
  if (s < 0.0) return vec2(0.0, 0.0);
  if (s < fall) { float u = s / fall; return vec2(H * (1.0 - u * u), 1.0); }
  float g = 2.0 * H / (fall * fall);
  float v = 2.0 * H / fall * r;
  float u = s - fall;
  for (int i = 0; i < 2; i++) {
    float T = 2.0 * v / g;
    if (u < T) return vec2(v * u - 0.5 * g * u * u, 1.0);
    u -= T;
    v *= r;
  }
  return vec2(0.0, 1.0);
}

void main() {
  float wave = field(aCell);
  float base = max(0.06, 0.32 + aRand * 0.14 + wave);
  float h = base;
  float yOff = 0.0;
  float vis = 1.0;
  float form;
  if (uCap > 0.5) {
    float s = uTime - uDrop.x - aDelay;
    vec2 dr = drop(s);
    float since = s - uDrop.y;
    // Squash on the first impact, recovering over ~0.3s.
    float squash = since >= 0.0 ? 0.22 * exp(-since / 90.0) : 0.0;
    vis = dr.y;
    h = uGlyphHeight * (1.0 - squash);
    yOff = base + 0.01 + dr.x;
    form = dr.y;
    wave = 0.0;
  } else {
    form = smoothstep(uSpillWindow.x, uSpillWindow.y, uTime);
  }

  vec3 p = position + vec3(0.0, 0.5, 0.0);
  vec3 world = vec3(aCell.x + position.x * vis, yOff + p.y * h * vis, aCell.y + position.z * vis);
  vLocal = vec3(p.x, p.y * h, p.z);
  vNormal = normal;
  vWorld = world;
  vGlyph = aGlyph;
  vSpill = aSpill;
  vWave = wave;
  vForm = form;
  vHeight = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uCameraPos;
uniform vec3 uLight;
uniform float uExposure;
uniform float uTime;
uniform vec2 uFog;
uniform vec3 uBg;
uniform vec3 uRed;
uniform vec2 uHalf;
uniform vec2 uEdge;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vWorld;
varying float vGlyph;
varying float vSpill;
varying float vWave;
varying float vForm;
varying float vHeight;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec3 n = normalize(vNormal);
  bool top = n.y > 0.5;
  vec3 graphite = vec3(0.034, 0.037, 0.043);
  float diffuse = max(dot(n, uLight), 0.0);
  vec3 color = graphite * (0.25 + 0.9 * diffuse);

  if (top) {
    // Machined top: a thin bright chamfer on each edge catches the key light.
    vec2 uv = vLocal.xz;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    color = vec3(0.028, 0.03, 0.034);
    color += vec3(0.022) * (1.0 - smoothstep(0.0, 0.05, edge));
    // Wave crests read as a cool sheen, troughs fall into shadow.
    color *= 0.55 + 0.75 * clamp(vWave * 0.7 + 0.35, 0.0, 1.5);
    // Red light spilling from the glyph onto neighbouring tops.
    color += uRed * 0.12 * vSpill * vForm * (1.0 - vGlyph);
  } else {
    // Sides darken toward the floor (contact occlusion).
    float ao = smoothstep(0.0, 0.9, vLocal.y);
    color *= mix(0.35, 1.0, ao);
    color += uRed * 0.05 * vSpill * vForm * ao * (1.0 - vGlyph);
  }

  if (vGlyph > 0.5) {
    if (top) {
      vec2 uv = vLocal.xz;
      float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      color = uRed * (0.62 + 0.28 * (1.0 - smoothstep(0.0, 0.06, edge))) * (0.75 + 0.35 * diffuse);
    } else {
      float rise = clamp(vLocal.y / max(vHeight, 0.001), 0.0, 1.0);
      color = uRed * mix(0.03, 0.34, rise * rise) * (0.45 + 0.6 * diffuse);
    }
  }

  float dist = distance(vWorld, uCameraPos);
  color = mix(color, uBg, smoothstep(uFog.x, uFog.y, dist));
  // Field dissolves into black toward its bounds, so it has no visible edge.
  vec2 q = vWorld.xz / uHalf;
  float r = pow(pow(abs(q.x), 4.0) + pow(abs(q.y), 4.0), 0.25);
  color = mix(color, uBg, smoothstep(uEdge.x, uEdge.y, r));
  color *= uExposure;
  color = mix(color * 12.92, 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, color));
  color += (hash12(gl_FragCoord.xy + fract(uTime * 0.001) * 917.0) - 0.5) * 0.01;
  gl_FragColor = vec4(color, 1.0);
}
`;

async function createLumenSceneWithDependencies(
  { mount, quality, onContextLost = function () {}, signal, preserveDrawingBuffer = false, interactive = true },
  dependencies = defaultDependencies,
) {
  if (!mount || !quality) throw new TypeError('Aion 2 scene requires mount and quality');
  const tier = quality.textureTier === 'mobile' ? 'mobile' : 'desktop';
  const renderer = dependencies.createRenderer({ alpha: false, antialias: quality.antialias !== false, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(quality.pixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x030406, 1);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  mount.appendChild(renderer.domElement);

  let active = true;
  let disposed = false;
  let contextLost = false;
  let initializing = true;
  let rejectInitialization;
  const initializationInterrupted = new Promise((resolve, reject) => { rejectInitialization = reject; });
  const geometries = [];
  const materials = [];
  let pointerTarget = null;
  let liveRaf = 0;

  function disposeResources() {
    if (disposed) return;
    disposed = true;
    active = false;
    if (liveRaf) cancelAnimationFrame(liveRaf);
    liveRaf = 0;
    pointerTarget?.removeEventListener('pointermove', handlePointer);
    pointerTarget?.removeEventListener('pointerdown', handlePointer);
    renderer.domElement.removeEventListener('webglcontextlost', handleContextLost, false);
    signal?.removeEventListener('abort', handleAbort);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  function interrupt(error) {
    if (disposed) return;
    disposeResources();
    if (initializing) rejectInitialization(error);
  }

  function handleAbort() { interrupt(abortError()); }

  function handleContextLost(event) {
    event.preventDefault();
    if (contextLost) return;
    contextLost = true;
    active = false;
    interrupt(new Error('WebGL context lost during Aion 2 scene initialization'));
    onContextLost();
  }

  renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
  signal?.addEventListener('abort', handleAbort, { once: true });
  if (signal?.aborted) handleAbort();

  let timeline;
  try {
    [timeline] = await Promise.race([
      Promise.all([dependencies.loadTimeline(signal), dependencies.loadFont?.()]),
      initializationInterrupted,
    ]);
  } catch (error) {
    interrupt(error);
    throw error;
  }
  if (disposed || signal?.aborted) throw abortError();

  const layout = timeline[tier];
  const { cols, rows } = layout;
  const count = cols * rows;
  const { mask, spill } = glyphMask(cols, rows, { ...layout.glyph, text: timeline.glyphText || '2' });
  const random = seededRandom(2026);

  // Field: every cell. Caps: glyph cells only, written top to bottom.
  const cells = new Float32Array(count * 2);
  const spills = new Float32Array(count);
  const rands = new Float32Array(count);
  const capIndex = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const x = col - (cols - 1) / 2;
      const z = row - (rows - 1) / 2;
      cells[i * 2] = x;
      cells[i * 2 + 1] = z;
      spills[i] = spill[i];
      rands[i] = random();
      if (mask[i]) {
        capIndex.push(i);
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
      }
    }
  }
  const capCount = capIndex.length;
  const capCells = new Float32Array(capCount * 2);
  const capSpills = new Float32Array(capCount);
  const capRands = new Float32Array(capCount);
  const capDelays = new Float32Array(capCount);
  const spread = timeline.drop.spreadMs;
  capIndex.forEach((i, k) => {
    capCells[k * 2] = cells[i * 2];
    capCells[k * 2 + 1] = cells[i * 2 + 1];
    capSpills[k] = 1;
    capRands[k] = rands[i];
    const along = (cells[i * 2 + 1] - zMin) / Math.max(1, zMax - zMin);
    capDelays[k] = along * spread + random() * 140;
  });

  const box = new THREE.BoxGeometry(0.86, 1, 0.86);
  geometries.push(box);
  function instanced(cellData, glyphData, spillData, randData, delayData, instances) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = box.index;
    geometry.setAttribute('position', box.getAttribute('position'));
    geometry.setAttribute('normal', box.getAttribute('normal'));
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellData, 2));
    geometry.setAttribute('aGlyph', new THREE.InstancedBufferAttribute(glyphData, 1));
    geometry.setAttribute('aSpill', new THREE.InstancedBufferAttribute(spillData, 1));
    geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(randData, 1));
    geometry.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delayData, 1));
    geometry.instanceCount = instances;
    geometries.push(geometry);
    return geometry;
  }
  const fieldGeometry = instanced(cells, new Float32Array(count), spills, rands, new Float32Array(count), count);
  const capGeometry = instanced(capCells, new Float32Array(capCount).fill(1), capSpills, capRands, capDelays, capCount);

  // Typing rhythm: each voice taps three dots in a row, twice.
  const pulses = [];
  const { gapMs, spacing } = timeline.typing;
  timeline.voices.forEach((voice) => {
    for (let round = 0; round < 2; round++) {
      for (let dot = 0; dot < 3; dot++) {
        pulses.push(new THREE.Vector4(
          voice.x * cols + (dot - 1) * spacing,
          voice.z * rows,
          voice.startMs + round * 700 + dot * gapMs,
          dot === 1 ? 1.1 : 1,
        ));
      }
    }
  });
  while (pulses.length < PULSES) pulses.push(new THREE.Vector4(0, 0, 0, 0));
  pulses.length = PULSES;

  const drop = timeline.drop;
  const lastLanding = drop.startMs + spread + 140 + drop.fallMs;
  const glyphCenter = new THREE.Vector2(layout.glyph.cx * cols, layout.glyph.cz * rows);
  const cfg = (c) => new THREE.Vector4(c.speed, c.width, c.decayMs, c.amplitude);
  // Vector4() defaults w to 1, which would make every empty slot a live ripple.
  const touches = Array.from({ length: TOUCHES }, () => new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    uTime: { value: 0 },
    uNow: { value: 0 },
    uCap: { value: 0 },
    uPulses: { value: pulses },
    uPulse: { value: cfg(timeline.pulse) },
    uShockAt: { value: new THREE.Vector4(glyphCenter.x, glyphCenter.y, lastLanding + 40, 1) },
    uShock: { value: cfg(timeline.shock) },
    uTouches: { value: touches },
    uTouch: { value: cfg(timeline.touch) },
    uDrop: { value: new THREE.Vector4(drop.startMs, drop.fallMs, drop.height, drop.restitution) },
    uSpillWindow: { value: new THREE.Vector2(drop.startMs, lastLanding + 300) },
    uGlyphHeight: { value: layout.glyph.height },
    uCameraPos: { value: new THREE.Vector3() },
    uLight: { value: new THREE.Vector3(-0.45, 0.78, 0.42).normalize() },
    uExposure: { value: 0 },
    uFog: { value: new THREE.Vector2(90, 190) },
    uBg: { value: new THREE.Color(0x030406).convertSRGBToLinear() },
    uRed: { value: new THREE.Color(0xc8302a).convertSRGBToLinear() },
    uHalf: { value: new THREE.Vector2(cols / 2, rows / 2) },
    uEdge: { value: new THREE.Vector2(0.55, 0.96) },
  };
  const fieldMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  // Caps share every uniform object except the mesh switch.
  const capMaterial = new THREE.ShaderMaterial({ uniforms: { ...uniforms, uCap: { value: 1 } }, vertexShader, fragmentShader });
  materials.push(fieldMaterial, capMaterial);
  const scene = new THREE.Scene();
  for (const [geometry, material] of [[fieldGeometry, fieldMaterial], [capGeometry, capMaterial]]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const camera = new THREE.PerspectiveCamera(layout.camera.fovDeg, 1, 1, 600);

  const deg = Math.PI / 180;
  const cam = timeline.camera;
  const target = new THREE.Vector3(glyphCenter.x * 0.55, 1.5, glyphCenter.y * 0.4);
  const clockStart = performance.now();

  let latestState = { elapsedMs: 0 };
  let aspect = 1;
  let lastExternal = 0;

  function draw(state) {
    const elapsed = Math.max(0, state.elapsedMs || 0);
    const move = easeInOut(Math.min(elapsed, cam.moveEndMs) / cam.moveEndMs);
    const elevation = (cam.elevationFromDeg + (cam.elevationToDeg - cam.elevationFromDeg) * move) * deg;
    const azimuth = (cam.azimuthFromDeg + (cam.azimuthToDeg - cam.azimuthFromDeg) * move) * deg;
    const radius = cam.radiusFrom + (cam.radiusTo - cam.radiusFrom) * move;
    camera.position.set(
      target.x + radius * Math.cos(elevation) * Math.sin(azimuth),
      target.y + radius * Math.sin(elevation),
      target.z + radius * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(target);
    camera.aspect = aspect;
    // Portrait screens need a wider lens to keep the field across the frame.
    camera.fov = aspect < 1 ? layout.camera.fovDeg / Math.min(1, aspect * 1.6) : layout.camera.fovDeg;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -layout.camera.shiftX;
    camera.projectionMatrix.elements[9] = -layout.camera.shiftY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    uniforms.uCameraPos.value.copy(camera.position);
    uniforms.uTime.value = elapsed;
    uniforms.uNow.value = performance.now() - clockStart;
    const fade = Math.min(1, elapsed / cam.fadeInMs);
    uniforms.uExposure.value = fade * fade * (3 - 2 * fade);
    renderer.render(scene, camera);
  }

  // ── Pointer ripples (live version only) ──
  // The controller only redraws a held hero every 250ms, so while a touch
  // ripple is alive the scene runs its own frames.
  const touchLife = 2400;
  let touchSlot = 0;
  let lastTouch = { x: Infinity, z: Infinity, at: -Infinity };
  const ndc = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();

  function touchesAlive(now) {
    return touches.some((touch) => touch.w > 0 && now - touch.z < touchLife);
  }

  function liveTick() {
    liveRaf = 0;
    if (!active || disposed) return;
    const now = performance.now();
    if (now - lastExternal > 40) draw(latestState);
    if (touchesAlive(now - clockStart)) liveRaf = requestAnimationFrame(liveTick);
  }

  function handlePointer(event) {
    if (!active || disposed) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1, 0.5);
    ndc.unproject(camera);
    ray.origin.copy(camera.position);
    ray.direction.copy(ndc).sub(camera.position).normalize();
    if (!ray.intersectPlane(plane, hit)) return;
    if (Math.abs(hit.x) > cols / 2 || Math.abs(hit.z) > rows / 2) return;
    const now = performance.now() - clockStart;
    const press = event.type === 'pointerdown';
    const moved = Math.hypot(hit.x - lastTouch.x, hit.z - lastTouch.z);
    if (!press && moved < 2.5 && now - lastTouch.at < 160) return;
    if (!press && now - lastTouch.at < 45) return;
    touches[touchSlot].set(hit.x, hit.z, now, press ? 2 : 1);
    touchSlot = (touchSlot + 1) % TOUCHES;
    lastTouch = { x: hit.x, z: hit.z, at: now };
    if (!liveRaf) liveRaf = requestAnimationFrame(liveTick);
  }

  if (interactive) {
    pointerTarget = mount.closest('section') || mount.parentElement;
    pointerTarget?.addEventListener('pointermove', handlePointer, { passive: true });
    pointerTarget?.addEventListener('pointerdown', handlePointer, { passive: true });
  }

  function render(state, deltaMs) {
    latestState = { ...state, elapsedMs: Number.isFinite(state.elapsedMs) ? state.elapsedMs : 0, deltaMs };
    if (!active || disposed) return;
    lastExternal = performance.now();
    draw(latestState);
  }

  function resize(width, height) {
    if (disposed || width <= 0 || height <= 0) return;
    aspect = width / height;
    renderer.setSize(width, height, false);
    if (active) draw(latestState);
  }

  initializing = false;
  return {
    render,
    resize,
    pause() {
      active = false;
      if (liveRaf) cancelAnimationFrame(liveRaf);
      liveRaf = 0;
    },
    resume() { if (!disposed && !contextLost) active = true; },
    dispose() { disposeResources(); },
  };
}

function createLumenScene(options) {
  return createLumenSceneWithDependencies(options);
}

window.createLumenScene = createLumenScene;
export { createLumenScene, createLumenSceneWithDependencies };
