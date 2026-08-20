import { clamp } from '../physics/constants.js';

/**
 * Scoring — out of 100, kept deliberately simple.
 *
 *   Close (0–70)  how near the line you stopped
 *   Fast  (0–30)  how much time you had left (par = full marks)
 *
 * Failures (crash / off-road / wall / timeout) score **0**.
 *
 * Fast is multiplied by Close so braking at launch and stopping 200 m short
 * cannot farm the time half. No 100,000-point pots, no squared curves.
 */

export const CLOSE_POINTS = 80;
export const FAST_POINTS = 20;
/** @deprecated use CLOSE_POINTS — kept so old imports do not explode mid-refactor */
export const PRECISION_POINTS = CLOSE_POINTS;
/** @deprecated use FAST_POINTS */
export const PACE_POINTS = FAST_POINTS;

/** Grades from metres off the line. */
export const RATINGS = [
  { grade: 'S', within: 0.5, label: 'Surgical' },
  { grade: 'A', within: 2, label: 'Excellent' },
  { grade: 'B', within: 6, label: 'Solid' },
  { grade: 'C', within: 15, label: 'Loose' },
  { grade: 'D', within: Infinity, label: 'Miles off' },
];

/**
 * How far from the line still scores. ~10% of the course, floor 10 m so short
 * openers are not scored to the centimetre.
 * @param {number} target metres to the line
 */
export function scoringWindow(target) {
  return Math.max(10, target * 0.1);
}

/**
 * Time marks: full if you finish at/under par, zero if you hit the limit.
 * @param {number} seconds
 * @param {number} parSeconds
 * @param {number} timeLimit
 */
export function clockFactor(seconds, parSeconds, timeLimit) {
  const remaining = Math.max(0, timeLimit - seconds);
  const headroom = Math.max(timeLimit - parSeconds, 1e-3);
  return clamp(remaining / headroom, 0, 1);
}

/**
 * Small credit bump for launching faster. Does **not** inflate the 0–100 score —
 * upgrades still pay by unlocking harder (better-paying) rungs via this bonus.
 * +0 at 100 km/h, +5 at 600, +8 at 900.
 * @param {number} launchSpeedKph
 */
export function speedBonus(launchSpeedKph) {
  return Math.round(Math.max(0, launchSpeedKph - 100) / 100);
}

/**
 * @deprecated Prefer speedBonus for credits. Returns 1 + tiny bump so old
 * callers that multiply a score stay roughly sane (max ~1.08).
 */
export function speedMultiplier(launchSpeedKph) {
  return 1 + speedBonus(launchSpeedKph) / 100;
}

/** @deprecated Scene difficulty now pays via credits, not a score multiplier. */
export function runMultiplier(launchSpeedKph, sceneMultiplier = 1) {
  return speedMultiplier(launchSpeedKph) * sceneMultiplier;
}

/** Purse from a run = the score itself (perfect stop → $100). */
export function creditsFor(score) {
  return Math.max(0, Math.round(score));
}

/**
 * One-time bonus the first time you clear a vehicle/scene/rung.
 * Exploring the roster funds early upgrades; grinding one run does not.
 * @param {number} launchSpeedKph
 */
export function firstClearBonus(launchSpeedKph) {
  return 20 + Math.round(launchSpeedKph / 20); // 25–65-ish
}

/**
 * @param {object} run
 * @param {boolean} run.clean stop on the road, short of the wall
 * @param {number} run.error metres from the target line
 * @param {number} run.target target distance, m
 * @param {number} run.seconds actual run time
 * @param {number} run.parSeconds perfect-run time
 * @param {number} [run.timeLimit] hard clock; falls back to par-only if omitted
 */
export function scoreRun({ clean, error, target, seconds, parSeconds, timeLimit }) {
  const remainingSeconds = Math.max(0, (timeLimit ?? parSeconds) - seconds);

  if (!clean) {
    return {
      score: 0,
      close: 0,
      fast: 0,
      closePoints: 0,
      fastPoints: 0,
      remainingSeconds: 0,
      // Aliases so UI / Game keep working without a big rename pass.
      accuracy: 0,
      pace: 0,
      parPace: 0,
      clock: 0,
      precisionPoints: 0,
      paceBonus: 0,
      multiplier: 1,
    };
  }

  const window = scoringWindow(target);
  const close = clamp(1 - error / window, 0, 1);

  const limit = timeLimit ?? parSeconds;
  // At or under par → full time marks. Hitting the limit → zero.
  const fast = timeLimit != null ? clockFactor(seconds, parSeconds, limit) : clamp(parSeconds / Math.max(seconds, 0.001), 0, 1);
  // Also track raw "vs par" for the result card (informational only).
  const parPace = clamp(parSeconds / Math.max(seconds, 0.001), 0, 1);

  const closePoints = Math.round(CLOSE_POINTS * close);
  // Fast is gated by close — a quick miss is still a miss.
  const fastPoints = Math.round(FAST_POINTS * close * fast);

  return {
    score: closePoints + fastPoints,
    close,
    fast,
    closePoints,
    fastPoints,
    remainingSeconds,
    accuracy: close,
    pace: fast,
    parPace,
    clock: fast,
    precisionPoints: closePoints,
    paceBonus: fastPoints,
    multiplier: 1,
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
