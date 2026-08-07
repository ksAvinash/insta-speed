/**
 * Brutalist desert strip. Coarse grip early, then the heat cooks the rotors
 * mid-stop while a side shear keeps anything with a flank honest.
 *
 * Wind and road width are one setting: the superbike unloads its rear under
 * hard braking, so the authored "1.05 grip / 3 m/s / 22 m" numbers were
 * unwinnable. Tuned to keep the desert character while a lane-keeping driver
 * still holds the strip.
 * @type {import('../registry.js').SceneDef}
 */
export default {
  id: 'mojave-airstrip',
  name: 'Mojave Sector 7',
  blurb: 'Cracked, sun-baked asphalt. Strong grip initially, but severe ambient heat cooks your brakes.',

  surface: 'dry_cracked_asphalt',
  gripMultiplier: 0.8,
  airDensity: 1.12,
  crosswind: 2.2,
  ambientTempC: 55,
  scoreMultiplier: 1.1,

  roadWidth: 30.0,
  wallOffset: 50.0,

  sky: { top: 0x1e3a8a, bottom: 0xf97316 },
  fog: { color: 0xfdba74, density: 0.0008 },
  sun: { color: 0xffedd5, intensity: 2.0, position: [0.0, 0.8, -0.3] },
  ground: { color: 0x78350f, accent: 0x92400e },
  road: { color: 0x292524, secondary: 0x44403c },
  props: [
    {
      type: 'windsock',
      spacing: 250,
      lateral: 17.0,
      height: 5.0,
      color: 0xea580c,
      bothSides: false,
    },
    {
      type: 'radar_dish',
      spacing: 800,
      lateral: 40.0,
      height: 18.0,
      color: 0x78716c,
      bothSides: false,
    },
  ],
};
