import { clamp } from '../physics/constants.js';

/**
 * Scoring.
 *
 * Two things are worth points, and they pull against each other:
 *
 * - **Precision** — how close to the line you stopped. Squared, so the last
 *   metre is worth far more than the first ten.
 * - **Pace** — how little time the run took. The fastest way to reach a line
 *   you still have to stop on is to stay at speed and brake at the last
 *   possible moment, so this rewards committing late rather than nursing the
 *   car down early and creeping in.
 *
 * Pace is multiplied by precision rather than added alongside it. Otherwise the
 * quickest run available would be to stand on the brake at launch, stop 300 m
 * short in record time and collect the pace half anyway.
 *
 * Kept free of any registry import so it stays testable under plain node.
 */

export const PRECISION_POINTS = 70000;
export const PACE_POINTS = 30000;

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
 * @param {object} run
 * @param {boolean} run.clean true only for a stop on the road, short of the wall
 * @param {number} run.error metres from the target line
 * @param {number} run.target target distance, m
 * @param {number} run.seconds what the run actually took
 * @param {number} run.parSeconds what a perfectly judged run takes
 * @param {number} [run.multiplier] speed × scene, see `runMultiplier`
 */
export function scoreRun({ clean, error, target, seconds, parSeconds, multiplier = 1 }) {
  if (!clean) {
    return { score: 0, accuracy: 0, pace: 0, precisionPoints: 0, paceBonus: 0, multiplier };
  }

  const accuracy = clamp(1 - error / scoringWindow(target), 0, 1);
  // Par is measured in still air with no steering, so a real run on a windy
  // bridge can never quite match it. Landing at or under par is simply full
  // marks rather than something to chase past.
  const pace = clamp(parSeconds / Math.max(seconds, 0.001), 0, 1);

  // The multiplier scales both halves, so it can never rescue a run that missed
  // — a stop 200 m short still multiplies out to zero.
  const precisionPoints = Math.round(PRECISION_POINTS * accuracy ** 2 * multiplier);
  const paceBonus = Math.round(PACE_POINTS * accuracy * pace * multiplier);

  return {
    score: precisionPoints + paceBonus,
    accuracy,
    pace,
    precisionPoints,
    paceBonus,
    multiplier,
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
