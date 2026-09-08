import * as THREE from '../vendor/three.module.min.js';

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function assetPath(assets, name, tier) {
  const value = assets[name];
  if (!value) throw new Error(`Missing Lumen asset: ${name}`);
  return typeof value === 'string' ? value : value[tier];
}

const defaultDependencies = {
  createRenderer: (options) => new THREE.WebGLRenderer(options),
  loadTimeline: async (signal) => {
    const response = await fetch(new URL('./lumen-timeline.json', import.meta.url), { signal });
    if (!response.ok) throw new Error('Unable to load the Lumen timeline');
    return response.json();
  },
  loadTexture: (loader, path) => loader.loadAsync(path),
};

function abortError(message = 'Lumen scene initialization aborted') {
  return new DOMException(message, 'AbortError');
}

function patchEarthShader(shader, earthNight, lightDirection) {
  shader.uniforms.earthNight = { value: earthNight };
  shader.uniforms.lightDirection = { value: lightDirection };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 lumenWorldNormal;')
    .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
lumenWorldNormal = normalize(vec3(
  dot(transformedNormal, viewMatrix[0].xyz),
  dot(transformedNormal, viewMatrix[1].xyz),
  dot(transformedNormal, viewMatrix[2].xyz)
));`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D earthNight;\nuniform vec3 lightDirection;\nvarying vec3 lumenWorldNormal;')
    .replace('#include <opaque_fragment>', `
      float lumenDark = 1.0 - smoothstep(-0.12, 0.16, dot(normalize(lumenWorldNormal), normalize(lightDirection)));
      outgoingLight += texture2D(earthNight, vMapUv).rgb * lumenDark * 1.6;
      #include <opaque_fragment>
    `);
}

async function createLumenSceneWithDependencies(
  { mount, quality, assets, onContextLost = function () {}, signal },
  dependencies = defaultDependencies,
) {
  if (!mount || !quality || !assets) throw new TypeError('Lumen scene requires mount, quality, and assets');
  const tier = quality.textureTier === 'mobile' ? 'mobile' : 'desktop';
  const segments = tier === 'mobile' ? 64 : 128;
  const renderer = dependencies.createRenderer({ alpha: false, antialias: Boolean(quality.antialias) });
  renderer.setPixelRatio(Math.min(quality.pixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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

  function handleAbort() {
    interrupt(abortError());
  }

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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 180);
  camera.up.set(0, 0, 1);
  const textureLoader = new THREE.TextureLoader();

  async function loadTexture(name, colorTexture) {
    const texture = await dependencies.loadTexture(textureLoader, assetPath(assets, name, tier), signal);
    if (disposed || signal?.aborted) {
      texture.dispose();
      throw abortError();
    }
    texture.colorSpace = colorTexture ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(texture);
    return texture;
  }

  let earthDay;
  let earthNight;
  let earthClouds;
  let earthNormal;
  let moonAlbedo;
  let moonNormal;
  try {
    [earthDay, earthNight, earthClouds, earthNormal, moonAlbedo, moonNormal] = await Promise.race([Promise.all([
      loadTexture('earthDay', true),
      loadTexture('earthNight', true),
      loadTexture('earthClouds', true),
      loadTexture('earthNormal', false),
      loadTexture('moonAlbedo', true),
      loadTexture('moonNormal', false),
    ]), initializationInterrupted]);
  } catch (error) {
    interrupt(error);
    throw error;
  }

  if (dependencies.buildScene) {
    const built = dependencies.buildScene({ renderer, resources: { geometries, materials, textures }, timeline });
    initializing = false;
    function render(state, deltaMs) {
      if (active && !disposed) built.render(state, deltaMs);
    }
    function resize(width, height) {
      if (!disposed && width > 0 && height > 0) built.resize(width, height);
    }
    function pause() { active = false; }
    function resume() { if (!disposed && !contextLost) active = true; }
    function dispose() { disposeResources(); }
    return { render, resize, pause, resume, dispose };
  }

  function sphere(radius, multiplier = 1) {
    const geometry = new THREE.SphereGeometry(radius, Math.round(segments * multiplier), Math.round(segments * multiplier / 2));
    geometries.push(geometry);
    return geometry;
  }

  const lightDirection = new THREE.Vector3(...timeline.light.direction).normalize();
  const sunlight = new THREE.DirectionalLight(0xfff4de, 3.2);
  sunlight.position.copy(lightDirection).multiplyScalar(18);
  sunlight.target.position.set(...timeline.bodies.earth.position);
  scene.add(sunlight, sunlight.target);
  scene.add(new THREE.HemisphereLight(0x18284a, 0x020205, 0.09));

  // Earth surface: independent day, night, normal, cloud, and atmosphere layers.
  const earthMaterial = new THREE.MeshStandardMaterial({
    map: earthDay,
    normalMap: earthNormal,
    normalScale: new THREE.Vector2(0.48, 0.48),
    roughness: 0.72,
    metalness: 0,
  });
  earthMaterial.onBeforeCompile = (shader) => patchEarthShader(shader, earthNight, lightDirection);
  earthMaterial.customProgramCacheKey = () => 'lumen-earth-day-night-v1';
  materials.push(earthMaterial);
  const earth = new THREE.Mesh(sphere(timeline.bodies.earth.radius), earthMaterial); // Earth surface
  const earthPosition = [...timeline.bodies.earth.position];
  if (tier === 'mobile') earthPosition[0] = timeline.mobile.earthX;
  earth.position.set(...earthPosition);
  earth.rotation.z = -0.409;
  scene.add(earth);

  const cloudMaterial = new THREE.MeshStandardMaterial({
    map: earthClouds,
    transparent: true,
    opacity: 0.68,
    alphaTest: 0.025,
    depthWrite: false,
    roughness: 1,
  });
  materials.push(cloudMaterial);
  const clouds = new THREE.Mesh(sphere(timeline.bodies.earth.radius * 1.008), cloudMaterial); // Earth cloud shell
  clouds.position.copy(earth.position);
  clouds.rotation.copy(earth.rotation);
  scene.add(clouds);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(0x4b9dff) } },
    vertexShader: 'varying vec3 n; varying vec3 eye; void main(){ vec4 world=modelMatrix*vec4(position,1.0); n=normalize(mat3(modelMatrix)*normal); eye=normalize(cameraPosition-world.xyz); gl_Position=projectionMatrix*viewMatrix*world; }',
    fragmentShader: 'uniform vec3 color; varying vec3 n; varying vec3 eye; void main(){ float rim=pow(max(0.0,1.0-dot(n,eye)),3.2); gl_FragColor=vec4(color,rim*0.48); }',
  });
  materials.push(atmosphereMaterial);
  const atmosphere = new THREE.Mesh(sphere(timeline.bodies.earth.radius * 1.07), atmosphereMaterial); // Earth atmosphere
  atmosphere.position.copy(earth.position);
  scene.add(atmosphere);

  // Moon surface: rough normal-mapped regolith.
  const moonMaterial = new THREE.MeshStandardMaterial({
    map: moonAlbedo,
    normalMap: moonNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.96,
    metalness: 0,
  });
  materials.push(moonMaterial);
  const moon = new THREE.Mesh(sphere(timeline.bodies.moon.radius, 0.75), moonMaterial); // Moon surface
  const moonPosition = [...timeline.bodies.moon.position];
  if (tier === 'mobile') moonPosition[0] = timeline.mobile.moonX;
  moon.position.set(...moonPosition);
  moon.rotation.set(0.12, -0.28, 0.08);
  scene.add(moon);

  // Procedural solar limb: layered granular photosphere and restrained corona.
  const sunMaterial = new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 p; varying vec3 n; void main(){ p=position; n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 p; varying vec3 n;
      float hash(vec3 q){ return fract(sin(dot(q,vec3(127.1,311.7,74.7)))*43758.5453); }
      void main(){
        float granules=hash(floor(normalize(p)*220.0));
        float limb=pow(max(0.0,abs(n.z)),0.32);
        vec3 hot=mix(vec3(1.0,0.20,0.015),vec3(1.0,0.78,0.25),granules);
        gl_FragColor=vec4(hot*(0.72+0.55*limb),1.0);
      }
    `,
  });
  materials.push(sunMaterial);
  const sun = new THREE.Mesh(sphere(timeline.bodies.sun.radius), sunMaterial);
  sun.position.set(...timeline.bodies.sun.position);
  scene.add(sun);

  const coronaMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 n; varying vec3 eye; void main(){ vec4 world=modelMatrix*vec4(position,1.0); n=normalize(mat3(modelMatrix)*normal); eye=normalize(cameraPosition-world.xyz); gl_Position=projectionMatrix*viewMatrix*world; }',
    fragmentShader: 'varying vec3 n; varying vec3 eye; void main(){ float glow=pow(max(0.0,1.0-dot(n,eye)),2.5); gl_FragColor=vec4(1.0,0.22,0.025,glow*0.17); }',
  });
  materials.push(coronaMaterial);
  const corona = new THREE.Mesh(sphere(timeline.bodies.sun.radius * 1.09), coronaMaterial);
  corona.position.copy(sun.position);
  scene.add(corona);

  // Seeded distant stars: deterministic points on a far spherical volume.
  const random = seededRandom(0x4c554d45);
  const starPositions = new Float32Array((tier === 'mobile' ? 900 : 1600) * 3);
  for (let index = 0; index < starPositions.length; index += 3) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = 72 + random() * 20;
    const ring = Math.sqrt(1 - z * z);
    starPositions[index] = Math.cos(angle) * ring * radius;
    starPositions[index + 1] = Math.sin(angle) * ring * radius;
    starPositions[index + 2] = z * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  geometries.push(starGeometry);
  const starMaterial = new THREE.PointsMaterial({ color: 0xdde6ff, size: tier === 'mobile' ? 0.065 : 0.05, sizeAttenuation: true });
  materials.push(starMaterial);
  scene.add(new THREE.Points(starGeometry, starMaterial));

  const cameraTarget = new THREE.Vector3();
  let latestState = { phase: 'solar', progress: 0, label: 'SOLAR', copyVisible: false, elapsedMs: 0 };
  let viewportWidth = 1;
  let viewportHeight = 1;

  function draw(state) {
    const elapsedMs = Math.max(0, Math.min(timeline.durationMs, state.elapsedMs || 0));
    let right = timeline.camera.findIndex((keyframe) => keyframe.ms >= elapsedMs);
    if (right < 1) right = right === 0 ? 1 : timeline.camera.length - 1;
    const previous = timeline.camera[right - 1];
    const next = timeline.camera[right];
    const amount = smoothstep((elapsedMs - previous.ms) / (next.ms - previous.ms));
    camera.position.fromArray(previous.position).lerp(new THREE.Vector3().fromArray(next.position), amount);
    cameraTarget.fromArray(previous.target).lerp(new THREE.Vector3().fromArray(next.target), amount);
    camera.fov = THREE.MathUtils.lerp(previous.lens, next.lens, amount);
    if (tier === 'mobile') {
      camera.setViewOffset(
        viewportWidth,
        viewportHeight,
        timeline.mobile.cameraShiftX * viewportWidth,
        0,
        viewportWidth,
        viewportHeight,
      );
    }
    camera.updateProjectionMatrix();
    camera.lookAt(cameraTarget);

    const heldMs = state.phase === 'held' ? Math.max(0, (state.elapsedMs || timeline.durationMs) - timeline.durationMs) : 0;
    earth.rotation.y = heldMs * 0.000018;
    clouds.rotation.y = heldMs * 0.000024;
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
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (active) draw(latestState);
  }

  function pause() {
    active = false;
  }

  function resume() {
    if (!disposed && !contextLost) active = true;
  }

  function dispose() {
    disposeResources();
  }

  initializing = false;
  return { render, resize, pause, resume, dispose };
}

function createLumenScene(options) {
  return createLumenSceneWithDependencies(options);
}

window.createLumenScene = createLumenScene;
export { createLumenScene, createLumenSceneWithDependencies, patchEarthShader };
