/**
 * Infinite, blinding salt. Built for pure speed tests: huge margin, thin air,
 * and heat that cooks the rotors once you start standing on the pedal.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'salt-flats',
  name: 'Bone Dry Salt Flat',
  blurb: 'Blinding white, endless track width. Low air resistance, but heat fade kills brakes early.',

  surface: 'salt',
  gripMultiplier: 0.85,
  airDensity: 1.15,
  crosswind: 1.2,
  ambientTempC: 42,
  scoreMultiplier: 1.0,

  roadWidth: 45.0,
  wallOffset: 120.0,

  sky: { top: 0x4a90e2, bottom: 0xe0f2fe },
  fog: { color: 0xdaf0ff, density: 0.0004 },
  sun: { color: 0xfff7e6, intensity: 1.8, position: [0.1, 0.9, -0.2] },
  ground: { color: 0xeef5f8, accent: 0xd8e3e8 },
  // Darker than the salt around it on purpose — leaving the road is a fail,
  // so the edges have to stay unmistakable even under whiteout glare.
  road: { color: 0xb7c4cc, secondary: 0xdf8800 },
  props: [
    {
      type: 'distance_marker',
      spacing: 100,
      lateral: 23.0,
      height: 1.8,
      color: 0xd97706,
      bothSides: true,
    },
    {
      type: 'timing_tower',
      spacing: 500,
      lateral: 35.0,
      height: 12.0,
      color: 0x475569,
      bothSides: false,
    },
  ],
};
