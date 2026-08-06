/**
 * Vehicle registry.
 *
 * Adding a vehicle is a one-file job: drop a module in `./specs/` that default-
 * exports a spec object. The glob below picks it up automatically — there is no
 * import list to maintain.
 */

/**
 * @typedef {object} VehicleSpec
 * @property {string} id stable key used for saved scores
 * @property {string} name display name
 * @property {string} class display category, e.g. 'Hypercar'
 * @property {string} [blurb] one-line flavour text for the garage
 * @property {number} mass kg
 * @property {number} massDistribution front weight fraction, 0-1
 * @property {number} wheelbase m
 * @property {number} cgHeight centre-of-gravity height, m
 * @property {number} wheelRadius m
 * @property {number} [unsprungMassPerAxle] kg, defaults to 3% of mass
 * @property {number} frontalArea m^2
 * @property {number} dragCoefficient Cd
 * @property {number} liftCoefficient Cl — negative produces downforce
 * @property {number} [aeroBalance] front share of downforce, defaults to massDistribution
 * @property {number} [sideArea] m^2, for crosswind
 * @property {number} [aeroSideOffset] m, crosswind yaw lever arm
 * @property {number} [maxSteerAngle] rad at the road wheel
 * @property {{ maxTorque: number, bias: number, abs: boolean, rotorMass: number,
 *              fadeTempC: number, absHz?: number }} brake
 * @property {import('../physics/Tire.js').TireCurve & { compound?: string }} tire
 * @property {number} maxLaunchKph top of this vehicle's speed ladder — players
 *   start at 100 km/h and unlock their way up, so this is a cap, not the speed
 *   a run begins at
 * @property {object} body procedural mesh recipe, see render/VehicleView.js
 * @property {string|null} [model] optional glTF path that overrides `body`
 */

const modules = import.meta.glob('./specs/*.js', { eager: true });

/** @type {VehicleSpec[]} */
export const VEHICLES = Object.values(modules)
  .map((m) => /** @type {VehicleSpec} */ (m.default))
  .filter(Boolean)
  .sort((a, b) => a.mass - b.mass);

/** @type {Map<string, VehicleSpec>} */
const byId = new Map(VEHICLES.map((v) => [v.id, v]));

/** @param {string} id */
export function getVehicle(id) {
  return byId.get(id) ?? VEHICLES[0];
}

export const DEFAULT_VEHICLE_ID = VEHICLES.find((v) => v.id === 'hyper-gt')?.id ?? VEHICLES[0]?.id;
