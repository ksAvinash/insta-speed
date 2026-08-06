import { VehicleSim } from '../physics/VehicleSim.js';
import { PHYSICS_DT } from '../physics/constants.js';

/**
 * Course layout maths.
 *
 * Deliberately free of any registry import so it stays runnable under plain
 * node for the test suite — the registries rely on Vite's `import.meta.glob`.
 */

/**
 * How long a run should last.
 *
 * Pinning every run to a flat 20 s sounds tidy but plays badly at the bottom of
 * the ladder: stopping from 100 km/h takes about 2.5 s, so the other 17.5 s is
 * spent holding a straight line waiting for something to happen. Instead the
 * budget scales with the length of the stop itself and is capped, so runs grow
 * from brisk to substantial as the ladder climbs — and the top of every
 * vehicle's ladder lands on the full 20 s.
 *
 * A scene can override the whole calculation with `runSeconds`.
 */
export const MAX_RUN_SECONDS = 20;
export const MIN_RUN_SECONDS = 12;
const RUN_SECONDS_PER_BRAKE_SECOND = 2.5;

/** @param {number} brakeSeconds time to stop if braking from the launch */
export function runBudget(brakeSeconds) {
  const scaled = brakeSeconds * RUN_SECONDS_PER_BRAKE_SECOND;
  return Math.min(MAX_RUN_SECONDS, Math.max(MIN_RUN_SECONDS, scaled));
}

/**
 * The line is never placed closer than this multiple of the flat-out stopping
 * distance. Where braking alone already eats the whole time budget — a heavy
 * truck on packed snow — the time-based target would collapse onto the
 * theoretical minimum, leaving nothing to absorb crosswind or the cost of
 * steering, and the course would be literally impossible.
 */
const MIN_TARGET_FACTOR = 1.2;

const COAST = { steer: 0, brake: 0 };
const FULL_BRAKE = { steer: 0, brake: 1 };
const STEP_GUARD = 120 * 900;

/**
 * Samples a flat-out stop, giving distance and time still needed from any
 * speed along the way. Ascending by speed so it can be interpolated.
 */
function brakingTable(spec, scene, launchSpeedKph) {
  const sim = new VehicleSim(spec, scene, { launchSpeedKph });
  const samples = [];
  let guard = 0;
  while (!sim.stopped && guard++ < STEP_GUARD) {
    samples.push({ v: sim.v, x: sim.x, t: sim.elapsed });
    sim.step(PHYSICS_DT, FULL_BRAKE);
  }
  const totalX = sim.x;
  const totalT = sim.elapsed;
  return samples.map((s) => ({ v: s.v, dist: totalX - s.x, time: totalT - s.t })).reverse();
}

/** Linear interpolation into an ascending-by-speed table. */
function lookup(table, v) {
  if (v <= table[0].v) return table[0];
  const last = table[table.length - 1];
  if (v >= last.v) return last;
  for (let i = 1; i < table.length; i++) {
    if (table[i].v >= v) {
      const a = table[i - 1];
      const b = table[i];
      const t = (v - a.v) / Math.max(b.v - a.v, 1e-9);
      return { v, dist: a.dist + (b.dist - a.dist) * t, time: a.time + (b.time - a.time) * t };
    }
  }
  return last;
}

/**
 * Builds the course for a vehicle, scene and launch speed.
 *
 * The target line is placed so that a perfectly judged run — coast at speed,
 * then brake flat out at the last possible moment — takes roughly
 * `runSeconds`. That keeps a 100 km/h opening run and a 600 km/h final run
 * feeling like the same length of game, while the distance itself scales
 * naturally with speed: slower launches get much shorter courses.
 *
 * It is computed from two reference simulations rather than a search, so it is
 * cheap enough to call on every garage interaction.
 *
 * @param {import('../vehicles/registry.js').VehicleSpec} spec
 * @param {import('../scenes/registry.js').SceneDef} scene
 * @param {number} [launchSpeedKph] defaults to the vehicle's top speed
 */
export function buildCourse(spec, scene, launchSpeedKph = spec.maxLaunchKph) {
  // Reference runs are made in still air. Where the line goes is a purely
  // longitudinal question, and a laterally unstable vehicle — the superbike
  // will spin itself in a crosswind once braking lifts its rear wheel — would
  // otherwise drag the line around with it, even making it move *closer* as
  // launch speed rose.
  const still = scene.crosswind ? { ...scene, crosswind: 0 } : scene;

  const table = brakingTable(spec, still, launchSpeedKph);
  const flatOut = table[table.length - 1];

  // Braking alone from this speed. Anything below this is unreachable.
  const ideal = flatOut.dist;
  const runSeconds = scene.runSeconds ?? runBudget(flatOut.time);

  // Walk the coasting profile, asking at each moment "if I stood on the brake
  // now, where and when would I stop?".
  const walk = (stop) => {
    const sim = new VehicleSim(spec, still, { launchSpeedKph });
    let guard = 0;
    let last = { seconds: 0, distance: ideal };
    while (sim.v > 1 && guard++ < STEP_GUARD) {
      const remaining = lookup(table, sim.v);
      last = { seconds: sim.elapsed, distance: sim.x + remaining.dist };
      if (stop(sim.elapsed + remaining.time, last.distance)) return last;
      sim.step(PHYSICS_DT, COAST);
    }
    return last;
  };

  const byTime = flatOut.time >= runSeconds ? { seconds: 0, distance: ideal }
    : walk((totalTime) => totalTime >= runSeconds);

  const target = Math.max(byTime.distance, ideal * MIN_TARGET_FACTOR);

  // Coast time has to follow whichever target actually won, or the garage would
  // advertise a braking point that lands short.
  const coastSeconds =
    target > byTime.distance ? walk((_t, distance) => distance >= target).seconds : byTime.seconds;

  const wallOffset = scene.wallOffset ?? 40;
  return {
    ideal,
    /** Time to stop if the brake goes on the instant you launch. */
    idealSeconds: flatOut.time,
    target,
    coastSeconds,
    runSeconds,
    launchSpeedKph,
    wall: target + wallOffset,
    runway: target + wallOffset + 300,
    roadWidth: scene.roadWidth ?? 20,
  };
}

/** Kept for callers that only want the flat-out number. */
export function idealStoppingDistance(spec, scene, launchSpeedKph) {
  return buildCourse(spec, scene, launchSpeedKph).ideal;
}
