import * as THREE from 'three';
import { clamp } from '../physics/constants.js';

/**
 * Streaks rushing past the camera. Purely a speed cue — they fade in above
 * ~150 km/h and are what makes the difference between "fast" and "600 km/h"
 * legible once the road surface itself blurs into a single tone.
 */
export class SpeedLines {
  /** @param {THREE.Scene} scene */
  constructor(scene, count = 90) {
    this.count = count;
    this.radius = 16;
    this.span = 90;

    this.positions = new Float32Array(count * 6); // two endpoints per streak
    this.seeds = new Float32Array(count * 3); // angle, radius, length

    for (let i = 0; i < count; i++) {
      this.seeds[i * 3] = Math.random() * Math.PI * 2;
      this.seeds[i * 3 + 1] = 4 + Math.random() * this.radius;
      this.seeds[i * 3 + 2] = 6 + Math.random() * 22;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry = geo;

    this.material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    this.offsets = new Float32Array(count);
    for (let i = 0; i < count; i++) this.offsets[i] = Math.random() * this.span;
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {THREE.Camera} camera
   * @param {number} dt
   * @param {boolean} [live] false once the run is over — a crash freezes the sim
   *   at speed, and streaks should not keep tearing past the result card
   */
  update(sim, camera, dt, live = true) {
    const speedRatio = live ? clamp((sim.v - 42) / 130, 0, 1) : 0;
    this.material.opacity = speedRatio * 0.42;
    if (speedRatio <= 0) return;

    const travel = sim.v * dt;
    const camZ = camera.position.z;
    const camX = camera.position.x;

    for (let i = 0; i < this.count; i++) {
      this.offsets[i] -= travel;
      if (this.offsets[i] < -10) this.offsets[i] += this.span;

      const angle = this.seeds[i * 3];
      const rad = this.seeds[i * 3 + 1];
      const len = this.seeds[i * 3 + 2] * (0.4 + speedRatio);

      const x = camX + Math.cos(angle) * rad;
      const y = 1.5 + Math.sin(angle) * rad * 0.55;
      const z = camZ + this.offsets[i];

      this.positions[i * 6] = x;
      this.positions[i * 6 + 1] = y;
      this.positions[i * 6 + 2] = z;
      this.positions[i * 6 + 3] = x;
      this.positions[i * 6 + 4] = y;
      this.positions[i * 6 + 5] = z + len;
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
