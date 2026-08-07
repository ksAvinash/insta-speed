import { COUNTDOWN_SECONDS } from '../core/Game.js';

/**
 * Vehicle-specific start-light gantries shown during the countdown.
 *
 * - Cars → F1: five reds light left-to-right, then extinguish for the start.
 * - Bikes → MotoGP: red bank snaps on together, then extinguishes.
 * - Trucks → traffic light: red → red+amber → green.
 */

/** @typedef {'f1'|'motogp'|'traffic'} StartMode */

/**
 * @param {import('../vehicles/registry.js').VehicleSpec} vehicle
 * @returns {StartMode}
 */
export function startModeFor(vehicle) {
  const cls = (vehicle.class ?? '').toLowerCase();
  const id = vehicle.id ?? '';
  if (cls.includes('bike') || id.includes('bike') || id.includes('moto')) return 'motogp';
  if (cls.includes('truck') || cls.includes('lorry') || id.includes('truck')) return 'traffic';
  return 'f1';
}

export class StartLights {
  constructor() {
    this.root = document.getElementById('start-lights');
    /** @type {StartMode} */
    this.mode = 'f1';
    /** @type {HTMLElement[]} */
    this.lamps = [];
    this.caption = null;
    this._lastKey = '';
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} vehicle */
  show(vehicle) {
    this.mode = startModeFor(vehicle);
    this.root.dataset.mode = this.mode;
    this.root.hidden = false;
    this.root.classList.remove('is-go', 'is-out');
    this.root.innerHTML = markup(this.mode);
    this.lamps = [...this.root.querySelectorAll('[data-lamp]')];
    this.caption = this.root.querySelector('.start-caption');
    this._lastKey = '';
    this.update(COUNTDOWN_SECONDS);
  }

  /**
   * Drive the lamps from remaining countdown time.
   * @param {number} remaining seconds left (COUNTDOWN_SECONDS → 0)
   */
  update(remaining) {
    if (this.root.hidden) return;
    const total = COUNTDOWN_SECONDS;
    const t = Math.max(0, Math.min(1, 1 - remaining / total));

    if (this.mode === 'f1') this.#updateF1(remaining, t);
    else if (this.mode === 'motogp') this.#updateMoto(remaining, t);
    else this.#updateTraffic(remaining, t);
  }

  /** All reds out / green held — the launch flash. */
  go() {
    this.root.classList.add('is-go');
    if (this.mode === 'f1' || this.mode === 'motogp') {
      for (const lamp of this.lamps) lamp.classList.remove('is-on');
      this.root.classList.add('is-out');
      if (this.caption) this.caption.textContent = 'GO';
    } else {
      this.#setTraffic({ red: false, amber: false, green: true });
      if (this.caption) this.caption.textContent = 'GO';
    }
  }

  hide() {
    this.root.hidden = true;
    this.root.classList.remove('is-go', 'is-out');
    this._lastKey = '';
  }

  #updateF1(remaining, t) {
    // Fill left→right over the first ~85% of the countdown, hold all five,
    // then the caller extinguishes on launch.
    let lit = 0;
    if (remaining > 0) {
      lit = Math.min(5, Math.max(1, Math.ceil(t * 5)));
      // Hold every lamp on for the last beat so the extinguish reads clearly.
      if (t >= 0.85) lit = 5;
    }
    const key = `f1:${lit}`;
    if (key === this._lastKey) return;
    this._lastKey = key;
    this.lamps.forEach((lamp, i) => lamp.classList.toggle('is-on', i < lit));
    if (this.caption) this.caption.textContent = lit < 5 ? 'ARMED' : 'HOLD';
  }

  #updateMoto(remaining, t) {
    // MotoGP: dark → whole red bank on → extinguish at the start.
    const on = remaining > 0 && t >= 0.28;
    const key = `moto:${on}`;
    if (key === this._lastKey) return;
    this._lastKey = key;
    for (const lamp of this.lamps) lamp.classList.toggle('is-on', on);
    if (this.caption) this.caption.textContent = on ? 'HOLD' : 'WAIT';
  }

  #updateTraffic(remaining, t) {
    // Classic three-aspect: red → red+amber → green.
    let phase;
    if (remaining <= 0 || t >= 0.92) phase = 'green';
    else if (t >= 0.55) phase = 'amber';
    else phase = 'red';

    const key = `traffic:${phase}`;
    if (key === this._lastKey) return;
    this._lastKey = key;

    if (phase === 'red') this.#setTraffic({ red: true, amber: false, green: false });
    else if (phase === 'amber') this.#setTraffic({ red: true, amber: true, green: false });
    else this.#setTraffic({ red: false, amber: false, green: true });

    if (this.caption) {
      this.caption.textContent =
        phase === 'red' ? 'STOP' : phase === 'amber' ? 'READY' : 'GO';
    }
  }

  /** @param {{ red: boolean, amber: boolean, green: boolean }} state */
  #setTraffic(state) {
    for (const lamp of this.lamps) {
      const color = lamp.dataset.lamp;
      lamp.classList.toggle('is-on', Boolean(state[color]));
    }
  }
}

/** @param {StartMode} mode */
function markup(mode) {
  if (mode === 'traffic') {
    return `
      <div class="start-gantry start-gantry--traffic" role="img" aria-label="Traffic start lights">
        <div class="start-housing start-housing--traffic">
          <span class="start-lamp start-lamp--red" data-lamp="red"></span>
          <span class="start-lamp start-lamp--amber" data-lamp="amber"></span>
          <span class="start-lamp start-lamp--green" data-lamp="green"></span>
        </div>
        <div class="start-caption">STOP</div>
      </div>`;
  }

  if (mode === 'motogp') {
    return `
      <div class="start-gantry start-gantry--motogp" role="img" aria-label="MotoGP start lights">
        <div class="start-beam"></div>
        <div class="start-housing start-housing--motogp">
          ${redLamps(5)}
        </div>
        <div class="start-caption">WAIT</div>
      </div>`;
  }

  // F1 default
  return `
    <div class="start-gantry start-gantry--f1" role="img" aria-label="Formula One start lights">
      <div class="start-beam"></div>
      <div class="start-housing start-housing--f1">
        ${redLamps(5)}
      </div>
      <div class="start-caption">ARMED</div>
    </div>`;
}

/** @param {number} count */
function redLamps(count) {
  return Array.from(
    { length: count },
    (_, i) => `<span class="start-lamp start-lamp--red" data-lamp="${i}"></span>`,
  ).join('');
}
