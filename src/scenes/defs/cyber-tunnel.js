/**
 * Claustrophobic subterranean tube. No wind, dense cool air, and walls close
 * enough that any lateral error is instant failure — the judgement test.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'cyber-tunnel',
  name: 'Tokai Sub-Level 4',
  blurb: 'Claustrophobic concrete tube. No crosswind, dense chill air, zero room for error.',

  surface: 'polished_concrete',
  gripMultiplier: 1.1,
  airDensity: 1.35,
  crosswind: 0.0,
  ambientTempC: 12,
  scoreMultiplier: 1.15,

  roadWidth: 10.5,
  wallOffset: 12.0,
  tunnel: true,

  sky: { top: 0x05050a, bottom: 0x0a0a14 },
  fog: { color: 0x0f172a, density: 0.0025 },
  sun: { color: 0x38bdf8, intensity: 0.4, position: [0.0, 1.0, 0.0] },
  ground: { color: 0x0f172a, accent: 0x1e293b },
  road: { color: 0x1e1e24, secondary: 0x06b6d4 },
  props: [
    {
      type: 'neon_arch',
      spacing: 60,
      lateral: 6.0,
      height: 6.5,
      color: 0x06b6d4,
      bothSides: true,
      emissive: true,
    },
    {
      type: 'cat_eye_led',
      spacing: 5,
      lateral: 5.3,
      height: 0.1,
      color: 0xf43f5e,
      bothSides: true,
      emissive: true,
    },
  ],
};
