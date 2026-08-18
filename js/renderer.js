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
composer.addPass(new OutputPass());

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
