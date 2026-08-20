import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRun,
  rateRun,
  scoringWindow,
  speedBonus,
  creditsFor,
  firstClearBonus,
  clockFactor,
  CLOSE_POINTS,
  FAST_POINTS,
} from '../src/core/score.js';
import { timeLimitFor } from '../src/core/course.js';

/** Mid course: 500 m line, par 10 s. */
const parSeconds = 10;
const timeLimit = timeLimitFor(parSeconds);
const course = { target: 500, parSeconds, timeLimit };

const run = (patch) =>
  scoreRun({ clean: true, error: 0, seconds: parSeconds, ...course, ...patch });

test('a perfect stop at par scores 100', () => {
  const r = run({});
  assert.equal(r.score, 100);
  assert.equal(r.closePoints, CLOSE_POINTS);
  assert.equal(r.fastPoints, FAST_POINTS);
  assert.equal(r.close, 1);
  assert.equal(r.fast, 1);
});

test('a failed run scores nothing', () => {
  const r = scoreRun({ clean: false, error: 0.1, seconds: 10, ...course });
  assert.equal(r.score, 0);
  assert.equal(r.closePoints, 0);
  assert.equal(r.fastPoints, 0);
});

test('stopping further from the line scores less', () => {
  const scores = [0, 2, 10, 40].map((error) => run({ error }).score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] < scores[i - 1]);
  }
  assert.equal(run({ error: scoringWindow(course.target) }).score, 0);
});

test('the same stop scores less when you use more of the clock', () => {
  const quick = run({ seconds: 10 });
  const slow = run({ seconds: 16 });
  assert.ok(slow.score < quick.score);
  assert.equal(slow.closePoints, quick.closePoints);
  assert.ok(slow.fastPoints < quick.fastPoints);
});

test('finishing under par still caps at 100', () => {
  assert.equal(run({ seconds: 4 }).score, 100);
  assert.equal(run({ seconds: 4 }).fast, 1);
});

test('a fast stop far from the line earns nothing', () => {
  const cheat = run({ error: 200, seconds: 3 });
  assert.equal(cheat.score, 0);
});

test('close is worth more than fast', () => {
  // 80/20 split: a clean-but-slow stop should still beat a quick miss.
  const sloppyButQuick = run({ error: 10, seconds: 10 });
  const preciseButSlow = run({ error: 0, seconds: 15 });
  assert.ok(
    preciseButSlow.score > sloppyButQuick.score,
    `precise ${preciseButSlow.score} should beat quick ${sloppyButQuick.score}`,
  );
});

test('short courses get a floor under the scoring window', () => {
  assert.equal(scoringWindow(50), 10);
  assert.equal(scoringWindow(1000), 100);
});

test('grades follow the error, and a failed run is an F', () => {
  assert.equal(rateRun(true, 0.2, 'stopped').grade, 'S');
  assert.equal(rateRun(true, 1.5, 'stopped').grade, 'A');
  assert.equal(rateRun(true, 40, 'stopped').grade, 'D');
  assert.equal(rateRun(false, 0.1, 'crash').label, 'Wrecked');
  assert.equal(rateRun(false, 0.1, 'offroad').grade, 'F');
});

test('every failure outcome gets its own label', () => {
  for (const [outcome, label] of [
    ['crash', 'Wrecked'],
    ['timeout', 'Out of time'],
    ['offroad', 'Off the road'],
    ['overshoot', 'Failed'],
  ]) {
    const r = rateRun(false, 3, outcome);
    assert.equal(r.grade, 'F');
    assert.equal(r.label, label);
  }
});

test('clock factor is full at par and zero at the limit', () => {
  assert.equal(clockFactor(parSeconds, parSeconds, timeLimit), 1);
  assert.equal(clockFactor(timeLimit, parSeconds, timeLimit), 0);
});

test('credits equal the score', () => {
  assert.equal(creditsFor(100), 100);
  assert.equal(creditsFor(0), 0);
  assert.equal(creditsFor(47), 47);
});

test('speed bonus grows slowly with launch speed', () => {
  assert.equal(speedBonus(100), 0);
  assert.equal(speedBonus(200), 1);
  assert.equal(speedBonus(600), 5);
  assert.ok(speedBonus(900) > speedBonus(600));
});

test('first clears pay a modest bonus that grows with speed', () => {
  let last = 0;
  for (const kph of [100, 200, 400, 600, 900]) {
    const bonus = firstClearBonus(kph);
    assert.ok(bonus > last);
    assert.ok(bonus < 100, 'first-clear stays small next to a 100-point run');
    last = bonus;
  }
});
