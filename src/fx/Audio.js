import { clamp } from '../physics/constants.js';

/**
 * Fully synthesised audio — no asset files, no loading, nothing to 404.
 *
 * Voices driven off sim state:
 * - wind noise (speed)
 * - vehicle engine / motor (class-specific, speed + brake)
 * - tyre squeal (slip)
 * - ABS tick, impact, timeout buzzer, countdown beep
 *
 * Browsers will not start an AudioContext outside a user gesture, so `resume()`
 * is wired to the same tap that starts a run.
 */

/**
 * Per-class continuous engine profiles.
 * Pitch tracks road speed; gain fades as the vehicle slows to a stop.
 * @typedef {object} EngineProfile
 * @property {number} baseHz idle / low-speed fundamental
 * @property {number} maxHz pitch at high speed
 * @property {number} harmonic ratio of second oscillator
 * @property {OscillatorType} wave
 * @property {OscillatorType} wave2
 * @property {number} noise amount of mechanical grit (0–1)
 * @property {number} gain peak engine level
 * @property {number} filterHz lowpass centre at mid speed
 * @property {number} pulseHz diesel-ish amplitude pulse rate (0 = none)
 */

/** @type {Record<string, EngineProfile>} */
const ENGINE = {
  // Hypercar: smooth high-rev scream
  car: {
    baseHz: 62,
    maxHz: 310,
    harmonic: 2.02,
    wave: 'sawtooth',
    wave2: 'triangle',
    noise: 0.08,
    gain: 0.1,
    filterHz: 900,
    pulseHz: 0,
  },
  // Superbike: thin, angry, climbs hard with speed
  bike: {
    baseHz: 95,
    maxHz: 480,
    harmonic: 2.15,
    wave: 'sawtooth',
    wave2: 'sawtooth',
    noise: 0.12,
    gain: 0.11,
    filterHz: 1400,
    pulseHz: 0,
  },
  // Heavy truck: low diesel rumble with slow mechanical pulse
  truck: {
    baseHz: 32,
    maxHz: 88,
    harmonic: 1.48,
    wave: 'square',
    wave2: 'sawtooth',
    noise: 0.32,
    gain: 0.13,
    filterHz: 420,
    pulseHz: 9,
  },
};

/**
 * @param {import('../vehicles/registry.js').VehicleSpec} [spec]
 * @returns {EngineProfile}
 */
export function engineProfileFor(spec) {
  const cls = (spec?.class ?? '').toLowerCase();
  const id = spec?.id ?? '';
  if (cls.includes('bike') || id.includes('bike') || id.includes('moto')) return ENGINE.bike;
  if (cls.includes('truck') || cls.includes('lorry') || id.includes('truck')) return ENGINE.truck;
  return ENGINE.car;
}

export class Audio {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.muted = false;
    /** @type {EngineProfile} */
    this.profile = ENGINE.car;
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

    // --- engine: dual oscillators + optional grit, class-switched -----------
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';
    this.engineOsc.frequency.value = 60;
    this.engineOsc2.frequency.value = 120;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 800;
    this.engineFilter.Q.value = 0.7;

    this.engineToneGain = this.ctx.createGain();
    this.engineToneGain.gain.value = 0.5;
    this.engineHarmGain = this.ctx.createGain();
    this.engineHarmGain.gain.value = 0.28;

    this.engineNoiseSrc = this.ctx.createBufferSource();
    this.engineNoiseSrc.buffer = noise;
    this.engineNoiseSrc.loop = true;
    this.engineNoiseFilter = this.ctx.createBiquadFilter();
    this.engineNoiseFilter.type = 'bandpass';
    this.engineNoiseFilter.frequency.value = 200;
    this.engineNoiseFilter.Q.value = 1.2;
    this.engineNoiseGain = this.ctx.createGain();
    this.engineNoiseGain.gain.value = 0;

    // engineGain = level from speed; engineVca = optional diesel LFO (base 1).
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineVca = this.ctx.createGain();
    this.engineVca.gain.value = 1;

    this.engineOsc.connect(this.engineToneGain);
    this.engineOsc2.connect(this.engineHarmGain);
    this.engineToneGain.connect(this.engineFilter);
    this.engineHarmGain.connect(this.engineFilter);
    this.engineNoiseSrc
      .connect(this.engineNoiseFilter)
      .connect(this.engineNoiseGain)
      .connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.engineVca).connect(this.master);

    // Truck chug: slow sine into VCA.gain (depth 0 for car/bike).
    this.enginePulse = this.ctx.createOscillator();
    this.enginePulse.type = 'sine';
    this.enginePulse.frequency.value = 9;
    this.enginePulseDepth = this.ctx.createGain();
    this.enginePulseDepth.gain.value = 0;
    this.enginePulse.connect(this.enginePulseDepth);
    this.enginePulseDepth.connect(this.engineVca.gain);

    this.engineOsc.start();
    this.engineOsc2.start();
    this.engineNoiseSrc.start();
    this.enginePulse.start();

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
    this.#applyProfile(this.profile);
  }

  /**
   * Pick engine character for the selected vehicle. Safe to call every launch.
   * @param {import('../vehicles/registry.js').VehicleSpec} spec
   */
  setVehicle(spec) {
    this.profile = engineProfileFor(spec);
    if (this.enabled) this.#applyProfile(this.profile);
  }

  /** @param {EngineProfile} p */
  #applyProfile(p) {
    if (!this.ctx) return;
    this.engineOsc.type = p.wave;
    this.engineOsc2.type = p.wave2;
    this.engineFilter.frequency.value = p.filterHz;
    this.engineNoiseGain.gain.value = 0; // live level set in update
    this.enginePulse.frequency.value = Math.max(p.pulseHz, 0.01);
    // Base VCA = 1; LFO depth only for trucks (adds ±depth around 1).
    this.engineVca.gain.value = 1;
    this.enginePulseDepth.gain.value = p.pulseHz > 0 ? 0.12 : 0;
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
    const p = this.profile;

    // Wind — same as before, air rush at speed.
    this.windGain.gain.setTargetAtTime(speedRatio ** 1.4 * 0.48, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(320 + speedRatio * 2400, now, 0.08);

    // Engine — pitch and volume fall with speed (this is a braking game).
    // Hard braking loads a slight pitch drop so it "strains" under deceleration.
    const brakeLoad = clamp(sim.brakeInput, 0, 1);
    const pitch = p.baseHz + (p.maxHz - p.baseHz) * speedRatio ** 0.85;
    const strained = pitch * (1 - brakeLoad * 0.08);
    this.engineOsc.frequency.setTargetAtTime(strained, now, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(strained * p.harmonic, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(p.filterHz * (0.55 + speedRatio * 0.9), now, 0.1);

    // Quiet at standstill, present at speed; a touch quieter under full brake so
    // wind + squeal can dominate the stop.
    const engLevel = speedRatio ** 1.1 * p.gain * (1 - brakeLoad * 0.25);
    this.engineGain.gain.setTargetAtTime(engLevel, now, 0.08);
    this.engineNoiseGain.gain.setTargetAtTime(engLevel * p.noise * 2.2, now, 0.1);
    this.engineNoiseFilter.frequency.setTargetAtTime(140 + speedRatio * 280, now, 0.1);

    // Tyre squeal
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

  /**
   * Brief launch whoosh layered under GO — pitch depends on vehicle class.
   * @param {import('../vehicles/registry.js').VehicleSpec} [spec]
   */
  launch(spec) {
    if (!this.enabled || this.muted) return;
    const p = engineProfileFor(spec);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = p.wave;
    osc.frequency.setValueAtTime(p.baseHz * 0.8, now);
    osc.frequency.exponentialRampToValueAtTime(p.maxHz * 0.7, now + 0.35);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(p.filterHz * 1.4, now + 0.3);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(p.gain * 1.6, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  silence() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0, now, 0.15);
    this.squealGain.gain.setTargetAtTime(0, now, 0.1);
    this.engineGain.gain.setTargetAtTime(0, now, 0.12);
    this.engineNoiseGain.gain.setTargetAtTime(0, now, 0.1);
  }
}
