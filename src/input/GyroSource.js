import { clamp } from '../physics/constants.js';

/**
 * Tilt steering from the device orientation sensor.
 *
 * Three things this has to get right, all of which are the usual failure modes
 * for gyro controls on the web:
 *
 * 1. iOS 13+ gates the sensor behind `requestPermission()`, which only resolves
 *    if called during a real user gesture, and only in a secure context.
 * 2. Players hold a phone at whatever angle suits them, so steering has to be
 *    measured as a delta from a captured neutral rather than from flat.
 * 3. Which of beta/gamma represents roll depends on the screen orientation, so
 *    the axis has to be remapped whenever the device is rotated.
 */
export class GyroSource {
  /** Full lock at this much roll away from neutral. */
  static RANGE_DEG = 24;
  static DEADZONE_DEG = 2.5;
  static SMOOTHING = 0.25;

  constructor() {
    this.supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.needsPermission =
      this.supported && typeof DeviceOrientationEvent.requestPermission === 'function';
    this.enabled = false;
    this.receiving = false;
    this.value = 0;
    this.rawRoll = 0;
    this.neutralRoll = 0;
    this.screenAngle = 0;
  }

  /**
   * Must be invoked from a user gesture (a real click/tap handler) or iOS will
   * reject it without ever showing the prompt.
   * @returns {Promise<'granted'|'denied'|'unsupported'>}
   */
  async enable() {
    if (!this.supported) return 'unsupported';

    if (this.needsPermission) {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response !== 'granted') return 'denied';
      } catch {
        return 'denied';
      }
    }

    this.#onScreenChange();
    window.addEventListener('deviceorientation', this.#onOrientation, { passive: true });
    screen.orientation?.addEventListener('change', this.#onScreenChange);
    window.addEventListener('orientationchange', this.#onScreenChange);
    this.enabled = true;

    // A sensor can be present but silent (desktop, some tablets). Give it a
    // moment and report back so the UI can fall back to touch buttons.
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (!this.receiving) {
      this.disable();
      return 'unsupported';
    }
    this.calibrate();
    return 'granted';
  }

  disable() {
    window.removeEventListener('deviceorientation', this.#onOrientation);
    screen.orientation?.removeEventListener('change', this.#onScreenChange);
    window.removeEventListener('orientationchange', this.#onScreenChange);
    this.enabled = false;
    this.receiving = false;
    this.value = 0;
  }

  /** Capture the current hold angle as centre. Called at the start of each run. */
  calibrate() {
    this.neutralRoll = this.rawRoll;
    this.value = 0;
  }

  // Arrow-function fields so the same reference can be added and removed as an
  // event listener — a private method cannot be rebound onto the instance.
  #onScreenChange = () => {
    this.screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
  };

  #onOrientation = (event) => {
    const { beta, gamma } = event;
    if (beta === null || gamma === null) return;
    this.receiving = true;

    // Roll lives on a different axis depending on how the screen is rotated.
    let roll;
    switch (this.screenAngle) {
      case 90:
        roll = -beta;
        break;
      case 180:
        roll = -gamma;
        break;
      case 270:
      case -90:
        roll = beta;
        break;
      default:
        roll = gamma;
    }
    this.rawRoll = roll;

    const delta = roll - this.neutralRoll;
    const dead = Math.sign(delta) * Math.max(0, Math.abs(delta) - GyroSource.DEADZONE_DEG);
    const target = clamp(dead / GyroSource.RANGE_DEG, -1, 1);

    // Low-pass, otherwise sensor jitter reads as steering input.
    this.value += (target - this.value) * GyroSource.SMOOTHING;
  };
}
