/**
 * Endless white salt under a searing sky — the classic speed-record stage.
 * Huge margin, thin dry air, heat that cooks the rotors if you sit on the pedal.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'salt-flats',
  name: 'White Horizon',
  blurb:
    'Blinding salt to the edge of the earth. Thin air, heat fade, and a track so wide the world feels infinite.',

  surface: 'salt',
  gripMultiplier: 0.9,
  airDensity: 1.12,
  crosswind: 1.6,
  ambientTempC: 44,
  scoreMultiplier: 1.05,

  // Wide enough that lateral drama is rare — the story is heat and distance.
  roadWidth: 42,
  wallOffset: 100,

  // Bleached desert sky: hard blue zenith, white-hot horizon.
  sky: { top: 0x3a8de0, bottom: 0xf4fbff },
  fog: { color: 0xe8f4ff, density: 0.00028 },
  sun: { color: 0xfff6e8, intensity: 2.35, position: [0.08, 0.92, -0.18] },
  ground: { color: 0xf4f7f8, accent: 0xe2e8ec },
  // Road sits slightly cooler/grey than the salt so edges stay readable.
  road: { color: 0xb8c4cc, secondary: 0xe8a020 },

  props: [
    {
      type: 'distance_marker',
      spacing: 100,
      lateral: 22,
      height: 2.0,
      color: 0xe85d04,
      bothSides: true,
    },
    {
      type: 'timing_tower',
      spacing: 600,
      lateral: 38,
      height: 14,
      color: 0x64748b,
      bothSides: false,
      scale: 1.1,
    },
    {
      type: 'radar_dish',
      spacing: 900,
      lateral: 48,
      height: 16,
      color: 0x94a3b8,
      bothSides: false,
    },
    {
      // Sparse dark rocks break the white infinity.
      type: 'rock',
      spacing: 80,
      lateral: 28,
      height: 1.2,
      color: 0x8a9098,
      bothSides: true,
      scatter: 18,
      scale: 1.4,
    },
  ],
};
