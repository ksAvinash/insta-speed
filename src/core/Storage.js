/** Personal bests, persisted per vehicle+scene combination. */

const KEY = 'insta-speed:bests:v1';
const SETTINGS_KEY = 'insta-speed:settings:v1';
const PROGRESS_KEY = 'insta-speed:progress:v1';

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
