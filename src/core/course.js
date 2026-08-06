import { VehicleSim } from '../physics/VehicleSim.js';
import { PHYSICS_DT } from '../physics/constants.js';

/**
 * Course layout maths.
 *
 * Deliberately free of any registry import so it stays runnable under plain
 * node for the test suite — the registries rely on Vite's `import.meta.glob`.
 */

/**
 * Distance a vehicle needs if it brakes flat out from the instant it launches.
 * @param {import('../vehicles/registry.js').VehicleSpec} spec
 * @param {import('../scenes/registry.js').SceneDef} scene
 */
export function idealStoppingDistance(spec, scene) {
  const sim = new VehicleSim(spec, scene);
  const input = { steer: 0, brake: 1 };
  let guard = 0;
  while (!sim.stopped && guard++ < 120 * 900) sim.step(PHYSICS_DT, input);
  return sim.x;
}

/**
 * Places the target line beyond the flat-out stopping distance, so the player
 * has to judge a coast phase rather than simply mashing the brake at t=0. The
 * multiplier is per-scene, which keeps every vehicle challenged by the same
 * amount despite stopping distances that vary by an order of magnitude across
 * the roster.
 *
 * @param {import('../vehicles/registry.js').VehicleSpec} spec
 * @param {import('../scenes/registry.js').SceneDef} scene
 */
export function buildCourse(spec, scene) {
  const ideal = idealStoppingDistance(spec, scene);
  const target = scene.targetDistance ?? ideal * (scene.targetFactor ?? 1.3);
  const wallOffset = scene.wallOffset ?? 40;
  return {
    ideal,
    target,
    wall: target + wallOffset,
    runway: target + wallOffset + 300,
    roadWidth: scene.roadWidth ?? 20,
  };
}
