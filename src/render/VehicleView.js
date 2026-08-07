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
 * Materials stay cheap on low tier (Lambert). Medium/high use Standard on body
 * paint only — the world around the car stays Lambert so fill cost does not
 * scale with scenery.
 */

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
 */
function materialForPart(part, quality) {
  const color = part.color ?? 0xcccccc;

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
    // Headlights / LED strips: unlit so they punch through any ambient.
    return new THREE.MeshBasicMaterial({
      color: part.emissive,
      toneMapped: false,
    });
  }

  // Body paint on medium/high — Standard is paid for once per car mesh, not
  // for the whole world. Low tier stays Lambert.
  const rich = (quality.pixelRatio ?? 1) >= 1.5 && part.role !== 'matte';
  if (rich) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: part.metalness ?? (part.role === 'trim' ? 0.75 : 0.28),
      roughness: part.roughness ?? (part.role === 'trim' ? 0.35 : 0.48),
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
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  build(spec, quality) {
    this.clear();
    this.spec = spec;
    this.quality = quality;

    for (const part of spec.body.parts) {
      const geo = geometryForPart(part);
      const mat = materialForPart(part, quality);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...part.pos);
      if (part.rot) mesh.rotation.set(...part.rot);
      mesh.castShadow = quality.shadows && !part.glass && !part.emissive;
      this.chassis.add(mesh);
      this.disposables.push(mesh);
    }

    this.#buildWheels(spec, quality);
    this.#buildBrakeLights(spec, quality);

    if (spec.model) this.#loadModel(spec, quality);
  }

  #buildWheels(spec, quality) {
    const w = spec.body.wheels;
    const tyreGeo = new THREE.CylinderGeometry(w.radius, w.radius, w.width, 18);
    tyreGeo.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshLambertMaterial({ color: w.color ?? 0x18181c });

    // Rim + hub read as a wheel rather than a black drum; the pale tread stripe
    // still sells rotation and lock-up at a glance.
    const rimGeo = new THREE.CylinderGeometry(w.radius * 0.62, w.radius * 0.62, w.width * 0.55, 14);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshLambertMaterial({ color: w.rimColor ?? 0x8a909a });

    const hubGeo = new THREE.CylinderGeometry(w.radius * 0.22, w.radius * 0.22, w.width * 0.7, 10);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x2a2e36 });

    const markGeo = new THREE.BoxGeometry(w.width * 1.04, w.radius * 1.92, w.radius * 0.14);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x9a9aa4 });

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

        this.root.add(hub);
        this.wheels.push({ mesh: hub, steers });
      }
    }

    // Shared geometries/materials disposed once in clear().
    this._wheelShared = [tyreGeo, tyreMat, rimGeo, rimMat, hubGeo, hubMat, markGeo, markMat];
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
      // Per-light geometry so clear() can dispose each mesh safely.
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c, toneMapped: false });
      const light = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      light.position.set(x, y, z);
      this.chassis.add(light);
      this.brakeLights.push(light);
      this.disposables.push(light);

      // Soft additive halo — fake bloom without a post stack. Medium+ only so
      // low tier keeps the draw count tight.
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

  async #loadModel(spec, quality) {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(spec.model);
      // Replace the procedural body, keep the wheels and lights driving as-is.
      for (const mesh of [...this.chassis.children]) this.chassis.remove(mesh);
      gltf.scene.traverse((o) => {
        if (o.isMesh) o.castShadow = quality.shadows;
      });
      this.chassis.add(gltf.scene);
      for (const light of this.brakeLights) this.chassis.add(light);
      for (const glow of this.brakeGlows) this.chassis.add(glow);
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

    // Dive under braking and squat under the (brief) launch, capped so heavy
    // vehicles do not look like they are folding in half.
    //
    // Filtered rather than driven straight off `ax`: ABS servos caliper
    // pressure at 30 Hz, so the raw deceleration trace is a sawtooth and the
    // body was buzzing against it. A real suspension has mass and dampers, and
    // this is the cheapest honest stand-in for both.
    const dive = clamp(-sim.ax / 22, -0.05, 0.09);
    const roll = clamp(sim.ay / 40, -0.06, 0.06);
    const k = 1 - Math.exp(-dt * 9);
    this.dive += (dive - this.dive) * k;
    this.roll += (roll - this.roll) * k;

    this.chassis.rotation.x = this.dive;
    this.chassis.position.y = -this.dive * 0.35;
    // Body roll leans away from the lateral acceleration, in the mirrored frame.
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
   *
   * Read straight off the wheel hubs, which the scene graph has already placed
   * correctly. Effects that need these must not recompute them from sim state —
   * duplicating the track-to-world transform is how they end up mirrored.
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
      this._wheelPoints[i].y = 0.12; // contact patch, not hub centre
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
  }
}
