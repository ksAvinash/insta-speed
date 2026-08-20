/**
 * The speed ladder.
 *
 * Prefer an explicit `launchSpeeds` list on the vehicle (four rungs: base +
 * three unlocks). Otherwise fall back to min → max in `speedStepKph` steps.
 *
 * Clean stops unlock the next rung. Upgrade `speedTiers` can still raise the
 * cap when present, but the stock roster uses fixed lists.
 */

/** Fallback when a spec does not declare its own floor / step. */
export const BASE_SPEED_KPH = 100;
export const SPEED_STEP_KPH = 100;

/**
 * Opening rung for a vehicle — first launch speed, minLaunchKph, or global base.
 * @param {import('../vehicles/registry.js').VehicleSpec} spec
 */
export function minLaunchKph(spec) {
  if (Array.isArray(spec.launchSpeeds) && spec.launchSpeeds.length) {
    return Math.min(...spec.launchSpeeds);
  }
  return spec.minLaunchKph ?? BASE_SPEED_KPH;
}

/**
 * @param {import('../vehicles/registry.js').VehicleSpec} spec
 * @returns {number[]} ascending, always at least one rung
 */
export function speedLadder(spec) {
  if (Array.isArray(spec.launchSpeeds) && spec.launchSpeeds.length) {
    const max = spec.maxLaunchKph ?? Math.max(...spec.launchSpeeds);
    // Include any upgrade-extended cap as a final rung when it exceeds the list.
    const rungs = [...new Set(spec.launchSpeeds.filter((v) => v <= max))];
    if (max > rungs[rungs.length - 1]) rungs.push(max);
    return rungs.sort((a, b) => a - b);
  }

  const max = spec.maxLaunchKph;
  const min = minLaunchKph(spec);
  const step = spec.speedStepKph ?? SPEED_STEP_KPH;
  if (max <= min) return [max];

  const rungs = [];
  for (let v = min; v < max; v += step) rungs.push(v);
  if (rungs[rungs.length - 1] !== max) rungs.push(max);
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
