/**
 * Road surface properties. A scene names a surface; the sim looks up grip and
 * rolling resistance here. Grip multiplies the tyre's peak friction coefficient.
 */

/**
 * @typedef {object} Surface
 * @property {string} label
 * @property {number} grip multiplier applied to tyre peak mu
 * @property {number} rollingResistance Crr
 * @property {string} smokeColor particle tint for lock-up
 */

/** @type {Record<string, Surface>} */
export const SURFACES = {
  tarmac: { label: 'Tarmac', grip: 1.0, rollingResistance: 0.012, smokeColor: '#c8c8cc' },
  concrete: { label: 'Concrete', grip: 1.02, rollingResistance: 0.013, smokeColor: '#d2d2d4' },
  salt: { label: 'Salt flat', grip: 0.88, rollingResistance: 0.02, smokeColor: '#f2efe6' },
  wet: { label: 'Wet tarmac', grip: 0.65, rollingResistance: 0.015, smokeColor: '#b4bcc4' },
  gravel: { label: 'Gravel', grip: 0.55, rollingResistance: 0.035, smokeColor: '#a8988a' },
  snow: { label: 'Packed snow', grip: 0.32, rollingResistance: 0.045, smokeColor: '#ffffff' },
  ice: { label: 'Ice', grip: 0.15, rollingResistance: 0.01, smokeColor: '#e8f4ff' },
};

export const DEFAULT_SURFACE = SURFACES.tarmac;

/** @param {string} id */
export function getSurface(id) {
  return SURFACES[id] ?? DEFAULT_SURFACE;
}
