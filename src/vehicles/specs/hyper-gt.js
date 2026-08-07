/**
 * Downforce is the story here: at launch speed the wings press roughly three
 * tonnes onto the tyres, so it brakes hardest when it is going fastest and the
 * grip falls away as it slows. Braking late feels amazing and ends badly.
 * @type {import('../registry.js').VehicleSpec}
 */
export default {
  id: 'hyper-gt',
  name: 'Vector GT-R',
  class: 'Hypercar',
  blurb: 'Carbon-ceramics and three tonnes of downforce. Grip fades as you slow.',

  mass: 1560,
  massDistribution: 0.42,
  wheelbase: 2.7,
  cgHeight: 0.36,
  wheelRadius: 0.35,
  unsprungMassPerAxle: 48,

  frontalArea: 1.9,
  dragCoefficient: 0.32,
  liftCoefficient: -1.1,
  aeroBalance: 0.45,
  sideArea: 4.2,
  maxSteerAngle: 0.4,

  brake: { maxTorque: 16000, bias: 0.68, abs: true, rotorMass: 19, fadeTempC: 720, absHz: 18 },
  tire: { compound: 'semi-slick', B: 11, C: 1.9, D: 1.35, E: 0.97 },

  maxLaunchKph: 600,
  // The one vehicle in the roster that takes the full extension. Downforce
  // scales with v^2, so the faster it launches the harder it can brake, and at
  // 900 km/h on packed snow it still holds a lane inside a metre. What actually
  // gates it is heat: on stock rotors a 900 km/h stop cooks to 2,180 °C and
  // needs 2,038 m, against 1,583 m once the brakes are fitted.
  speedTiers: [700, 800, 900],
  model: null,
  body: {
    parts: [
      { shape: 'box', size: [1.95, 0.42, 4.5], pos: [0, 0.44, 0], color: 0xd81f36 },
      { shape: 'wedge', size: [1.62, 0.46, 2.0], pos: [0, 0.83, -0.15], color: 0x2b2f36 },
      { shape: 'box', size: [2.02, 0.1, 0.7], pos: [0, 0.2, 2.05], color: 0x14161a },
      { shape: 'box', size: [1.72, 0.07, 0.42], pos: [0, 1.06, -2.0], color: 0x14161a },
      { shape: 'box', size: [0.08, 0.32, 0.3], pos: [0.72, 0.9, -1.98], color: 0x14161a },
      { shape: 'box', size: [0.08, 0.32, 0.3], pos: [-0.72, 0.9, -1.98], color: 0x14161a },
      { shape: 'box', size: [1.3, 0.06, 0.5], pos: [0, 0.66, 2.12], color: 0xf2f2f2, emissive: 0xfff0c0 },
    ],
    wheels: { radius: 0.35, width: 0.33, track: 1.68, front: 1.42, rear: -1.42, color: 0x16181c },
  },
};
