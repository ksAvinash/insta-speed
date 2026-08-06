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

  launchSpeedKph: 320,
  model: null,
  body: {
    parts: [
      { shape: 'box', size: [2.5, 2.1, 5.6], pos: [0, 1.75, -0.9], color: 0xe8e8ec },
      { shape: 'box', size: [2.44, 1.5, 2.3], pos: [0, 1.5, 2.0], color: 0xc4242c },
      { shape: 'box', size: [2.3, 0.9, 0.2], pos: [0, 1.9, 3.05], color: 0x1b1f26 },
      { shape: 'box', size: [2.56, 0.5, 0.5], pos: [0, 0.5, 3.15], color: 0x2a2e36 },
      { shape: 'cylinder', size: [0.16, 0.16, 1.6], pos: [1.1, 2.6, 0.9], color: 0x9aa0a8 },
      { shape: 'box', size: [1.6, 0.22, 0.3], pos: [0, 0.75, 3.2], color: 0xf2f2f2, emissive: 0xfff0c0 },
    ],
    wheels: { radius: 0.52, width: 0.38, track: 2.1, front: 2.1, rear: -1.9, color: 0x131316 },
  },
};
