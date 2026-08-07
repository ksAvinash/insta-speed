/**
 * Frozen arctic strip. Sub-zero grip, dense cold air, and a crosswind that
 * keeps nudging you onto the ice patches off the centreline.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'glacial-runway',
  name: 'Svalbard Polar Strip',
  blurb: 'Frozen tarmac under twilight. Sub-zero grip makes ABS panic and locking wheels fatal.',

  surface: 'ice_tarmac',
  gripMultiplier: 0.45,
  airDensity: 1.38,
  crosswind: 3.8,
  ambientTempC: -18,
  scoreMultiplier: 1.45,

  roadWidth: 18.0,
  wallOffset: 30.0,

  sky: { top: 0x0c192c, bottom: 0x2d4a68 },
  fog: { color: 0x3b5f7e, density: 0.003 },
  sun: { color: 0x93c5fd, intensity: 0.5, position: [-0.8, 0.1, -0.5] },
  ground: { color: 0xdbeafe, accent: 0x93c5fd },
  road: { color: 0x1e293b, secondary: 0x475569 },
  props: [
    {
      type: 'runway_light',
      spacing: 20,
      lateral: 9.5,
      height: 0.4,
      color: 0xfbfb24,
      bothSides: true,
      emissive: true,
    },
    {
      type: 'snow_bank',
      spacing: 40,
      lateral: 10.0,
      height: 1.5,
      color: 0xf8fafc,
      bothSides: true,
    },
  ],
};
