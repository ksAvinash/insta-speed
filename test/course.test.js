import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleSim } from '../src/physics/VehicleSim.js';
import { PHYSICS_DT } from '../src/physics/constants.js';
import { buildCourse } from '../src/core/course.js';

// The registries use `import.meta.glob`, which is a Vite transform and does not
// exist under plain node, so the specs are imported directly here.
import hyperGt from '../src/vehicles/specs/hyper-gt.js';
import rallyHatch from '../src/vehicles/specs/rally-hatch.js';
import superbike from '../src/vehicles/specs/superbike.js';
import semiTruck from '../src/vehicles/specs/semi-truck.js';
import schoolBus from '../src/vehicles/specs/school-bus.js';

import saltFlats from '../src/scenes/defs/salt-flats.js';
import tunnel from '../src/scenes/defs/tunnel.js';
import coastalBridge from '../src/scenes/defs/coastal-bridge.js';
import snowPass from '../src/scenes/defs/snow-pass.js';

const VEHICLES = [hyperGt, rallyHatch, superbike, semiTruck, schoolBus];
const SCENES = [saltFlats, tunnel, coastalBridge, snowPass];

/**
 * Drives a run with a fixed input, reporting how it ended.
 * @param {(sim: VehicleSim, course: object) => {steer:number,brake:number}} driver
 */
function run(spec, scene, driver) {
  const course = buildCourse(spec, scene);
  const sim = new VehicleSim(spec, scene);
  const half = course.roadWidth / 2;
  let guard = 0;

  while (!sim.stopped && guard++ < 120 * 900) {
    sim.step(PHYSICS_DT, driver(sim, course));
    if (Math.abs(sim.y) > half) {
      return { outcome: 'offroad', sim, course, maxLateral: Math.abs(sim.y) };
    }
    if (sim.x >= course.wall) return { outcome: 'crash', sim, course };
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
function brakingDistanceTable(spec, scene) {
  const sim = new VehicleSim(spec, scene);
  /** @type {{ v: number, dist: number }[]} */
  const samples = [];
  let guard = 0;
  while (!sim.stopped && guard++ < 120 * 900) {
    samples.push({ v: sim.v, x: sim.x });
    sim.step(PHYSICS_DT, { steer: 0, brake: 1 });
  }
  const total = sim.x;
  return samples.map(({ v, x }) => ({ v, dist: total - x })).reverse(); // ascending v
}

function makeTimedDriver(spec, scene) {
  const course = buildCourse(spec, scene);
  const table = brakingDistanceTable(spec, scene);
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

  // The table is measured driving dead straight. Steering to hold a lane eats
  // into the same friction budget and lengthens the stop, so the trigger needs
  // a margin — which is exactly the allowance a real driver leaves too.
  // Measured empirically: holding a lane costs up to ~16% of stopping distance.
  const MARGIN = 1.2;

  return (sim) => {
    if (!latched && course.target - sim.x <= needed(sim.v) * MARGIN) latched = true;
    return { steer: steerToLane(sim), brake: latched ? 1 : 0 };
  };
}

for (const spec of VEHICLES) {
  for (const scene of SCENES) {
    const pair = `${spec.name} @ ${scene.name}`;

    test(`${pair}: a lane-keeping driver stays on the road while braking flat out`, () => {
      const r = run(spec, scene, laneKeeping);
      assert.notEqual(
        r.outcome,
        'offroad',
        `drifted ${r.maxLateral?.toFixed(1)} m off a ${r.course.roadWidth} m road even with active steering`,
      );
    });

    test(`${pair}: the target line is reachable`, () => {
      const r = run(spec, scene, makeTimedDriver(spec, scene));
      assert.equal(r.outcome, 'stopped', `run ended as "${r.outcome}"`);
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

test('every course leaves room to coast before braking', () => {
  for (const spec of VEHICLES) {
    for (const scene of SCENES) {
      const course = buildCourse(spec, scene);
      assert.ok(
        course.target > course.ideal * 1.15,
        `${spec.name} @ ${scene.name}: target ${course.target.toFixed(0)} m is too close to the ${course.ideal.toFixed(0)} m flat-out stop`,
      );
    }
  }
});
