/**
 * Enclosed concrete. No wind and the best grip in the game, but the walls
 * rushing past make the speed read far higher than it does in the open, which
 * is exactly what wrecks your judgement of when to start braking.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'tunnel',
  name: 'Vollmer Tunnel',
  blurb: 'Best grip in the game. The walls make you brake far too early.',

  surface: 'concrete',
  gripMultiplier: 1,
  airDensity: 1.225,
  crosswind: 0,
  ambientTempC: 16,

  // Narrow, but calm — a small premium for the walls being that close.
  scoreMultiplier: 1.05,

  roadWidth: 10.5,
  wallOffset: 30,
  tunnel: true,

  sky: { top: 0x05070a, bottom: 0x0d1117 },
  fog: { color: 0x0b0e13, density: 0.0022 },
  sun: { color: 0xbfd4ff, intensity: 0.5, position: [0.2, 1, -0.3] },
  ground: { color: 0x2a2e35, accent: 0x1c2027 },
  road: { color: 0x3a3f47, secondary: 0x2c3037 },
  props: [
    { type: 'lamp', spacing: 24, lateral: 0, height: 6.2, color: 0xffe9b0, emissive: true },
    { type: 'post', spacing: 12, lateral: 6.4, height: 1.1, color: 0xf5d13a, bothSides: true },
  ],
};
