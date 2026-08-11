/**
 * Fifteen tonnes, no ABS, and rotors that cook long before the truck stops.
 * The energy dump is so large that brake fade — not grip — is what actually
 * limits you. Lock it up and it takes half a kilometre.
 * @type {import('../registry.js').VehicleSpec}
 */
export default {
  id: 'semi-truck',
  name: 'Haulmaster 900',
  class: 'Heavy truck',
  blurb: 'No ABS, and the rotors cook long before it stops. Fade is the enemy.',

  mass: 15000,
  massDistribution: 0.38,
  wheelbase: 4.2,
  cgHeight: 1.28,
  wheelRadius: 0.52,
  unsprungMassPerAxle: 620,

  frontalArea: 9.2,
  dragCoefficient: 0.62,
  liftCoefficient: 0.1,
  sideArea: 26,
  aeroSideOffset: 0.6,
  maxSteerAngle: 0.36,

  brake: { maxTorque: 78000, bias: 0.42, abs: false, rotorMass: 84, fadeTempC: 460 },
  tire: { compound: 'truck', B: 8, C: 1.75, D: 0.85, E: 0.98 },

  minLaunchKph: 100,
  maxLaunchKph: 300,
  // One rung, and only on the finished truck. Fifteen tonnes on packed snow is
  // the pairing that runs out of road first: at 400 km/h the judgement window
  // has already stretched to 4.5 s because the stop alone eats 1,435 m, and
  // anything beyond that is a wait rather than a run.
  speedTiers: [300, 300, 400],
  model: '/models/semi-truck.glb',
  body: {
    parts: [
      // Trailer box
      { shape: 'box', size: [2.5, 2.1, 5.6], pos: [0, 1.75, -0.9], color: 0xe8e8ec },
      // Trailer ribs
      { shape: 'box', size: [2.52, 0.08, 5.5], pos: [0, 2.75, -0.9], color: 0xd0d0d6, role: 'matte' },
      { shape: 'box', size: [2.52, 0.08, 5.5], pos: [0, 0.78, -0.9], color: 0xc8c8ce, role: 'matte' },
      // Cab
      { shape: 'box', size: [2.44, 1.55, 2.35], pos: [0, 1.55, 2.05], color: 0xc4242c },
      // Cab roof fairing
      { shape: 'wedge', size: [2.3, 0.45, 1.4], pos: [0, 2.55, 1.7], color: 0xa81e26 },
      // Windscreen
      { shape: 'box', size: [2.1, 0.85, 0.08], pos: [0, 1.95, 3.15], color: 0x6a90b0, glass: true, opacity: 0.4 },
      // Grille
      { shape: 'box', size: [2.0, 0.7, 0.12], pos: [0, 1.15, 3.2], color: 0x1b1f26, role: 'trim' },
      // Bumper
      { shape: 'box', size: [2.56, 0.45, 0.45], pos: [0, 0.55, 3.2], color: 0x2a2e36, role: 'trim' },
      // Side fuel tanks
      { shape: 'cylinder', size: [0.28, 0.28, 1.4], pos: [1.15, 0.95, 0.6], color: 0x9aa0a8, role: 'trim', rot: [0, 0, Math.PI / 2] },
      { shape: 'cylinder', size: [0.28, 0.28, 1.4], pos: [-1.15, 0.95, 0.6], color: 0x9aa0a8, role: 'trim', rot: [0, 0, Math.PI / 2] },
      // Exhaust stack
      { shape: 'cylinder', size: [0.14, 0.14, 1.7], pos: [1.15, 2.55, 0.95], color: 0x9aa0a8, role: 'trim' },
      // Door lines
      { shape: 'box', size: [0.04, 1.1, 1.2], pos: [1.24, 1.5, 2.0], color: 0xa01c24, role: 'matte' },
      { shape: 'box', size: [0.04, 1.1, 1.2], pos: [-1.24, 1.5, 2.0], color: 0xa01c24, role: 'matte' },
      // Headlights
      { shape: 'box', size: [0.55, 0.18, 0.12], pos: [0.75, 0.95, 3.28], color: 0xf2f2f2, emissive: 0xfff0c0 },
      { shape: 'box', size: [0.55, 0.18, 0.12], pos: [-0.75, 0.95, 3.28], color: 0xf2f2f2, emissive: 0xfff0c0 },
      // Trailer landing gear stub
      { shape: 'box', size: [0.15, 0.55, 0.15], pos: [0.9, 0.55, 0.4], color: 0x3a3e46, role: 'matte' },
      { shape: 'box', size: [0.15, 0.55, 0.15], pos: [-0.9, 0.55, 0.4], color: 0x3a3e46, role: 'matte' },
    ],
    wheels: {
      radius: 0.52,
      width: 0.38,
      track: 2.1,
      front: 2.1,
      rear: -1.9,
      color: 0x131316,
      rimColor: 0x6a7078,
    },
    brakeLights: { y: 1.15, z: -3.65, track: 1.0, size: [0.4, 0.16, 0.1] },
  },
};
