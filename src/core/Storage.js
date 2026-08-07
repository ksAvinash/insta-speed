/** Personal bests, progression and the garage wallet. */

import { PART_IDS, MAX_LEVEL, normaliseLevels } from '../vehicles/upgrades.js';

// v2: scores gained a speed and scene multiplier, so a v1 best is not
// comparable with anything set afterwards. Old bests are dropped rather than
// scaled — there is no honest factor to scale them by.
const KEY = 'insta-speed:bests:v2';
const SETTINGS_KEY = 'insta-speed:settings:v1';
const PROGRESS_KEY = 'insta-speed:progress:v1';
const GARAGE_KEY = 'insta-speed:garage:v1';

/** @returns {Record<string, { score: number, errorM: number, date: number }>} */
function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

const slot = (vehicleId, sceneId) => `${vehicleId}::${sceneId}`;

export function getBest(vehicleId, sceneId) {
  return readAll()[slot(vehicleId, sceneId)] ?? null;
}

/**
 * Stores the run if it beats the existing best.
 * @returns {boolean} true when a new record was set
 */
export function recordBest(vehicleId, sceneId, score, errorM) {
  const all = readAll();
  const key = slot(vehicleId, sceneId);
  const prev = all[key];
  if (prev && prev.score >= score) return false;
  all[key] = { score, errorM, date: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private browsing — scores just won't persist */
  }
  return true;
}

/* ------------------------------- progression ------------------------------ */

/** @returns {Record<string, number>} vehicle id → fastest speed unlocked */
function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Fastest launch speed the player has earned on this vehicle.
 * @param {string} vehicleId
 * @param {number} base slowest rung on the ladder
 */
export function getUnlockedSpeed(vehicleId, base) {
  const stored = readProgress()[vehicleId];
  return typeof stored === 'number' ? Math.max(stored, base) : base;
}

/**
 * Records a newly earned speed.
 * @returns {boolean} true if this actually unlocked something new
 */
export function unlockSpeed(vehicleId, kph) {
  const all = readProgress();
  if ((all[vehicleId] ?? 0) >= kph) return false;
  all[vehicleId] = kph;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* private browsing — progress just won't persist */
  }
  return true;
}

/* --------------------------------- garage --------------------------------- */

/**
 * The wallet and the parts fitted to each vehicle.
 *
 * Credits are a single shared balance rather than one per vehicle, so a player
 * picks something to develop instead of grinding three ladders in parallel.
 *
 * @typedef {object} GarageState
 * @property {number} credits
 * @property {Record<string, Record<string, number>>} upgrades vehicle id → part levels
 * @property {Record<string, true>} cleared `vehicle::scene::kph` triples already banked
 */

/** @returns {GarageState} */
function readGarage() {
  try {
    const raw = JSON.parse(localStorage.getItem(GARAGE_KEY) ?? '{}');
    return {
      credits: Number.isFinite(raw.credits) ? Math.max(0, raw.credits) : 0,
      upgrades: raw.upgrades && typeof raw.upgrades === 'object' ? raw.upgrades : {},
      cleared: raw.cleared && typeof raw.cleared === 'object' ? raw.cleared : {},
    };
  } catch {
    return { credits: 0, upgrades: {}, cleared: {} };
  }
}

/** @param {GarageState} state */
function writeGarage(state) {
  try {
    localStorage.setItem(GARAGE_KEY, JSON.stringify(state));
  } catch {
    /* private browsing — the garage just won't persist */
  }
  return state;
}

export function getCredits() {
  return readGarage().credits;
}

/** @param {number} amount */
export function addCredits(amount) {
  const state = readGarage();
  state.credits = Math.max(0, state.credits + Math.round(amount));
  writeGarage(state);
  return state.credits;
}

/**
 * Part levels fitted to a vehicle. Always normalised on the way out, so a
 * retuned or removed part cannot produce an out-of-range level later.
 * @param {string} vehicleId
 */
export function getUpgrades(vehicleId) {
  return normaliseLevels(readGarage().upgrades[vehicleId]);
}

/**
 * Buys one level of one part, if it is affordable and not already maxed.
 * The balance check and the write happen together here rather than in the
 * caller, so there is exactly one place that can spend credits.
 *
 * @param {string} vehicleId
 * @param {string} partId
 * @param {number} cost
 * @returns {{ ok: boolean, levels: Record<string, number>, credits: number, reason?: string }}
 */
export function buyUpgrade(vehicleId, partId, cost) {
  const state = readGarage();
  const levels = normaliseLevels(state.upgrades[vehicleId]);

  if (!PART_IDS.includes(partId)) {
    return { ok: false, levels, credits: state.credits, reason: 'no such part' };
  }
  if (levels[partId] >= MAX_LEVEL) {
    return { ok: false, levels, credits: state.credits, reason: 'already maxed' };
  }
  if (state.credits < cost) {
    return { ok: false, levels, credits: state.credits, reason: 'not enough credits' };
  }

  levels[partId] += 1;
  state.credits -= cost;
  state.upgrades[vehicleId] = levels;
  writeGarage(state);
  return { ok: true, levels, credits: state.credits };
}

const clearKey = (vehicleId, sceneId, kph) => `${vehicleId}::${sceneId}::${kph}`;

/**
 * Records the first clean stop on a vehicle/scene/rung triple.
 * @returns {boolean} true the first time, so the bonus is paid once
 */
export function markCleared(vehicleId, sceneId, kph) {
  const state = readGarage();
  const key = clearKey(vehicleId, sceneId, kph);
  if (state.cleared[key]) return false;
  state.cleared[key] = true;
  writeGarage(state);
  return true;
}

/** @returns {boolean} */
export function isCleared(vehicleId, sceneId, kph) {
  return Boolean(readGarage().cleared[clearKey(vehicleId, sceneId, kph)]);
}

/* -------------------------------- settings -------------------------------- */

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** @param {Record<string, any>} patch */
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
