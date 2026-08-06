import { VehicleSim } from '../physics/VehicleSim.js';
import { clamp } from '../physics/constants.js';
import { getVehicle, DEFAULT_VEHICLE_ID } from '../vehicles/registry.js';
import { getScene, DEFAULT_SCENE_ID } from '../scenes/registry.js';
import { buildCourse } from './course.js';
import { recordBest } from './Storage.js';
import { bus } from './Bus.js';

export { buildCourse, idealStoppingDistance } from './course.js';

/** @typedef {'garage'|'countdown'|'running'|'result'} GameState */

const COUNTDOWN_SECONDS = 3;

/** Rating bands, in metres of error from the target line. */
const RATINGS = [
  { grade: 'S', within: 0.5, label: 'Surgical' },
  { grade: 'A', within: 2, label: 'Excellent' },
  { grade: 'B', within: 6, label: 'Solid' },
  { grade: 'C', within: 15, label: 'Loose' },
  { grade: 'D', within: Infinity, label: 'Miles off' },
];

export class Game {
  constructor() {
    /** @type {GameState} */
    this.state = 'garage';
    this.vehicleId = DEFAULT_VEHICLE_ID;
    this.sceneId = DEFAULT_SCENE_ID;
    this.countdown = 0;
    /** @type {VehicleSim|null} */
    this.sim = null;
    this.course = null;
    this.result = null;
    this.input = { steer: 0, brake: 0 };
  }

  get vehicle() {
    return getVehicle(this.vehicleId);
  }

  get scene() {
    return getScene(this.sceneId);
  }

  /** Distance still to run before the target line. Negative once past it. */
  get distanceToTarget() {
    if (!this.sim || !this.course) return 0;
    return this.course.target - this.sim.x;
  }

  select(vehicleId, sceneId) {
    if (vehicleId) this.vehicleId = vehicleId;
    if (sceneId) this.sceneId = sceneId;
    bus.emit('selection', { vehicleId: this.vehicleId, sceneId: this.sceneId });
  }

  /** Build the course and drop into the countdown. */
  launch() {
    const spec = this.vehicle;
    const scene = this.scene;
    this.course = buildCourse(spec, scene);
    this.sim = new VehicleSim(spec, scene);
    this.sim.v = 0; // held at rest until the countdown fires
    this.result = null;
    this.countdown = COUNTDOWN_SECONDS;
    this.state = 'countdown';
    bus.emit('statechange', this.state);
    bus.emit('course', this.course);
  }

  backToGarage() {
    this.state = 'garage';
    this.sim = null;
    this.result = null;
    bus.emit('statechange', this.state);
  }

  /**
   * Fixed-step update driven by core/Loop.js.
   * @param {number} dt
   * @param {{ steer: number, brake: number }} input
   */
  update(dt, input) {
    this.input = input;

    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after >= 0) bus.emit('countdown', after);

      if (this.countdown <= 0) {
        // Instant acceleration: the whole point. Straight to launch speed.
        this.sim.reset();
        this.state = 'running';
        bus.emit('statechange', this.state);
        bus.emit('launched', this.sim.speedKph);
      }
      return;
    }

    if (this.state !== 'running' || !this.sim) return;

    this.sim.step(dt, input);
    this.#checkOutcome();
  }

  #checkOutcome() {
    const { sim, course } = this;
    const halfRoad = course.roadWidth / 2;

    if (Math.abs(sim.y) > halfRoad) {
      this.#finish({ outcome: 'offroad' });
      return;
    }
    if (sim.x >= course.wall) {
      this.#finish({ outcome: 'crash', impactKph: sim.speedKph });
      return;
    }
    if (sim.stopped) {
      const overshot = sim.x > course.target;
      this.#finish({ outcome: overshot ? 'overshoot' : 'stopped' });
    }
  }

  #finish(partial) {
    const { sim, course } = this;
    const error = Math.abs(course.target - sim.x);
    const clean = partial.outcome === 'stopped';

    const window = Math.max(20, course.target * 0.12);
    const accuracy = clamp(1 - error / window, 0, 1);
    const score = clean ? Math.round(100000 * accuracy ** 2) : 0;
    const rating = clean
      ? RATINGS.find((r) => error <= r.within)
      : { grade: 'F', label: partial.outcome === 'crash' ? 'Wrecked' : 'Failed' };

    const isRecord = clean && recordBest(this.vehicleId, this.sceneId, score, error);

    this.result = {
      ...partial,
      clean,
      error,
      score,
      accuracy,
      grade: rating.grade,
      label: rating.label,
      isRecord,
      stoppedAt: sim.x,
      target: course.target,
      time: sim.elapsed,
      peakRotorC: Math.max(sim.rotorTemp.front, sim.rotorTemp.rear),
      vehicleId: this.vehicleId,
      sceneId: this.sceneId,
    };

    this.state = 'result';
    bus.emit('statechange', this.state);
    bus.emit('result', this.result);
  }
}
