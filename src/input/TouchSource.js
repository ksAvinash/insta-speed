/**
 * Touch controls.
 *
 * Brake is a hold anywhere that is not a steering pad, which keeps the target
 * enormous on a phone. Steering pads only appear when the gyroscope is
 * unavailable or refused, so the game stays playable either way.
 */
export class TouchSource {
  constructor() {
    this.brake = false;
    this.left = false;
    this.right = false;
    this.available = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    /** @type {Map<number, 'brake'|'left'|'right'>} */
    this.pointers = new Map();
  }

  /**
   * @param {HTMLElement} surface element covering the play area
   * @param {{ left: HTMLElement, right: HTMLElement }} pads
   */
  attach(surface, pads) {
    const claim = (id, role) => {
      this.pointers.set(id, role);
      this.#sync();
    };
    const release = (id) => {
      this.pointers.delete(id);
      this.#sync();
    };

    const bind = (el, role) => {
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture?.(e.pointerId);
        claim(e.pointerId, role);
        e.preventDefault();
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
        el.addEventListener(type, (e) => release(e.pointerId));
      }
    };

    bind(surface, 'brake');
    bind(pads.left, 'left');
    bind(pads.right, 'right');

    // A pointer lost outside the window would otherwise stick the brake on.
    window.addEventListener('blur', () => {
      this.pointers.clear();
      this.#sync();
    });
  }

  #sync() {
    const roles = new Set(this.pointers.values());
    this.brake = roles.has('brake');
    this.left = roles.has('left');
    this.right = roles.has('right');
  }
}
