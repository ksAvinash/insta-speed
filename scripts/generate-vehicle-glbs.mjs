/**
 * High-detail body-only GLB models for the three launch vehicles.
 *
 * Wheels stay procedural in VehicleView (spin/steer). These are chassis shells:
 * +Z forward, +Y up, SI metres. Dense hard-surface detail, still mobile-friendly
 * (subdivided primitives + lathes, not multi-MB scans).
 *
 * Usage: node scripts/generate-vehicle-glbs.mjs
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
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
const SEG = 48; // cylinder / lathe density

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.4,
    roughness: opts.roughness ?? 0.38,
    transparent: Boolean(opts.transparent || (opts.opacity != null && opts.opacity < 1)),
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: opts.side ?? THREE.FrontSide,
    flatShading: false,
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

/** Subdivided box with optional top-face taper (cabin / nose). */
function panel(w, h, d, { segs = [3, 2, 5], taperTop = 1, taperFront = 1 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, segs[0], segs[1], segs[2]);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    if (y > 0 && taperTop !== 1) {
      const k = taperTop + (1 - taperTop) * (0.5 + z / d);
      x *= k;
      z = z * (0.94 + 0.06 * (1 - y / (h / 2))) - d * 0.02 * (y / (h / 2));
    }
    if (z > 0 && taperFront !== 1) {
      const f = z / (d / 2);
      y *= 1 - (1 - taperFront) * f * 0.35;
      x *= 1 - (1 - taperFront) * f * 0.12;
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Revolution solid from [x,y] profile points (x = radius, y = height). */
function lathe(points, segs = SEG) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, segs);
  geo.computeVertexNormals();
  return geo;
}

function ringBolts(group, material, { y, z, radius, count = 8, size = 0.03 }) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    add(
      group,
      new THREE.CylinderGeometry(size, size, size * 0.6, 8),
      material,
      [Math.cos(a) * radius, y, z + Math.sin(a) * radius * 0.15],
    );
  }
}

function ventSlats(group, material, { x, y, z, w, h, depth, n = 6, vertical = false }) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    if (vertical) {
      add(group, new THREE.BoxGeometry(w / n * 0.55, h, depth), material, [x + t * w, y, z]);
    } else {
      add(group, new THREE.BoxGeometry(w, h / n * 0.55, depth), material, [x, y + t * h, z]);
    }
  }
}

// ===========================================================================
// Vector GT-R — hypercar
// ===========================================================================
function buildHyperGt() {
  const root = new THREE.Group();
  root.name = 'vector-gt-r';

  const paint = mat(0xd81f36, { metalness: 0.55, roughness: 0.28 });
  const paintDeep = mat(0x8f1020, { metalness: 0.5, roughness: 0.35 });
  const carbon = mat(0x0e1014, { metalness: 0.72, roughness: 0.32 });
  const carbonWeave = mat(0x1a1e28, { metalness: 0.68, roughness: 0.4 });
  const glass = mat(0x5a8aaa, { metalness: 0.05, roughness: 0.05, opacity: 0.32 });
  const glassDark = mat(0x1a2838, { metalness: 0.1, roughness: 0.08, opacity: 0.55 });
  const chrome = mat(0xd0d4dc, { metalness: 0.95, roughness: 0.15 });
  const light = mat(0xfff6e0, { metalness: 0.15, roughness: 0.2, emissive: 0xffe8a8, emissiveIntensity: 1.1 });
  const led = mat(0xff2020, { metalness: 0.2, roughness: 0.3, emissive: 0xff1010, emissiveIntensity: 0.35 });
  const rubber = mat(0x111114, { metalness: 0.1, roughness: 0.9 });
  const silver = mat(0x9aa0aa, { metalness: 0.85, roughness: 0.25 });

  // --- Main body volumes (high-seg panels) --------------------------------
  add(root, panel(1.98, 0.36, 4.35, { segs: [4, 2, 10], taperFront: 0.88 }), paint, [0, 0.42, 0]);
  add(root, panel(2.14, 0.12, 3.85, { segs: [3, 1, 8] }), paintDeep, [0, 0.24, 0.05]);
  // Sculpted nose
  add(root, panel(1.88, 0.3, 1.25, { segs: [4, 2, 6], taperFront: 0.55, taperTop: 0.7 }), paint, [0, 0.42, 1.9]);
  add(root, panel(2.08, 0.05, 0.85, { segs: [3, 1, 4] }), carbon, [0, 0.14, 2.18]);
  // Canards
  for (const s of [-1, 1]) {
    add(root, panel(0.32, 0.03, 0.28, { segs: [2, 1, 2] }), carbon, [s * 0.95, 0.28, 2.05], [0, s * 0.15, s * 0.2]);
  }
  // Front bumper intake
  add(root, new THREE.BoxGeometry(1.1, 0.16, 0.2, 3, 1, 2), carbon, [0, 0.28, 2.35]);
  ventSlats(root, carbonWeave, { x: 0, y: 0.28, z: 2.42, w: 1.0, h: 0.12, depth: 0.04, n: 7 });

  // Cabin glass + pillars
  add(root, panel(1.55, 0.42, 1.95, { segs: [3, 2, 6], taperTop: 0.75 }), glass, [0, 0.9, -0.05]);
  add(root, panel(1.62, 0.08, 2.05, { segs: [2, 1, 5], taperTop: 0.8 }), carbon, [0, 1.12, -0.1]);
  // A-pillars
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.06, 0.38, 0.9, 1, 2, 3), carbon, [s * 0.78, 0.95, 0.55], [0.15, 0, s * 0.08]);
  }
  // Side glass
  add(root, new THREE.BoxGeometry(1.68, 0.26, 1.45, 2, 1, 4), glassDark, [0, 0.78, -0.12]);
  // Door shut lines (thin recesses)
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.02, 0.32, 1.5), carbonWeave, [s * 1.02, 0.52, 0.05]);
  }

  // Rear haunches + deck
  add(root, panel(1.96, 0.34, 1.25, { segs: [4, 2, 5], taperTop: 0.9 }), paint, [0, 0.52, -1.6]);
  add(root, panel(1.7, 0.12, 0.9, { segs: [3, 1, 3] }), carbon, [0, 0.72, -1.75]);

  // Diffuser with many fins
  add(root, new THREE.BoxGeometry(1.85, 0.08, 0.7, 4, 1, 3), carbon, [0, 0.16, -2.25]);
  for (let i = -5; i <= 5; i++) {
    add(root, new THREE.BoxGeometry(0.035, 0.14, 0.55), carbonWeave, [i * 0.15, 0.12, -2.2]);
  }

  // Swan-neck wing
  add(root, new THREE.BoxGeometry(1.85, 0.04, 0.42, 6, 1, 2), carbon, [0, 1.18, -2.08]);
  add(root, new THREE.BoxGeometry(1.85, 0.02, 0.12), silver, [0, 1.21, -1.92]); // Gurney
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.05, 0.42, 0.36), carbon, [s * 0.9, 0.98, -2.08]);
    add(root, new THREE.CylinderGeometry(0.025, 0.025, 0.35, 12), carbon, [s * 0.55, 1.0, -1.95], [0.3, 0, 0]);
  }

  // Mirrors with stalks
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.02, 0.02, 0.18, 10), carbon, [s * 0.95, 0.78, 0.55], [0, 0, s * 0.6]);
    add(root, new THREE.BoxGeometry(0.28, 0.1, 0.18, 2, 1, 2), carbon, [s * 1.05, 0.82, 0.52]);
    add(root, new THREE.BoxGeometry(0.22, 0.08, 0.02), glassDark, [s * 1.05, 0.82, 0.42]);
  }

  // Roof stripe + antenna
  add(root, new THREE.BoxGeometry(0.18, 0.025, 1.85, 1, 1, 4), mat(0xf2f2f6, { metalness: 0.25, roughness: 0.45 }), [0, 1.15, -0.12]);
  add(root, new THREE.CylinderGeometry(0.012, 0.008, 0.22, 8), silver, [0.15, 1.28, -0.4]);

  // Quad LED headlight strip + DRLs
  add(root, new THREE.BoxGeometry(1.45, 0.07, 0.1, 8, 1, 1), light, [0, 0.56, 2.32]);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      add(root, new THREE.BoxGeometry(0.12, 0.04, 0.04), light, [s * (0.35 + i * 0.14), 0.48, 2.36]);
    }
  }

  // Side intakes with mesh
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.16, 0.28, 0.7, 1, 2, 3), carbon, [s * 1.04, 0.52, 0.35]);
    ventSlats(root, carbonWeave, {
      x: s * 1.12,
      y: 0.52,
      z: 0.35,
      w: 0.02,
      h: 0.24,
      depth: 0.55,
      n: 5,
      vertical: false,
    });
  }

  // Rear light bar
  add(root, new THREE.BoxGeometry(1.6, 0.06, 0.06, 10, 1, 1), led, [0, 0.68, -2.28]);

  // Exhausts with tips
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.055, 0.06, 0.35, 16), chrome, [s * 0.38, 0.22, -2.35], [Math.PI / 2, 0, 0]);
    add(root, new THREE.TorusGeometry(0.055, 0.012, 8, 16), chrome, [s * 0.38, 0.22, -2.52], [0, 0, 0]);
  }

  // Wheel-arch flares
  for (const [x, z] of [
    [1.0, 1.35],
    [-1.0, 1.35],
    [1.0, -1.35],
    [-1.0, -1.35],
  ]) {
    add(root, new THREE.TorusGeometry(0.42, 0.06, 10, 24, Math.PI), paintDeep, [x, 0.38, z], [0, x > 0 ? Math.PI / 2 : -Math.PI / 2, 0]);
  }

  // Undertray
  add(root, new THREE.BoxGeometry(1.7, 0.03, 3.8, 2, 1, 6), carbon, [0, 0.1, 0]);

  // Badge / nose cone detail
  add(root, new THREE.SphereGeometry(0.06, 16, 12), chrome, [0, 0.5, 2.45]);
  ringBolts(root, silver, { y: 0.2, z: 2.1, radius: 0.35, count: 6, size: 0.015 });

  return root;
}

// ===========================================================================
// Hornet 1000R — superbike
// ===========================================================================
function buildSuperbike() {
  const root = new THREE.Group();
  root.name = 'hornet-1000r';

  const body = mat(0xf0a01e, { metalness: 0.48, roughness: 0.3 });
  const bodyDark = mat(0xc47810, { metalness: 0.45, roughness: 0.35 });
  const dark = mat(0x141418, { metalness: 0.6, roughness: 0.35 });
  const carbon = mat(0x0c0e12, { metalness: 0.75, roughness: 0.3 });
  const glass = mat(0x6a9ab8, { metalness: 0.05, roughness: 0.06, opacity: 0.35 });
  const chrome = mat(0xc4c8d0, { metalness: 0.92, roughness: 0.18 });
  const light = mat(0xfff2d0, { emissive: 0xffe8a0, emissiveIntensity: 1.0, roughness: 0.25 });
  const seat = mat(0x1e1e24, { metalness: 0.1, roughness: 0.82 });
  const gold = mat(0xc9a227, { metalness: 0.85, roughness: 0.28 });

  // Fuel tank — lathe profile
  add(
    root,
    lathe([
      [0.02, 0.55],
      [0.16, 0.58],
      [0.2, 0.72],
      [0.18, 0.88],
      [0.12, 0.98],
      [0.04, 1.02],
    ]),
    body,
    [0, 0, 0.08],
  );
  // Tank side panels
  for (const s of [-1, 1]) {
    add(root, panel(0.06, 0.28, 0.55, { segs: [1, 2, 3], taperTop: 0.85 }), bodyDark, [s * 0.18, 0.72, 0.1]);
  }

  // Main frame spars
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.05, 0.08, 0.95, 1, 1, 4), carbon, [s * 0.1, 0.55, 0.05], [0.08, 0, 0]);
  }
  // Engine block suggestion
  add(root, new THREE.BoxGeometry(0.32, 0.28, 0.4, 2, 2, 2), dark, [0, 0.48, 0.15]);
  ventSlats(root, chrome, { x: 0.17, y: 0.48, z: 0.15, w: 0.02, h: 0.22, depth: 0.32, n: 5 });
  ventSlats(root, chrome, { x: -0.17, y: 0.48, z: 0.15, w: 0.02, h: 0.22, depth: 0.32, n: 5 });

  // Belly pan / fairing lower
  add(root, panel(0.36, 0.12, 1.1, { segs: [2, 1, 5], taperFront: 0.7 }), carbon, [0, 0.38, 0.1]);
  // Upper fairing nose
  add(root, panel(0.42, 0.34, 0.7, { segs: [3, 2, 4], taperFront: 0.5, taperTop: 0.65 }), dark, [0, 1.02, 0.55]);
  // Windscreen
  add(root, new THREE.BoxGeometry(0.32, 0.28, 0.04, 2, 3, 1), glass, [0, 1.22, 0.8], [-0.4, 0, 0]);
  // Screen edge
  add(root, new THREE.BoxGeometry(0.34, 0.02, 0.28), chrome, [0, 1.36, 0.72], [-0.4, 0, 0]);

  // Headlight projector + halo
  add(root, new THREE.SphereGeometry(0.07, 20, 16), light, [0, 0.98, 0.88]);
  add(root, new THREE.TorusGeometry(0.08, 0.012, 10, 24), chrome, [0, 0.98, 0.88], [0, 0, 0]);
  add(root, new THREE.BoxGeometry(0.2, 0.08, 0.06), dark, [0, 0.98, 0.82]);

  // Clip-ons / bars
  add(root, new THREE.CylinderGeometry(0.015, 0.015, 0.72, 12), chrome, [0, 1.1, 0.58], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.025, 0.02, 0.1, 10), dark, [s * 0.34, 1.1, 0.58], [0, 0, Math.PI / 2]);
    add(root, new THREE.BoxGeometry(0.04, 0.08, 0.06), dark, [s * 0.34, 1.05, 0.58]); // lever perch
  }

  // Forks (USD style)
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.028, 0.032, 0.62, 16), gold, [s * 0.095, 0.7, 0.68], [0.42, 0, 0]);
    add(root, new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), dark, [s * 0.095, 0.95, 0.55], [0.42, 0, 0]);
  }
  // Triple clamp
  add(root, new THREE.BoxGeometry(0.28, 0.04, 0.1, 2, 1, 1), dark, [0, 1.05, 0.52]);
  add(root, new THREE.BoxGeometry(0.26, 0.03, 0.08), dark, [0, 0.88, 0.62]);

  // Swingarm
  for (const s of [-1, 1]) {
    add(root, panel(0.06, 0.05, 0.62, { segs: [1, 1, 3] }), carbon, [s * 0.12, 0.42, -0.32], [0.05, 0, 0]);
  }
  add(root, new THREE.CylinderGeometry(0.02, 0.02, 0.28, 10), chrome, [0, 0.42, -0.02], [0, 0, Math.PI / 2]);

  // Rear shock
  add(root, new THREE.CylinderGeometry(0.04, 0.035, 0.28, 12), gold, [0, 0.58, -0.25], [0.5, 0, 0]);

  // Tail section + seat
  add(root, panel(0.34, 0.14, 0.65, { segs: [2, 1, 4], taperTop: 0.6 }), dark, [0, 0.92, -0.55]);
  add(root, new THREE.BoxGeometry(0.3, 0.09, 0.52, 2, 1, 3), seat, [0, 0.82, -0.15]);
  add(root, new THREE.BoxGeometry(0.28, 0.06, 0.25), seat, [0, 0.88, -0.45]); // pillion pad
  // Tail light
  add(root, new THREE.BoxGeometry(0.16, 0.06, 0.04), mat(0xff2020, { emissive: 0xff1010, emissiveIntensity: 0.5 }), [0, 0.9, -0.88]);

  // Exhaust can with heat shield
  add(root, new THREE.CylinderGeometry(0.06, 0.05, 0.55, 20), chrome, [0.22, 0.4, -0.5], [0.15, 0.1, 0.4]);
  add(root, new THREE.CylinderGeometry(0.065, 0.065, 0.15, 16), carbon, [0.28, 0.38, -0.72], [0.15, 0.1, 0.4]);
  add(root, new THREE.BoxGeometry(0.08, 0.02, 0.25), carbon, [0.18, 0.48, -0.45], [0.15, 0, 0.4]);

  // Number plates
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.035, 0.18, 0.24), mat(0xffffff, { roughness: 0.55 }), [s * 0.22, 0.72, 0.15]);
  }

  // Radiator
  add(root, new THREE.BoxGeometry(0.28, 0.22, 0.08, 2, 3, 1), dark, [0, 0.55, 0.55]);
  ventSlats(root, chrome, { x: 0, y: 0.55, z: 0.6, w: 0.24, h: 0.18, depth: 0.02, n: 6 });

  // Rear hugger + chain guard
  add(root, panel(0.3, 0.08, 0.38, { segs: [2, 1, 2] }), dark, [0, 0.52, -0.78]);
  add(root, new THREE.BoxGeometry(0.04, 0.08, 0.45), carbon, [0.14, 0.48, -0.35]);

  // Footpegs
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), chrome, [s * 0.22, 0.38, -0.05], [0, 0, Math.PI / 2]);
  }

  ringBolts(root, chrome, { y: 0.55, z: 0.15, radius: 0.12, count: 4, size: 0.012 });

  return root;
}

// ===========================================================================
// Haulmaster 900 — semi truck
// ===========================================================================
function buildSemiTruck() {
  const root = new THREE.Group();
  root.name = 'haulmaster-900';

  const cab = mat(0xc4242c, { metalness: 0.4, roughness: 0.36 });
  const cabDeep = mat(0x8a1a20, { metalness: 0.38, roughness: 0.42 });
  const trailer = mat(0xe8e8ee, { metalness: 0.28, roughness: 0.5 });
  const trailerRib = mat(0xd2d2da, { metalness: 0.35, roughness: 0.45 });
  const steel = mat(0x6a7078, { metalness: 0.82, roughness: 0.28 });
  const steelDark = mat(0x3a3e46, { metalness: 0.7, roughness: 0.4 });
  const glass = mat(0x6a90b0, { metalness: 0.05, roughness: 0.1, opacity: 0.4 });
  const black = mat(0x1a1e24, { metalness: 0.45, roughness: 0.5 });
  const light = mat(0xfff2d0, { emissive: 0xffe8a0, emissiveIntensity: 0.95, roughness: 0.25 });
  const chrome = mat(0xc8ccd4, { metalness: 0.95, roughness: 0.15 });
  const amber = mat(0xffa020, { emissive: 0xff8000, emissiveIntensity: 0.4, roughness: 0.4 });
  const rubber = mat(0x1a1a1c, { metalness: 0.1, roughness: 0.9 });

  // --- Trailer -----------------------------------------------------------
  add(root, new THREE.BoxGeometry(2.5, 2.08, 5.55, 2, 2, 8), trailer, [0, 1.74, -0.95]);
  // Horizontal ribs
  for (let i = 0; i < 9; i++) {
    const y = 0.78 + i * 0.24;
    add(root, new THREE.BoxGeometry(2.54, 0.045, 5.52), trailerRib, [0, y, -0.95]);
  }
  // Vertical posts
  for (let z = -3.4; z <= 1.5; z += 0.7) {
    for (const s of [-1, 1]) {
      add(root, new THREE.BoxGeometry(0.05, 2.05, 0.05), steel, [s * 1.26, 1.74, z]);
    }
  }
  // Rear doors
  add(root, new THREE.BoxGeometry(1.2, 1.95, 0.08, 2, 3, 1), trailerRib, [0.62, 1.7, -3.72]);
  add(root, new THREE.BoxGeometry(1.2, 1.95, 0.08, 2, 3, 1), trailerRib, [-0.62, 1.7, -3.72]);
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.08, 1.7, 0.06), steel, [s * 0.62, 1.7, -3.78]);
    add(root, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 10), chrome, [s * 0.35, 1.7, -3.8]);
  }
  // Rear underride bar + lights
  add(root, new THREE.BoxGeometry(2.3, 0.12, 0.1), steelDark, [0, 0.55, -3.75]);
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.2, 0.1, 0.06), mat(0xff2020, { emissive: 0xff1010, emissiveIntensity: 0.55 }), [s * 0.9, 1.2, -3.78]);
    add(root, new THREE.BoxGeometry(0.12, 0.08, 0.05), amber, [s * 1.1, 2.55, -3.7]);
  }
  // Trailer landing gear
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.12, 0.7, 0.12), steel, [s * 0.9, 0.55, 0.35]);
    add(root, new THREE.BoxGeometry(0.35, 0.06, 0.2), steelDark, [s * 0.9, 0.22, 0.35]);
  }
  // Chassis rails under trailer
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.12, 0.18, 5.2, 1, 1, 6), steelDark, [s * 0.55, 0.95, -0.9]);
  }
  // Air tanks
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16), steel, [s * 0.9, 1.05, -2.2], [0, 0, Math.PI / 2]);
  }

  // --- Cab ---------------------------------------------------------------
  add(root, new THREE.BoxGeometry(2.45, 1.58, 2.35, 3, 2, 4), cab, [0, 1.56, 2.12]);
  // Door panels + handles
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.04, 1.15, 1.25, 1, 3, 3), cabDeep, [s * 1.24, 1.5, 2.05]);
    add(root, new THREE.BoxGeometry(0.03, 0.08, 0.18), chrome, [s * 1.28, 1.45, 2.35]);
  }
  // Roof sleeper / fairing
  add(root, panel(2.32, 0.48, 1.45, { segs: [3, 2, 4], taperFront: 0.75, taperTop: 0.85 }), cabDeep, [0, 2.58, 1.7]);
  // Roof marker lights
  for (let i = -2; i <= 2; i++) {
    add(root, new THREE.BoxGeometry(0.1, 0.05, 0.08), amber, [i * 0.35, 2.88, 2.4]);
  }
  // Windscreen
  add(root, new THREE.BoxGeometry(2.18, 0.92, 0.05, 4, 3, 1), glass, [0, 1.98, 3.28]);
  // Wiper arms
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.02, 0.02, 0.55), black, [s * 0.45, 1.55, 3.2], [0.9, 0, s * 0.1]);
  }
  // Side windows
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.04, 0.72, 1.15, 1, 2, 3), glass, [s * 1.24, 1.9, 2.05]);
  }
  // Visor
  add(root, new THREE.BoxGeometry(2.35, 0.06, 0.35), cabDeep, [0, 2.45, 3.15]);

  // Grille — dense bars
  add(root, new THREE.BoxGeometry(2.1, 0.78, 0.1, 2, 2, 1), black, [0, 1.15, 3.28]);
  for (let i = -8; i <= 8; i++) {
    add(root, new THREE.BoxGeometry(0.035, 0.7, 0.04), chrome, [i * 0.11, 1.15, 3.34]);
  }
  for (let j = -2; j <= 2; j++) {
    add(root, new THREE.BoxGeometry(1.95, 0.025, 0.03), chrome, [0, 1.15 + j * 0.14, 3.35]);
  }
  // Brand plate
  add(root, new THREE.BoxGeometry(0.5, 0.12, 0.03), chrome, [0, 1.55, 3.36]);

  // Bumper + steps
  add(root, new THREE.BoxGeometry(2.6, 0.45, 0.48, 3, 1, 2), steel, [0, 0.52, 3.28]);
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.35, 0.05, 0.55), steelDark, [s * 1.15, 0.55, 2.7]);
    add(root, new THREE.BoxGeometry(0.35, 0.05, 0.45), steelDark, [s * 1.15, 0.85, 2.55]);
  }
  // Fog lights
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), light, [s * 0.85, 0.52, 3.5], [Math.PI / 2, 0, 0]);
  }
  // Main headlights
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.55, 0.2, 0.12, 2, 1, 1), light, [s * 0.8, 0.98, 3.4]);
    add(root, new THREE.BoxGeometry(0.2, 0.12, 0.08), amber, [s * 1.15, 0.98, 3.38]);
  }

  // Fuel tanks with straps
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.3, 0.3, 1.45, 24), steel, [s * 1.18, 0.95, 0.55], [0, 0, Math.PI / 2]);
    for (const z of [-0.15, 0.15]) {
      add(root, new THREE.TorusGeometry(0.31, 0.02, 8, 20), steelDark, [s * 1.18, 0.95, 0.55 + z], [0, 0, Math.PI / 2]);
    }
  }

  // Exhaust stack with heat shield + tip
  add(root, new THREE.CylinderGeometry(0.14, 0.14, 1.85, 20), chrome, [1.2, 2.55, 0.95]);
  add(root, new THREE.CylinderGeometry(0.16, 0.16, 0.9, 16), steelDark, [1.2, 2.2, 0.95]);
  add(root, new THREE.CylinderGeometry(0.15, 0.18, 0.12, 16), chrome, [1.2, 3.5, 0.95]);
  add(root, new THREE.TorusGeometry(0.17, 0.02, 8, 16), chrome, [1.2, 3.58, 0.95], [Math.PI / 2, 0, 0]);

  // Fifth wheel
  add(root, new THREE.CylinderGeometry(0.45, 0.5, 0.12, 24), steelDark, [0, 1.08, 0.95]);
  add(root, new THREE.BoxGeometry(0.35, 0.08, 0.55), steel, [0, 1.14, 0.95]);

  // Air horns
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.04, 0.05, 0.35, 12), chrome, [s * 0.5, 2.75, 1.5], [0.2, 0, 0]);
  }

  // Mirrors — big truck mirrors
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.025, 0.025, 0.55, 10), black, [s * 1.35, 2.0, 2.8], [0.2, 0, s * 0.3]);
    add(root, new THREE.BoxGeometry(0.18, 0.45, 0.08, 1, 2, 1), black, [s * 1.55, 2.15, 2.95]);
    add(root, new THREE.BoxGeometry(0.14, 0.38, 0.02), glass, [s * 1.55, 2.15, 2.9]);
    add(root, new THREE.BoxGeometry(0.12, 0.18, 0.06), black, [s * 1.55, 1.85, 2.95]); // convex
  }

  // Cab steps + mudflap mounts
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.08, 0.35, 0.4), rubber, [s * 1.15, 0.45, -0.2]);
  }

  ringBolts(root, chrome, { y: 1.15, z: 3.2, radius: 0.9, count: 8, size: 0.02 });

  return root;
}

// ===========================================================================

async function exportGlb(object, filename) {
  const result = await new Promise((resolve, reject) => {
    exporter.parse(object, resolve, reject, {
      binary: true,
      onlyVisible: true,
      truncateDrawRange: true,
    });
  });
  const path = join(OUT, filename);
  writeFileSync(path, Buffer.from(result));
  const kb = (result.byteLength / 1024).toFixed(1);

  // Rough tri count
  let tris = 0;
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      const idx = g.index;
      tris += idx ? idx.count / 3 : g.attributes.position.count / 3;
    }
  });
  console.log(`wrote ${path} (${kb} KB, ~${Math.round(tris)} tris)`);
}

const jobs = [
  ['hyper-gt.glb', buildHyperGt],
  ['superbike.glb', buildSuperbike],
  ['semi-truck.glb', buildSemiTruck],
];

for (const [name, build] of jobs) {
  await exportGlb(build(), name);
}
console.log('done — dense hard-surface shells; wheels stay procedural.');
