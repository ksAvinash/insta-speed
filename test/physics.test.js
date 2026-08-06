import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleSim } from '../src/physics/VehicleSim.js';
import { pacejka, peakSlip, slipRatio, lateralCapacity } from '../src/physics/Tire.js';
import { PHYSICS_DT, KPH_TO_MS } from '../src/physics/constants.js';

/** A deliberately ordinary performance car, used to check the model against reality. */
const referenceCar = {
  id: 'reference',
  name: 'Reference Car',
  mass: 1500,
  massDistribution: 0.6,
  wheelbase: 2.7,
  cgHeight: 0.55,
  wheelRadius: 0.32,
  unsprungMassPerAxle: 45,
  frontalArea: 2.2,
  dragCoefficient: 0.3,
  liftCoefficient: 0,
  brake: { maxTorque: 9000, bias: 0.65, abs: true, rotorMass: 9, fadeTempC: 600, absHz: 15 },
  tire: { B: 10, C: 1.9, D: 1.0, E: 0.97 },
  maxLaunchKph: 100,
};

const flatTrack = {
  id: 'test',
  surface: 'tarmac',
  gripMultiplier: 1,
  airDensity: 1.225,
  crosswind: 0,
};

/** Run a full-brake stop and return the distance covered. */
function brakeToStop(spec, scene, input = { steer: 0, brake: 1 }) {
  const sim = new VehicleSim(spec, scene);
  let guard = 0;
  while (!sim.stopped && guard++ < 120 * 600) {
    sim.step(PHYSICS_DT, input);
  }
  return { distance: sim.x, time: sim.elapsed, sim };
}

test('100-0 km/h stop lands in the real-world envelope for a performance car', () => {
  const { distance } = brakeToStop(referenceCar, flatTrack);
  assert.ok(
    distance >= 39 && distance <= 43,
    `expected 39-43 m, got ${distance.toFixed(2)} m`,
  );
});

test('ABS stops shorter than a locked-wheel skid', () => {
  const withAbs = brakeToStop(referenceCar, flatTrack).distance;
  const noAbs = brakeToStop(
    { ...referenceCar, brake: { ...referenceCar.brake, abs: false } },
    flatTrack,
  ).distance;
  assert.ok(noAbs > withAbs, `locked skid (${noAbs.toFixed(1)}m) should exceed ABS (${withAbs.toFixed(1)}m)`);
});

test('lower-grip surfaces lengthen the stop', () => {
  const dry = brakeToStop(referenceCar, flatTrack).distance;
  const wet = brakeToStop(referenceCar, { ...flatTrack, surface: 'wet' }).distance;
  const snow = brakeToStop(referenceCar, { ...flatTrack, surface: 'snow' }).distance;
  assert.ok(wet > dry * 1.3, `wet ${wet.toFixed(1)}m vs dry ${dry.toFixed(1)}m`);
  assert.ok(snow > wet * 1.5, `snow ${snow.toFixed(1)}m vs wet ${wet.toFixed(1)}m`);
});

test('braking transfers load onto the front axle', () => {
  const sim = new VehicleSim(referenceCar, flatTrack);
  const staticFront = sim.load.front;
  for (let i = 0; i < 30; i++) sim.step(PHYSICS_DT, { steer: 0, brake: 1 });
  assert.ok(sim.load.front > staticFront, 'front axle should gain load under braking');
  assert.ok(sim.load.rear < sim.load.front, 'rear should be lighter than front under braking');
});

test('rotors heat up under braking and fade cuts pad friction', () => {
  const sim = new VehicleSim(referenceCar, flatTrack);
  for (let i = 0; i < 60; i++) sim.step(PHYSICS_DT, { steer: 0, brake: 1 });
  assert.ok(sim.rotorTemp.front > sim.ambientTemp, 'front rotor should heat up');
  assert.equal(sim.padFriction(500), 1, 'no fade below the rated temperature');
  assert.ok(sim.padFriction(900) < 0.5, 'heavy fade well past the rated temperature');
});

test('downforce shortens the stop at high speed', () => {
  const fast = { ...referenceCar, maxLaunchKph: 300 };
  const noWing = brakeToStop(fast, flatTrack).distance;
  const winged = brakeToStop({ ...fast, liftCoefficient: -1.2 }, flatTrack).distance;
  assert.ok(winged < noWing, `downforce ${winged.toFixed(1)}m should beat ${noWing.toFixed(1)}m`);
});

test('the sim is deterministic for an identical input sequence', () => {
  const inputs = Array.from({ length: 4000 }, (_, i) => ({
    steer: Math.sin(i / 90) * 0.4,
    brake: i < 200 ? 0 : Math.min(1, (i - 200) / 300),
  }));

  const run = () => {
    const sim = new VehicleSim({ ...referenceCar, maxLaunchKph: 600 }, flatTrack);
    for (const input of inputs) sim.step(PHYSICS_DT, input);
    return { x: sim.x, y: sim.y, yaw: sim.yaw, v: sim.v };
  };

  assert.deepEqual(run(), run());
});

test('tyre curve peaks past zero slip and falls off toward lock-up', () => {
  const curve = referenceCar.tire;
  const peak = peakSlip(curve);
  assert.ok(peak.slip > 0.05 && peak.slip < 0.3, `peak slip at ${peak.slip.toFixed(3)}`);
  assert.ok(pacejka(1, curve) < peak.mu, 'a fully locked wheel grips less than at peak');
  assert.ok(pacejka(0, curve) === 0, 'no slip, no force');
});

test('slip ratio is -1 for a locked wheel and 0 when free-rolling', () => {
  assert.equal(slipRatio(0, 0.32, 25), -1);
  assert.ok(Math.abs(slipRatio(25 / 0.32, 0.32, 25)) < 1e-9);
});

test('friction circle leaves no lateral grip when braking at the limit', () => {
  assert.equal(lateralCapacity(1, 10000, 10000), 0);
  assert.ok(Math.abs(lateralCapacity(1, 10000, 0) - 10000) < 1e-9);
});

test('a 600 km/h launch is survivable but takes serious road', () => {
  const { distance, sim } = brakeToStop({ ...referenceCar, maxLaunchKph: 600 }, flatTrack);
  assert.ok(sim.stopped, 'should reach a stop');
  assert.ok(distance > 800, `expected a long stop, got ${distance.toFixed(0)} m`);
  assert.ok(distance < 4000, `should fit on a runway, got ${distance.toFixed(0)} m`);
});
