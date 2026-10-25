import * as THREE from '../vendor/three.module.min.js';

// Lumen 1.9 Earthrise (2026-10-25). One slow telephoto shot from just above
// the lunar surface: the camera rises, the horizon sinks and a half-lit Earth
// clears it. Everything is ray-traced in one full-screen shader (an analytic
// Moon sphere with procedural crater relief and cast shadows, an Earth sphere
// with Blue Marble day + cloud textures and a thin atmosphere), so there is no
// mesh tessellation to show at a 9 degree lens. No stars: at this exposure a
// real camera would not record them.

function easeInOut(value) {
  const t = Math.max(0, Math.min(1, value));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function assetPath(assets, name, tier) {
  const value = assets[name];
  if (!value) throw new Error(`Missing Lumen asset: ${name}`);
  return typeof value === 'string' ? value : value[tier];
}

const defaultDependencies = {
  createRenderer: (options) => new THREE.WebGLRenderer(options),
  loadTimeline: async (signal) => {
    const response = await fetch(new URL('./lumen-timeline.json?v=earthrise', import.meta.url), { signal });
    if (!response.ok) throw new Error('Unable to load the Lumen timeline');
    return response.json();
  },
  loadTexture: (loader, path) => loader.loadAsync(path),
};

function abortError(message = 'Lumen scene initialization aborted') {
  return new DOMException(message, 'AbortError');
}

const vertexShader = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 resolution;
uniform vec3 camPos;
uniform vec3 camRight;
uniform vec3 camUp;
uniform vec3 camForward;
uniform vec2 tanHalf;
uniform vec3 sunDir;
uniform float moonR;
uniform vec3 earthPos;
uniform float earthR;
uniform mat3 earthRot;
uniform float exposure;
uniform float time;
uniform float detail;
uniform sampler2D earthDay;
uniform sampler2D earthClouds;
uniform sampler2D moonAlbedo;

const float PI = 3.14159265;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}

// One octave of craters: sparse cells, each a bowl with a raised rim and a
// soft ejecta skirt. Returns height in cell units.
float craterLayer(vec2 q, float seed) {
  vec2 c = floor(q); vec2 f = fract(q); float h = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 id = c + g + seed;
    if (hash12(id + 17.1) < 0.68) continue;
    float rad = mix(0.16, 0.46, pow(hash12(id + 3.7), 1.6));
    float r = length(g + hash22(id) - f) / rad;
    float bowl = r < 1.0 ? (r * r - 1.0) * 0.16 : 0.0;
    float rim = exp(-pow((r - 1.0) * 3.4, 2.0)) * 0.07;
    float skirt = r > 1.0 ? 0.03 * exp(-(r - 1.0) * 2.2) : 0.0;
    h += (bowl + rim + skirt) * rad;
  }
  return h;
}

// Terrain height on the tangent plane. Octaves smaller than the pixel
// footprint fade out so the grazing ground near the horizon never shimmers.
float terrain(vec2 q, float fp, int octaves) {
  float h = (fbm(q * 0.11) - 0.5) * 0.9 + (fbm(q * 0.6 + 3.0) - 0.5) * 0.12;
  float cell = 2.2;
  for (int k = 0; k < 6; k++) {
    if (k >= octaves) break;
    float w = smoothstep(fp * 5.0, fp * 12.0, cell);
    if (w > 0.0) h += craterLayer(q / cell, float(k) * 13.1) * cell * w;
    cell *= 0.42;
  }
  return h;
}

vec2 sphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b * b - dot(oc, oc) + r * r;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec4 sampleEquirect(sampler2D tex, vec3 n) {
  float lon = atan(n.y, n.x);
  float lat = asin(clamp(n.z, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  // Seam-safe derivatives: take the smaller of the wrapped/unwrapped u slopes.
  float u2 = fract(uv.x + 0.5);
  vec2 dx = vec2(dFdx(uv.x), dFdx(uv.y)); vec2 dy = vec2(dFdy(uv.x), dFdy(uv.y));
  vec2 dx2 = vec2(dFdx(u2), dx.y); vec2 dy2 = vec2(dFdy(u2), dy.y);
  if (abs(dx2.x) < abs(dx.x)) dx = dx2;
  if (abs(dy2.x) < abs(dy.x)) dy = dy2;
  return textureGrad(tex, uv, dx, dy);
}

vec3 shadeEarth(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  vec3 n = normalize(p - earthPos);
  vec3 l = earthRot * n;
  float ndl = dot(n, sunDir);
  float day = smoothstep(-0.06, 0.18, ndl);
  vec3 albedo = sampleEquirect(earthDay, l).rgb; albedo = mix(vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), albedo, 0.82);
  vec4 cloudSample = sampleEquirect(earthClouds, l);
  float cloud = smoothstep(0.5, 0.95, dot(cloudSample.rgb, vec3(0.333))) * cloudSample.a;
  float ocean = smoothstep(0.06, 0.02, albedo.r) * smoothstep(0.02, 0.06, albedo.b);
  vec3 h = normalize(sunDir - rd);
  float glint = pow(max(dot(n, h), 0.0), 60.0) * ocean * (1.0 - cloud) * 0.5;
  vec3 surface = mix(albedo, vec3(0.86), cloud);
  vec3 lit = surface * max(ndl, 0.0) * day + glint * day;
  // Rayleigh haze thickens toward the limb.
  float mu = max(dot(n, -rd), 0.0);
  float haze = pow(1.0 - mu, 2.2);
  lit = mix(lit, vec3(0.32, 0.55, 1.0) * max(ndl + 0.1, 0.0), haze * 0.45);
  return lit;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = camPos;
  vec3 rd = normalize(camForward + ndc.x * tanHalf.x * camRight + ndc.y * tanHalf.y * camUp);
  float pixelAngle = 2.0 * tanHalf.y / resolution.y;

  vec3 moonC = vec3(0.0, 0.0, -moonR);
  vec2 mh = sphere(ro, rd, moonC, moonR);
  vec3 color = vec3(0.0);

  // Horizon relief: a ray that grazes past the smooth sphere still hits if it
  // passes under a mountain profile defined by its azimuth.
  float az = atan(rd.x, rd.y);
  float ridge = (0.1 + fbm(vec2(az * 120.0, 1.0)) * 0.75 + fbm(vec2(az * 700.0, 5.0)) * 0.15) * 0.022;
  vec3 oc = ro - moonC;
  float tc = -dot(oc, rd);
  float miss = length(oc + rd * tc) - moonR;
  bool silhouette = mh.x < 0.0 && tc > 0.0 && miss < ridge;

  if (mh.x > 0.0 || silhouette) {
    float t = mh.x > 0.0 ? mh.x : tc;
    vec3 p = ro + rd * t;
    vec3 n0 = normalize(p - moonC);
    vec2 q = p.xy;
    float grazing = max(dot(n0, -rd), 0.015);
    float fp = t * pixelAngle / grazing;
    int oct = detail > 0.5 ? 6 : 4;
    float e = max(fp * 0.5, 0.004);
    float h0 = terrain(q, fp, oct);
    float hx = terrain(q + vec2(e, 0.0), fp, oct);
    float hy = terrain(q + vec2(0.0, e), fp, oct);
    vec3 n = normalize(n0 - vec3((hx - h0) / e, (hy - h0) / e, 0.0));
    if (silhouette) { n = n0; fp = 1.0; }

    // Cast shadows from crater rims under the low sun.
    vec2 sd = normalize(sunDir.xy);
    float tanSun = sunDir.z / length(sunDir.xy);
    float shadow = 1.0;
    float stp = 0.04;
    float travel = 0.0;
    for (int k = 0; k < 7; k++) {
      travel += stp;
      float hs = terrain(q + sd * travel, fp, oct - 2);
      shadow = min(shadow, clamp(((h0 + travel * tanSun) - hs) * 2.5 / travel + 1.0, 0.0, 1.0));
      stp *= 1.7;
    }

    float tone = texture(moonAlbedo, vec2(0.5, 0.5) + q * vec2(0.0045, 0.0035)).r;
    float speckle = mix(0.86, 1.1, vnoise(q * 9.0));
    vec3 albedo = vec3(0.155, 0.148, 0.14) * mix(0.75, 1.25, tone) * mix(1.0, speckle, smoothstep(0.08, 0.01, fp));
    float mu0 = max(dot(n, sunDir) * 0.85 + 0.15, 0.0);
    float mu = max(dot(n, -rd), 0.0);
    // Lunar regolith: Lambert for relief, Lommel-Seeliger for the flat look.
    float brdf = mix(mu0, 2.0 * mu0 / (mu0 + mu + 1e-4), 0.7);
    color = albedo * brdf * mix(0.35, 1.0, shadow) * 0.78;
    // Faint earthshine keeps shadows from going pure black.
    color += albedo * 0.012;
  } else {
    vec2 eh = sphere(ro, rd, earthPos, earthR);
    if (eh.x > 0.0) {
      color = shadeEarth(ro, rd, eh.x);
    }
    // Thin atmosphere ring, only on the sunlit limb.
    vec3 oe = ro - earthPos;
    float te = -dot(oe, rd);
    float d = length(oe + rd * te);
    if (te > 0.0 && d > earthR * 0.995) {
      vec3 limbN = normalize(oe + rd * te);
      float lit = smoothstep(-0.15, 0.35, dot(limbN, sunDir));
      float glow = exp(-(d - earthR) / (earthR * 0.012)) * lit;
      color += vec3(0.3, 0.55, 1.0) * glow * 0.55;
    }
  }

  color = aces(color * exposure);
  color = toSrgb(color);
  // Film grain, very light, so gradients never band.
  float grain = hash12(gl_FragCoord.xy + fract(time * 0.001) * 917.0) - 0.5;
  color += grain * 0.012;
  gl_FragColor = vec4(color, 1.0);
}
`;

async function createLumenSceneWithDependencies(
  { mount, quality, assets, onContextLost = function () {}, signal, preserveDrawingBuffer = false },
  dependencies = defaultDependencies,
) {
  if (!mount || !quality || !assets) throw new TypeError('Lumen scene requires mount, quality, and assets');
  const tier = quality.textureTier === 'mobile' ? 'mobile' : 'desktop';
  const renderer = dependencies.createRenderer({ alpha: false, antialias: false, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(quality.pixelRatio, 1.5));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  mount.appendChild(renderer.domElement);

  let active = true;
  let disposed = false;
  let contextLost = false;
  let initializing = true;
  let rejectInitialization;
  const initializationInterrupted = new Promise((resolve, reject) => { rejectInitialization = reject; });
  const textures = [];
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
    textures.forEach((texture) => texture.dispose());
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
    interrupt(new Error('WebGL context lost during Lumen scene initialization'));
    onContextLost();
  }

  renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
  signal?.addEventListener('abort', handleAbort, { once: true });
  if (signal?.aborted) handleAbort();

  let timeline;
  try {
    timeline = await Promise.race([dependencies.loadTimeline(signal), initializationInterrupted]);
  } catch (error) {
    interrupt(error);
    throw error;
  }

  const textureLoader = new THREE.TextureLoader();
  async function loadTexture(name) {
    const texture = await dependencies.loadTexture(textureLoader, assetPath(assets, name, tier), signal);
    if (disposed || signal?.aborted) {
      texture.dispose();
      throw abortError();
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(texture);
    return texture;
  }

  let earthDay;
  let earthClouds;
  let moonAlbedo;
  try {
    [earthDay, earthClouds, moonAlbedo] = await Promise.race([Promise.all([
      loadTexture('earthDay'),
      loadTexture('earthClouds'),
      loadTexture('moonAlbedo'),
    ]), initializationInterrupted]);
  } catch (error) {
    interrupt(error);
    throw error;
  }
  moonAlbedo.wrapS = moonAlbedo.wrapT = THREE.RepeatWrapping;

  if (dependencies.buildScene) {
    const built = dependencies.buildScene({ renderer, resources: { geometries, materials, textures }, timeline });
    initializing = false;
    return {
      render(state, deltaMs) { if (active && !disposed) built.render(state, deltaMs); },
      resize(width, height) { if (!disposed && width > 0 && height > 0) built.resize(width, height); },
      pause() { active = false; },
      resume() { if (!disposed && !contextLost) active = true; },
      dispose() { disposeResources(); },
    };
  }

  const deg = Math.PI / 180;
  const mobile = tier === 'mobile';
  const moonR = timeline.moon.radius;
  const cam = timeline.camera;
  const dip = (height) => Math.acos(moonR / (moonR + height));
  const dipFrom = dip(cam.heightFrom);
  const dipTo = dip(cam.heightTo);

  const azimuth = (mobile ? timeline.mobile.azimuthDeg : timeline.earth.azimuthDeg) * deg;
  const elevation = timeline.earth.elevationDeg * deg;
  const earthPos = new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
  ).multiplyScalar(timeline.earth.distance);
  const sunDir = new THREE.Vector3(...timeline.sun.direction).normalize();

  const pitch = cam.pitchDeg * deg;
  const camForward = new THREE.Vector3(0, Math.cos(pitch), Math.sin(pitch));
  const camRight = new THREE.Vector3(1, 0, 0);
  const camUp = new THREE.Vector3().crossVectors(camRight, camForward);

  const uniforms = {
    resolution: { value: new THREE.Vector2(1, 1) },
    camPos: { value: new THREE.Vector3(0, 0, cam.heightFrom) },
    camRight: { value: camRight },
    camUp: { value: camUp },
    camForward: { value: camForward },
    tanHalf: { value: new THREE.Vector2(1, 1) },
    sunDir: { value: sunDir },
    moonR: { value: moonR },
    earthPos: { value: earthPos },
    earthR: { value: timeline.earth.radius },
    earthRot: { value: new THREE.Matrix3() },
    exposure: { value: 0 },
    time: { value: 0 },
    detail: { value: mobile ? 0 : 1 },
    earthDay: { value: earthDay },
    earthClouds: { value: earthClouds },
    moonAlbedo: { value: moonAlbedo },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
  materials.push(material);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometries.push(geometry);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  // World-to-Earth-local rotation: axial tilt toward the viewer, then spin.
  const tilt = new THREE.Matrix4().makeRotationX(timeline.earth.tiltDeg * deg);
  const spinMatrix = new THREE.Matrix4();
  const earthMatrix = new THREE.Matrix4();

  let latestState = { phase: 'rise', progress: 0, label: '', copyVisible: false, elapsedMs: 0 };
  let viewportWidth = 1;
  let viewportHeight = 1;

  function draw(state) {
    const elapsed = Math.max(0, state.elapsedMs || 0);
    const rise = easeInOut(Math.min(elapsed, cam.riseEndMs) / cam.riseEndMs);
    const angle = dipFrom + (dipTo - dipFrom) * rise;
    uniforms.camPos.value.set(0, 0, moonR * (1 / Math.cos(angle) - 1));

    const spin = timeline.earth.spinDeg * deg + elapsed * timeline.earth.spinRadPerMs;
    spinMatrix.makeRotationZ(-spin);
    earthMatrix.multiplyMatrices(spinMatrix, tilt);
    uniforms.earthRot.value.setFromMatrix4(earthMatrix);

    const fade = Math.min(1, elapsed / cam.fadeInMs);
    uniforms.exposure.value = 1.1 * fade * fade * (3 - 2 * fade);
    uniforms.time.value = elapsed;

    const shortHalf = Math.tan(((mobile ? timeline.mobile.fovShortDeg : cam.fovShortDeg) * deg) / 2);
    const aspect = viewportWidth / viewportHeight;
    if (aspect >= 1) uniforms.tanHalf.value.set(shortHalf * aspect, shortHalf);
    else uniforms.tanHalf.value.set(shortHalf, shortHalf / aspect);
    renderer.render(scene, camera);
  }

  function render(state, deltaMs) {
    latestState = { ...state, elapsedMs: Number.isFinite(state.elapsedMs) ? state.elapsedMs : 0, deltaMs };
    if (!active || disposed) return;
    draw(latestState);
  }

  function resize(width, height) {
    if (disposed || width <= 0 || height <= 0) return;
    viewportWidth = width;
    viewportHeight = height;
    renderer.setSize(width, height, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    uniforms.resolution.value.copy(size);
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
