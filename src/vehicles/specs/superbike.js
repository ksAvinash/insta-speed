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

  maxLaunchKph: 400,
  // Only the fully built bike gets a faster launch, and only one rung of it.
  // Everything that makes it quick also makes it unstable, so the extension is
  // held back until all three gating parts are at their top level.
  speedTiers: [400, 400, 500],

  /**
   * The bike's tyres buy lateral grip, not longitudinal bite — the opposite of
   * every other vehicle's.
   *
   * Raising peak friction on a 1.42 m wheelbase with a 0.62 m centre of gravity
   * deepens the load transfer that already lifts its rear wheel, and the rear
   * going light is what costs it lateral force. Measured on Storm Deck Bridge,
   * the default ladder's smallest step — `tire.D` up 5% — takes a stock 5.1 m
   * drift past the 6.65 m edge of the deck. The lateral-weighted ladder below
   * instead brings a fully built bike *down* to 2.2 m.
   *
   * @type {Record<string, import('../upgrades.js').UpgradeStep[]>}
   */
  upgrades: {
    tyres: [
      { label: 'Stock compound' },
      { label: 'Sport radial', mul: { 'tire.D': 1.01 }, set: { 'tire.lateralGrip': 1.13 } },
      { label: 'Track radial', mul: { 'tire.D': 1.02 }, set: { 'tire.lateralGrip': 1.18 } },
      { label: 'Slick carcass', mul: { 'tire.D': 1.04 }, set: { 'tire.lateralGrip': 1.24 } },
    ],
  },

  model: null,
  body: {
    parts: [
      // Fuel tank / main body
      { shape: 'box', size: [0.36, 0.4, 1.15], pos: [0, 0.68, 0.02], color: 0xf0a01e },
      // Belly pan
      { shape: 'box', size: [0.32, 0.14, 1.0], pos: [0, 0.42, 0.05], color: 0x1a1a1e, role: 'matte' },
      // Upper fairing
      { shape: 'wedge', size: [0.38, 0.34, 0.75], pos: [0, 0.98, 0.48], color: 0x1c1c20, role: 'trim' },
      // Windscreen
      { shape: 'box', size: [0.28, 0.22, 0.06], pos: [0, 1.18, 0.72], color: 0x7aa0c0, glass: true, opacity: 0.4 },
      // Tail section
      { shape: 'box', size: [0.3, 0.18, 0.55], pos: [0, 0.9, -0.55], color: 0x1c1c20, role: 'trim' },
      // Seat
      { shape: 'box', size: [0.28, 0.1, 0.45], pos: [0, 0.82, -0.2], color: 0x2a2a30, role: 'matte' },
      // Handlebar
      { shape: 'box', size: [0.62, 0.05, 0.08], pos: [0, 1.05, 0.52], color: 0x2a2a30, role: 'trim' },
      // Fork tubes
      { shape: 'cylinder', size: [0.03, 0.03, 0.55], pos: [0.08, 0.72, 0.62], color: 0xc0c4cc, role: 'trim', rot: [0.35, 0, 0] },
      { shape: 'cylinder', size: [0.03, 0.03, 0.55], pos: [-0.08, 0.72, 0.62], color: 0xc0c4cc, role: 'trim', rot: [0.35, 0, 0] },
      // Exhaust can
      { shape: 'cylinder', size: [0.06, 0.05, 0.45], pos: [0.18, 0.42, -0.55], color: 0x8a9098, role: 'trim', rot: [0.15, 0, 0.4] },
      // Headlight
      { shape: 'box', size: [0.16, 0.12, 0.14], pos: [0, 0.95, 0.78], color: 0xf2f2f2, emissive: 0xfff0c0 },
      // Side number plates
      { shape: 'box', size: [0.04, 0.16, 0.22], pos: [0.2, 0.7, 0.15], color: 0xffffff, role: 'matte' },
      { shape: 'box', size: [0.04, 0.16, 0.22], pos: [-0.2, 0.7, 0.15], color: 0xffffff, role: 'matte' },
    ],
    wheels: {
      radius: 0.32,
      width: 0.17,
      track: 0,
      front: 0.71,
      rear: -0.71,
      color: 0x141418,
      rimColor: 0xc4c8d0,
    },
    // Single centre tail light — a bike does not have a pair of wing lights.
    brakeLights: { y: 0.88, z: -0.85, track: 0, dual: false, size: [0.18, 0.1, 0.08] },
  },
};
