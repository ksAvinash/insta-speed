/**
 * Light, no aero, honest road tyres. The friendly one — it stops in a sensible
 * distance and the ABS is forgiving, which makes it the yardstick for the rest
 * of the roster.
 * @type {import('../registry.js').VehicleSpec}
 */
export default {
  id: 'rally-hatch',
  name: 'Kestrel RS',
  class: 'Hot hatch',
  blurb: 'Light, no aero, honest tyres. The benchmark car.',

  mass: 1180,
  massDistribution: 0.61,
  wheelbase: 2.52,
  cgHeight: 0.52,
  wheelRadius: 0.31,
  unsprungMassPerAxle: 40,

  frontalArea: 2.15,
  dragCoefficient: 0.33,
  liftCoefficient: 0.05,
  sideArea: 4.0,
  maxSteerAngle: 0.46,

  brake: { maxTorque: 6000, bias: 0.64, abs: true, rotorMass: 14, fadeTempC: 560, absHz: 14 },
  tire: { compound: 'road', B: 10, C: 1.9, D: 1.15, E: 0.97 },

  maxLaunchKph: 420,
  model: null,
  body: {
    parts: [
      { shape: 'box', size: [1.76, 0.62, 3.9], pos: [0, 0.6, 0], color: 0x2f7fe0 },
      { shape: 'box', size: [1.62, 0.62, 2.1], pos: [0, 1.16, -0.25], color: 0x2b6ec4 },
      { shape: 'box', size: [1.5, 0.42, 1.5], pos: [0, 1.2, -0.1], color: 0x1b2530 },
      { shape: 'box', size: [1.66, 0.06, 0.34], pos: [0, 1.5, -1.28], color: 0x1b2530 },
      { shape: 'box', size: [1.2, 0.06, 0.4], pos: [0, 0.78, 1.86], color: 0xf2f2f2, emissive: 0xfff0c0 },
    ],
    wheels: { radius: 0.31, width: 0.24, track: 1.52, front: 1.28, rear: -1.24, color: 0x18181c },
  },
};
