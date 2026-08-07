import { VehicleSim } from '../physics/VehicleSim.js';
import { getVehicle, DEFAULT_VEHICLE_ID } from '../vehicles/registry.js';
import { getScene, DEFAULT_SCENE_ID } from '../scenes/registry.js';
import { buildCourse } from './course.js';
import { scoreRun, rateRun, runMultiplier, creditsFor, firstClearBonus } from './score.js';
import { speedLadder, nextSpeed, clampToLadder, BASE_SPEED_KPH } from './speeds.js';
import {
  recordBest,
  getUnlockedSpeed,
  unlockSpeed,
  getUpgrades,
  buyUpgrade,
  getCredits,
  addCredits,
  markCleared,
} from './Storage.js';
import {
  applyUpgrades,
  nextLevelCost,
  nextSpeedTier,
  upgradeTier,
  MAX_LEVEL,
} from '../vehicles/upgrades.js';
import { bus } from './Bus.js';

export { buildCourse, idealStoppingDistance } from './course.js';

/** @typedef {'garage'|'countdown'|'running'|'result'} GameState */

/** Seconds the vehicle is held at rest under the start lights. */
export const COUNTDOWN_SECONDS = 3;

export class Game {
  constructor() {
    /** @type {GameState} */
    this.state = 'garage';
    this.vehicleId = DEFAULT_VEHICLE_ID;
    this.sceneId = DEFAULT_SCENE_ID;
    this.launchSpeedKph = BASE_SPEED_KPH;
    this.countdown = 0;
    /** @type {VehicleSim|null} */
    this.sim = null;
    this.course = null;
    this.result = null;
    this.input = { steer: 0, brake: 0 };
  }

  /**
   * The vehicle as actually built — stock spec with the player's parts folded
   * in. Everything downstream (sim, course, renderer, HUD) sees this one, so
   * an upgrade is visible everywhere without any of them knowing about parts.
   */
  get vehicle() {
    return applyUpgrades(getVehicle(this.vehicleId), this.upgrades);
  }

  /** The showroom vehicle, for comparing a build against what it started as. */
  get stockVehicle() {
    return getVehicle(this.vehicleId);
  }

  /** Part levels fitted to the selected vehicle. */
  get upgrades() {
    return getUpgrades(this.vehicleId);
  }

  get credits() {
    return getCredits();
  }

  get scene() {
    return getScene(this.sceneId);
  }

  /** Distance still to run before the target line. Negative once past it. */
  get distanceToTarget() {
    if (!this.sim || !this.course) return 0;
    return this.course.target - this.sim.x;
  }

  /** Seconds on the clock. Never negative — the run ends when it reaches zero. */
  get timeLeft() {
    if (!this.sim || !this.course) return 0;
    return Math.max(0, this.course.timeLimit - this.sim.elapsed);
  }

  /** Ladder rungs for the current vehicle. */
  get ladder() {
    return speedLadder(this.vehicle);
  }

  /** Fastest rung the player has earned on the current vehicle. */
  get unlockedSpeed() {
    return getUnlockedSpeed(this.vehicleId, this.ladder[0]);
  }

  select(vehicleId, sceneId) {
    if (vehicleId) this.vehicleId = vehicleId;
    if (sceneId) this.sceneId = sceneId;
    // Each vehicle carries its own progression, so the selected speed has to be
    // re-snapped whenever the vehicle changes.
    this.launchSpeedKph = clampToLadder(this.vehicle, this.launchSpeedKph, this.unlockedSpeed);
    bus.emit('selection', { vehicleId: this.vehicleId, sceneId: this.sceneId });
  }

  /** @param {number} kph */
  selectSpeed(kph) {
    this.launchSpeedKph = clampToLadder(this.vehicle, kph, this.unlockedSpeed);
    bus.emit('selection', { vehicleId: this.vehicleId, sceneId: this.sceneId });
  }

  /** Jump straight to the fastest rung unlocked so far. */
  selectFastestUnlocked() {
    this.selectSpeed(this.unlockedSpeed);
  }

  /* ------------------------------- upgrades ------------------------------ */

  /**
   * What fitting one more level of a part costs, or `null` if it is maxed.
   * @param {string} partId
   */
  upgradeCost(partId) {
    return nextLevelCost(this.upgrades[partId] ?? 0);
  }

  /** @param {string} partId */
  canAfford(partId) {
    const cost = this.upgradeCost(partId);
    return cost !== null && this.credits >= cost;
  }

  /**
   * The next speed cap this vehicle can reach and the part level it needs, or
   * `null` once its ladder is fully extended.
   */
  get nextTier() {
    return nextSpeedTier(this.stockVehicle, this.upgrades);
  }

  /** How built the selected vehicle is, 0–3. Gates the speed ladder. */
  get tier() {
    return upgradeTier(this.upgrades);
  }

  get isFullyBuilt() {
    return this.tier >= MAX_LEVEL;
  }

  /**
   * Fits one level of a part. The balance check lives in Storage so there is a
   * single place credits can be spent.
   * @param {string} partId
   * @returns {{ ok: boolean, reason?: string }}
   */
  buyUpgrade(partId) {
    const cost = this.upgradeCost(partId);
    if (cost === null) return { ok: false, reason: 'already maxed' };

    const result = buyUpgrade(this.vehicleId, partId, cost);
    if (!result.ok) return { ok: false, reason: result.reason };

    // A new part can raise the cap, but never lowers it, so the current
    // selection stays valid. Re-snapping anyway keeps this correct if the
    // tuning ever moves the other way.
    this.launchSpeedKph = clampToLadder(this.vehicle, this.launchSpeedKph, this.unlockedSpeed);
    bus.emit('garage', { vehicleId: this.vehicleId, levels: result.levels, credits: result.credits });
    return { ok: true };
  }

  /**
   * Move onto a rung the run just earned, so "run it again" straight off the
   * result card launches at the new speed. Winning a speed and then having to
   * walk back through the garage to actually drive it is pure ceremony.
   * @returns {boolean} true if the launch speed changed
   */
  takeUnlockedSpeed() {
    const kph = this.result?.unlockedKph;
    if (!kph || kph === this.launchSpeedKph) return false;
    this.selectSpeed(kph);
    return this.launchSpeedKph === kph;
  }

  /** Build the course and drop into the countdown. */
  launch() {
    const spec = this.vehicle;
    const scene = this.scene;
    this.course = buildCourse(spec, scene, this.launchSpeedKph);
    this.sim = new VehicleSim(spec, scene, { launchSpeedKph: this.launchSpeedKph });
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
      return;
    }
    // Checked last, so a stop that lands on the buzzer still counts.
    if (sim.elapsed >= course.timeLimit) {
      this.#finish({ outcome: 'timeout', timeoutKph: sim.speedKph });
    }
  }

  #finish(partial) {
    const { sim, course } = this;
    const error = Math.abs(course.target - sim.x);
    const clean = partial.outcome === 'stopped';

    const multiplier = runMultiplier(this.launchSpeedKph, this.scene.scoreMultiplier ?? 1);
    const { score, accuracy, pace, precisionPoints, paceBonus } = scoreRun({
      clean,
      error,
      target: course.target,
      seconds: sim.elapsed,
      parSeconds: course.runSeconds,
      multiplier,
    });
    const rating = rateRun(clean, error, partial.outcome);

    const isRecord = clean && recordBest(this.vehicleId, this.sceneId, score, error);

    // A clean stop earns the next rung on this vehicle's speed ladder.
    const next = clean ? nextSpeed(this.vehicle, this.launchSpeedKph) : null;
    const unlockedKph = next && unlockSpeed(this.vehicleId, next) ? next : null;

    // Credits. The first clean stop on a vehicle/scene/rung triple pays a bonus
    // on top, so working through the roster funds the early upgrades rather
    // than repeating one comfortable run.
    const firstClear = clean && markCleared(this.vehicleId, this.sceneId, this.launchSpeedKph);
    const runCredits = creditsFor(score);
    const clearBonus = firstClear ? firstClearBonus(this.launchSpeedKph) : 0;
    const creditsEarned = runCredits + clearBonus;
    if (creditsEarned > 0) addCredits(creditsEarned);

    this.result = {
      ...partial,
      clean,
      error,
      score,
      accuracy,
      pace,
      precisionPoints,
      paceBonus,
      multiplier,
      runCredits,
      clearBonus,
      creditsEarned,
      credits: this.credits,
      grade: rating.grade,
      label: rating.label,
      isRecord,
      unlockedKph,
      launchSpeedKph: this.launchSpeedKph,
      isTopSpeed: next === null,
      stoppedAt: sim.x,
      target: course.target,
      time: sim.elapsed,
      parSeconds: course.runSeconds,
      timeLimit: course.timeLimit,
      peakRotorC: Math.max(sim.rotorTemp.front, sim.rotorTemp.rear),
      vehicleId: this.vehicleId,
      sceneId: this.sceneId,
    };

    this.state = 'result';
    bus.emit('statechange', this.state);
    bus.emit('result', this.result);
  }
}
