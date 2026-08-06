import * as THREE from 'three';

/**
 * Rubber laid on the road wherever a tyre slides.
 *
 * Smoke tells you a wheel is sliding *now*; the marks are the record of it, and
 * they are what make a lock-up legible after the fact — you get out of the car
 * and see the two black lines that cost you the run.
 *
 * One dynamic buffer of quads, written in place and recycled oldest-first, so
 * the whole trail is a single draw call regardless of how long it gets. Marks
 * do not fade: real rubber stays on the road, and a run is short enough that
 * the pool never wraps in practice.
 */

/** A new quad is laid every time a contact patch has travelled this far. */
const SEGMENT_METRES = 0.4;
/** Sitting just above the road plane, below the target line at 0.02. */
const HEIGHT = 0.012;

export class SkidMarks {
  /**
   * @param {THREE.Scene} scene
   * @param {number} [maxSegments] pooled quads shared across every wheel
   */
  constructor(scene, maxSegments = 900) {
    this.max = maxSegments;
    this.cursor = 0;
    this.count = 0; // high-water mark, so the draw range skips unused quads
    this.halfWidth = 0.16;

    // Six vertices per quad — indexed geometry saves nothing worth the extra
    // bookkeeping when every vertex is rewritten on recycle anyway.
    this.positions = new Float32Array(maxSegments * 6 * 3);
    this.colors = new Float32Array(maxSegments * 6 * 4);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    this.geometry = geo;

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.tint = new THREE.Color(0x14141a);
    /** @type {({ x: number, z: number }|null)[]} last patch position per wheel */
    this.trail = [];
    this.reset();
  }

  /**
   * Marks are darker than the road they are on, so a white surface needs a
   * different rubber colour to a black one.
   * @param {import('../scenes/registry.js').SceneDef} def
   */
  setScene(def) {
    const road = new THREE.Color(def.road?.color ?? 0x333333);
    // Two-thirds of the way from the road toward black keeps the mark clearly
    // visible on snow and salt without turning tarmac into a void.
    this.tint.copy(road).multiplyScalar(0.34);
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  setVehicle(spec) {
    this.halfWidth = Math.max(0.08, (spec.body?.wheels?.width ?? 0.3) * 0.45);
  }

  reset() {
    this.cursor = 0;
    this.count = 0;
    this.colors.fill(0);
    this.trail.length = 0;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, 0);
  }

  #lay(from, to, alpha) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;

    // Perpendicular to the direction of travel, so the mark is the width of the
    // tyre rather than the width of the step.
    const nx = (-dz / len) * this.halfWidth;
    const nz = (dx / len) * this.halfWidth;

    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.count = Math.max(this.count, this.cursor === 0 ? this.max : this.cursor);

    const corners = [
      [from.x - nx, from.z - nz],
      [from.x + nx, from.z + nz],
      [to.x + nx, to.z + nz],
      [from.x - nx, from.z - nz],
      [to.x + nx, to.z + nz],
      [to.x - nx, to.z - nz],
    ];

    let p = i * 18;
    let c = i * 24;
    for (const [x, z] of corners) {
      this.positions[p++] = x;
      this.positions[p++] = HEIGHT;
      this.positions[p++] = z;
      this.colors[c++] = this.tint.r;
      this.colors[c++] = this.tint.g;
      this.colors[c++] = this.tint.b;
      this.colors[c++] = alpha;
    }
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {THREE.Vector3[]} contactPoints world-space contact patches, in the
   *   same order as `wheels`
   * @param {{ steers: boolean }[]} wheels which axle each patch belongs to
   * @param {boolean} [live] false once the run is over
   */
  update(sim, contactPoints, wheels, live = true) {
    if (!contactPoints?.length) return;
    while (this.trail.length < contactPoints.length) this.trail.push(null);

    const rolling = sim.v > 1.5 && live;
    let dirty = false;

    for (let i = 0; i < contactPoints.length; i++) {
      const axle = wheels[i]?.steers ? 'front' : 'rear';
      const slipping = sim.axleSlipIntensity(axle);
      const point = contactPoints[i];

      if (!rolling || slipping <= 0.06) {
        // Lift the pen: the next mark starts fresh rather than joining across
        // the gap where the tyre was gripping.
        this.trail[i] = null;
        continue;
      }

      const last = this.trail[i];
      if (!last) {
        this.trail[i] = { x: point.x, z: point.z };
        continue;
      }

      if (Math.hypot(point.x - last.x, point.z - last.z) < SEGMENT_METRES) continue;

      this.#lay(last, point, 0.25 + slipping * 0.55);
      last.x = point.x;
      last.z = point.z;
      dirty = true;
    }

    if (!dirty) return;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, this.count * 6);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
