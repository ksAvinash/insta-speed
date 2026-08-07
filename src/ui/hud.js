import { clamp } from '../physics/constants.js';

/**
 * Live telemetry. Kept deliberately cheap: values are written straight to
 * cached element references every frame, and each is compared against its last
 * value so the browser is not asked to re-layout text that has not changed.
 */
export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.speed = document.getElementById('hud-speed');
    this.distance = document.getElementById('hud-distance');
    this.distanceBox = this.distance.parentElement;
    this.time = document.getElementById('hud-time');
    this.timeBox = this.time.parentElement;
    this.timeLimit = document.getElementById('hud-time-limit');
    this.gValue = document.getElementById('hud-g');
    this.tempValue = document.getElementById('hud-temp');
    this.barBrake = document.getElementById('bar-brake');
    this.barG = document.getElementById('bar-g');
    this.barTemp = document.getElementById('bar-temp');
    this.flagAbs = document.getElementById('flag-abs');
    this.flagLock = document.getElementById('flag-lock');
    this.flagFade = document.getElementById('flag-fade');
    this.hint = document.getElementById('hud-hint');
    this.last = {};
  }

  #text(el, key, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el.textContent = value;
  }

  #flag(el, key, on, className = 'is-on') {
    if (this.last[key] === on) return;
    this.last[key] = on;
    el.classList.toggle(className, on);
  }

  /**
   * Course-dependent chrome, set once per run rather than every frame.
   * @param {{ timeLimit: number }} course
   */
  setCourse(course) {
    this.limit = course.timeLimit;
    this.#text(this.timeLimit, 'limit', `of ${course.timeLimit} s`);
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} distanceToTarget
   */
  update(sim, distanceToTarget) {
    this.#text(this.speed, 'speed', String(Math.round(sim.speedKph)));

    // Counting up rather than down: the number the player is judged on is the
    // one on the result card, so it is the one to show them live. The limit
    // sits under it, and the colour does the urgency.
    this.#text(this.time, 'time', sim.elapsed.toFixed(1));
    const left = (this.limit ?? Infinity) - sim.elapsed;
    this.#flag(this.timeBox, 'tight', left <= 5, 'is-tight');
    this.#flag(this.timeBox, 'critical', left <= 2, 'is-critical');

    const over = distanceToTarget < 0;
    this.#text(
      this.distance,
      'dist',
      `${over ? '+' : ''}${Math.abs(distanceToTarget).toFixed(Math.abs(distanceToTarget) < 100 ? 1 : 0)}`,
    );
    if (this.last.over !== over) {
      this.last.over = over;
      this.distanceBox.classList.toggle('is-over', over);
    }

    this.barBrake.style.width = `${sim.brakeInput * 100}%`;

    const g = sim.gForce;
    this.barG.style.width = `${clamp(g / 2.5, 0, 1) * 100}%`;
    this.#text(this.gValue, 'g', `${g.toFixed(1)}g`);

    const temp = Math.max(sim.rotorTemp.front, sim.rotorTemp.rear);
    const fadeTemp = sim.spec.brake.fadeTempC ?? 600;
    this.barTemp.style.width = `${clamp(temp / (fadeTemp * 1.5), 0, 1) * 100}%`;
    this.#text(this.tempValue, 'temp', `${Math.round(temp)}°`);

    const locked = sim.locked;
    this.#flag(this.flagAbs, 'abs', sim.absActive);
    this.#flag(this.flagLock, 'lock', locked.front || locked.rear);
    this.#flag(this.flagFade, 'fade', sim.padFriction(temp) < 0.92);
  }

  /** @param {string} text */
  setHint(text) {
    this.#text(this.hint, 'hint', text);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
