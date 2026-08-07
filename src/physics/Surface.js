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
  polished_concrete: {
    label: 'Polished concrete',
    grip: 1.0,
    rollingResistance: 0.011,
    smokeColor: '#d8dce0',
  },
  salt: { label: 'Salt flat', grip: 0.88, rollingResistance: 0.02, smokeColor: '#f2efe6' },
  wet: { label: 'Wet tarmac', grip: 0.65, rollingResistance: 0.015, smokeColor: '#b4bcc4' },
  dry_cracked_asphalt: {
    label: 'Cracked asphalt',
    grip: 1.0,
    rollingResistance: 0.015,
    smokeColor: '#c4b8a8',
  },
  gravel: { label: 'Gravel', grip: 0.55, rollingResistance: 0.035, smokeColor: '#a8988a' },
  snow: { label: 'Packed snow', grip: 0.32, rollingResistance: 0.045, smokeColor: '#ffffff' },
  ice_tarmac: {
    label: 'Icy tarmac',
    grip: 1.0,
    rollingResistance: 0.014,
    smokeColor: '#e8f0f8',
  },
  ice: { label: 'Ice', grip: 0.15, rollingResistance: 0.01, smokeColor: '#e8f4ff' },
  carbon_mesh: {
    label: 'Carbon mesh',
    grip: 1.0,
    rollingResistance: 0.01,
    smokeColor: '#a8b0c0',
  },
};

export const DEFAULT_SURFACE = SURFACES.tarmac;

/** @param {string} id */
export function getSurface(id) {
  return SURFACES[id] ?? DEFAULT_SURFACE;
}
