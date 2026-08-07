import { clamp } from '../physics/constants.js';

/**
 * Fully synthesised audio — no asset files, no loading, nothing to 404.
 *
 * Four voices, all driven straight off sim state: wind noise rising with speed,
 * a tyre-squeal band that opens as slip passes the grip peak, an ABS tick, and
 * a one-shot impact. Browsers will not start an AudioContext outside a user
 * gesture, so `resume()` is wired to the same tap that starts a run.
 */
export class Audio {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.muted = false;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    const noise = this.#noiseBuffer(2);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // --- wind: low-passed noise, cutoff and level track speed ---------------
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = noise;
    this.windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.windSrc.start();

    // --- tyre squeal: narrow band that opens up past the grip peak ----------
    this.squealSrc = this.ctx.createBufferSource();
    this.squealSrc.buffer = noise;
    this.squealSrc.loop = true;
    this.squealFilter = this.ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1600;
    this.squealFilter.Q.value = 9;
    this.squealGain = this.ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealSrc.connect(this.squealFilter).connect(this.squealGain).connect(this.master);
    this.squealSrc.start();

    this.absPhase = 0;
    this.enabled = true;
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  #noiseBuffer(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   */
  update(sim, dt) {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const speedRatio = clamp(sim.v / 170, 0, 1);

    this.windGain.gain.setTargetAtTime(speedRatio ** 1.4 * 0.5, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(320 + speedRatio * 2400, now, 0.08);

    const squeal = sim.slipIntensity * clamp(sim.v / 20, 0, 1);
    this.squealGain.gain.setTargetAtTime(squeal * 0.3, now, 0.05);
    this.squealFilter.frequency.setTargetAtTime(1100 + squeal * 1500, now, 0.05);

    if (sim.absActive && sim.brakeInput > 0.1) {
      this.absPhase += dt;
      const period = 1 / (sim.spec.brake.absHz ?? 15);
      if (this.absPhase >= period) {
        this.absPhase = 0;
        this.tick();
      }
    }
  }

  /** Short click for an ABS pulse. */
  tick() {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 90;
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** @param {number} severity 0-1 */
  impact(severity = 1) {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(0.6);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(clamp(severity, 0.2, 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 0.6);
  }

  /**
   * Out-of-time buzzer — three falling square tones, not a crash impact.
   * Reads as "the clock killed you" rather than "you hit something".
   */
  timeout() {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    // Harsh mid → low → lower, each a short square blip with a shared tail.
    const steps = [
      { f: 520, t: 0, d: 0.14 },
      { f: 380, t: 0.16, d: 0.16 },
      { f: 240, t: 0.34, d: 0.28 },
    ];
    for (const { f, t, d } of steps) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now + t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.72), now + t + d);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.16, now + t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(gain).connect(this.master);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    }
  }

  /** Rising tone during the countdown, then a launch whoomph. */
  beep(frequency = 660, duration = 0.12) {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  silence() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0, now, 0.15);
    this.squealGain.gain.setTargetAtTime(0, now, 0.1);
  }
}
