/**
 * Scene registry.
 *
 * Same contract as the vehicle registry: drop a module in `./defs/` that
 * default-exports a scene definition and it appears in the picker.
 */

/**
 * @typedef {object} SceneDef
 * @property {string} id
 * @property {string} name
 * @property {string} [blurb]
 * @property {string} surface key into physics/Surface.js
 * @property {number} [gripMultiplier] extra grip scaling on top of the surface
 * @property {number} [airDensity] kg/m^3 — thinner air at altitude means less drag
 * @property {number} [crosswind] m/s, positive pushes right
 * @property {number} [ambientTempC] affects how fast rotors shed heat
 * @property {number} [coastSeconds] override the judgement window before the
 *   braking point — see core/course.js. The target distance itself is derived,
 *   never authored.
 * @property {number} [scoreMultiplier] pays for the scene's difficulty, on top
 *   of the launch-speed multiplier — see core/score.js. Defaults to 1.
 * @property {number} [wallOffset] m past the line before the wall
 * @property {number} [roadWidth] m — leaving it is a fail
 * @property {{ top: number, bottom: number }} sky vertical gradient colours
 * @property {{ color: number, density: number }} fog
 * @property {{ color: number, intensity: number, position: [number, number, number] }} sun
 * @property {{ color: number, accent?: number }} ground
 * @property {{ color: number, secondary?: number }} road
 * @property {Array<object>} [props] instanced roadside decoration
 * @property {boolean} [tunnel] wraps the road in a tunnel shell
 */

const modules = import.meta.glob('./defs/*.js', { eager: true });

/** @type {SceneDef[]} */
export const SCENES = Object.values(modules)
  .map((m) => /** @type {SceneDef} */ (m.default))
  .filter(Boolean);

/** @type {Map<string, SceneDef>} */
const byId = new Map(SCENES.map((s) => [s.id, s]));

/** @param {string} id */
export function getScene(id) {
  return byId.get(id) ?? SCENES[0];
}

export const DEFAULT_SCENE_ID = SCENES.find((s) => s.id === 'salt-flats')?.id ?? SCENES[0]?.id;
