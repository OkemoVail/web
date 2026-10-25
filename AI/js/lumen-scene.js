import { WebGLRenderer } from '../vendor/three.module.min.js';
import * as THREE from '../vendor/three.core.min.js';

// Aion 2 hero (2026-10-25). A field of graphite blocks works as a sound
// surface: one voice ripples out, a second one answers ("talks back"), then
// the waves settle and the blocks under a "2" rise and light in AION red.
// The camera moves from a low pass across the field to a raised three-quarter
// view and the final frame holds with a faint residual ripple.
// One InstancedMesh; heights are computed in the vertex shader from a few
// uniforms plus per-block attributes (glyph mask, red spill, delay, jitter).

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
    const response = await fetch(new URL('./lumen-timeline.json?v=aion2', import.meta.url), { signal });
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
      const coverage = sum / (scale * scale * 255);
      mask[row * cols + col] = coverage > 0.42 ? 1 : 0;
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

const vertexShader = /* glsl */ `
attribute vec2 aCell;
attribute float aGlyph;
attribute float aSpill;
attribute float aRand;
attribute float aDelay;
uniform float uTime;
uniform float uCell;
uniform vec4 uVoiceA;
uniform vec4 uVoiceB;
uniform vec4 uWave;
uniform float uResidual;
uniform vec2 uForm;
uniform float uGlyphHeight;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vWorld;
varying float vGlyph;
varying float vSpill;
varying float vWave;
varying float vForm;
varying float vHeight;

float voice(vec4 v, vec2 p, float t) {
  float dt = t - v.z;
  if (dt <= 0.0) return 0.0;
  float d = distance(p, v.xy);
  float front = uWave.x * dt;
  float envelope = smoothstep(front, front - 10.0, d);
  float k = 6.2831853 / uWave.y;
  float w = 6.2831853 / uWave.z;
  float falloff = 1.0 / (1.0 + d * 0.035);
  return sin(d * k - dt * w) * envelope * falloff * v.w;
}

void main() {
  float t = uTime;
  float settle = smoothstep(uForm.x, uForm.x + uForm.y * 1.4, t);
  float wave = (voice(uVoiceA, aCell, t) + voice(uVoiceB, aCell, t)) * uWave.w;
  wave *= mix(1.0, uResidual, settle);
  float form = clamp((t - uForm.x - aDelay) / uForm.y, 0.0, 1.0);
  form = 1.0 - pow(1.0 - form, 3.0);
  float h = max(0.06, 0.32 + aRand * 0.14 + wave);
  h += aGlyph * uGlyphHeight * form;

  vec3 p = position + vec3(0.0, 0.5, 0.0);
  vec3 world = vec3(aCell.x + position.x * uCell, p.y * h, aCell.y + position.z * uCell);
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
    float lit = vForm;
    if (top) {
      vec2 uv = vLocal.xz;
      float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      vec3 face = uRed * (0.62 + 0.28 * (1.0 - smoothstep(0.0, 0.06, edge))) * (0.75 + 0.35 * diffuse);
      color = mix(color, face, lit);
    } else {
      float rise = clamp(vLocal.y / max(vHeight, 0.001), 0.0, 1.0);
      vec3 side = uRed * mix(0.03, 0.34, rise * rise) * (0.45 + 0.6 * diffuse);
      color = mix(color, side, lit);
    }
  }

  float dist = distance(vWorld, uCameraPos);
  color = mix(color, uBg, smoothstep(uFog.x, uFog.y, dist));
  // Field dissolves into black around the focus, so it has no visible edge.
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
  { mount, quality, onContextLost = function () {}, signal, preserveDrawingBuffer = false },
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

  function disposeResources() {
    if (disposed) return;
    disposed = true;
    active = false;
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
  const cell = 1;
  const count = cols * rows;
  const { mask, spill } = glyphMask(cols, rows, { ...layout.glyph, text: timeline.glyphText || '2' });
  const random = seededRandom(2026);

  const glyphCenter = new THREE.Vector2(layout.glyph.cx * cols, layout.glyph.cz * rows);
  const cells = new Float32Array(count * 2);
  const glyphs = new Float32Array(count);
  const spills = new Float32Array(count);
  const rands = new Float32Array(count);
  const delays = new Float32Array(count);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const x = (col - (cols - 1) / 2) * cell;
      const z = (row - (rows - 1) / 2) * cell;
      cells[i * 2] = x;
      cells[i * 2 + 1] = z;
      glyphs[i] = mask[i];
      spills[i] = spill[i];
      rands[i] = random();
      // The glyph builds from its centre outward with a little jitter.
      delays[i] = Math.hypot(x - glyphCenter.x, z - glyphCenter.y) * 14 + random() * 260;
    }
  }

  const box = new THREE.BoxGeometry(0.86, 1, 0.86);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = box.index;
  geometry.setAttribute('position', box.getAttribute('position'));
  geometry.setAttribute('normal', box.getAttribute('normal'));
  geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geometry.setAttribute('aGlyph', new THREE.InstancedBufferAttribute(glyphs, 1));
  geometry.setAttribute('aSpill', new THREE.InstancedBufferAttribute(spills, 1));
  geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 1));
  geometry.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delays, 1));
  geometry.instanceCount = count;
  geometries.push(box, geometry);

  const voice = (v) => new THREE.Vector4(v.x * cols, v.z * rows, v.startMs, 1);
  const wave = timeline.wave;
  const uniforms = {
    uTime: { value: 0 },
    uCell: { value: 1 },
    uVoiceA: { value: voice(timeline.voices[0]) },
    uVoiceB: { value: voice(timeline.voices[1]) },
    uWave: { value: new THREE.Vector4(wave.speed, wave.wavelength, wave.periodMs, wave.amplitude) },
    uResidual: { value: wave.residual },
    uForm: { value: new THREE.Vector2(timeline.formStartMs, timeline.formMs) },
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
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  materials.push(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(layout.camera.fovDeg, 1, 1, 600);

  const deg = Math.PI / 180;
  const cam = timeline.camera;
  const target = new THREE.Vector3(glyphCenter.x * 0.55, 1.5, glyphCenter.y * 0.4);

  let latestState = { elapsedMs: 0 };
  let aspect = 1;

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
    uniforms.uCameraPos.value.copy(camera.position);
    uniforms.uTime.value = elapsed;
    const fade = Math.min(1, elapsed / cam.fadeInMs);
    uniforms.uExposure.value = fade * fade * (3 - 2 * fade);
    renderer.render(scene, camera);
  }

  function render(state, deltaMs) {
    latestState = { ...state, elapsedMs: Number.isFinite(state.elapsedMs) ? state.elapsedMs : 0, deltaMs };
    if (!active || disposed) return;
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
    pause() { active = false; },
    resume() { if (!disposed && !contextLost) active = true; },
    dispose() { disposeResources(); },
  };
}

function createLumenScene(options) {
  return createLumenSceneWithDependencies(options);
}

window.createLumenScene = createLumenScene;
export { createLumenScene, createLumenSceneWithDependencies };
