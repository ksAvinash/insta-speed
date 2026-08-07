import { clamp } from '../physics/constants.js';

/**
 * Live telemetry. Kept deliberately cheap: values are written straight to
 * cached element references every frame, and each is compared against its last
 * value so the browser is not asked to re-layout text that has not changed.
 */
/** Seconds left when the screen border starts pulsing. */
const TIMEOUT_WARN_FROM = 5;

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
    this.timeoutWarn = document.getElementById('timeout-warn');
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
    this.#flag(this.timeBox, 'tight', left <= TIMEOUT_WARN_FROM, 'is-tight');
    this.#flag(this.timeBox, 'critical', left <= 2, 'is-critical');
    this.#timeoutBorder(left);

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

  /**
   * Red border pulse from 5 s remaining → 0. Urgency (0–1) drives thickness,
   * opacity and pulse rate via CSS custom properties.
   * @param {number} left seconds remaining on the run clock
   */
  #timeoutBorder(left) {
    if (!this.timeoutWarn) return;
    const active = left > 0 && left <= TIMEOUT_WARN_FROM;
    if (!active) {
      if (this.last.timeoutBorder) {
        this.last.timeoutBorder = false;
        this.timeoutWarn.hidden = true;
        this.timeoutWarn.classList.remove('is-critical');
      }
      return;
    }

    // 0 at 5 s, 1 as the clock hits zero.
    const urgency = clamp(1 - left / TIMEOUT_WARN_FROM, 0, 1);
    // Quantise so we are not writing CSS vars every frame for no visual change.
    const bucket = Math.round(urgency * 20) / 20;
    if (this.last.timeoutUrgency !== bucket) {
      this.last.timeoutUrgency = bucket;
      this.timeoutWarn.style.setProperty('--urgency', String(bucket));
      // Pulse period: ~0.9 s at 5 s left, ~0.35 s in the final second.
      this.timeoutWarn.style.setProperty('--pulse', `${0.9 - bucket * 0.55}s`);
    }
    if (!this.last.timeoutBorder) {
      this.last.timeoutBorder = true;
      this.timeoutWarn.hidden = false;
    }
    this.timeoutWarn.classList.toggle('is-critical', left <= 2);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    if (this.timeoutWarn) {
      this.timeoutWarn.hidden = true;
      this.timeoutWarn.classList.remove('is-critical');
    }
    this.last.timeoutBorder = false;
    this.last.timeoutUrgency = undefined;
  }
}
