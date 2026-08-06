/**
 * The speed ladder.
 *
 * Players start every vehicle at 100 km/h and unlock the next rung — 100 km/h
 * faster — by bringing the previous one to a clean stop. The final rung is the
 * vehicle's own top speed, so the ladder always ends on a round, characterful
 * number rather than wherever the increments happened to land.
 *
 * The step is deliberately a whole 100: a 50 km/h bump barely changes how a
 * stop feels, so half the ladder read as the same run twice.
 */

export const BASE_SPEED_KPH = 100;
export const SPEED_STEP_KPH = 100;

/**
 * @param {import('../vehicles/registry.js').VehicleSpec} spec
 * @returns {number[]} ascending, always at least one rung
 */
export function speedLadder(spec) {
  const max = spec.maxLaunchKph;
  if (max <= BASE_SPEED_KPH) return [max];

  const rungs = [];
  for (let v = BASE_SPEED_KPH; v < max; v += SPEED_STEP_KPH) rungs.push(v);
  rungs.push(max);
  return rungs;
}

/** The rung after `speed`, or `null` if it is already the top. */
export function nextSpeed(spec, speed) {
  const ladder = speedLadder(spec);
  const i = ladder.indexOf(speed);
  if (i === -1) return ladder.find((v) => v > speed) ?? null;
  return ladder[i + 1] ?? null;
}

/** Snaps an arbitrary speed onto the ladder, clamped to what is unlocked. */
export function clampToLadder(spec, speed, unlocked = Infinity) {
  const ladder = speedLadder(spec);
  const allowed = ladder.filter((v) => v <= unlocked);
  const usable = allowed.length ? allowed : [ladder[0]];
  if (usable.includes(speed)) return speed;
  // Nearest rung at or below the request, else the slowest available.
  return [...usable].reverse().find((v) => v <= speed) ?? usable[0];
}
