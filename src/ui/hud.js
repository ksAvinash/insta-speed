import { clamp } from '../physics/constants.js';

/**
 * Live telemetry. Kept deliberately cheap: values are written straight to
 * cached element references every frame, and each is compared against its last
 * value so the browser is not asked to re-layout text that has not changed.
 */
/** Seconds left when the border and clock start pulsing together. */
const TIMEOUT_WARN_FROM = 5;
/** Clock is hidden until remaining time is at or below this. */
const CLOCK_VISIBLE_FROM = 9;

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.speed = document.getElementById('hud-speed');
    this.distance = document.getElementById('hud-distance');
    this.distanceBox = this.distance.parentElement;
    // Digit is an SVG <text>; the visible shell is the .readout--time wrapper.
    // parentElement would be the <svg>, which must not receive [hidden]/is-tight.
    this.time = document.getElementById('hud-time');
    this.timeBox = this.time?.closest('.readout--time') ?? this.time?.parentElement;
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
    // SVG <text> and HTML text nodes both accept textContent.
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
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} distanceToTarget
   */
  update(sim, distanceToTarget) {
    this.#text(this.speed, 'speed', String(Math.round(sim.speedKph)));

    // Countdown only — top centre from 9 s. Big constant outline type; from 5 s
    // it pulses in lockstep with the border warn.
    const left = Math.max(0, (this.limit ?? 0) - sim.elapsed);
    this.#clockVisible(left);
    if (left <= CLOCK_VISIBLE_FROM) {
      const display = Math.ceil(left - 1e-9); // 0.01 still reads as 1 until gone
      this.#text(this.time, 'time', String(Math.max(0, display)));
      const tight = left <= TIMEOUT_WARN_FROM && left > 0;
      const critical = left <= 2 && left > 0;
      this.#flag(this.timeBox, 'tight', tight, 'is-tight');
      this.#flag(this.timeBox, 'critical', critical, 'is-critical');
      // Safari often ignores CSS stroke on SVG <text> — set attributes too.
      this.#clockStroke(critical ? '#ff5046' : tight ? '#ffc448' : '#ffffff');
    }
    this.#timeoutWarn(left);

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

  /** @param {number} left */
  #clockVisible(left) {
    const show = left <= CLOCK_VISIBLE_FROM;
    if (this.last.clockVisible === show) return;
    this.last.clockVisible = show;
    this.timeBox.hidden = !show;
    // iOS Safari can leave [hidden] stuck; force display for absolute clock.
    this.timeBox.style.display = show ? 'flex' : 'none';
    if (!show) {
      this.timeBox.classList.remove('is-tight', 'is-critical');
      this.last.tight = false;
      this.last.critical = false;
    }
  }

  /** @param {string} color */
  #clockStroke(color) {
    if (this.last.clockStroke === color) return;
    this.last.clockStroke = color;
    this.time.setAttribute('stroke', color);
    this.time.setAttribute('fill', 'none');
  }

  /**
   * Border + clock pulse from 5 s remaining → 0. Same --pulse/--urgency on
   * both so they breathe together.
   * @param {number} left seconds remaining on the run clock
   */
  #timeoutWarn(left) {
    const active = left > 0 && left <= TIMEOUT_WARN_FROM;
    if (!active) {
      if (this.last.timeoutBorder) {
        this.last.timeoutBorder = false;
        if (this.timeoutWarn) {
          this.timeoutWarn.hidden = true;
          this.timeoutWarn.classList.remove('is-critical');
        }
        this.timeBox.style.removeProperty('--pulse');
        this.timeBox.style.removeProperty('--urgency');
      }
      return;
    }

    // 0 at 5 s, 1 as the clock hits zero.
    const urgency = clamp(1 - left / TIMEOUT_WARN_FROM, 0, 1);
    // Quantise so we are not writing CSS vars every frame for no visual change.
    const bucket = Math.round(urgency * 20) / 20;
    if (this.last.timeoutUrgency !== bucket) {
      this.last.timeoutUrgency = bucket;
      // Pulse period: ~0.9 s at 5 s left, ~0.35 s in the final second.
      const pulse = `${0.9 - bucket * 0.55}s`;
      const urgencyStr = String(bucket);
      if (this.timeoutWarn) {
        this.timeoutWarn.style.setProperty('--urgency', urgencyStr);
        this.timeoutWarn.style.setProperty('--pulse', pulse);
      }
      // Same vars on the clock so its outline pulse locks to the border.
      this.timeBox.style.setProperty('--urgency', urgencyStr);
      this.timeBox.style.setProperty('--pulse', pulse);
    }
    if (!this.last.timeoutBorder) {
      this.last.timeoutBorder = true;
      if (this.timeoutWarn) this.timeoutWarn.hidden = false;
    }
    this.timeoutWarn?.classList.toggle('is-critical', left <= 2);
  }

  show() {
    this.root.hidden = false;
    // Stay hidden until the run is inside the final 9 s.
    this.timeBox.hidden = true;
    this.timeBox.style.display = 'none';
    this.last.clockVisible = false;
  }

  hide() {
    this.root.hidden = true;
    if (this.timeoutWarn) {
      this.timeoutWarn.hidden = true;
      this.timeoutWarn.classList.remove('is-critical');
    }
    this.timeBox.hidden = true;
    this.timeBox.style.display = 'none';
    this.timeBox.classList.remove('is-tight', 'is-critical');
    this.timeBox.style.removeProperty('--pulse');
    this.timeBox.style.removeProperty('--urgency');
    this.last.timeoutBorder = false;
    this.last.timeoutUrgency = undefined;
    this.last.clockVisible = undefined;
    this.last.clockStroke = undefined;
    this.last.tight = false;
    this.last.critical = false;
  }
}
