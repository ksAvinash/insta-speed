/**
 * A twelve-tonne sail. The huge side area makes crosswind scenes genuinely
 * difficult — the bridge will push it clean out of its lane while you are busy
 * trying not to overshoot the line.
 * @type {import('../registry.js').VehicleSpec}
 */
export default {
  id: 'school-bus',
  name: 'District 12 Bus',
  class: 'Bus',
  blurb: 'A twelve-tonne sail. Crosswind will move it, and it will not hurry.',

  mass: 12000,
  massDistribution: 0.44,
  wheelbase: 5.4,
  cgHeight: 1.42,
  wheelRadius: 0.5,
  unsprungMassPerAxle: 480,

  frontalArea: 8.4,
  dragCoefficient: 0.68,
  liftCoefficient: 0.12,
  sideArea: 34,
  aeroSideOffset: 0.9,
  maxSteerAngle: 0.34,

  brake: { maxTorque: 60000, bias: 0.46, abs: false, rotorMass: 68, fadeTempC: 440 },
  tire: { compound: 'truck', B: 8, C: 1.8, D: 0.9, E: 0.98 },

  maxLaunchKph: 260,
  model: null,
  body: {
    parts: [
      { shape: 'box', size: [2.5, 2.2, 9.4], pos: [0, 1.72, 0], color: 0xf5c116 },
      { shape: 'box', size: [2.54, 0.5, 9.5], pos: [0, 2.6, 0], color: 0xe8b410 },
      { shape: 'box', size: [2.3, 1.0, 0.16], pos: [0, 2.0, 4.72], color: 0x1b1f26 },
      { shape: 'box', size: [0.14, 1.6, 8.6], pos: [1.26, 1.9, -0.2], color: 0x1b1f26 },
      { shape: 'box', size: [0.14, 1.6, 8.6], pos: [-1.26, 1.9, -0.2], color: 0x1b1f26 },
      { shape: 'box', size: [2.56, 0.4, 0.4], pos: [0, 0.62, 4.8], color: 0x2a2e36 },
      { shape: 'box', size: [1.7, 0.24, 0.3], pos: [0, 0.9, 4.82], color: 0xf2f2f2, emissive: 0xfff0c0 },
    ],
    wheels: { radius: 0.5, width: 0.34, track: 2.06, front: 3.0, rear: -2.4, color: 0x131316 },
  },
};
