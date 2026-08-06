/**
 * The tutorial venue: flat, bright, endless, and forgiving. Thin desert air
 * means slightly less aerodynamic drag helping you slow down.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'salt-flats',
  name: 'Bonneville Salt Flats',
  blurb: 'Flat, bright and endless. Thin air, so drag helps you less than usual.',

  surface: 'salt',
  gripMultiplier: 1,
  airDensity: 1.1,
  // Dead calm on purpose: this is where players learn to judge a braking point
  // without also fighting to hold a lane.
  crosswind: 0,
  ambientTempC: 34,

  targetFactor: 1.35,
  roadWidth: 26,
  wallOffset: 45,

  sky: { top: 0x2f6fd0, bottom: 0xbfe0f5 },
  fog: { color: 0xdff0fb, density: 0.00035 },
  sun: { color: 0xfff6e0, intensity: 2.6, position: [-0.4, 0.8, 0.35] },
  ground: { color: 0xf0ece0, accent: 0xdcd6c4 },
  // Deliberately darker than the salt around it. Leaving the road is a fail
  // condition, so its edges have to be unmistakable.
  road: { color: 0xb9b09a, secondary: 0xa39a84 },
  props: [
    { type: 'post', spacing: 100, lateral: 17, height: 3.2, color: 0xd94b2b, bothSides: true },
    { type: 'rock', spacing: 220, lateral: 40, scatter: 24, scale: 1.6, color: 0xb8ad97 },
  ],
};
