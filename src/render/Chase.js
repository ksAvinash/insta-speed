import * as THREE from 'three';
import { clamp } from '../physics/constants.js';

/**
 * Chase camera.
 *
 * Speed is communicated far more by the camera than by the number on the HUD:
 * the field of view opens up as velocity climbs, the rig sinks and tightens,
 * and hard braking shakes it. The pivot lags the car slightly so that yaw reads
 * as the car rotating rather than the world swinging.
 */
export class Chase {
  /** @param {import('./Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.camera = renderer.camera;
    // Offsets are held relative to the car, never in world space — see update().
    this.offset = new THREE.Vector3();
    this.lookOffset = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.yawLag = 0;
    this.distance = 7;
    this.height = 1.8;
  }

  get baseFov() {
    return this.renderer.designFov;
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  configure(spec) {
    const size = Math.max(spec.wheelbase, 1.4);
    this.distance = 4.2 + size * 1.15;
    // High enough to look down onto the road surface; too low and the road
    // recedes edge-on and reads as an empty plain.
    this.height = 1.5 + spec.cgHeight * 1.5;
    this.reset = true;
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   */
  update(sim, dt) {
    const speedRatio = clamp(sim.v / 140, 0, 1.4);

    // Ease the rig back and down as speed builds.
    const dist = this.distance * (1 + speedRatio * 0.16);
    const height = this.height * (1 - speedRatio * 0.12);

    this.yawLag += (sim.yaw - this.yawLag) * Math.min(1, dt * 6);
    const fx = Math.sin(this.yawLag);
    const fz = Math.cos(this.yawLag);

    // Everything is smoothed as an offset *from the car*, then added to the
    // car's current position. Smoothing an absolute world target that is moving
    // at 160 m/s leaves the camera tens of metres behind in steady state — the
    // lag is proportional to speed, so the faster you go the further away the
    // car drifts. Offsets change slowly, so they can be damped freely.
    this.desired.set(-fx * dist, height + sim.v * 0.002, -fz * dist);

    // Look further up the road the faster we are going — this is what makes the
    // target line readable in time to actually react to it. Kept modest, since
    // too much lead pushes the car into the distance.
    const lead = 7 + sim.v * 0.16;
    this.target.set(Math.sin(sim.yaw) * lead, 0.75, Math.cos(sim.yaw) * lead);

    if (this.reset) {
      this.offset.copy(this.desired);
      this.lookOffset.copy(this.target);
      this.reset = false;
    } else {
      // Frame-rate independent exponential smoothing.
      this.offset.lerp(this.desired, 1 - Math.exp(-dt * 9));
      this.lookOffset.lerp(this.target, 1 - Math.exp(-dt * 11));
    }

    this.lookAt.set(
      sim.y + this.lookOffset.x,
      this.lookOffset.y,
      sim.x + this.lookOffset.z,
    );

    // Shake from deceleration and from tyres past their grip peak.
    const stress = clamp(-sim.ax / 14, 0, 1) * 0.55 + sim.slipIntensity * 0.9;
    this.shake += (stress - this.shake) * Math.min(1, dt * 10);
    const amp = this.shake * 0.16;
    const t = performance.now() * 0.001;

    this.camera.position.set(sim.y + this.offset.x, this.offset.y, sim.x + this.offset.z);
    this.camera.position.x += Math.sin(t * 47) * amp;
    this.camera.position.y += Math.sin(t * 61) * amp * 0.7;
    this.camera.lookAt(this.lookAt);
    this.camera.rotateZ(Math.sin(t * 39) * amp * 0.05);

    const targetFov = this.baseFov + speedRatio * 13 + this.shake * 3;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }

  /** Static three-quarter view used in the garage. */
  showcase(spec, time) {
    const size = Math.max(spec.wheelbase, 1.4);
    const radius = 5 + size * 1.6;
    this.camera.fov = this.baseFov;
    this.camera.position.set(
      Math.sin(time * 0.32) * radius,
      2.1 + spec.cgHeight,
      Math.cos(time * 0.32) * radius,
    );
    this.camera.lookAt(0, spec.cgHeight + 0.35, 0);
    this.camera.updateProjectionMatrix();
    this.reset = true;
  }
}
