/**
 * Wet deck and a vicious crosswind. Grip is down by a third and anything with
 * a big flank — the bus especially — gets shoved across its lane while you are
 * trying to place it on the line.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'coastal-bridge',
  name: 'Storm Deck Bridge',
  blurb: 'Wet deck, brutal crosswind. Anything with a flank gets shoved sideways.',

  surface: 'wet',
  gripMultiplier: 1,
  airDensity: 1.26,
  crosswind: 7,
  ambientTempC: 9,

  targetFactor: 1.3,
  roadWidth: 19,
  wallOffset: 40,

  sky: { top: 0x2b3644, bottom: 0x6d7c8c },
  fog: { color: 0x76858f, density: 0.0011 },
  sun: { color: 0xc8d4e0, intensity: 1.1, position: [0.6, 0.5, -0.5] },
  ground: { color: 0x2b3f4e, accent: 0x22333f },
  road: { color: 0x33383f, secondary: 0x272b31 },
  props: [
    { type: 'pylon', spacing: 180, lateral: 12.5, height: 34, color: 0xb2453a, bothSides: true },
    { type: 'post', spacing: 9, lateral: 10.2, height: 1.25, color: 0xdadfe4, bothSides: true },
  ],
};
