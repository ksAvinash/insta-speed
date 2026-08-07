/**
 * Perfect sunny day on open tarmac — deep blue sky, warm gold sun, green
 * canopy flashing past. High grip, honest air, the purest “feel the speed”
 * stage in the set.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'pacific-day',
  name: 'Pacific Clearway',
  blurb:
    'Cloudless blue, hot gold sun, and sticky tarmac. Wide and honest — pure speed under a perfect sky.',

  surface: 'tarmac',
  gripMultiplier: 1.05,
  airDensity: 1.2,
  // Kept gentle — a fully-built superbike unloads its rear under hard braking
  // and even a light shear will walk it off a narrow strip at 500 km/h.
  crosswind: 0.55,
  ambientTempC: 28,
  scoreMultiplier: 1.0,

  roadWidth: 22,
  wallOffset: 40,

  // Classic clear day: deep zenith, pale horizon haze.
  sky: { top: 0x1e6fff, bottom: 0xc8e4ff },
  fog: { color: 0xd4e8ff, density: 0.00035 },
  sun: { color: 0xfff2d0, intensity: 2.15, position: [0.35, 0.88, -0.2] },
  ground: { color: 0x3d5c38, accent: 0x5a7a42 },
  road: { color: 0x2a2e34, secondary: 0x3a4048 },

  props: [
    {
      type: 'tree',
      spacing: 28,
      lateral: 13,
      height: 6.2,
      color: 0x2f6b3a,
      bothSides: true,
      scatter: 8,
      scale: 1.2,
    },
    {
      type: 'tree',
      spacing: 52,
      lateral: 20,
      height: 4.8,
      color: 0x3f8a4a,
      bothSides: true,
      scatter: 12,
      scale: 0.9,
    },
    {
      type: 'distance_marker',
      spacing: 100,
      lateral: 11.5,
      height: 1.6,
      color: 0xf2f2f0,
      bothSides: true,
    },
    {
      type: 'windsock',
      spacing: 380,
      lateral: 12,
      height: 5.2,
      color: 0xff6b2c,
      bothSides: false,
    },
  ],
};
