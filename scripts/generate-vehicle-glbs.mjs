/**
 * Generate body-only GLB models for the three launch vehicles.
 *
 * Wheels stay procedural in VehicleView (they need to spin/steer), so these
 * meshes are chassis shells only: +Z forward, +Y up, roughly SI metres.
 *
 * Usage: node scripts/generate-vehicle-glbs.mjs
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// --- Node polyfills for GLTFExporter ---------------------------------------
globalThis.FileReader = class FileReader {
  constructor() {
    this.onloadend = null;
    this.onload = null;
    this.onerror = null;
    this.result = null;
    this.readyState = 0;
  }
  readAsArrayBuffer(blob) {
    this.readyState = 1;
    Promise.resolve(blob.arrayBuffer())
      .then((buf) => {
        this.result = buf;
        this.readyState = 2;
        const ev = { target: this };
        this.onload?.(ev);
        this.onloadend?.(ev);
      })
      .catch((err) => this.onerror?.(err));
  }
  readAsDataURL(blob) {
    this.readyState = 1;
    Promise.resolve(blob.arrayBuffer())
      .then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:application/octet-stream;base64,${b64}`;
        this.readyState = 2;
        const ev = { target: this };
        this.onload?.(ev);
        this.onloadend?.(ev);
      })
      .catch((err) => this.onerror?.(err));
  }
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/models');
mkdirSync(OUT, { recursive: true });

const exporter = new GLTFExporter();

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.35,
    roughness: opts.roughness ?? 0.42,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flat ?? false,
  });
}

function add(group, geo, material, pos = [0, 0, 0], rot = null, scale = null) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Smooth wedge via scaled box deformation. */
function wedgeGeo(w, h, d, taper = 0.72) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y > 0) {
      const t = taper + (1 - taper) * ((z / d) * 0.5 + 0.5);
      pos.setX(i, pos.getX(i) * t);
      pos.setZ(i, z * 0.92 - d * 0.04);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Cabin glass shell — slightly smaller wedge. */
function glassWedge(w, h, d) {
  return wedgeGeo(w, h, d, 0.78);
}

// ---------------------------------------------------------------------------
// Vector GT-R — low hypercar, wide stance, canopy, wing, carbon accents
// ---------------------------------------------------------------------------
function buildHyperGt() {
  const root = new THREE.Group();
  root.name = 'vector-gt-r';

  const paint = mat(0xd81f36, { metalness: 0.45, roughness: 0.32 });
  const paintDark = mat(0x9a1528, { metalness: 0.4, roughness: 0.4 });
  const carbon = mat(0x12141a, { metalness: 0.65, roughness: 0.38 });
  const glass = mat(0x6a9ab8, { metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.38 });
  const chrome = mat(0xc8ccd4, { metalness: 0.9, roughness: 0.22 });
  const light = mat(0xfff4d0, { metalness: 0.2, roughness: 0.25, emissive: 0xffe8a0, emissiveIntensity: 0.85 });
  const black = mat(0x0a0a0c, { metalness: 0.3, roughness: 0.7 });

  // Lower tub
  add(root, new THREE.BoxGeometry(1.95, 0.38, 4.4, 2, 1, 6), paint, [0, 0.42, 0.02]);
  // Side sills
  add(root, new THREE.BoxGeometry(2.12, 0.14, 3.7), paintDark, [0, 0.26, 0.05]);
  // Nose
  add(root, wedgeGeo(1.85, 0.28, 1.1, 0.55), paint, [0, 0.4, 1.85]);
  // Front splitter
  add(root, new THREE.BoxGeometry(2.05, 0.06, 0.75), carbon, [0, 0.16, 2.15]);
  // Bumper lip
  add(root, new THREE.BoxGeometry(1.88, 0.14, 0.32), paint, [0, 0.3, 2.22]);
  // Cabin glass
  add(root, glassWedge(1.52, 0.4, 1.9), glass, [0, 0.88, -0.08]);
  // Roof / A-pillar frame
  add(root, wedgeGeo(1.58, 0.1, 2.0, 0.7), carbon, [0, 1.08, -0.12]);
  // Side windows strip
  add(root, new THREE.BoxGeometry(1.62, 0.22, 1.4), glass, [0, 0.78, -0.15]);
  // Rear haunches
  add(root, new THREE.BoxGeometry(1.92, 0.32, 1.1), paint, [0, 0.5, -1.55]);
  // Diffuser
  add(root, new THREE.BoxGeometry(1.8, 0.1, 0.6), carbon, [0, 0.18, -2.2]);
  for (let i = -2; i <= 2; i++) {
    add(root, new THREE.BoxGeometry(0.05, 0.12, 0.45), carbon, [i * 0.28, 0.14, -2.15]);
  }
  // Wing
  add(root, new THREE.BoxGeometry(1.78, 0.05, 0.38), carbon, [0, 1.12, -2.05]);
  add(root, new THREE.BoxGeometry(0.06, 0.38, 0.32), carbon, [0.86, 0.95, -2.05]);
  add(root, new THREE.BoxGeometry(0.06, 0.38, 0.32), carbon, [-0.86, 0.95, -2.05]);
  // Mirrors
  add(root, new THREE.BoxGeometry(0.24, 0.08, 0.16), carbon, [0.98, 0.8, 0.52]);
  add(root, new THREE.BoxGeometry(0.24, 0.08, 0.16), carbon, [-0.98, 0.8, 0.52]);
  // Roof stripe
  add(root, new THREE.BoxGeometry(0.2, 0.03, 1.7), mat(0xf0f0f4, { metalness: 0.2, roughness: 0.5 }), [0, 1.12, -0.15]);
  // Headlight bar
  add(root, new THREE.BoxGeometry(1.4, 0.08, 0.14), light, [0, 0.55, 2.28]);
  // Side intakes
  add(root, new THREE.BoxGeometry(0.14, 0.24, 0.6), black, [1.0, 0.5, 0.35]);
  add(root, new THREE.BoxGeometry(0.14, 0.24, 0.6), black, [-1.0, 0.5, 0.35]);
  // Exhaust tips
  add(root, new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), chrome, [0.35, 0.22, -2.45], [Math.PI / 2, 0, 0]);
  add(root, new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), chrome, [-0.35, 0.22, -2.45], [Math.PI / 2, 0, 0]);

  return root;
}

// ---------------------------------------------------------------------------
// Hornet 1000R — superbike silhouette
// ---------------------------------------------------------------------------
function buildSuperbike() {
  const root = new THREE.Group();
  root.name = 'hornet-1000r';

  const body = mat(0xf0a01e, { metalness: 0.4, roughness: 0.35 });
  const dark = mat(0x1a1a1e, { metalness: 0.55, roughness: 0.4 });
  const carbon = mat(0x12141a, { metalness: 0.7, roughness: 0.35 });
  const glass = mat(0x7aa8c8, { metalness: 0.05, roughness: 0.1, transparent: true, opacity: 0.4 });
  const chrome = mat(0xb8bcc4, { metalness: 0.85, roughness: 0.25 });
  const light = mat(0xfff0c8, { emissive: 0xffe8a0, emissiveIntensity: 0.9, roughness: 0.3 });
  const seat = mat(0x2a2a30, { metalness: 0.15, roughness: 0.75 });

  // Main tank / body
  add(root, new THREE.BoxGeometry(0.38, 0.38, 1.2, 2, 2, 4), body, [0, 0.7, 0.05]);
  // Tank top curve (sphere-ish)
  add(root, new THREE.SphereGeometry(0.2, 16, 12), body, [0, 0.9, 0.15], null, [1.1, 0.7, 1.4]);
  // Belly pan
  add(root, new THREE.BoxGeometry(0.34, 0.12, 1.05), carbon, [0, 0.42, 0.08]);
  // Upper fairing
  add(root, wedgeGeo(0.4, 0.32, 0.75, 0.65), dark, [0, 1.0, 0.5]);
  // Windscreen
  add(root, new THREE.BoxGeometry(0.3, 0.24, 0.05), glass, [0, 1.2, 0.78], [-0.35, 0, 0]);
  // Tail
  add(root, wedgeGeo(0.32, 0.16, 0.55, 0.5), dark, [0, 0.92, -0.55]);
  // Seat
  add(root, new THREE.BoxGeometry(0.3, 0.1, 0.5), seat, [0, 0.82, -0.18]);
  // Handlebars
  add(root, new THREE.BoxGeometry(0.68, 0.04, 0.08), chrome, [0, 1.08, 0.55]);
  // Fork tubes
  add(root, new THREE.CylinderGeometry(0.028, 0.028, 0.58, 10), chrome, [0.09, 0.72, 0.65], [0.4, 0, 0]);
  add(root, new THREE.CylinderGeometry(0.028, 0.028, 0.58, 10), chrome, [-0.09, 0.72, 0.65], [0.4, 0, 0]);
  // Swingarm suggestion
  add(root, new THREE.BoxGeometry(0.08, 0.06, 0.55), carbon, [0.12, 0.45, -0.35]);
  add(root, new THREE.BoxGeometry(0.08, 0.06, 0.55), carbon, [-0.12, 0.45, -0.35]);
  // Exhaust
  add(root, new THREE.CylinderGeometry(0.055, 0.045, 0.5, 12), chrome, [0.2, 0.4, -0.55], [0.2, 0, 0.35]);
  // Headlight
  add(root, new THREE.BoxGeometry(0.18, 0.14, 0.12), light, [0, 0.98, 0.82]);
  // Side number plates
  add(root, new THREE.BoxGeometry(0.04, 0.16, 0.22), mat(0xffffff, { roughness: 0.6 }), [0.22, 0.72, 0.12]);
  add(root, new THREE.BoxGeometry(0.04, 0.16, 0.22), mat(0xffffff, { roughness: 0.6 }), [-0.22, 0.72, 0.12]);
  // Rear hugger
  add(root, new THREE.BoxGeometry(0.28, 0.08, 0.32), dark, [0, 0.55, -0.75]);

  return root;
}

// ---------------------------------------------------------------------------
// Haulmaster 900 — cab + long trailer
// ---------------------------------------------------------------------------
function buildSemiTruck() {
  const root = new THREE.Group();
  root.name = 'haulmaster-900';

  const cab = mat(0xc4242c, { metalness: 0.35, roughness: 0.4 });
  const cabDark = mat(0x8a1a22, { metalness: 0.35, roughness: 0.45 });
  const trailer = mat(0xe4e4ea, { metalness: 0.25, roughness: 0.55 });
  const steel = mat(0x6a7078, { metalness: 0.8, roughness: 0.3 });
  const glass = mat(0x6a90b0, { metalness: 0.05, roughness: 0.12, transparent: true, opacity: 0.42 });
  const black = mat(0x1b1f26, { metalness: 0.4, roughness: 0.55 });
  const light = mat(0xfff2c8, { emissive: 0xffe8a0, emissiveIntensity: 0.85, roughness: 0.3 });
  const chrome = mat(0xc0c4cc, { metalness: 0.9, roughness: 0.2 });

  // Trailer box
  add(root, new THREE.BoxGeometry(2.48, 2.05, 5.5, 1, 1, 4), trailer, [0, 1.72, -0.95]);
  // Trailer ribs
  for (const y of [0.75, 1.72, 2.7]) {
    add(root, new THREE.BoxGeometry(2.52, 0.06, 5.45), mat(0xd0d0d8, { metalness: 0.3, roughness: 0.5 }), [0, y, -0.95]);
  }
  // Vertical posts on trailer sides
  for (let z = -3.2; z <= 1.4; z += 1.15) {
    add(root, new THREE.BoxGeometry(0.06, 2.0, 0.06), steel, [1.25, 1.72, z]);
    add(root, new THREE.BoxGeometry(0.06, 2.0, 0.06), steel, [-1.25, 1.72, z]);
  }
  // Cab
  add(root, new THREE.BoxGeometry(2.42, 1.55, 2.3), cab, [0, 1.55, 2.1]);
  // Cab roof fairing
  add(root, wedgeGeo(2.28, 0.42, 1.35, 0.75), cabDark, [0, 2.55, 1.75]);
  // Windscreen
  add(root, new THREE.BoxGeometry(2.15, 0.88, 0.06), glass, [0, 1.95, 3.2]);
  // Side windows
  add(root, new THREE.BoxGeometry(0.05, 0.7, 1.1), glass, [1.22, 1.85, 2.05]);
  add(root, new THREE.BoxGeometry(0.05, 0.7, 1.1), glass, [-1.22, 1.85, 2.05]);
  // Grille
  add(root, new THREE.BoxGeometry(2.05, 0.72, 0.1), black, [0, 1.15, 3.25]);
  for (let i = -4; i <= 4; i++) {
    add(root, new THREE.BoxGeometry(0.04, 0.62, 0.04), chrome, [i * 0.2, 1.15, 3.3]);
  }
  // Bumper
  add(root, new THREE.BoxGeometry(2.55, 0.42, 0.42), steel, [0, 0.52, 3.25]);
  // Fuel tanks
  add(root, new THREE.CylinderGeometry(0.28, 0.28, 1.35, 16), steel, [1.15, 0.95, 0.55], [0, 0, Math.PI / 2]);
  add(root, new THREE.CylinderGeometry(0.28, 0.28, 1.35, 16), steel, [-1.15, 0.95, 0.55], [0, 0, Math.PI / 2]);
  // Exhaust stack
  add(root, new THREE.CylinderGeometry(0.13, 0.13, 1.75, 12), chrome, [1.18, 2.55, 0.95]);
  add(root, new THREE.SphereGeometry(0.14, 10, 8), chrome, [1.18, 3.45, 0.95]);
  // Headlights
  add(root, new THREE.BoxGeometry(0.55, 0.18, 0.1), light, [0.78, 0.95, 3.35]);
  add(root, new THREE.BoxGeometry(0.55, 0.18, 0.1), light, [-0.78, 0.95, 3.35]);
  // Landing gear
  add(root, new THREE.BoxGeometry(0.14, 0.55, 0.14), steel, [0.9, 0.55, 0.35]);
  add(root, new THREE.BoxGeometry(0.14, 0.55, 0.14), steel, [-0.9, 0.55, 0.35]);
  // Fifth wheel plate
  add(root, new THREE.BoxGeometry(0.9, 0.12, 0.9), black, [0, 1.05, 0.9]);

  return root;
}

async function exportGlb(object, filename) {
  const scene = new THREE.Scene();
  scene.add(object);
  // Soft fill light so materials aren't pure black offline (doesn't bake into GLB)
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  const result = await new Promise((resolve, reject) => {
    exporter.parse(
      object,
      resolve,
      reject,
      {
        binary: true,
        onlyVisible: true,
        truncateDrawRange: true,
      },
    );
  });

  const path = join(OUT, filename);
  writeFileSync(path, Buffer.from(result));
  const kb = (result.byteLength / 1024).toFixed(1);
  console.log(`wrote ${path} (${kb} KB)`);
}

const jobs = [
  ['hyper-gt.glb', buildHyperGt],
  ['superbike.glb', buildSuperbike],
  ['semi-truck.glb', buildSemiTruck],
];

for (const [name, build] of jobs) {
  await exportGlb(build(), name);
}

console.log('done — body shells only; wheels stay procedural for spin/steer.');
