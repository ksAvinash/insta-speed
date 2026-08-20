/**
 * Vehicle upgrades.
 *
 * A part level is pure data: it names field paths on the vehicle spec and how
 * to change them. `applyUpgrades` folds those into a *derived* spec, which is
 * what the sim, the course builder and the renderer all see. Nothing in
 * `physics/` knows upgrades exist.
 *
 * Two things this module must get right, both of them load-bearing:
 *
 * 1. **The base spec is never mutated.** The specs in `./specs/` are module
 *    singletons shared by every run, the garage preview and the test suite.
 *    `tire` and `brake` are cloned before anything is written to them — a
 *    shallow spread of the spec would share those objects and one purchase
 *    would silently re-tune the vehicle everywhere, permanently.
 *
 * 2. **Derived specs are memoised.** `Tire.peakSlip` caches on the tyre curve
 *    object identity, so a fresh derived spec costs a 200-sample sweep plus 40
 *    golden-section iterations. The garage rebuilds the course on every
 *    interaction, which would otherwise redo that solve several times a click.
 *
 * Why upgrades do not simply make a run easier: `core/course.js` places the
 * target line by simulating *this* vehicle, so fitting better brakes moves the
 * line closer and par shrinks with it. The score at a given rung is very nearly
 * invariant. What upgrades actually buy is altitude — the speed ladder extends
 * (`speedTiers`), and `core/score.js` pays a multiplier for the faster rung.
 *
 * Kept free of any registry import so it stays testable under plain node.
 */

/** Levels available on every part. Level 0 is the stock component. */
export const MAX_LEVEL = 3;

/**
 * Credit cost to move *up to* each level. Index is the level being bought.
 * Tuned for the 0–100 score (= credits) model: a perfect run pays 100 cr, so
 * L1 is about one good clear, L3 a short campaign.
 */
export const LEVEL_COSTS = [0, 120, 280, 600];

/**
 * A step is three optional maps of dotted spec paths:
 * `mul` multiplies, `add` adds, `set` replaces. Splitting them rather than
 * writing one map of magic numbers keeps the data files readable — `mul` of
 * 1.12 and `add` of 90 mean obviously different things at a glance.
 *
 * @typedef {object} UpgradeStep
 * @property {string} label what the player is buying
 * @property {Record<string, number>} [mul]
 * @property {Record<string, number>} [add]
 * @property {Record<string, number|boolean>} [set]
 */

/**
 * The stock roster's default part ladders. A vehicle overrides any of these
 * with an `upgrades` block in its own spec file — see `specs/superbike.js`,
 * whose tyres deliberately buy lateral grip rather than longitudinal bite.
 *
 * @type {{ id: string, name: string, blurb: string, steps: UpgradeStep[] }[]}
 */
export const PARTS = [
  {
    id: 'tyres',
    name: 'Tyres',
    blurb: 'Peak friction, and how much of it is left for steering.',
    steps: [
      { label: 'Stock compound' },
      { label: 'Sport compound', mul: { 'tire.D': 1.05 }, set: { 'tire.lateralGrip': 1.1 } },
      { label: 'Track compound', mul: { 'tire.D': 1.1 }, set: { 'tire.lateralGrip': 1.12 } },
      { label: 'Slick compound', mul: { 'tire.D': 1.16 }, set: { 'tire.lateralGrip': 1.14 } },
    ],
  },
  {
    id: 'brakes',
    name: 'Brakes',
    blurb: 'Torque, and the thermal mass to survive using it.',
    steps: [
      { label: 'Stock discs' },
      {
        label: 'Vented steel',
        mul: { 'brake.maxTorque': 1.12, 'brake.rotorMass': 1.18 },
        add: { 'brake.fadeTempC': 90 },
      },
      {
        label: 'Two-piece floating',
        mul: { 'brake.maxTorque': 1.24, 'brake.rotorMass': 1.36 },
        add: { 'brake.fadeTempC': 170 },
      },
      {
        label: 'Carbon-ceramic + ABS',
        mul: { 'brake.maxTorque': 1.35, 'brake.rotorMass': 1.55 },
        add: { 'brake.fadeTempC': 250 },
        set: { 'brake.abs': true },
      },
    ],
  },
  {
    id: 'aero',
    name: 'Aero',
    blurb: 'Downforce, and a centre of pressure far enough back to stay straight.',
    steps: [
      { label: 'Stock body' },
      { label: 'Lip and splitter', add: { liftCoefficient: -0.12 }, mul: { sideArea: 0.95 }, set: { aeroCpOffset: -0.14 } },
      { label: 'Adjustable wing', add: { liftCoefficient: -0.24 }, mul: { sideArea: 0.9 }, set: { aeroCpOffset: -0.19 } },
      { label: 'Full ground effect', add: { liftCoefficient: -0.38 }, mul: { sideArea: 0.85 }, set: { aeroCpOffset: -0.25 } },
    ],
  },
  {
    id: 'chassis',
    name: 'Chassis',
    blurb: 'Mass and centre-of-gravity height — how violent the load transfer is.',
    steps: [
      { label: 'Stock shell' },
      { label: 'Stripped interior', mul: { mass: 0.98, cgHeight: 0.98, unsprungMassPerAxle: 0.94 } },
      { label: 'Aluminium subframes', mul: { mass: 0.96, cgHeight: 0.96, unsprungMassPerAxle: 0.88 } },
      { label: 'Full carbon tub', mul: { mass: 0.93, cgHeight: 0.93, unsprungMassPerAxle: 0.8 } },
    ],
  },
];

export const PART_IDS = PARTS.map((p) => p.id);

/**
 * Parts that gate the speed ladder. Chassis is deliberately excluded: it is the
 * one upgrade with no downside, so requiring it would make the tier a formality
 * rather than a choice about how the vehicle behaves.
 */
const TIER_PARTS = ['tyres', 'brakes', 'aero'];

/** @type {Record<string, number>} */
export const ZERO_LEVELS = Object.fromEntries(PART_IDS.map((id) => [id, 0]));

/**
 * Clamps whatever came out of storage onto the parts that actually exist.
 * Levels are persisted, so a part being retuned or removed must not be able to
 * produce an out-of-range index later.
 * @param {Record<string, unknown>} [raw]
 */
export function normaliseLevels(raw) {
  const out = { ...ZERO_LEVELS };
  if (!raw || typeof raw !== 'object') return out;
  for (const id of PART_IDS) {
    const n = Math.floor(Number(raw[id]));
    out[id] = Number.isFinite(n) ? Math.min(MAX_LEVEL, Math.max(0, n)) : 0;
  }
  return out;
}

/** @param {string} id */
export function getPart(id) {
  return PARTS.find((p) => p.id === id);
}

/**
 * The step data for a part at a level, taking any per-vehicle override.
 * @param {import('./registry.js').VehicleSpec} spec
 * @param {string} partId
 * @param {number} level
 * @returns {UpgradeStep}
 */
export function stepFor(spec, partId, level) {
  const steps = spec.upgrades?.[partId] ?? getPart(partId)?.steps ?? [];
  return steps[Math.min(level, steps.length - 1)] ?? { label: '' };
}

/** Credits to move this part from its current level to the next one. */
export function nextLevelCost(level) {
  return level >= MAX_LEVEL ? null : LEVEL_COSTS[level + 1];
}

/** What has already been sunk into a vehicle, for the "sell" maths we do not have. */
export function totalSpent(levels) {
  return PART_IDS.reduce((sum, id) => {
    let n = 0;
    for (let l = 1; l <= (levels[id] ?? 0); l++) n += LEVEL_COSTS[l];
    return sum + n;
  }, 0);
}

/**
 * The vehicle's upgrade tier: the *lowest* of the three parts that gate speed.
 * A car with race tyres and stock brakes has not earned a faster launch — the
 * rotors are what actually run out first, and the physics agrees.
 * @param {Record<string, number>} levels
 */
export function upgradeTier(levels) {
  return TIER_PARTS.reduce((min, id) => Math.min(min, levels[id] ?? 0), MAX_LEVEL);
}

/**
 * Top of the speed ladder for a build. `speedTiers[i]` is the cap once every
 * gating part reaches level `i + 1`; vehicles without the field never extend.
 *
 * The entries are per-vehicle rather than a flat +100 per tier because the
 * roster cannot take a uniform bump: the GT gains 700/800/900, while the truck
 * on packed snow stretches its judgement window past the point where the run is
 * a stop rather than a wait. See the tier notes in each spec file.
 *
 * @param {import('./registry.js').VehicleSpec} spec
 * @param {Record<string, number>} levels
 */
export function tunedMaxSpeed(spec, levels) {
  const tier = upgradeTier(levels);
  const tiers = spec.speedTiers;
  if (!tier || !Array.isArray(tiers) || !tiers.length) return spec.maxLaunchKph;
  const capped = tiers[Math.min(tier, tiers.length) - 1];
  return Math.max(spec.maxLaunchKph, capped ?? spec.maxLaunchKph);
}

/**
 * The next cap this vehicle can reach, and what it takes to get there.
 * `null` once the ladder is fully extended.
 * @returns {{ kph: number, level: number } | null}
 */
export function nextSpeedTier(spec, levels) {
  const tiers = spec.speedTiers;
  if (!Array.isArray(tiers) || !tiers.length) return null;
  const current = tunedMaxSpeed(spec, levels);
  for (let level = upgradeTier(levels) + 1; level <= Math.min(MAX_LEVEL, tiers.length); level++) {
    if (tiers[level - 1] > current) return { kph: tiers[level - 1], level };
  }
  return null;
}

/* ------------------------------- application ------------------------------ */

/** Reads a dotted path off the spec. */
function read(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** Writes a dotted path. Only ever called on an object we already cloned. */
function write(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

/** @param {UpgradeStep} step */
function applyStep(out, step) {
  for (const [path, factor] of Object.entries(step.mul ?? {})) {
    const current = read(out, path);
    if (typeof current === 'number') write(out, path, current * factor);
  }
  for (const [path, delta] of Object.entries(step.add ?? {})) {
    const current = read(out, path);
    if (typeof current === 'number') write(out, path, current + delta);
  }
  for (const [path, value] of Object.entries(step.set ?? {})) {
    write(out, path, value);
  }
}

/** @type {WeakMap<object, Map<string, object>>} */
const derivedCache = new WeakMap();

/**
 * The spec the sim should actually run, given a set of part levels.
 *
 * Returns the base spec unchanged when nothing is fitted, so a stock vehicle
 * keeps its module identity and every existing cache — including the tyre peak
 * solve — stays warm.
 *
 * @param {import('./registry.js').VehicleSpec} spec
 * @param {Record<string, number>} [rawLevels]
 * @returns {import('./registry.js').VehicleSpec}
 */
export function applyUpgrades(spec, rawLevels) {
  const levels = normaliseLevels(rawLevels);
  const key = PART_IDS.map((id) => levels[id]).join('');
  if (key === PART_IDS.map(() => 0).join('')) return spec;

  let perSpec = derivedCache.get(spec);
  if (!perSpec) {
    perSpec = new Map();
    derivedCache.set(spec, perSpec);
  }
  const hit = perSpec.get(key);
  if (hit) return hit;

  // Clone the two nested objects the steps write into. Everything else on a
  // spec is a scalar or render-only data we never touch.
  const out = {
    ...spec,
    tire: { ...spec.tire },
    brake: { ...spec.brake },
    // Defaults have to be materialised before a multiplier can land on them.
    unsprungMassPerAxle: spec.unsprungMassPerAxle ?? spec.mass * 0.03,
    sideArea: spec.sideArea ?? spec.frontalArea * 2.4,
  };

  // Steps are absolute against stock rather than cumulative, so only the level
  // actually fitted is applied. Compounding each level onto the last would make
  // the top of a ladder far stronger than its own numbers suggest, and would
  // make the data impossible to read against the base spec.
  for (const id of PART_IDS) {
    if (levels[id] > 0) applyStep(out, stepFor(spec, id, levels[id]));
  }

  out.maxLaunchKph = tunedMaxSpeed(spec, levels);
  out.upgradeLevels = levels;
  out.upgradeTier = upgradeTier(levels);

  perSpec.set(key, out);
  return out;
}
