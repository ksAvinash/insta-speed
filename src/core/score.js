import { clamp } from '../physics/constants.js';

/**
 * Scoring.
 *
 * Three things are worth points, and they pull against each other:
 *
 * - **Precision** — how close to the line you stopped. Squared, so the last
 *   metre is worth far more than the first ten.
 * - **Pace** — how little time the run took versus par (coast then brake flat
 *   out). Rewards committing late rather than nursing the car down early.
 * - **Clock** — how much of the run limit you still had when you stopped.
 *   Finishing with time in hand pays; scraping in on the buzzer does not.
 *
 * Pace and clock are blended into one "speed" half, then multiplied by
 * precision. Otherwise the quickest run available would be to stand on the
 * brake at launch, stop 300 m short in record time and collect the speed half
 * anyway — and a stop that lands with 0.1 s left would score the same as one
 * that left half the limit unused.
 *
 * Kept free of any registry import so it stays testable under plain node.
 */

export const PRECISION_POINTS = 70000;
export const PACE_POINTS = 30000;

/** Share of the speed half that comes from beating par vs saving clock. */
export const PAR_WEIGHT = 0.55;
export const CLOCK_WEIGHT = 0.45;

/**
 * The multiplier is what makes upgrades worth buying.
 *
 * `core/course.js` places the target line by simulating the vehicle you are
 * actually driving, so fitting better brakes moves the line closer and par
 * shrinks with it — the raw score at a given rung barely moves. Upgrades
 * therefore cannot pay off inside a run; they pay off by extending the ladder,
 * and the reward has to live on the rung itself.
 *
 * At 100 km/h this is 1.0 and at 900 it is 2.6, so a fully built car earns
 * roughly two and a half times what it did on its first launch.
 */
const SPEED_MULTIPLIER_PER_KPH = 1 / 500;
const REFERENCE_KPH = 100;

/** @param {number} launchSpeedKph */
export function speedMultiplier(launchSpeedKph) {
  return 1 + Math.max(0, launchSpeedKph - REFERENCE_KPH) * SPEED_MULTIPLIER_PER_KPH;
}

/**
 * Total multiplier for a run. The scene half is declared per scene
 * (`scoreMultiplier`), so a crosswind bridge pays for the extra difficulty
 * rather than just being the annoying one.
 * @param {number} launchSpeedKph
 * @param {number} [sceneMultiplier]
 */
export function runMultiplier(launchSpeedKph, sceneMultiplier = 1) {
  return speedMultiplier(launchSpeedKph) * sceneMultiplier;
}

/** Credits banked from a score. Kept coarse — the wallet is not a second score. */
export function creditsFor(score) {
  return Math.round(score / 100);
}

/**
 * Paid once per vehicle/scene/rung, the first time it is stopped cleanly.
 * Exploring the roster should fund the first upgrades; grinding one known run
 * should not.
 * @param {number} launchSpeedKph
 */
export function firstClearBonus(launchSpeedKph) {
  return Math.round(300 + launchSpeedKph * 2);
}

/** Rating bands, in metres of error from the target line. */
export const RATINGS = [
  { grade: 'S', within: 0.5, label: 'Surgical' },
  { grade: 'A', within: 2, label: 'Excellent' },
  { grade: 'B', within: 6, label: 'Solid' },
  { grade: 'C', within: 15, label: 'Loose' },
  { grade: 'D', within: Infinity, label: 'Miles off' },
];

/**
 * How far from the line still scores anything. Proportional to course length,
 * with a floor so the short opening courses are not brutal.
 * @param {number} target
 */
export function scoringWindow(target) {
  return Math.max(20, target * 0.12);
}

/**
 * How much of the "perfect run's spare clock" you still had when you stopped.
 *
 * A par run leaves `timeLimit − parSeconds` on the board; that headroom is
 * full marks. Stopping later burns it. Stopping earlier cannot exceed 1 — the
 * same cap as beating par, so you cannot farm by inventing a shorter run.
 *
 * @param {number} seconds actual run time
 * @param {number} parSeconds
 * @param {number} timeLimit
 */
export function clockFactor(seconds, parSeconds, timeLimit) {
  const remaining = Math.max(0, timeLimit - seconds);
  const headroom = Math.max(timeLimit - parSeconds, 1e-3);
  return clamp(remaining / headroom, 0, 1);
}

/**
 * @param {object} run
 * @param {boolean} run.clean true only for a stop on the road, short of the wall
 * @param {number} run.error metres from the target line
 * @param {number} run.target target distance, m
 * @param {number} run.seconds what the run actually took
 * @param {number} run.parSeconds what a perfectly judged run takes
 * @param {number} [run.timeLimit] hard clock for the pairing; required for the
 *   remaining-time half. Falls back to par-only pace if omitted (tests).
 * @param {number} [run.multiplier] speed × scene, see `runMultiplier`
 */
export function scoreRun({
  clean,
  error,
  target,
  seconds,
  parSeconds,
  timeLimit,
  multiplier = 1,
}) {
  if (!clean) {
    return {
      score: 0,
      accuracy: 0,
      pace: 0,
      clock: 0,
      precisionPoints: 0,
      paceBonus: 0,
      multiplier,
      remainingSeconds: 0,
    };
  }

  const accuracy = clamp(1 - error / scoringWindow(target), 0, 1);
  // Par is measured in still air with no steering, so a real run on a windy
  // bridge can never quite match it. Landing at or under par is simply full
  // marks rather than something to chase past.
  const parPace = clamp(parSeconds / Math.max(seconds, 0.001), 0, 1);

  const limit = timeLimit ?? parSeconds;
  const remainingSeconds = Math.max(0, limit - seconds);
  const clock = timeLimit != null ? clockFactor(seconds, parSeconds, timeLimit) : parPace;

  // Speed half: commit late (par) and leave time on the clock (remaining).
  const pace = parPace * PAR_WEIGHT + clock * CLOCK_WEIGHT;

  // The multiplier scales both halves, so it can never rescue a run that missed
  // — a stop 200 m short still multiplies out to zero.
  const precisionPoints = Math.round(PRECISION_POINTS * accuracy ** 2 * multiplier);
  const paceBonus = Math.round(PACE_POINTS * accuracy * pace * multiplier);

  return {
    score: precisionPoints + paceBonus,
    accuracy,
    pace,
    parPace,
    clock,
    precisionPoints,
    paceBonus,
    multiplier,
    remainingSeconds,
  };
}

const FAILURE_LABELS = {
  crash: 'Wrecked',
  timeout: 'Out of time',
  offroad: 'Off the road',
};

/**
 * @param {boolean} clean
 * @param {number} error metres from the line
 * @param {'stopped'|'overshoot'|'crash'|'offroad'|'timeout'} outcome
 */
export function rateRun(clean, error, outcome) {
  if (clean) return RATINGS.find((r) => error <= r.within);
  return { grade: 'F', label: FAILURE_LABELS[outcome] ?? 'Failed' };
}
