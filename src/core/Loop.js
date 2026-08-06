import { PHYSICS_DT } from '../physics/constants.js';

/**
 * Fixed-timestep loop with an accumulator.
 *
 * Physics always advances in exact `PHYSICS_DT` increments no matter what the
 * display is doing, so a given input sequence produces an identical stop on a
 * 60 Hz laptop and a 120 Hz phone. Rendering interpolates between the last two
 * physics states with the leftover accumulator as alpha.
 */
export class Loop {
  /**
   * @param {object} opts
   * @param {(dt: number) => void} opts.update fixed-step simulation
   * @param {(alpha: number, frameDt: number) => void} opts.render
   * @param {number} [opts.dt]
   * @param {number} [opts.maxSubSteps] spiral-of-death guard
   */
  constructor({ update, render, dt = PHYSICS_DT, maxSubSteps = 8 }) {
    this.update = update;
    this.render = render;
    this.dt = dt;
    this.maxSubSteps = maxSubSteps;
    this.accumulator = 0;
    this.running = false;
    this.lastTime = 0;
    this.frameDt = 0;
    this.fps = 60;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.#tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  // Arrow-function field so it can be handed straight to requestAnimationFrame.
  #tick = (now) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.#tick);

    // Clamp the frame delta so a backgrounded tab does not teleport the car.
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.frameDt = frameDt;
    this.fps += (1 / Math.max(frameDt, 1e-4) - this.fps) * 0.1;

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSubSteps) {
      this.update(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    // If we blew the sub-step budget, drop the backlog rather than spiralling.
    if (steps === this.maxSubSteps) this.accumulator = 0;

    this.render(this.accumulator / this.dt, frameDt);
  };
}
