import * as THREE from 'three';
import { clamp } from '../physics/constants.js';

/**
 * Builds the visible vehicle.
 *
 * A spec either describes itself with a `body` recipe of primitives — which is
 * how the whole launch roster works, so no art pipeline is needed to add a
 * vehicle — or points `model` at a glTF file, which is loaded lazily and swaps
 * in over the top. Both paths produce the same node layout, so nothing
 * downstream cares which was used.
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

export class VehicleView {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    /** Body tips forward under braking; wheels stay on the ground. */
    this.chassis = new THREE.Group();
    this.root.add(this.chassis);
    scene.add(this.root);

    /** @type {{ mesh: THREE.Mesh, steers: boolean }[]} */
    this.wheels = [];
    /** @type {THREE.Mesh[]} */
    this.brakeLights = [];
    this.disposables = [];
    this.wheelSpin = 0;
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  build(spec, quality) {
    this.clear();
    this.spec = spec;

    for (const part of spec.body.parts) {
      const geo = geometryForPart(part);
      const mat = new THREE.MeshLambertMaterial({
        color: part.color ?? 0xcccccc,
        emissive: part.emissive ?? 0x000000,
        emissiveIntensity: part.emissive ? 0.6 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...part.pos);
      if (part.rot) mesh.rotation.set(...part.rot);
      mesh.castShadow = quality.shadows;
      this.chassis.add(mesh);
      this.disposables.push(mesh);
    }

    this.#buildWheels(spec, quality);
    this.#buildBrakeLights(spec, quality);

    if (spec.model) this.#loadModel(spec, quality);
  }

  #buildWheels(spec, quality) {
    const w = spec.body.wheels;
    const geo = new THREE.CylinderGeometry(w.radius, w.radius, w.width, 16);
    geo.rotateZ(Math.PI / 2); // barrel runs across the car
    const mat = new THREE.MeshLambertMaterial({ color: w.color ?? 0x18181c });

    // A pale stripe on the tread makes wheel rotation — and lock-up — readable.
    const markGeo = new THREE.BoxGeometry(w.width * 1.02, w.radius * 1.9, w.radius * 0.16);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x8a8a94 });

    const lateral = w.track > 0 ? [-w.track / 2, w.track / 2] : [0];
    for (const [z, steers] of [
      [w.front, true],
      [w.rear, false],
    ]) {
      for (const x of lateral) {
        const hub = new THREE.Group();
        hub.position.set(x, w.radius, z);

        const tyre = new THREE.Mesh(geo, mat);
        tyre.castShadow = quality.shadows;
        hub.add(tyre);
        hub.add(new THREE.Mesh(markGeo, markMat));

        this.root.add(hub);
        this.wheels.push({ mesh: hub, steers });
        this.disposables.push(tyre);
      }
    }
    this.wheelGeo = geo;
    this.wheelMat = mat;
    this.markGeo = markGeo;
    this.markMat = markMat;
  }

  #buildBrakeLights(spec, quality) {
    const w = spec.body.wheels;
    const geo = new THREE.BoxGeometry(0.26, 0.14, 0.1);
    const lateral = Math.max(w.track / 2 - 0.2, 0.12);
    for (const x of [-lateral, lateral]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c, toneMapped: false });
      const light = new THREE.Mesh(geo, mat);
      light.position.set(x, w.radius + 0.35, w.rear - 0.15);
      this.chassis.add(light);
      this.brakeLights.push(light);
      this.disposables.push(light);
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
    } catch (err) {
      console.warn(`[insta-speed] falling back to the procedural body for ${spec.id}:`, err);
    }
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   */
  update(sim, dt) {
    this.root.position.set(sim.y, 0, sim.x);
    this.root.rotation.y = sim.yaw;

    // Dive under braking and squat under the (brief) launch, capped so heavy
    // vehicles do not look like they are folding in half.
    const dive = clamp(-sim.ax / 22, -0.05, 0.09);
    this.chassis.rotation.x = dive;
    this.chassis.position.y = -dive * 0.35;
    this.chassis.rotation.z = clamp(-sim.ay / 40, -0.06, 0.06);

    const r = this.spec.wheelRadius;
    for (const { mesh, steers } of this.wheels) {
      const omega = steers ? sim.omega.front : sim.omega.rear;
      mesh.rotation.x += omega * dt;
      mesh.rotation.y = steers ? sim.steerAngle : 0;
      mesh.position.y = r;
    }

    const glow = sim.brakeInput;
    for (const light of this.brakeLights) {
      light.material.color.setRGB(0.22 + glow * 0.78, 0.05 + glow * 0.06, 0.05 + glow * 0.06);
      light.scale.setScalar(1 + glow * 0.25);
    }
  }

  clear() {
    for (const obj of this.disposables) {
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    this.wheelGeo?.dispose();
    this.wheelMat?.dispose();
    this.markGeo?.dispose();
    this.markMat?.dispose();
    this.chassis.clear();
    for (const { mesh } of this.wheels) this.root.remove(mesh);
    this.wheels = [];
    this.brakeLights = [];
    this.disposables = [];
  }
}
