import { VehicleSim } from '../physics/VehicleSim.js';
import { PHYSICS_DT } from '../physics/constants.js';

/**
 * Course layout maths.
 *
 * Deliberately free of any registry import so it stays runnable under plain
 * node for the test suite — the registries rely on Vite's `import.meta.glob`.
 */

/**
 * The judgement window: how long you coast before the braking point arrives.
 *
 * This is the same at every rung of the ladder, and that is the whole design.
 * Budgeting a *total* run time instead — longer runs the faster you go — meant
 * each unlock mostly bought more road to sit on at constant speed waiting for
 * something to happen, which is the least interesting part of the run. Holding
 * the window fixed means unlocking 400 km/h changes what the stop demands of
 * you rather than how long you stare down a runway: the same three and a half
 * seconds to place the car, against a stop that is now four times longer.
 *
 * Course length still grows with speed, because braking distance does, but only
 * by as much as the physics forces.
 *
 * A scene can override the window with `coastSeconds`.
 */
export const COAST_SECONDS = 3.5;

/**
 * The run clock.
 *
 * Every course carries its own limit rather than one global number, because par
 * ranges from under six seconds (a hot hatch at 100 km/h on tarmac) to nearly
 * half a minute (a loaded truck at 320 km/h on packed snow) — a single figure
 * would be unreachable at one end and irrelevant at the other.
 *
 * It is generous on purpose. The clock is not there to make a well-judged stop
 * a race; it is there to close off the one strategy the scoring alone tolerates,
 * which is feathering the brakes from the launch and nursing the car down to a
 * crawl metres from the line. That run stops legally, and without a limit it can
 * take three times as long as committing properly.
 */
const TIME_LIMIT_FACTOR = 1.7;
const TIME_LIMIT_SLACK = 2;

/** @param {number} parSeconds what a perfectly judged run takes */
export function timeLimitFor(parSeconds) {
  return Math.ceil(parSeconds * TIME_LIMIT_FACTOR + TIME_LIMIT_SLACK);
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
 * The target line is placed so that a perfectly judged run — coast at speed for
 * `COAST_SECONDS`, then brake flat out and never lift — stops exactly on it.
 * Every rung therefore opens with the same short window to read the road and
 * commit, and everything past that point is the stop itself.
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
  const coastWindow = scene.coastSeconds ?? COAST_SECONDS;

  // Walk the coasting profile, asking at each moment "if I stood on the brake
  // now, where and when would I stop?".
  const walk = (stop) => {
    const sim = new VehicleSim(spec, still, { launchSpeedKph });
    let guard = 0;
    let last = { seconds: 0, distance: ideal };
    while (sim.v > 1 && guard++ < STEP_GUARD) {
      const remaining = lookup(table, sim.v);
      last = { seconds: sim.elapsed, distance: sim.x + remaining.dist };
      if (stop(sim.elapsed, last.distance)) return last;
      sim.step(PHYSICS_DT, COAST);
    }
    return last;
  };

  const byWindow = walk((coasted) => coasted >= coastWindow);
  const target = Math.max(byWindow.distance, ideal * MIN_TARGET_FACTOR);

  // Coast time has to follow whichever target actually won, or the garage would
  // advertise a braking point that lands short.
  const coastSeconds =
    target > byWindow.distance
      ? walk((_coasted, distance) => distance >= target).seconds
      : byWindow.seconds;

  // Par: coast to the braking point, then the stop from whatever speed drag has
  // left you with.
  const brakingFrom = coastSpeedAt(spec, still, launchSpeedKph, coastSeconds);
  const parSeconds = coastSeconds + lookup(table, brakingFrom).time;

  const wallOffset = scene.wallOffset ?? 40;
  return {
    ideal,
    /** Time to stop if the brake goes on the instant you launch. */
    idealSeconds: flatOut.time,
    target,
    coastSeconds,
    /**
     * What a perfectly judged run takes: the judgement window plus the stop
     * itself. This is par — the pace half of the score is measured against it.
     */
    runSeconds: parSeconds,
    /** Wall-clock limit for the run. Overrun is a failure, like the wall. */
    timeLimit: timeLimitFor(parSeconds),
    launchSpeedKph,
    wall: target + wallOffset,
    runway: target + wallOffset + 300,
    roadWidth: scene.roadWidth ?? 14,
  };
}

/** Speed left after coasting for `seconds` — drag alone has bled some off. */
function coastSpeedAt(spec, scene, launchSpeedKph, seconds) {
  const sim = new VehicleSim(spec, scene, { launchSpeedKph });
  let guard = 0;
  while (sim.elapsed < seconds && sim.v > 1 && guard++ < STEP_GUARD) sim.step(PHYSICS_DT, COAST);
  return sim.v;
}

/** Kept for callers that only want the flat-out number. */
export function idealStoppingDistance(spec, scene, launchSpeedKph) {
  return buildCourse(spec, scene, launchSpeedKph).ideal;
}
