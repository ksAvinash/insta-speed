/**
 * Driving rain on dark tarmac — low cloud, mist, wet grip, a side-gust that
 * never quite leaves you alone. Looks heavy; plays fair if you brake early.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'monsoon-run',
  name: 'Monsoon Approach',
  blurb:
    'Sheets of rain on blacktop. Low cloud, mist, slick grip — stand on the pedal late and the ABS will beg.',

  surface: 'wet',
  gripMultiplier: 1.0,
  airDensity: 1.3,
  // Rain shear is the character — road is wider so a braking bike still holds.
  crosswind: 1.6,
  ambientTempC: 16,
  scoreMultiplier: 1.25,

  roadWidth: 22,
  wallOffset: 34,

  // Storm slate: charcoal zenith, bruised steel horizon.
  sky: { top: 0x1a2230, bottom: 0x5a6a7c },
  fog: { color: 0x6a7888, density: 0.0032 },
  // Weak, diffuse daylight through cloud cover.
  sun: { color: 0xb8c4d0, intensity: 0.65, position: [0.15, 0.85, 0.25] },
  ground: { color: 0x2a3038, accent: 0x3a4450 },
  // Glossy wet blacktop — secondary is the pale rain-sheen streak.
  road: { color: 0x1a1e24, secondary: 0x6a7a8c },

  props: [
    {
      type: 'hazard_strobe',
      spacing: 70,
      lateral: 12,
      height: 3.6,
      color: 0xff5533,
      bothSides: true,
      emissive: true,
    },
    {
      type: 'windsock',
      spacing: 220,
      lateral: 14,
      height: 4.8,
      color: 0xe85d04,
      bothSides: false,
    },
    {
      // Dark roadside trees — silhouettes in the rain mist.
      type: 'tree',
      spacing: 45,
      lateral: 16,
      height: 5.5,
      color: 0x1e2a24,
      bothSides: true,
      scatter: 6,
      scale: 1.15,
    },
    {
      type: 'cat_eye_led',
      spacing: 12,
      lateral: 10.8,
      height: 0.1,
      color: 0xaaccff,
      bothSides: true,
      emissive: true,
    },
  ],
};
