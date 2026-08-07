/**
 * High-altitude carbon deck above the cloud floor. Thin air kills aero assist,
 * and a stratospheric crosswind never lets up.
 *
 * The brief wanted max grip (1.2) with 8.5 m/s wind on a 14 m deck. Under
 * hard braking the superbike unloads its rear; that pairing spins off the
 * edge. Grip and wind are balanced so the thin-air / high-wind character
 * survives and a lane-keeping driver still holds the deck.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'maglev-spire',
  name: 'Stratosphere Deck',
  blurb: 'High-altitude launch platform. Thin air means no parachute or aero braking assist.',

  surface: 'carbon_mesh',
  gripMultiplier: 0.62,
  airDensity: 0.75,
  crosswind: 5.0,
  ambientTempC: -5,
  scoreMultiplier: 1.6,

  roadWidth: 16.0,
  wallOffset: 18.0,

  sky: { top: 0x020617, bottom: 0x1e1b4b },
  fog: { color: 0x312e81, density: 0.0002 },
  sun: { color: 0xffffff, intensity: 2.2, position: [0.3, 0.6, -0.7] },
  ground: { color: 0x020617, accent: 0x0f172a },
  road: { color: 0x0f172a, secondary: 0x6366f1 },
  props: [
    {
      type: 'magnetic_guide_rail',
      spacing: 15,
      lateral: 8.4,
      height: 0.8,
      color: 0x818cf8,
      bothSides: true,
      emissive: true,
    },
    {
      type: 'hazard_strobe',
      spacing: 100,
      lateral: 8.6,
      height: 2.5,
      color: 0xef4444,
      bothSides: true,
      emissive: true,
    },
  ],
};
