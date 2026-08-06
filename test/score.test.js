import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRun,
  rateRun,
  scoringWindow,
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
