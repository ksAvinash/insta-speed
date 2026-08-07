import * as THREE from 'three';

/**
 * Quality tiers. The renderer starts on a guess from the device profile and
 * `Renderer.probe()` demotes it if the measured framerate cannot keep up, so a
 * mid-range phone degrades gracefully instead of crawling.
 */
export const QUALITY = {
  low: {
    pixelRatio: 1,
    shadows: false,
    propDistance: 500,
    smoke: 120,
    streaks: 40,
    contactShadow: false,
    exposure: 1.0,
    antialias: false,
  },
  medium: {
    pixelRatio: 1.5,
    shadows: false,
    propDistance: 900,
    smoke: 300,
    streaks: 70,
    contactShadow: false,
    exposure: 1.05,
    antialias: true,
  },
  high: {
    pixelRatio: 2,
    shadows: true,
    propDistance: 1600,
    smoke: 700,
    streaks: 100,
    contactShadow: true,
    exposure: 1.08,
    antialias: true,
  },
};

function guessTier() {
  // Dev override: ?tier=low|medium|high for A/B perf checks.
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const forced = new URLSearchParams(location.search).get('tier');
    if (forced && forced in QUALITY) return /** @type {keyof typeof QUALITY} */ (forced);
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;
  if (coarse && (cores <= 4 || memory <= 3)) return 'low';
  if (coarse) return 'medium';
  return cores >= 8 ? 'high' : 'medium';
}

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.tierName = guessTier();
    this.quality = QUALITY[this.tierName];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.quality.exposure ?? 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);

    this.#frames = 0;
    this.#accum = 0;
    this.#probed = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    screen.orientation?.addEventListener('change', () => setTimeout(() => this.resize(), 100));
  }

  #frames;
  #accum;
  #probed;

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    // Portrait phones get a wider vertical FOV so the road ahead stays visible.
    // `designFov` is the resting value the chase rig boosts away from — reading
    // it back off the camera would let each run's boost ratchet the next one.
    this.designFov = this.camera.aspect < 1 ? 74 : 60;
    this.camera.fov = this.designFov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Watches the first second of frames and drops a tier if the device is
   * clearly struggling. Runs once.
   * @param {number} frameDt
   */
  probe(frameDt) {
    if (this.#probed) return;
    this.#frames++;
    this.#accum += frameDt;
    if (this.#frames < 40) return;

    this.#probed = true;
    const fps = this.#frames / this.#accum;
    if (fps < 45 && this.tierName !== 'low') {
      this.setTier(this.tierName === 'high' ? 'medium' : 'low');
    }
  }

  /** @param {keyof QUALITY} name */
  setTier(name) {
    this.tierName = name;
    this.quality = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.toneMappingExposure = this.quality.exposure ?? 1.05;
    this.onTierChange?.(name, this.quality);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Live GPU stats for the dev overlay — cheap to sample. */
  get info() {
    return this.renderer.info;
  }

  dispose() {
    this.renderer.dispose();
  }
}
