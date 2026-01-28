import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const stage = document.getElementById("stage");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
stage.appendChild(renderer.domElement);

// ===== Studio environment lighting (makes car paint/metal not black) =====
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;

// Extra lights (adds punch)
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const key = new THREE.DirectionalLight(0xffffff, 3.2);
key.position.set(6, 9, 8);
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 1.6);
fill.position.set(-8, 3, 6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 2.2);
rim.position.set(-2, 8, -10);
scene.add(rim);

// ===== MODEL STACK =====
// userGroup: user temporary drag rotation
// tiltGroup: your fixed hero tilt (always returns here)
// spinGroup: auto spin (stops while dragging)
const userGroup = new THREE.Group();
const tiltGroup = new THREE.Group();
const spinGroup = new THREE.Group();
scene.add(userGroup);
userGroup.add(tiltGroup);
tiltGroup.add(spinGroup);

// ===== YOUR FIXED ROTATION VALUES =====
const defaultUserRot = new THREE.Euler(-1.413717, 0.221227, 0.0);
const defaultTilt    = new THREE.Euler(-0.785398, 0.0, 0.314159);

// Apply initial fixed pose
userGroup.rotation.copy(defaultUserRot);
tiltGroup.rotation.copy(defaultTilt);

// Camera
camera.position.set(0, 2.2, 12.0);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

// ===== Load Model =====
const loader = new GLTFLoader();
let model = null;

loader.load(
  "./model.glb",
  (gltf) => {
    model = gltf.scene;
    spinGroup.add(model);

    // Texture crispness
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) {
            m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            m.map.needsUpdate = true;
          }
          m.needsUpdate = true;
        }
      }
    });

    // Center model
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    // Scale
    const maxDim = Math.max(size.x, size.y, size.z);
    const desired = 6.8; // bigger/smaller
    model.scale.setScalar(desired / maxDim);

    // If your GLB is authored upside down, keep this. If it's wrong, set to 0.
    model.rotation.x = Math.PI;

    // Move up/down (THIS line moves the whole model up/down)
    // Positive = up, Negative = down
    userGroup.position.y = 0.0;

    // Re-lock pose
    userGroup.rotation.copy(defaultUserRot);
    tiltGroup.rotation.copy(defaultTilt);
  },
  undefined,
  (err) => console.error("Failed to load ./model.glb", err)
);

// ===== DRAG INTERACTION (stops spin while dragging, then snaps back) =====
let isDragging = false;
let lastX = 0;
let lastY = 0;

const dragStrength = 0.005;

// Clamp pitch so it doesn't flip upside down
const minPitch = -Math.PI * 0.95;
const maxPitch = -Math.PI * 0.05;

renderer.domElement.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener("pointermove", (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  // Rotate the USER group while dragging
  userGroup.rotation.y += dx * dragStrength;
  userGroup.rotation.x += dy * dragStrength;

  userGroup.rotation.x = THREE.MathUtils.clamp(userGroup.rotation.x, minPitch, maxPitch);
});

function endDrag(e){
  isDragging = false;
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
}
renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);
renderer.domElement.addEventListener("pointerleave", () => { isDragging = false; });

// ===== AUTO SPIN + SNAP BACK TO YOUR FIXED POINTS =====
const autoSpinSpeed = 0.012; // slower/faster
const snapStrength  = 0.10;  // faster/slower return

function animate() {
  requestAnimationFrame(animate);

  // Always keep tilt locked
  tiltGroup.rotation.copy(defaultTilt);

  if (!isDragging) {
    // Spin only when not dragging
    spinGroup.rotation.y += autoSpinSpeed;

    // Smoothly return to EXACT fixed points after release
    userGroup.rotation.x += (defaultUserRot.x - userGroup.rotation.x) * snapStrength;
    userGroup.rotation.y += (defaultUserRot.y - userGroup.rotation.y) * snapStrength;
    userGroup.rotation.z += (defaultUserRot.z - userGroup.rotation.z) * snapStrength;
  }

  renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
