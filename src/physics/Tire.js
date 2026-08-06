/**
 * Pacejka "magic formula" tyre model.
 *
 * Returns a friction coefficient as a function of slip. The curve rises steeply,
 * peaks a little past slip ~0.1, then falls away — which is the whole reason
 * locking the wheels costs you stopping distance rather than saving it.
 */

/**
 * @typedef {object} TireCurve
 * @property {number} B stiffness factor — how sharply grip builds with slip
 * @property {number} C shape factor — controls where the curve plateaus
 * @property {number} D peak friction coefficient
 * @property {number} E curvature factor — how far grip falls off past the peak
 */

/**
 * Friction coefficient for a given slip ratio (longitudinal) or slip angle in
 * radians (lateral). Sign of the result follows the sign of `slip`.
 * @param {number} slip
 * @param {TireCurve} curve
 */
export function pacejka(slip, curve) {
  const { B, C, D, E } = curve;
  const Bs = B * slip;
  return D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))));
}

const peakCache = new WeakMap();

/**
 * Slip ratio at which the curve produces peak grip. This is the value ABS
 * targets, so it is worth computing once per compound and caching.
 * @param {TireCurve} curve
 * @returns {{ slip: number, mu: number }}
 */
export function peakSlip(curve) {
  const cached = peakCache.get(curve);
  if (cached) return cached;

  // Coarse sweep to bracket the peak, then a golden-section refine.
  let best = 0;
  let bestMu = 0;
  for (let s = 0.005; s <= 1; s += 0.005) {
    const mu = pacejka(s, curve);
    if (mu > bestMu) {
      bestMu = mu;
      best = s;
    }
  }
  let lo = Math.max(0.001, best - 0.005);
  let hi = best + 0.005;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) * 0.382;
    const m2 = lo + (hi - lo) * 0.618;
    if (pacejka(m1, curve) > pacejka(m2, curve)) hi = m2;
    else lo = m1;
  }
  const slip = (lo + hi) / 2;
  const result = { slip, mu: pacejka(slip, curve) };
  peakCache.set(curve, result);
  return result;
}

/**
 * Longitudinal slip ratio. Negative under braking (wheel turning slower than
 * the road passing beneath it), -1 when fully locked.
 * @param {number} wheelOmega rad/s
 * @param {number} wheelRadius m
 * @param {number} groundSpeed m/s
 */
export function slipRatio(wheelOmega, wheelRadius, groundSpeed) {
  const denom = Math.max(Math.abs(groundSpeed), 1e-3);
  return (wheelOmega * wheelRadius - groundSpeed) / denom;
}

/**
 * Tyre load sensitivity: peak friction falls as vertical load rises, so a tyre
 * carrying twice the load makes appreciably less than twice the grip.
 *
 * This matters enormously under heavy braking. Without it the front axle gains
 * grip in exact proportion to the load transferred onto it, which tips the
 * vehicle into oversteer and — above the resulting critical speed — an
 * unrecoverable spin from the tiniest disturbance.
 *
 * @param {number} load current vertical load, N
 * @param {number} reference static load on that axle, N
 * @param {number} [k] fractional grip loss per unit of load ratio
 */
export function loadSensitivity(load, reference, k = 0.14) {
  if (reference <= 0) return 1;
  const ratio = load / reference;
  return Math.min(1.15, Math.max(0.45, 1 - k * (ratio - 1)));
}

/**
 * Lateral curve derived from the longitudinal one. Slip *angle* in radians is
 * a different quantity from slip *ratio*, so the stiffness factor has to be
 * rescaled — reusing B unchanged gives a cornering stiffness roughly twice
 * what a real tyre produces.
 * @param {TireCurve} curve
 */
export function lateralCurve(curve) {
  return { ...curve, B: curve.lateralB ?? curve.B * 0.5 };
}

/**
 * Remaining lateral grip once longitudinal force has eaten into the friction
 * circle. Brake at the absolute limit and you have no steering left at all.
 * @param {number} mu peak friction coefficient
 * @param {number} normalLoad N
 * @param {number} longitudinalForce N already being used
 */
export function lateralCapacity(mu, normalLoad, longitudinalForce) {
  const total = mu * normalLoad;
  const used = Math.min(Math.abs(longitudinalForce), total);
  return Math.sqrt(Math.max(0, total * total - used * used));
}
