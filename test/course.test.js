import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleSim } from '../src/physics/VehicleSim.js';
import { PHYSICS_DT } from '../src/physics/constants.js';
import { buildCourse, timeLimitFor, COAST_SECONDS } from '../src/core/course.js';
import { speedLadder, nextSpeed, clampToLadder, BASE_SPEED_KPH, SPEED_STEP_KPH } from '../src/core/speeds.js';
import { applyUpgrades, PART_IDS, MAX_LEVEL } from '../src/vehicles/upgrades.js';

// The registries use `import.meta.glob`, which is a Vite transform and does not
// exist under plain node, so the specs are imported directly here.
import hyperGt from '../src/vehicles/specs/hyper-gt.js';
import superbike from '../src/vehicles/specs/superbike.js';
import semiTruck from '../src/vehicles/specs/semi-truck.js';

import saltFlats from '../src/scenes/defs/salt-flats.js';
import cyberTunnel from '../src/scenes/defs/cyber-tunnel.js';
import glacialRunway from '../src/scenes/defs/glacial-runway.js';
import mojaveAirstrip from '../src/scenes/defs/mojave-airstrip.js';
import maglevSpire from '../src/scenes/defs/maglev-spire.js';

const STOCK = [hyperGt, superbike, semiTruck];
const SCENES = [saltFlats, cyberTunnel, glacialRunway, mojaveAirstrip, maglevSpire];

/**
 * Builds a player can actually be driving.
 *
 * Upgrades are not cosmetic and they are not uniformly good: a part changes the
 * spec the sim runs, so it can take a pairing that used to be winnable and make
 * it unwinnable. That is not hypothetical — the default tyre ladder's smallest
 * step pushes the superbike off a windy deck, which is why it has its own
 * lateral-weighted ladder in `specs/superbike.js`.
 *
 * Every part maxed *alone* is included as well as the full build, because a
 * single part with nothing to balance it is the shape most likely to break: it
 * is also exactly what a player saving for one expensive component ends up
 * driving.
 */
const levels = (n) => Object.fromEntries(PART_IDS.map((id) => [id, n]));
const BUILDS = [
  { name: 'stock', levels: levels(0) },
  ...PART_IDS.map((id) => ({
    name: `${id} L${MAX_LEVEL}`,
    levels: { ...levels(0), [id]: MAX_LEVEL },
  })),
  { name: 'fully built', levels: levels(MAX_LEVEL) },
];

/** Every stock vehicle in every build a player can reach. */
const VEHICLES = STOCK.flatMap((spec) =>
  BUILDS.map((build) => {
    const tuned = applyUpgrades(spec, build.levels);
    // The derived spec keeps the base id, so it needs its own display name to
    // tell the failures apart.
    return { ...tuned, name: `${tuned.name} (${build.name})` };
  }),
);

/**
 * Drives a run with a fixed input, reporting how it ended.
 * @param {(sim: VehicleSim, course: object) => {steer:number,brake:number}} driver
 */
function run(spec, scene, driver, launchSpeedKph) {
  const course = buildCourse(spec, scene, launchSpeedKph);
  const sim = new VehicleSim(spec, scene, { launchSpeedKph });
  const half = course.roadWidth / 2;
  let guard = 0;

  // Outcome order mirrors Game.#checkOutcome, including the clock last, so a
  // stop that lands on the buzzer still counts as a stop.
  while (!sim.stopped && guard++ < 120 * 3000) {
    sim.step(PHYSICS_DT, driver(sim, course));
    if (Math.abs(sim.y) > half) {
      return { outcome: 'offroad', sim, course, maxLateral: Math.abs(sim.y) };
    }
    if (sim.x >= course.wall) return { outcome: 'crash', sim, course };
    if (sim.elapsed >= course.timeLimit) return { outcome: 'timeout', sim, course };
  }
  return { outcome: sim.x > course.target ? 'overshoot' : 'stopped', sim, course };
}

/**
 * A crude lane-keeping driver: steer proportionally to lateral error and yaw,
 * brake flat out. This is the right bar for "is this course survivable" — a
 * car left completely unsteered in a crosswind genuinely does get blown off
 * the road, so requiring the sim to drive itself would be testing the wrong
 * thing. If this driver can hold a lane, a player can.
 */
function steerToLane(sim) {
  // Rate of change of lateral position in track coordinates — the term that
  // actually damps the correction, rather than body-frame vy.
  const yDot = sim.v * Math.sin(sim.yaw) + sim.vy * Math.cos(sim.yaw);
  return Math.max(-1, Math.min(1, -(sim.y * 0.05 + yDot * 0.35 + sim.yaw * 1.5)));
}

const laneKeeping = (sim) => ({ steer: steerToLane(sim), brake: 1 });

/**
 * Coast, then stand on the brake at exactly the right moment and never lift.
 *
 * Deceleration is far from constant — a downforce car slows much harder at
 * 600 km/h than at 200 — so a `v^2 / 2a` estimate brakes far too late. Instead
 * the flat-out reference run is sampled to build a real "distance still needed
 * from this speed" table, and the brake latches once applied, because a
 * controller that re-evaluates every tick just oscillates on and off.
 */
function brakingDistanceTable(spec, scene, launchSpeedKph) {
  const sim = new VehicleSim(spec, scene, { launchSpeedKph });
  /** @type {{ v: number, dist: number }[]} */
  const samples = [];
  let guard = 0;
  while (!sim.stopped && guard++ < 120 * 900) {
    samples.push({ v: sim.v, x: sim.x });
    // Steering while braking is measured, not assumed. The two share one
    // friction budget, and on 32%-grip snow holding a lane costs far more
    // distance than it does on tarmac.
    sim.step(PHYSICS_DT, { steer: steerToLane(sim), brake: 1 });
  }
  const total = sim.x;
  return samples.map(({ v, x }) => ({ v, dist: total - x })).reverse(); // ascending v
}

function makeTimedDriver(spec, scene, launchSpeedKph) {
  const course = buildCourse(spec, scene, launchSpeedKph);
  const table = brakingDistanceTable(spec, scene, launchSpeedKph);
  let latched = false;

  const needed = (v) => {
    if (v <= table[0].v) return table[0].dist;
    for (let i = 1; i < table.length; i++) {
      if (table[i].v >= v) {
        const a = table[i - 1];
        const b = table[i];
        const t = (v - a.v) / Math.max(b.v - a.v, 1e-9);
        return a.dist + (b.dist - a.dist) * t;
      }
    }
    return table[table.length - 1].dist;
  };

  // Small allowance on top of the measured table, the way a real driver leaves
  // themselves room rather than braking at the theoretical last centimetre.
  const MARGIN = 1.06;

  return (sim) => {
    if (!latched && course.target - sim.x <= needed(sim.v) * MARGIN) latched = true;
    return { steer: steerToLane(sim), brake: latched ? 1 : 0 };
  };
}

/** Slowest, middle and top rung — enough coverage without 300 test cases. */
function sampleRungs(spec) {
  const ladder = speedLadder(spec);
  return [...new Set([ladder[0], ladder[Math.floor(ladder.length / 2)], ladder.at(-1)])];
}

for (const spec of VEHICLES) {
  for (const scene of SCENES) {
    for (const kph of sampleRungs(spec)) {
      const pair = `${spec.name} @ ${scene.name} @ ${kph} km/h`;

      test(`${pair}: a lane-keeping driver stays on the road while braking flat out`, () => {
        const r = run(spec, scene, laneKeeping, kph);
        assert.notEqual(
          r.outcome,
          'offroad',
          `drifted ${r.maxLateral?.toFixed(1)} m off a ${r.course.roadWidth} m road even with active steering`,
        );
      });

      test(`${pair}: the target line is reachable`, () => {
        const r = run(spec, scene, makeTimedDriver(spec, scene, kph), kph);
        assert.equal(r.outcome, 'stopped', `run ended as "${r.outcome}"`);

        // The clock must never be what ends a properly driven run.
        assert.ok(
          r.sim.elapsed <= r.course.timeLimit * 0.8,
          `used ${r.sim.elapsed.toFixed(1)} s of a ${r.course.timeLimit} s limit`,
        );

        const error = Math.abs(r.course.target - r.sim.x);
        // A crude open-loop driver should at least land in the same postcode;
        // this catches courses that are simply impossible to hit.
        assert.ok(
          error < r.course.target * 0.25,
          `stopped ${error.toFixed(0)} m from a line at ${r.course.target.toFixed(0)} m`,
        );
      });
    }
  }
}

test('a perfectly judged run takes about par', () => {
  for (const spec of VEHICLES) {
    for (const scene of SCENES) {
      for (const kph of speedLadder(spec)) {
        const course = buildCourse(spec, scene, kph);
        const sim = new VehicleSim(spec, scene, { launchSpeedKph: kph });
        let guard = 0;
        while (sim.elapsed < course.coastSeconds && guard++ < 200000) {
          sim.step(PHYSICS_DT, { steer: 0, brake: 0 });
        }
        while (!sim.stopped && guard++ < 200000) sim.step(PHYSICS_DT, { steer: 0, brake: 1 });

        // Par is what the pace half of the score is measured against, so a run
        // that is actually driven perfectly has to be able to reach it.
        const where = `${spec.name} @ ${scene.name} @ ${kph} km/h`;
        assert.ok(
          Math.abs(sim.elapsed - course.runSeconds) < 1.5,
          `${where}: run took ${sim.elapsed.toFixed(1)} s against par of ${course.runSeconds.toFixed(1)} s`,
        );
      }
    }
  }
});

test('the time limit scales with the pairing and leaves room over par', () => {
  for (const spec of VEHICLES) {
    for (const scene of SCENES) {
      for (const kph of speedLadder(spec)) {
        const course = buildCourse(spec, scene, kph);
        const where = `${spec.name} @ ${scene.name} @ ${kph} km/h`;

        // One global limit cannot work when par runs from under 6 s to 27 s.
        assert.equal(course.timeLimit, timeLimitFor(course.runSeconds), `${where}: limit is derived`);
        assert.ok(
          course.timeLimit >= course.runSeconds * 1.5,
          `${where}: ${course.timeLimit} s limit is too tight against ${course.runSeconds.toFixed(1)} s par`,
        );
        assert.equal(course.timeLimit, Math.round(course.timeLimit), `${where}: limit should be whole seconds`);
      }
    }
  }
});

test('the clock catches a run nursed down to a crawl', () => {
  // The strategy the limit exists to close off: shed the speed early, then
  // trickle the last stretch at walking pace to guarantee the line. It stops
  // legally and, on the scoring alone, only loses the pace half.
  const creep = (sim) => ({ steer: steerToLane(sim), brake: sim.v > 4 ? 1 : 0 });

  // Calm scenes only: a superbike left crawling in a crosswind gets blown off
  // the road before the clock ever gets to it, which is a different test.
  for (const [spec, scene, kph] of [
    [hyperGt, saltFlats, 100],
    [hyperGt, saltFlats, 600],
    [superbike, cyberTunnel, 200],
    [superbike, cyberTunnel, 400],
    [semiTruck, saltFlats, 200],
  ]) {
    const r = run(spec, scene, creep, kph);
    assert.equal(
      r.outcome,
      'timeout',
      `${spec.name} @ ${scene.name} @ ${kph} km/h: creeping ended as "${r.outcome}"`,
    );
  }
});

test('the judgement window stays the same all the way up the ladder', () => {
  for (const spec of VEHICLES) {
    for (const scene of SCENES) {
      for (const kph of speedLadder(spec)) {
        const { coastSeconds } = buildCourse(spec, scene, kph);
        const where = `${spec.name} @ ${scene.name} @ ${kph} km/h`;

        // Unlocking a faster launch must not buy more time sitting at speed
        // waiting for the braking point — that is the boring half of a run.
        // The only thing that may push the window out is the minimum-target
        // floor on pairings that can barely stop at all, and only slightly.
        assert.ok(
          coastSeconds >= COAST_SECONDS - 0.05,
          `${where}: only ${coastSeconds.toFixed(2)} s to judge the braking point`,
        );
        // The floor is worth about a second on the handful of pairings that can
        // barely stop inside their own course — a hot hatch at 420 km/h on
        // packed snow — and nothing at all everywhere else.
        assert.ok(
          coastSeconds <= COAST_SECONDS + 1.5,
          `${where}: ${coastSeconds.toFixed(2)} s of coasting, window is ${COAST_SECONDS} s`,
        );
      }
    }
  }
});

test('target distance grows with launch speed', () => {
  for (const spec of VEHICLES) {
    for (const scene of SCENES) {
      const targets = speedLadder(spec).map((kph) => buildCourse(spec, scene, kph).target);
      for (let i = 1; i < targets.length; i++) {
        assert.ok(
          targets[i] > targets[i - 1],
          `${spec.name} @ ${scene.name}: target shrank from ${targets[i - 1].toFixed(0)} m to ${targets[i].toFixed(0)} m as speed rose`,
        );
      }
    }
  }
});

test('every course leaves room to coast before braking', () => {
  for (const spec of VEHICLES) {
    for (const scene of SCENES) {
      for (const kph of speedLadder(spec)) {
        const course = buildCourse(spec, scene, kph);
        assert.ok(
          course.target >= course.ideal,
          `${spec.name} @ ${scene.name} @ ${kph}: target ${course.target.toFixed(0)} m is inside the ${course.ideal.toFixed(0)} m flat-out stop`,
        );
      }
    }
  }
});

test('the speed ladder starts at the base speed and ends at the vehicle top speed', () => {
  for (const spec of VEHICLES) {
    const ladder = speedLadder(spec);
    assert.equal(ladder[0], BASE_SPEED_KPH, `${spec.name} should start at ${BASE_SPEED_KPH}`);
    assert.equal(ladder.at(-1), spec.maxLaunchKph, `${spec.name} should end at its top speed`);
    assert.deepEqual([...ladder].sort((a, b) => a - b), ladder, 'ladder must ascend');
    assert.equal(new Set(ladder).size, ladder.length, 'ladder must not repeat a rung');

    // Every step bar the last is exactly one increment.
    for (let i = 1; i < ladder.length - 1; i++) {
      assert.equal(ladder[i] - ladder[i - 1], SPEED_STEP_KPH);
    }
  }
});

test('ladder navigation clamps to what is unlocked', () => {
  const spec = hyperGt;
  assert.equal(nextSpeed(spec, 100), 200);
  assert.equal(nextSpeed(spec, 500), 600);
  assert.equal(nextSpeed(spec, 600), null, 'top of the ladder has no next rung');

  assert.equal(clampToLadder(spec, 400, 250), 200, 'cannot select beyond what is unlocked');
  assert.equal(clampToLadder(spec, 200, 600), 200, 'unlocked rungs pass through');
  assert.equal(clampToLadder(spec, 175, 600), 100, 'off-ladder snaps down to a real rung');

  // Progress saved against the old 50 km/h ladder has to keep working.
  assert.equal(clampToLadder(spec, 350, 350), 300, 'a stale unlock snaps back onto the ladder');
});
