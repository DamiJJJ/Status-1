/* NEON ARENA — renderer, camera, postprocessing, lights, sky
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== RENDERER / SCENA / POSTPROCESSING ==================== */

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.fog, 42, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 500);
camera.rotation.order = 'YXZ'; // yaw→pitch: odrzut modyfikuje czysto pitch
camera.position.set(0, PLAYER_EYE, 26);
const BASE_FOV = 75, ZOOM_FOV = 24;

const composer = new EffectComposer(renderer);
// kept by name: main.js retargets this pass at the menu panorama (MENU-1)
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.5, 0.55, 0.60);
composer.addPass(bloomPass);

/* Sprint blur: a RADIAL smear that leaves the middle of the screen sharp and
   grows toward the edges - the running-tunnel look, driven by `sprintBlend`
   through setSprintBlur(). Radial rather than a flat gaussian on purpose:
   a uniform blur over the whole frame costs you the ability to see what you
   are running at, which is not a trade a shooter can make.

   The pass is DISABLED at strength 0, so it costs nothing whenever nobody is
   running - it sits between the bloom and the output pass, i.e. it smears the
   lit image before tone mapping. */
const sprintBlurPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - vec2(0.5);
      // nothing happens in the middle third; the smear ramps up outward
      float k = strength * smoothstep(0.34, 1.0, length(dir) * 2.0);
      vec4 sum = vec4(0.0);
      for (int i = 0; i < 8; i++) {
        sum += texture2D(tDiffuse, vUv - dir * k * (float(i) / 7.0));
      }
      gl_FragColor = sum / 8.0;
    }`,
});
sprintBlurPass.enabled = false;
composer.addPass(sprintBlurPass);
composer.addPass(new OutputPass());

/* Kept deliberately small (user asked for a LIGHT blur): this is a uv offset,
   so 0.035 smears a corner pixel by ~3% of the screen. Much past that the
   taps stop overlapping and the smear breaks into visible ghost copies. */
const SPRINT_BLUR_MAX = 0.035;

function setSprintBlur(x) {
  const s = Math.max(0, Math.min(1, x)) * SPRINT_BLUR_MAX;
  sprintBlurPass.enabled = s > 0.001;
  sprintBlurPass.uniforms.strength.value = s;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

/* --- oświetlenie --- */
const hemi = new THREE.HemisphereLight(0x8f98da, 0x33355a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9b0, 2.8);
sun.position.set(32, 48, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 130;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const ambient = new THREE.AmbientLight(0x3a3f6e, 0.7);
scene.add(ambient);

/* --- niebo: gradientowa kopuła (shader) --- */
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top:     { value: new THREE.Color(PALETTE.sky) },
      horizon: { value: new THREE.Color(PALETTE.horizon) },
      glow:    { value: new THREE.Color(0xd97b4a) },
      sunDir:  { value: sun.position.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = pow(max(dot(normalize(vDir), sunDir), 0.0), 6.0);
        col += glow * s * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 12), skyMat);
  scene.add(sky);
}
