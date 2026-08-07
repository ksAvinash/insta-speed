import * as THREE from 'three';
import { clamp } from '../physics/constants.js';
import { worldX, worldYaw } from './trackFrame.js';

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
    this.judder = 0;
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
   * @param {boolean} [live] false once the run is over, which parks the shake
   *   and the FOV boost instead of leaving them buzzing behind the result card
   */
  update(sim, dt, live = true) {
    // Garage showcase shifts the film plate; always restore for a live chase.
    if (this.camera.clearViewOffset) this.camera.clearViewOffset();

    const speedRatio = clamp(sim.v / 140, 0, 1.4);

    // Ease the rig back and down as speed builds.
    const dist = this.distance * (1 + speedRatio * 0.16);
    const height = this.height * (1 - speedRatio * 0.12);

    const heading = worldYaw(sim.yaw);
    this.yawLag += (heading - this.yawLag) * Math.min(1, dt * 6);
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
    this.target.set(Math.sin(heading) * lead, 0.75, Math.cos(heading) * lead);

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
      worldX(sim.y) + this.lookOffset.x,
      this.lookOffset.y,
      sim.x + this.lookOffset.z,
    );

    // Two separate channels, because they mean different things to the player.
    //
    // `shake` is the low rumble of hard deceleration. It used to be strong
    // enough that simply braking well made the whole screen stutter, which read
    // as a framerate problem rather than as speed, so it is now understated.
    //
    // `judder` fires only once a wheel has genuinely stopped turning. That is
    // the mistake worth feeling in your hands: it hits fast, sits at a higher
    // frequency than the rumble, and fades as the car slows. Locking up should
    // be unmistakable without heavy braking being uncomfortable.
    const locked = sim.locked;
    const lockedAxles = (locked.front ? 1 : 0) + (locked.rear ? 1 : 0);

    if (!live) {
      // Result card: kill camera shake immediately. Exponential decay left a
      // stuttering frame behind the fail popup for a noticeable beat.
      this.shake = 0;
      this.judder = 0;
    } else {
      const rumble = clamp(-sim.ax / 18, 0, 1) * 0.3 + sim.slipIntensity * 0.35;
      const lockup = lockedAxles * 0.5 * clamp(sim.v / 10, 0, 1);

      this.shake += (rumble - this.shake) * Math.min(1, dt * 8);
      // Onset is snappy, release is slower — a lock should announce itself.
      this.judder += (lockup - this.judder) * Math.min(1, dt * (lockup > this.judder ? 24 : 7));
    }

    const rumbleAmp = this.shake * 0.09;
    const juddAmp = this.judder * 0.16;
    const t = performance.now() * 0.001;

    this.camera.position.set(
      worldX(sim.y) + this.offset.x,
      this.offset.y,
      sim.x + this.offset.z,
    );
    this.camera.position.x += Math.sin(t * 47) * rumbleAmp + Math.sin(t * 96) * juddAmp;
    this.camera.position.y += Math.sin(t * 61) * rumbleAmp * 0.7 + Math.cos(t * 103) * juddAmp * 0.8;
    this.camera.lookAt(this.lookAt);
    this.camera.rotateZ((Math.sin(t * 39) * rumbleAmp + Math.sin(t * 88) * juddAmp) * 0.05);

    const targetFov = live
      ? this.baseFov + speedRatio * 13 + this.shake * 3 + this.judder * 2
      : this.baseFov;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Slow orbit used in the garage.
   * Framed tight so the vehicle fills the empty middle stage band between the
   * top/bottom chrome docks — not the geometric centre of the full canvas.
   */
  showcase(spec, time) {
    const size = Math.max(spec.wheelbase, 1.4);
    // Close enough that the body reads as the hero; still clears body length.
    const radius = 3.4 + size * 1.05;
    const height = 1.15 + spec.cgHeight * 0.95;
    // Slightly wider than the chase FOV so a phone still sees the whole car.
    this.camera.fov = Math.min(this.baseFov + 6, 78);
    this.camera.position.set(
      Math.sin(time * 0.28) * radius,
      height,
      Math.cos(time * 0.28) * radius,
    );
    // Look slightly below the CG so more of the car sits in the upper half of
    // the frame — the bottom chrome dock covers the lower third of the screen.
    this.camera.lookAt(0, spec.cgHeight * 0.55 + 0.12, 0);

    // Shift the film plate so the look-at lands in the stage hole (~42% from
    // the top), not dead-centre under the launch/parts dock.
    const el = this.renderer.renderer?.domElement;
    const w = el?.clientWidth || window.innerWidth;
    const h = el?.clientHeight || window.innerHeight;
    if (this.camera.setViewOffset && w > 0 && h > 0) {
      // Positive y offset = use a lower slice of the film → scene moves up.
      this.camera.setViewOffset(w, h, 0, h * 0.1, w, h);
    }

    this.camera.updateProjectionMatrix();
    this.reset = true;
  }
}
