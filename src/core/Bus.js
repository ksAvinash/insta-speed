/** Minimal pub/sub so the sim, UI and audio can stay unaware of each other. */
export class Bus {
  #handlers = new Map();

  /** @param {string} event @param {(payload?: any) => void} fn */
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  /** @param {string} event @param {(payload?: any) => void} fn */
  off(event, fn) {
    this.#handlers.get(event)?.delete(fn);
  }

  /** @param {string} event @param {any} [payload] */
  emit(event, payload) {
    const set = this.#handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}

export const bus = new Bus();
