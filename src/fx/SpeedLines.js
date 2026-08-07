import * as THREE from 'three';
import { clamp } from '../physics/constants.js';

/**
 * Streaks rushing past the camera. Purely a speed cue — they fade in above
 * ~150 km/h and are what makes the difference between "fast" and "600 km/h"
 * legible once the road surface itself blurs into a single tone.
 *
 * Count is tiered: fewer, longer streaks read cleaner than a dense white fog
 * of short ones, and low tier pays less per frame for the attribute upload.
 */
export class SpeedLines {
  /**
   * @param {THREE.Scene} scene
   * @param {number} [count]
   */
  constructor(scene, count = 90) {
    this.scene = scene;
    this.radius = 18;
    this.span = 100;

    this.material = new THREE.LineBasicMaterial({
      color: 0xd8e4f0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    this.count = 0;
    this.setBudget(count);
  }

  /**
   * Rebuild the streak pool for a quality tier.
   * @param {number} count
   */
  setBudget(count) {
    const n = Math.max(24, count | 0);
    if (n === this.count) return;

    this.geometry?.dispose();
    this.count = n;
    this.positions = new Float32Array(n * 6);
    this.seeds = new Float32Array(n * 3);
    this.offsets = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      this.seeds[i * 3] = Math.random() * Math.PI * 2;
      this.seeds[i * 3 + 1] = 3.5 + Math.random() * this.radius;
      // Longer base streaks — density comes from length, not count.
      this.seeds[i * 3 + 2] = 10 + Math.random() * 28;
      this.offsets[i] = Math.random() * this.span;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry = geo;
    this.lines.geometry = geo;
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
    // Slight FOV coupling: wider FOV (high speed) makes streaks a touch brighter.
    const fovBoost = clamp(((camera.fov ?? 60) - 55) / 30, 0, 1);
    this.material.opacity = speedRatio * (0.36 + fovBoost * 0.12);
    if (speedRatio <= 0) return;

    const travel = sim.v * dt;
    const camZ = camera.position.z;
    const camX = camera.position.x;
    const camY = camera.position.y;

    for (let i = 0; i < this.count; i++) {
      this.offsets[i] -= travel;
      if (this.offsets[i] < -12) this.offsets[i] += this.span;

      const angle = this.seeds[i * 3];
      const rad = this.seeds[i * 3 + 1];
      const len = this.seeds[i * 3 + 2] * (0.45 + speedRatio * 0.9);

      const x = camX + Math.cos(angle) * rad;
      const y = camY * 0.35 + 0.8 + Math.sin(angle) * rad * 0.5;
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
    this.geometry?.dispose();
    this.material.dispose();
    this.scene.remove(this.lines);
  }
}
