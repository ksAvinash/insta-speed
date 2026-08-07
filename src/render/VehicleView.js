import * as THREE from 'three';
import { clamp } from '../physics/constants.js';
import { worldX, worldYaw } from './trackFrame.js';

/**
 * Builds the visible vehicle.
 *
 * A spec either describes itself with a `body` recipe of primitives — which is
 * how the whole launch roster works, so no art pipeline is needed to add a
 * vehicle — or points `model` at a glTF file, which is loaded lazily and swaps
 * in over the top. Both paths produce the same node layout, so nothing
 * downstream cares which was used.
 *
 * Fitted upgrades (`spec.upgradeLevels` from `applyUpgrades`) change the look
 * as well as the numbers: wider/stickier tyres, coloured calipers, aero bits
 * and a carbon-leaning chassis. Stock (no levels on the object) reads as level 0.
 */

/** @param {import('../vehicles/registry.js').VehicleSpec} spec */
function levelsOf(spec) {
  const L = spec.upgradeLevels;
  return {
    tyres: L?.tyres ?? 0,
    brakes: L?.brakes ?? 0,
    aero: L?.aero ?? 0,
    chassis: L?.chassis ?? 0,
  };
}

/** Tyre compound look by level: stock → sport → track → slick. */
const TYRE_LOOK = [
  { widthMul: 1.0, tyre: 0x18181c, stripe: 0x9a9aa4, rim: null },
  { widthMul: 1.07, tyre: 0x121218, stripe: 0xc9a227, rim: 0x7a8088 },
  { widthMul: 1.13, tyre: 0x0c0c10, stripe: 0xe24b3a, rim: 0x6a7078 },
  { widthMul: 1.2, tyre: 0x08080c, stripe: 0xf2f2f6, rim: 0xc4a574 },
];

/** Brake caliper / disc look by level. */
const BRAKE_LOOK = [
  null, // stock — no extra caliper hardware
  { caliper: 0x8a9098, disc: 0x6a7078, scale: 1.0 },
  { caliper: 0xe8a020, disc: 0x9aa0a8, scale: 1.15 },
  { caliper: 0xd4ff4d, disc: 0xc8ccd0, scale: 1.3 },
];

/** A box with its top face tapered in, which reads as a cabin or a fairing. */
function makeWedge(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * 0.74);
      pos.setZ(i, pos.getZ(i) * 0.8 - d * 0.06);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function geometryForPart(part) {
  const [a, b, c] = part.size;
  switch (part.shape) {
    case 'wedge':
      return makeWedge(a, b, c);
    case 'cylinder':
      return new THREE.CylinderGeometry(a, b, c, 12);
    case 'sphere':
      return new THREE.SphereGeometry(a, 12, 8);
    default:
      return new THREE.BoxGeometry(a, b, c);
  }
}

/**
 * @param {object} part
 * @param {{ pixelRatio?: number, shadows?: boolean }} quality
 * @param {number} chassisLevel
 */
function materialForPart(part, quality, chassisLevel = 0) {
  let color = part.color ?? 0xcccccc;

  // Carbon tub: pull body paint toward dark matte carbon without rewriting
  // every recipe. Trim gets even more graphite.
  if (chassisLevel >= 2 && !part.glass && !part.emissive) {
    const c = new THREE.Color(color);
    if (chassisLevel >= 3) {
      c.offsetHSL(0, -0.15, -0.12);
      if (part.role === 'trim' || part.role === 'matte') c.offsetHSL(0, -0.1, -0.08);
    } else {
      c.offsetHSL(0, -0.08, -0.06);
    }
    color = c.getHex();
  }

  if (part.glass) {
    return new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: part.opacity ?? 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  if (part.emissive) {
    return new THREE.MeshBasicMaterial({
      color: part.emissive,
      toneMapped: false,
    });
  }

  const rich = (quality.pixelRatio ?? 1) >= 1.5 && part.role !== 'matte';
  if (rich) {
    const carbon = chassisLevel >= 3 && part.role !== 'matte';
    return new THREE.MeshStandardMaterial({
      color,
      metalness: part.metalness ?? (part.role === 'trim' ? 0.75 : carbon ? 0.55 : 0.28),
      roughness: part.roughness ?? (part.role === 'trim' ? 0.35 : carbon ? 0.55 : 0.48),
    });
  }

  return new THREE.MeshLambertMaterial({ color });
}

export class VehicleView {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    /** Body tips forward under braking; wheels stay on the ground. */
    this.chassis = new THREE.Group();
    this.root.add(this.chassis);
    scene.add(this.root);

    /** @type {{ mesh: THREE.Group, steers: boolean }[]} */
    this.wheels = [];
    /** @type {THREE.Mesh[]} */
    this.brakeLights = [];
    /** @type {THREE.Mesh[]} */
    this.brakeGlows = [];
    this.disposables = [];
    this.wheelSpin = 0;
    this.dive = 0;
    this.roll = 0;
    /** Ride-height offset from chassis upgrades (negative = lower). */
    this.chassisBaseY = 0;
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  build(spec, quality) {
    this.clear();
    this.spec = spec;
    this.quality = quality;
    this.levels = levelsOf(spec);
    this.chassisBaseY = -0.018 * this.levels.chassis;

    for (const part of spec.body.parts) {
      const geo = geometryForPart(part);
      const mat = materialForPart(part, quality, this.levels.chassis);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...part.pos);
      if (part.rot) mesh.rotation.set(...part.rot);
      mesh.castShadow = quality.shadows && !part.glass && !part.emissive;
      this.chassis.add(mesh);
      this.disposables.push(mesh);

      // Soft headlight bloom — additive plane, medium+ only, zero cost when off.
      if (part.emissive && (quality.pixelRatio ?? 1) >= 1.5) {
        const [sx, sy] = part.size;
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(sx * 1.35, sy * 1.6),
          new THREE.MeshBasicMaterial({
            color: part.emissive,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            side: THREE.DoubleSide,
          }),
        );
        glow.position.set(part.pos[0], part.pos[1], part.pos[2] + (part.size[2] ?? 0.2) * 0.55);
        this.chassis.add(glow);
        this.disposables.push(glow);
      }
    }

    this.#buildWheels(spec, quality);
    this.#buildBrakeLights(spec, quality);
    this.#buildAeroKit(spec, quality);
    this.#buildChassisKit(spec, quality);

    if (spec.model) this.#loadModel(spec, quality);
  }

  #addChassisMesh(geo, mat, pos, quality, cast = true) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (pos[3] != null) mesh.rotation.set(pos[3], pos[4] ?? 0, pos[5] ?? 0);
    mesh.castShadow = quality.shadows && cast;
    this.chassis.add(mesh);
    this.disposables.push(mesh);
    return mesh;
  }

  #buildWheels(spec, quality) {
    const w = spec.body.wheels;
    const look = TYRE_LOOK[clamp(this.levels.tyres, 0, 3)];
    const width = w.width * look.widthMul;
    const rimColor = look.rim ?? w.rimColor ?? 0x8a909a;

    const tyreGeo = new THREE.CylinderGeometry(w.radius, w.radius, width, 18);
    tyreGeo.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshLambertMaterial({ color: look.tyre });

    const rimGeo = new THREE.CylinderGeometry(w.radius * 0.62, w.radius * 0.62, width * 0.55, 14);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshLambertMaterial({ color: rimColor });

    const hubGeo = new THREE.CylinderGeometry(w.radius * 0.22, w.radius * 0.22, width * 0.7, 10);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x2a2e36 });

    const markGeo = new THREE.BoxGeometry(width * 1.04, w.radius * 1.92, w.radius * 0.14);
    const markMat = new THREE.MeshBasicMaterial({ color: look.stripe });

    // 5-spoke star on medium+ only — a few boxes, readable in the garage.
    const richWheels = (quality.pixelRatio ?? 1) >= 1.5;
    let spokeGeo;
    let spokeMat;
    if (richWheels) {
      spokeGeo = new THREE.BoxGeometry(width * 0.22, w.radius * 0.9, w.radius * 0.1);
      spokeMat = new THREE.MeshLambertMaterial({ color: rimColor });
    }

    // Shared caliper / disc pieces for brake upgrades — parented to the hub so
    // they steer with the wheel; at speed they read as a coloured blur.
    const brake = BRAKE_LOOK[clamp(this.levels.brakes, 0, 3)];
    let discGeo;
    let discMat;
    let caliperGeo;
    let caliperMat;
    if (brake) {
      discGeo = new THREE.CylinderGeometry(w.radius * 0.72, w.radius * 0.72, width * 0.12, 16);
      discGeo.rotateZ(Math.PI / 2);
      discMat = new THREE.MeshLambertMaterial({ color: brake.disc });
      const cs = 0.14 * brake.scale;
      caliperGeo = new THREE.BoxGeometry(width * 0.35, cs * 2.2, cs * 3.2);
      caliperMat = new THREE.MeshLambertMaterial({ color: brake.caliper });
    }

    const lateral = w.track > 0 ? [-w.track / 2, w.track / 2] : [0];
    for (const [z, steers] of [
      [w.front, true],
      [w.rear, false],
    ]) {
      for (const x of lateral) {
        const hub = new THREE.Group();
        hub.position.set(x, w.radius, z);

        const tyre = new THREE.Mesh(tyreGeo, tyreMat);
        tyre.castShadow = quality.shadows;
        hub.add(tyre);
        hub.add(new THREE.Mesh(rimGeo, rimMat));
        hub.add(new THREE.Mesh(hubGeo, hubMat));
        hub.add(new THREE.Mesh(markGeo, markMat));

        if (richWheels) {
          for (let s = 0; s < 5; s++) {
            const spoke = new THREE.Mesh(spokeGeo, spokeMat);
            spoke.rotation.z = (s / 5) * Math.PI;
            hub.add(spoke);
          }
        }

        if (brake) {
          hub.add(new THREE.Mesh(discGeo, discMat));
          const cal = new THREE.Mesh(caliperGeo, caliperMat);
          // Sit on the top of the disc so the colour is readable in the garage.
          cal.position.set(0, w.radius * 0.55, 0);
          hub.add(cal);
        }

        this.root.add(hub);
        this.wheels.push({ mesh: hub, steers });
      }
    }

    this._wheelShared = [tyreGeo, tyreMat, rimGeo, rimMat, hubGeo, hubMat, markGeo, markMat];
    if (richWheels) this._wheelShared.push(spokeGeo, spokeMat);
    if (brake) this._wheelShared.push(discGeo, discMat, caliperGeo, caliperMat);
  }

  #buildBrakeLights(spec, quality) {
    const w = spec.body.wheels;
    const cfg = spec.body.brakeLights;
    const y = cfg?.y ?? w.radius + 0.35;
    const z = cfg?.z ?? w.rear - 0.15;
    const track = cfg?.track ?? Math.max(w.track / 2 - 0.2, 0.12);
    const size = cfg?.size ?? [0.28, 0.12, 0.08];
    const dual = cfg?.dual !== false && track > 0.05;
    const xs = dual ? [-track, track] : [0];

    for (const x of xs) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c, toneMapped: false });
      const light = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      light.position.set(x, y, z);
      this.chassis.add(light);
      this.brakeLights.push(light);
      this.disposables.push(light);

      if ((quality.pixelRatio ?? 1) >= 1.5) {
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xff2a1a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(size[0] * 1.6, size[1] * 1.8), glowMat);
        glow.position.set(x, y, z - size[2] * 0.6);
        this.chassis.add(glow);
        this.brakeGlows.push(glow);
        this.disposables.push(glow);
      }
    }
  }

  /**
   * Aero ladder: lip → wing → full kit. Anchored to the wheelbox so it fits
   * every vehicle without per-spec art.
   */
  #buildAeroKit(spec, quality) {
    const level = this.levels.aero;
    if (level <= 0) return;

    const w = spec.body.wheels;
    const track = Math.max(w.track, 0.5);
    const front = w.front;
    const rear = w.rear;
    const isBike = w.track === 0;
    const carbon = new THREE.MeshLambertMaterial({ color: 0x1a1c22 });
    const accent = new THREE.MeshLambertMaterial({ color: 0x2a2e38 });

    if (level >= 1) {
      // Front splitter / lip.
      const sw = isBike ? 0.42 : track * 1.05;
      this.#addChassisMesh(
        new THREE.BoxGeometry(sw, 0.05, 0.38),
        carbon,
        [0, 0.12, front + 0.55],
        quality,
      );
      if (!isBike) {
        // Canards
        for (const side of [-1, 1]) {
          this.#addChassisMesh(
            new THREE.BoxGeometry(0.28, 0.04, 0.22),
            accent,
            [side * (track * 0.55), 0.28, front + 0.35],
            quality,
          );
        }
      }
    }

    if (level >= 2) {
      // Rear wing blade + endplates (or a centre stalk on the bike).
      const wingW = isBike ? 0.55 : track * 1.05;
      const wingY = isBike ? 1.05 : 0.95;
      const wingZ = rear - (isBike ? 0.15 : 0.35);
      this.#addChassisMesh(new THREE.BoxGeometry(wingW, 0.06, 0.36), carbon, [0, wingY, wingZ], quality);
      if (isBike) {
        this.#addChassisMesh(
          new THREE.BoxGeometry(0.06, 0.28, 0.08),
          accent,
          [0, wingY - 0.16, wingZ + 0.05],
          quality,
        );
      } else {
        for (const side of [-1, 1]) {
          this.#addChassisMesh(
            new THREE.BoxGeometry(0.06, 0.32, 0.34),
            accent,
            [side * (wingW * 0.5), wingY - 0.1, wingZ],
            quality,
          );
        }
      }
    }

    if (level >= 3) {
      // Side skirts + rear diffuser fins.
      if (!isBike) {
        for (const side of [-1, 1]) {
          this.#addChassisMesh(
            new THREE.BoxGeometry(0.1, 0.12, Math.abs(front - rear) * 0.85),
            carbon,
            [side * (track * 0.55 + 0.08), 0.18, (front + rear) * 0.5],
            quality,
          );
        }
        for (let i = -2; i <= 2; i++) {
          this.#addChassisMesh(
            new THREE.BoxGeometry(0.04, 0.1, 0.35),
            accent,
            [i * 0.18, 0.12, rear - 0.55],
            quality,
          );
        }
      } else {
        // Bike: belly pan extension + hugger.
        this.#addChassisMesh(new THREE.BoxGeometry(0.3, 0.08, 0.7), carbon, [0, 0.32, 0.1], quality);
        this.#addChassisMesh(new THREE.BoxGeometry(0.28, 0.1, 0.35), accent, [0, 0.55, rear - 0.05], quality);
      }
    }
  }

  /**
   * Chassis ladder: lower stance, carbon accents, then cage / lightweight bits.
   */
  #buildChassisKit(spec, quality) {
    const level = this.levels.chassis;
    if (level <= 0) return;

    const w = spec.body.wheels;
    const track = Math.max(w.track, 0.35);
    const isBike = w.track === 0;
    const carbon = new THREE.MeshLambertMaterial({ color: 0x14161c });
    const bolt = new THREE.MeshLambertMaterial({ color: 0x3a3e48 });

    if (level >= 1 && !isBike) {
      // Lightweight door inners / stripped sill flash.
      for (const side of [-1, 1]) {
        this.#addChassisMesh(
          new THREE.BoxGeometry(0.06, 0.35, 1.1),
          carbon,
          [side * (track * 0.52), 0.55, 0.1],
          quality,
          false,
        );
      }
    }

    if (level >= 2) {
      // Carbon roof / tank spine.
      if (isBike) {
        this.#addChassisMesh(new THREE.BoxGeometry(0.2, 0.06, 0.7), carbon, [0, 0.92, 0.05], quality);
      } else {
        this.#addChassisMesh(
          new THREE.BoxGeometry(track * 0.55, 0.05, Math.abs(w.front - w.rear) * 0.5),
          carbon,
          [0, 1.05, -0.1],
          quality,
        );
      }
      // Exposed fastener row — reads as race hardware.
      for (let i = -2; i <= 2; i++) {
        this.#addChassisMesh(
          new THREE.BoxGeometry(0.04, 0.04, 0.04),
          bolt,
          [i * 0.12, isBike ? 0.95 : 1.08, isBike ? 0.2 : -0.15],
          quality,
          false,
        );
      }
    }

    if (level >= 3) {
      // Roll-cage / subframe tubes.
      if (isBike) {
        for (const side of [-1, 1]) {
          this.#addChassisMesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
            carbon,
            [side * 0.12, 0.7, -0.15, 0.4, 0, side * 0.15],
            quality,
          );
        }
      } else {
        // Simple halo bar over the cabin.
        const half = track * 0.35;
        this.#addChassisMesh(
          new THREE.CylinderGeometry(0.035, 0.035, half * 2, 6),
          carbon,
          [0, 1.15, -0.2, 0, 0, Math.PI / 2],
          quality,
        );
        for (const side of [-1, 1]) {
          this.#addChassisMesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6),
            carbon,
            [side * half, 0.9, -0.2],
            quality,
          );
        }
      }
    }
  }

  async #loadModel(spec, quality) {
    const token = (this._modelToken = (this._modelToken ?? 0) + 1);
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(spec.model);
      // A newer build() started while we were loading — drop this result.
      if (token !== this._modelToken || this.spec?.id !== spec.id) return;

      // Only swap once the file is in: keeps the procedural body as a live
      // fallback if the request fails, and avoids an empty chassis on error.
      const keep = new Set([...this.brakeLights, ...this.brakeGlows]);
      for (const child of [...this.chassis.children]) {
        if (keep.has(child)) continue;
        this.chassis.remove(child);
        child.geometry?.dispose?.();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m.dispose?.();
        }
      }

      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = quality.shadows;
        o.receiveShadow = quality.shadows;
        // No cubemap in this scene — high-metalness Standard materials go
        // nearly black and the garage car disappears. Pull metalness down and
        // bias roughness so hemi + sun alone keep the body readable.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0.4, 0.35);
          if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.5, 0.42);
          if ('envMapIntensity' in m) m.envMapIntensity = 0.4;
          m.needsUpdate = true;
        }
      });
      gltf.scene.name = `model:${spec.id}`;
      this.chassis.add(gltf.scene);
      for (const light of this.brakeLights) this.chassis.add(light);
      for (const glow of this.brakeGlows) this.chassis.add(glow);
      // Upgrade kits still layer on top of the loaded shell.
      this.#buildAeroKit(spec, quality);
      this.#buildChassisKit(spec, quality);
    } catch (err) {
      console.warn(`[insta-speed] falling back to the procedural body for ${spec.id}:`, err);
    }
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   */
  update(sim, dt) {
    this.root.position.set(worldX(sim.y), 0, sim.x);
    this.root.rotation.y = worldYaw(sim.yaw);

    const dive = clamp(-sim.ax / 22, -0.05, 0.09);
    const roll = clamp(sim.ay / 40, -0.06, 0.06);
    const k = 1 - Math.exp(-dt * 9);
    this.dive += (dive - this.dive) * k;
    this.roll += (roll - this.roll) * k;

    this.chassis.rotation.x = this.dive;
    this.chassis.position.y = this.chassisBaseY - this.dive * 0.35;
    this.chassis.rotation.z = this.roll;

    const r = this.spec.wheelRadius;
    for (const { mesh, steers } of this.wheels) {
      const omega = steers ? sim.omega.front : sim.omega.rear;
      mesh.rotation.x += omega * dt;
      mesh.rotation.y = steers ? worldYaw(sim.steerAngle) : 0;
      mesh.position.y = r;
    }

    const glow = sim.brakeInput;
    for (const light of this.brakeLights) {
      light.material.color.setRGB(0.22 + glow * 0.78, 0.05 + glow * 0.06, 0.05 + glow * 0.06);
      light.scale.setScalar(1 + glow * 0.25);
    }
    for (const halo of this.brakeGlows) {
      halo.material.opacity = glow * 0.55;
      halo.scale.setScalar(1 + glow * 0.4);
    }
  }

  /**
   * World-space contact-patch positions, one per wheel.
   * @returns {THREE.Vector3[]}
   */
  wheelWorldPositions() {
    this._wheelPoints ??= [];
    while (this._wheelPoints.length < this.wheels.length) {
      this._wheelPoints.push(new THREE.Vector3());
    }
    this._wheelPoints.length = this.wheels.length;
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].mesh.getWorldPosition(this._wheelPoints[i]);
      this._wheelPoints[i].y = 0.12;
    }
    return this._wheelPoints;
  }

  clear() {
    for (const obj of this.disposables) {
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    if (this._wheelShared) {
      const seen = new Set();
      for (const item of this._wheelShared) {
        if (seen.has(item)) continue;
        seen.add(item);
        item.dispose?.();
      }
      this._wheelShared = null;
    }
    this.chassis.clear();
    for (const { mesh } of this.wheels) this.root.remove(mesh);
    this.wheels = [];
    this.brakeLights = [];
    this.brakeGlows = [];
    this.disposables = [];
    this.chassisBaseY = 0;
  }
}
