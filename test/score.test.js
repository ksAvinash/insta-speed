import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRun,
  rateRun,
  scoringWindow,
  speedMultiplier,
  runMultiplier,
  creditsFor,
  firstClearBonus,
  PRECISION_POINTS,
  PACE_POINTS,
} from '../src/core/score.js';

/** A mid-ladder course: 500 m line, par 10 s. */
const course = { target: 500, parSeconds: 10 };

const run = (patch) => scoreRun({ clean: true, error: 0, seconds: 10, ...course, ...patch });

test('a perfect run at par scores the full hundred thousand', () => {
  const r = run({});
  assert.equal(r.score, PRECISION_POINTS + PACE_POINTS);
  assert.equal(r.accuracy, 1);
  assert.equal(r.pace, 1);
});

test('a failed run scores nothing however it ended', () => {
  for (const outcome of ['crash', 'offroad', 'overshoot']) {
    const r = scoreRun({ clean: false, error: 0.1, seconds: 10, ...course });
    assert.equal(r.score, 0, `${outcome} should score nothing`);
    assert.equal(r.paceBonus, 0);
  }
});

test('stopping further from the line scores less', () => {
  const scores = [0, 2, 10, 30].map((error) => run({ error }).score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] < scores[i - 1], `error ${i} scored ${scores[i]}, no worse than ${scores[i - 1]}`);
  }
  assert.equal(run({ error: scoringWindow(course.target) }).score, 0, 'outside the window is worthless');
});

test('the same stop scores less the longer it took', () => {
  const quick = run({ seconds: 10 });
  const slow = run({ seconds: 16 });
  assert.ok(slow.score < quick.score, `${slow.score} should be under ${quick.score}`);
  // Only the pace half moves: precision is identical for an identical stop.
  assert.equal(slow.precisionPoints, quick.precisionPoints);
});

test('beating par is capped rather than farmed', () => {
  assert.equal(run({ seconds: 4 }).pace, 1, 'under par is simply full marks');
  assert.equal(run({ seconds: 4 }).score, run({ seconds: 10 }).score);
});

test('a fast stop miles short of the line earns almost nothing', () => {
  // The obvious exploit: brake at launch, stop 200 m short in record time. Pace
  // is gated by accuracy precisely so this cannot pay.
  const cheat = run({ error: 200, seconds: 3 });
  assert.equal(cheat.pace, 1, 'it really was quick');
  assert.equal(cheat.score, 0, 'and worth nothing at all');
});

test('precision is worth more than pace', () => {
  const sloppyButQuick = run({ error: 8, seconds: 10 });
  const preciseButSlow = run({ error: 0, seconds: 20 });
  assert.ok(
    preciseButSlow.score > sloppyButQuick.score,
    `precise ${preciseButSlow.score} should beat quick ${sloppyButQuick.score}`,
  );
});

test('short courses get a floor under the scoring window', () => {
  assert.equal(scoringWindow(50), 20, 'a 50 m opening course is not scored to the centimetre');
  assert.equal(scoringWindow(1000), 120);
});

test('grades follow the error, and a failed run is an F', () => {
  assert.equal(rateRun(true, 0.2, 'stopped').grade, 'S');
  assert.equal(rateRun(true, 1.5, 'stopped').grade, 'A');
  assert.equal(rateRun(true, 40, 'stopped').grade, 'D');
  assert.equal(rateRun(false, 0.1, 'crash').label, 'Wrecked');
  assert.equal(rateRun(false, 0.1, 'offroad').grade, 'F');
});

test('every failure outcome gets its own label, including the clock', () => {
  for (const [outcome, label] of [
    ['crash', 'Wrecked'],
    ['timeout', 'Out of time'],
    ['offroad', 'Off the road'],
    ['overshoot', 'Failed'],
  ]) {
    const r = rateRun(false, 3, outcome);
    assert.equal(r.grade, 'F');
    assert.equal(r.label, label, `${outcome} should read "${label}"`);
  }
});

test('running out of time scores nothing, however close to the line', () => {
  // Half a metre off the line is an S-grade stop — but only if you stopped.
  const r = scoreRun({ clean: false, error: 0.1, seconds: 30, ...course });
  assert.equal(r.score, 0);
});

/* ------------------------------ multipliers ------------------------------ */

test('the multiplier pays for launch speed', () => {
  assert.equal(speedMultiplier(100), 1, 'the opening rung is the reference');
  assert.equal(speedMultiplier(600), 2);
  assert.equal(speedMultiplier(900), 2.6);

  // Monotonic all the way up, and never below 1 — a rung under the reference
  // must not be able to pay a penalty.
  let last = 0;
  for (let kph = 100; kph <= 900; kph += 100) {
    const m = speedMultiplier(kph);
    assert.ok(m > last, `${kph} km/h should pay more than the rung below`);
    last = m;
  }
  assert.equal(speedMultiplier(50), 1, 'below the reference is still the base rate');
});

test('the scene multiplier compounds with the speed one', () => {
  assert.equal(runMultiplier(100, 1), 1);
  assert.equal(runMultiplier(600, 1.35), speedMultiplier(600) * 1.35);
  assert.equal(runMultiplier(600), speedMultiplier(600), 'a scene without one is neutral');
});

test('the multiplier scales a score without ever rescuing a miss', () => {
  const plain = run({ error: 1 });
  const doubled = run({ error: 1, multiplier: 2 });
  assert.ok(Math.abs(doubled.score - plain.score * 2) <= 1, 'both halves scale');

  // The load-bearing property of the whole scoring model: pace is multiplied by
  // precision, so a quick stop 200 m short is worth nothing at any multiplier.
  assert.equal(run({ error: 200, seconds: 3, multiplier: 2.6 }).score, 0);
  assert.equal(
    scoreRun({ clean: false, error: 0.1, seconds: 10, multiplier: 2.6, ...course }).score,
    0,
    'a failed run is zero however fast it was launched',
  );
});

test('a faster rung is worth more than the same stop on a slower one', () => {
  // This is the entire reason to buy upgrades: the course adapts to the vehicle,
  // so the raw score barely moves — the payoff has to live on the rung.
  const opening = run({ multiplier: runMultiplier(100, 1) });
  const topRung = run({ multiplier: runMultiplier(900, 1.35) });
  assert.ok(topRung.score > opening.score * 3, `${topRung.score} against ${opening.score}`);
});

test('credits follow the score, and first clears pay a bonus on top', () => {
  assert.equal(creditsFor(100000), 1000);
  assert.equal(creditsFor(0), 0);

  let last = 0;
  for (let kph = 100; kph <= 900; kph += 100) {
    const bonus = firstClearBonus(kph);
    assert.ok(bonus > last, `${kph} km/h should pay a bigger first clear`);
    last = bonus;
  }

  // A first clear has to be worth a meaningful slice of the cheapest part, or
  // working through the roster is not a real way to fund the first upgrade.
  assert.ok(firstClearBonus(100) >= 400);
});
