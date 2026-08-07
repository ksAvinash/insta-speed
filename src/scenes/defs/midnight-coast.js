/**
 * Night coastal highway — moonlit asphalt, warm sodium lamps, cat-eye beads.
 * Cool dense air, honest grip, just enough breeze to keep you honest.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'midnight-coast',
  name: 'Midnight Coastline',
  blurb:
    'Moonlit coastal strip under sodium lamps. Cool dense air, clean grip, amber beads racing past in the dark.',

  surface: 'tarmac',
  gripMultiplier: 1.02,
  airDensity: 1.28,
  // Coastal night breeze — enough to feel, not enough to spin a braking bike.
  crosswind: 0.75,
  ambientTempC: 11,
  scoreMultiplier: 1.1,

  roadWidth: 20,
  wallOffset: 32,

  // Deep indigo zenith → violet horizon; cold moonlight from high and left.
  sky: { top: 0x050816, bottom: 0x1a2744 },
  fog: { color: 0x0c1220, density: 0.0011 },
  sun: { color: 0xc8d8ff, intensity: 0.55, position: [-0.55, 0.72, -0.35] },
  ground: { color: 0x0a0e16, accent: 0x141c2a },
  // Dark night asphalt with warm edge markers so the lane still reads.
  road: { color: 0x14181f, secondary: 0xf0a020 },

  props: [
    {
      // Warm street lamps marching into the night.
      type: 'hazard_strobe',
      spacing: 55,
      lateral: 11.2,
      height: 5.2,
      color: 0xffb347,
      bothSides: true,
      emissive: true,
    },
    {
      type: 'lamp',
      spacing: 55,
      lateral: 11.2,
      height: 5.35,
      color: 0xffcc66,
      bothSides: true,
      emissive: true,
    },
    {
      // Cat-eye reflectors — the speed bead line at night.
      type: 'cat_eye_led',
      spacing: 8,
      lateral: 9.8,
      height: 0.12,
      color: 0xffe08a,
      bothSides: true,
      emissive: true,
    },
    {
      type: 'runway_light',
      spacing: 22,
      lateral: 10.1,
      height: 0.28,
      color: 0x88ccff,
      bothSides: true,
      emissive: true,
    },
  ],
};
