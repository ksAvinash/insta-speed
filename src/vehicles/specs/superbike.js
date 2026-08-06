/**
 * A tall centre of gravity on a very short wheelbase means load transfer is
 * violent: grab the front brake hard and the rear wheel unloads to nothing.
 * Enormous grip if you are smooth, and no margin at all if you are not.
 * @type {import('../registry.js').VehicleSpec}
 */
export default {
  id: 'superbike',
  name: 'Hornet 1000R',
  class: 'Superbike',
  blurb: 'Vicious load transfer. The rear goes light the moment you squeeze.',

  mass: 205,
  massDistribution: 0.52,
  wheelbase: 1.42,
  cgHeight: 0.62,
  wheelRadius: 0.32,
  unsprungMassPerAxle: 14,

  frontalArea: 0.62,
  dragCoefficient: 0.58,
  liftCoefficient: 0.02,
  sideArea: 1.0,
  maxSteerAngle: 0.5,

  brake: { maxTorque: 1800, bias: 0.9, abs: true, rotorMass: 6.4, fadeTempC: 640, absHz: 20 },
  tire: { compound: 'sport', B: 12, C: 1.9, D: 1.45, E: 0.96 },

  launchSpeedKph: 460,
  model: null,
  body: {
    parts: [
      { shape: 'box', size: [0.34, 0.42, 1.35], pos: [0, 0.66, 0.05], color: 0xf0a01e },
      { shape: 'wedge', size: [0.36, 0.36, 0.8], pos: [0, 0.95, 0.42], color: 0x1c1c20 },
      { shape: 'box', size: [0.3, 0.16, 0.5], pos: [0, 0.92, -0.45], color: 0x1c1c20 },
      { shape: 'box', size: [0.62, 0.06, 0.1], pos: [0, 1.02, 0.52], color: 0x2a2a30 },
      { shape: 'box', size: [0.16, 0.1, 0.3], pos: [0, 1.06, 0.66], color: 0xf2f2f2, emissive: 0xfff0c0 },
    ],
    wheels: { radius: 0.32, width: 0.17, track: 0, front: 0.71, rear: -0.71, color: 0x141418 },
  },
};
