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

  minLaunchKph: 200,
  maxLaunchKph: 600,
  // The one vehicle in the roster that takes the full extension. Downforce
  // scales with v^2, so the faster it launches the harder it can brake, and at
  // 900 km/h on packed snow it still holds a lane inside a metre. What actually
  // gates it is heat: on stock rotors a 900 km/h stop cooks to 2,180 °C and
  // needs 2,038 m, against 1,583 m once the brakes are fitted.
  speedTiers: [700, 800, 900],
  model: '/models/hyper-gt.glb',
  body: {
    parts: [
      // Main tub
      { shape: 'box', size: [1.95, 0.42, 4.5], pos: [0, 0.44, 0], color: 0xd81f36 },
      // Side sills
      { shape: 'box', size: [2.08, 0.14, 3.6], pos: [0, 0.28, 0.1], color: 0xb01828, role: 'matte' },
      // Cabin / canopy glass
      { shape: 'wedge', size: [1.55, 0.42, 1.85], pos: [0, 0.86, -0.05], color: 0x6a8aaa, glass: true, opacity: 0.42 },
      // Cabin frame
      { shape: 'wedge', size: [1.62, 0.12, 2.0], pos: [0, 1.05, -0.12], color: 0x1a1e24, role: 'trim' },
      // Nose splitter
      { shape: 'box', size: [2.02, 0.08, 0.72], pos: [0, 0.18, 2.08], color: 0x12141a, role: 'trim' },
      // Front bumper lip
      { shape: 'box', size: [1.85, 0.16, 0.35], pos: [0, 0.32, 2.15], color: 0xc41c30 },
      // Rear diffuser
      { shape: 'box', size: [1.78, 0.12, 0.55], pos: [0, 0.2, -2.15], color: 0x12141a, role: 'trim' },
      // Rear wing blade
      { shape: 'box', size: [1.72, 0.07, 0.42], pos: [0, 1.06, -2.0], color: 0x14161a, role: 'trim' },
      // Wing endplates
      { shape: 'box', size: [0.08, 0.34, 0.32], pos: [0.78, 0.92, -1.98], color: 0x14161a, role: 'trim' },
      { shape: 'box', size: [0.08, 0.34, 0.32], pos: [-0.78, 0.92, -1.98], color: 0x14161a, role: 'trim' },
      // Mirrors
      { shape: 'box', size: [0.22, 0.08, 0.14], pos: [0.92, 0.78, 0.55], color: 0x1a1e24, role: 'trim' },
      { shape: 'box', size: [0.22, 0.08, 0.14], pos: [-0.92, 0.78, 0.55], color: 0x1a1e24, role: 'trim' },
      // Roof stripe
      { shape: 'box', size: [0.22, 0.04, 1.6], pos: [0, 1.08, -0.2], color: 0xf0f0f4, role: 'matte' },
      // Headlight bar
      { shape: 'box', size: [1.35, 0.07, 0.22], pos: [0, 0.58, 2.18], color: 0xf2f2f2, emissive: 0xfff0c0 },
      // Side intakes
      { shape: 'box', size: [0.12, 0.22, 0.55], pos: [0.98, 0.52, 0.35], color: 0x0e1014, role: 'matte' },
      { shape: 'box', size: [0.12, 0.22, 0.55], pos: [-0.98, 0.52, 0.35], color: 0x0e1014, role: 'matte' },
    ],
    wheels: {
      radius: 0.35,
      width: 0.33,
      track: 1.68,
      front: 1.42,
      rear: -1.42,
      color: 0x16181c,
      rimColor: 0xb0b6c0,
    },
    brakeLights: { y: 0.62, z: -2.28, track: 0.72, size: [0.32, 0.1, 0.08] },
  },
};
