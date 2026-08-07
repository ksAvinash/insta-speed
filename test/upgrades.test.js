import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTS,
  PART_IDS,
  MAX_LEVEL,
  LEVEL_COSTS,
  applyUpgrades,
  normaliseLevels,
  upgradeTier,
  tunedMaxSpeed,
  nextSpeedTier,
  nextLevelCost,
  totalSpent,
  stepFor,
} from '../src/vehicles/upgrades.js';
import { speedLadder } from '../src/core/speeds.js';

// The registry uses `import.meta.glob`, so the specs are imported directly.
import hyperGt from '../src/vehicles/specs/hyper-gt.js';
import superbike from '../src/vehicles/specs/superbike.js';
import semiTruck from '../src/vehicles/specs/semi-truck.js';

const VEHICLES = [hyperGt, superbike, semiTruck];
const levels = (n) => Object.fromEntries(PART_IDS.map((id) => [id, n]));
const only = (part, n) => ({ ...levels(0), [part]: n });

test('a stock build returns the base spec untouched', () => {
  for (const spec of VEHICLES) {
    assert.equal(applyUpgrades(spec, levels(0)), spec, `${spec.name} should keep its identity`);
    assert.equal(applyUpgrades(spec, undefined), spec, 'no stored levels means stock');
  }
});

test('applying upgrades never mutates the base spec', () => {
  // The specs are module singletons shared by every run and the garage preview.
  // A shallow spread would leave `tire` and `brake` aliased, and one purchase
  // would silently re-tune the vehicle everywhere, permanently.
  for (const spec of VEHICLES) {
    const before = JSON.stringify(spec);
    for (let n = 1; n <= MAX_LEVEL; n++) applyUpgrades(spec, levels(n));
    assert.equal(JSON.stringify(spec), before, `${spec.name} was mutated by applyUpgrades`);
  }
});

test('derived specs are memoised, so the tyre peak solve stays cached', () => {
  // `Tire.peakSlip` caches on the curve object identity and the garage rebuilds
  // the course on every interaction, so a fresh object per call would redo a
  // 200-sample sweep several times a click.
  for (const spec of VEHICLES) {
    assert.equal(applyUpgrades(spec, levels(2)), applyUpgrades(spec, levels(2)));
    assert.notEqual(applyUpgrades(spec, levels(2)), applyUpgrades(spec, levels(3)));
  }
});

test('each part improves monotonically with level', () => {
  for (const spec of VEHICLES) {
    let lastTorque = 0;
    let lastFade = 0;
    let lastMass = Infinity;
    let lastDownforce = -Infinity;

    for (let n = 0; n <= MAX_LEVEL; n++) {
      const brakes = applyUpgrades(spec, only('brakes', n));
      assert.ok(brakes.brake.maxTorque > lastTorque, `${spec.name} brake torque at level ${n}`);
      assert.ok(brakes.brake.fadeTempC > lastFade, `${spec.name} fade threshold at level ${n}`);
      lastTorque = brakes.brake.maxTorque;
      lastFade = brakes.brake.fadeTempC;

      const chassis = applyUpgrades(spec, only('chassis', n));
      assert.ok(chassis.mass < lastMass, `${spec.name} mass at level ${n}`);
      lastMass = chassis.mass;

      const aero = applyUpgrades(spec, only('aero', n));
      // Negative lift is downforce, so this rises as the coefficient falls.
      assert.ok(-aero.liftCoefficient > lastDownforce, `${spec.name} downforce at level ${n}`);
      lastDownforce = -aero.liftCoefficient;
    }
  }
});

test('tyre upgrades never reduce grip, in either direction', () => {
  // The superbike buys lateral grip rather than longitudinal bite, so the two
  // ladders are shaped differently — but neither may go backwards.
  for (const spec of VEHICLES) {
    let lastD = 0;
    let lastLateral = 0;
    for (let n = 0; n <= MAX_LEVEL; n++) {
      const tuned = applyUpgrades(spec, only('tyres', n));
      const lateral = tuned.tire.lateralGrip ?? 1.08;
      assert.ok(tuned.tire.D >= lastD, `${spec.name} peak mu fell at tyre level ${n}`);
      assert.ok(lateral >= lastLateral, `${spec.name} lateral grip fell at tyre level ${n}`);
      lastD = tuned.tire.D;
      lastLateral = lateral;
    }
  }
});

test('steps are absolute against stock, not cumulative', () => {
  // Level 3 must be exactly what its own data says. If the levels compounded,
  // the top of a ladder would be far stronger than it reads in the spec file.
  const tuned = applyUpgrades(hyperGt, only('brakes', 3));
  const step = stepFor(hyperGt, 'brakes', 3);
  assert.equal(tuned.brake.maxTorque, hyperGt.brake.maxTorque * step.mul['brake.maxTorque']);
  assert.equal(tuned.brake.fadeTempC, hyperGt.brake.fadeTempC + step.add['brake.fadeTempC']);
});

test('the tier is the weakest of the gating parts, and chassis does not count', () => {
  assert.equal(upgradeTier(levels(0)), 0);
  assert.equal(upgradeTier(levels(2)), 2);
  assert.equal(upgradeTier({ tyres: 3, brakes: 3, aero: 1, chassis: 3 }), 1, 'weakest gating part wins');
  assert.equal(upgradeTier({ tyres: 3, brakes: 3, aero: 3, chassis: 0 }), 3, 'chassis is not a gate');
});

test('the speed ladder extends only as the vehicle earns it', () => {
  // The caps the roster was tuned and matrix-tested against.
  const expected = new Map([
    [hyperGt, [600, 700, 800, 900]],
    [superbike, [400, 400, 400, 500]],
    [semiTruck, [300, 300, 300, 400]],
  ]);

  for (const [spec, caps] of expected) {
    for (let tier = 0; tier <= MAX_LEVEL; tier++) {
      const built = applyUpgrades(spec, levels(tier));
      assert.equal(
        tunedMaxSpeed(spec, levels(tier)),
        caps[tier],
        `${spec.name} at tier ${tier}`,
      );
      assert.equal(built.maxLaunchKph, caps[tier], `${spec.name} derived spec at tier ${tier}`);
      assert.equal(
        speedLadder(built).at(-1),
        caps[tier],
        `${spec.name} ladder should top out at its tier cap`,
      );
    }
  }
});

test('a part fitted without the others buys no extra speed', () => {
  // Race tyres on stock rotors is not a faster car — heat is what runs out
  // first, and the physics agrees.
  for (const spec of VEHICLES) {
    for (const part of ['tyres', 'brakes', 'aero']) {
      assert.equal(
        tunedMaxSpeed(spec, only(part, MAX_LEVEL)),
        spec.maxLaunchKph,
        `${spec.name}: ${part} alone should not extend the ladder`,
      );
    }
  }
});

test('nextSpeedTier names the level that actually raises the cap', () => {
  // The GT gains a rung per tier.
  assert.deepEqual(nextSpeedTier(hyperGt, levels(0)), { kph: 700, level: 1 });
  assert.deepEqual(nextSpeedTier(hyperGt, levels(2)), { kph: 900, level: 3 });
  assert.equal(nextSpeedTier(hyperGt, levels(3)), null, 'fully built has no next tier');

  // The bike and truck hold their single rung back until everything is fitted,
  // so tiers 1 and 2 must still point at level 3 rather than reporting a gain.
  for (const spec of [superbike, semiTruck]) {
    const top = spec.speedTiers.at(-1);
    assert.deepEqual(nextSpeedTier(spec, levels(0)), { kph: top, level: 3 }, spec.name);
    assert.deepEqual(nextSpeedTier(spec, levels(2)), { kph: top, level: 3 }, spec.name);
    assert.equal(nextSpeedTier(spec, levels(3)), null, spec.name);
  }
});

test('stored levels are clamped onto the parts that exist', () => {
  assert.deepEqual(normaliseLevels(null), levels(0));
  assert.deepEqual(normaliseLevels({ tyres: 99 }), { ...levels(0), tyres: MAX_LEVEL });
  assert.deepEqual(normaliseLevels({ tyres: -4 }), levels(0));
  assert.deepEqual(normaliseLevels({ tyres: 2.7 }), { ...levels(0), tyres: 2 });
  assert.deepEqual(normaliseLevels({ nosuchpart: 3 }), levels(0));
  assert.deepEqual(normaliseLevels({ tyres: 'two' }), levels(0));

  // A clamped level must still produce a usable spec rather than reading past
  // the end of a ladder that has since been shortened.
  const spec = applyUpgrades(hyperGt, { tyres: 99, brakes: 99, aero: 99, chassis: 99 });
  assert.equal(spec.maxLaunchKph, 900);
});

test('costs rise with level and every part is buyable', () => {
  assert.equal(nextLevelCost(MAX_LEVEL), null, 'a maxed part cannot be bought again');
  for (let n = 1; n <= MAX_LEVEL; n++) {
    assert.ok(LEVEL_COSTS[n] > LEVEL_COSTS[n - 1], `level ${n} should cost more than ${n - 1}`);
    assert.equal(nextLevelCost(n - 1), LEVEL_COSTS[n]);
  }
  assert.equal(totalSpent(levels(0)), 0);
  assert.equal(
    totalSpent(levels(MAX_LEVEL)),
    PART_IDS.length * LEVEL_COSTS.reduce((a, b) => a + b, 0),
  );
});

test('every part has a full ladder of labelled steps', () => {
  for (const part of PARTS) {
    assert.equal(part.steps.length, MAX_LEVEL + 1, `${part.id} needs a step per level plus stock`);
    for (const [i, step] of part.steps.entries()) {
      assert.ok(step.label, `${part.id} level ${i} needs a label for the garage`);
    }
  }
  // Per-vehicle overrides have to be complete too, or a level would silently
  // fall back to the last step in a short array.
  for (const spec of VEHICLES) {
    for (const [id, steps] of Object.entries(spec.upgrades ?? {})) {
      assert.ok(PART_IDS.includes(id), `${spec.name} overrides unknown part "${id}"`);
      assert.equal(steps.length, MAX_LEVEL + 1, `${spec.name}: ${id} override is incomplete`);
      for (const step of steps) assert.ok(step.label, `${spec.name}: ${id} step needs a label`);
    }
  }
});
