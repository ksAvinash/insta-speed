import { GyroSource } from './GyroSource.js';
import { KeyboardSource } from './KeyboardSource.js';
import { TouchSource } from './TouchSource.js';
import { clamp } from '../physics/constants.js';

/** Seconds for a digital press to reach full brake / full lock. */
const BRAKE_RISE = 0.18;
const BRAKE_FALL = 0.12;
const STEER_RISE = 0.25;
const STEER_RETURN = 0.16;

/**
 * Collapses every input device into one `{ steer, brake }` pair.
 *
 * Digital sources are ramped rather than applied instantly, so a keyboard or a
 * screen tap still gives analogue brake pressure — holding, releasing and
 * re-applying (cadence braking) is a real technique rather than a binary switch.
 */
export class InputManager {
  constructor() {
    this.gyro = new GyroSource();
    this.keyboard = new KeyboardSource();
    this.touch = new TouchSource();

    this.steer = 0;
    this.brake = 0;
    this.value = { steer: 0, brake: 0 };
    this.gyroActive = false;
  }

  /**
   * @param {HTMLElement} surface
   * @param {{ left: HTMLElement, right: HTMLElement }} pads
   */
  attach(surface, pads) {
    this.keyboard.attach();
    this.touch.attach(surface, pads);
  }

  /** Called from a user gesture. @returns {Promise<'granted'|'denied'|'unsupported'>} */
  async enableGyro() {
    const status = await this.gyro.enable();
    this.gyroActive = status === 'granted';
    return status;
  }

  disableGyro() {
    this.gyro.disable();
    this.gyroActive = false;
  }

  /** Re-centre tilt steering on the player's current hold angle. */
  calibrate() {
    if (this.gyroActive) this.gyro.calibrate();
  }

  /** True when on-screen steering pads should be shown. */
  get needsSteerPads() {
    return this.touch.available && !this.gyroActive;
  }

  /**
   * @param {number} dt frame delta, seconds
   * @returns {{ steer: number, brake: number }}
   */
  update(dt) {
    const braking = this.keyboard.brake || this.touch.brake;
    const rate = braking ? dt / BRAKE_RISE : -dt / BRAKE_FALL;
    this.brake = clamp(this.brake + rate, 0, 1);

    // Tilt is already analogue, so it bypasses the ramp entirely.
    if (this.gyroActive) {
      this.steer = this.gyro.value;
    } else {
      const dir = (this.keyboard.right || this.touch.right ? 1 : 0) -
        (this.keyboard.left || this.touch.left ? 1 : 0);
      if (dir === 0) {
        const decay = dt / STEER_RETURN;
        this.steer = Math.abs(this.steer) <= decay ? 0 : this.steer - Math.sign(this.steer) * decay;
      } else {
        this.steer = clamp(this.steer + (dir * dt) / STEER_RISE, -1, 1);
      }
    }

    this.value.steer = this.steer;
    this.value.brake = this.brake;
    return this.value;
  }

  reset() {
    this.steer = 0;
    this.brake = 0;
    this.keyboard.reset();
    this.touch.pointers.clear();
  }
}
