/**
 * Packed snow at a third of tarmac grip, so stopping distances roughly triple
 * and ABS becomes the difference between a score and a spectacle. The cold air
 * does at least keep the rotors out of fade.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'snow-pass',
  name: 'Kirkenes Pass',
  blurb: 'A third of the grip. Distances triple and ABS becomes everything.',

  surface: 'snow',
  gripMultiplier: 1,
  airDensity: 1.32,
  crosswind: 5,
  ambientTempC: -8,

  // A third of the grip means the longest stops in the game — the best-paying
  // scene, and the one where brake upgrades show up most clearly.
  scoreMultiplier: 1.35,

  roadWidth: 14.7,
  wallOffset: 55,

  sky: { top: 0x8fa8c4, bottom: 0xdfe8f2 },
  fog: { color: 0xe4ecf4, density: 0.0016 },
  sun: { color: 0xfff2e2, intensity: 1.4, position: [-0.5, 0.4, 0.6] },
  ground: { color: 0xeef4fa, accent: 0xd6e2ee },
  road: { color: 0xd8e2ec, secondary: 0xc2cfdc },
  props: [
    { type: 'tree', spacing: 26, lateral: 16, scatter: 7, scale: 1.5, color: 0x1f3b2c, bothSides: true },
    { type: 'post', spacing: 40, lateral: 8.4, height: 2.6, color: 0xe04a2f, bothSides: true },
  ],
};
