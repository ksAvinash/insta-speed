/** Desktop controls: arrows or WASD to steer, Down/Space to brake. */
export class KeyboardSource {
  constructor() {
    this.left = false;
    this.right = false;
    this.brake = false;
    this.keys = new Set();
    this.onRestart = null;
  }

  attach() {
    window.addEventListener('keydown', this.#onDown);
    window.addEventListener('keyup', this.#onUp);
    // Releasing a key while the tab is hidden never fires keyup.
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.keys.clear();
    this.left = this.right = this.brake = false;
  }

  #sync() {
    const k = this.keys;
    this.left = k.has('ArrowLeft') || k.has('KeyA');
    this.right = k.has('ArrowRight') || k.has('KeyD');
    this.brake = k.has('ArrowDown') || k.has('KeyS') || k.has('Space');
  }

  // Arrow-function fields so the listener reference stays stable and removable.
  #onDown = (e) => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'KeyR') this.onRestart?.();
    this.keys.add(e.code);
    this.#sync();
    if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  };

  #onUp = (e) => {
    this.keys.delete(e.code);
    this.#sync();
  };
}
