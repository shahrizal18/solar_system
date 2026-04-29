// src/main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PLANETS } from './data/planets.js';
import { propagateOrbit, getHeliocentricPosition } from './physics/orbit.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 5, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// Controls (initialized before use)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 200;

// Lighting
const sunLight = new THREE.PointLight(0xffffff, 5, 100, 1);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x222244, 0.6));

// Starfield
const starGeo = new THREE.BufferGeometry();
const starCount = 8000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 1500;
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true });
scene.add(new THREE.Points(starGeo, starMat));

// Planet meshes & orbit lines
const planetMeshes = {};
const orbitLines = {};

function createProceduralTexture(color, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size / 3; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

PLANETS.forEach(p => {
  const isSun = p.name === 'Sun';
  const radius = isSun ? 5 : 0.15 * (p.radiusKm / 6371);
  const geo = new THREE.SphereGeometry(radius, 64, 64);
  const mat = new THREE.MeshStandardMaterial({
    color: p.color,
    emissive: p.emissive || 0x000000,
    emissiveIntensity: isSun ? 3 : 0.4,
    map: createProceduralTexture(p.color),
    roughness: isSun ? 0.15 : 0.6,
    metalness: isSun ? 0.05 : 0.15
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { ...p, baseRadius: radius };
  scene.add(mesh);
  planetMeshes[p.name] = mesh;

  if (!isSun) {
    const curve = new THREE.EllipseCurve(0, 0, p.a, p.a * Math.sqrt(1 - p.e * p.e), 0, 2 * Math.PI, false, 0);
    const pts = curve.getPoints(128);
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map(v => new THREE.Vector3(v.x, 0, v.y)));
    const mat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.25 });
    const line = new THREE.Line(geo, mat);
    line.rotation.x = Math.PI / 2;
    scene.add(line);
    orbitLines[p.name] = line;
  }
});

// Saturn rings
const satMesh = planetMeshes['Saturn'];
if (satMesh) {
  const ringGeo = new THREE.RingGeometry(7, 12, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xccbbaa, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  satMesh.add(ring);
}

// Asteroid Belt (InstancedMesh)
function createAsteroidBelt() {
  const count = 2000;
  const geo = new THREE.IcosahedronGeometry(0.015, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = 2.1 + Math.random() * 1.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * 0.15;
    dummy.position.set(r * Math.cos(theta) * Math.cos(phi), r * Math.sin(phi), r * Math.sin(theta) * Math.cos(phi));
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    dummy.scale.setScalar(0.4 + Math.random() * 1.2);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}
createAsteroidBelt();

// Post-Processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.2, 0.3, 0.8
);
composer.addPass(bloomPass);

// Sun Flare
const sunFlare = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,200,1)');
      grad.addColorStop(0.2, 'rgba(255,200,100,0.5)');
      grad.addColorStop(0.5, 'rgba(255,150,50,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      return c;
    })(),
    blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false
  })
);
sunFlare.scale.set(12, 12, 1);
sunFlare.renderOrder = 10;
scene.add(sunFlare);

// State
let simDays = 0;
let timeSpeed = 10;
let isPlaying = true;
let scaleMode = 'visual';

// UI
const speedEl = document.getElementById('speed');
const dateEl = document.getElementById('date');
const playBtn = document.getElementById('play');
const scaleEl = document.getElementById('scale');
const infoEl = document.getElementById('info');

speedEl.addEventListener('input', () => { timeSpeed = parseFloat(speedEl.value); dateEl.value = simDays.toFixed(1); });
playBtn.addEventListener('click', () => { isPlaying = !isPlaying; playBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play'; });
scaleEl.addEventListener('change', () => {
  scaleMode = scaleEl.value;
  infoEl.textContent = scaleMode === 'scientific' 
    ? '⚠️ True size ratios. Zoom in to see planets.' 
    : '🌍 Visually scaled for clarity.';
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener('click', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(planetMeshes));
  if (hits.length > 0) {
    const p = hits[0].object.userData;
    infoEl.textContent = `${p.name}: a=${p.a.toFixed(4)} AU, e=${p.e.toFixed(4)}, i=${p.i.toFixed(3)}°`;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
let lastTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (isPlaying) {
    simDays += timeSpeed * dt;
    dateEl.value = simDays.toFixed(1);
  }

  PLANETS.forEach(p => {
    const mesh = planetMeshes[p.name];
    if (!mesh) return;
    
    if (p.name === 'Sun') {
      mesh.position.set(0, 0, 0);
      return;
    }

    let pos;
    const eph = getHeliocentricPosition(p.name, simDays);
    pos = eph || propagateOrbit(p, simDays);

    // Y-up conversion for Three.js
    mesh.position.set(pos.x, pos.z, -pos.y);

    const displayRadius = scaleMode === 'scientific' 
      ? mesh.userData.baseRadius / 10000 
      : mesh.userData.baseRadius;
    mesh.scale.setScalar(displayRadius / mesh.userData.baseRadius);
    
    // Update atmosphere glow uniforms
    mesh.children.forEach(child => {
      if (child.material && child.material.uniforms && child.material.uniforms.viewVector) {
        child.material.uniforms.viewVector.value.copy(camera.position);
      }
    });
  });

  controls.update();
  sunFlare.position.copy(planetMeshes['Sun'].position);
  sunFlare.lookAt(camera.position);
  composer.render();
}
animate(performance.now());
