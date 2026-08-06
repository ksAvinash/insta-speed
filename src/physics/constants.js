/** Physical constants and unit helpers. SI throughout: metres, kilograms, seconds. */

export const G = 9.80665; // m/s^2
export const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m^3
export const AMBIENT_TEMP_C = 20;

/** Specific heat capacity of a cast-iron brake rotor, J/(kg*K). */
export const ROTOR_SPECIFIC_HEAT = 460;

/** Rotor cooling: base term plus a term proportional to airflow (speed). */
export const ROTOR_COOLING_BASE = 12; // W/K
export const ROTOR_COOLING_PER_MS = 1.6; // W/K per m/s of airflow

export const KPH_TO_MS = 1 / 3.6;
export const MS_TO_KPH = 3.6;
export const MS_TO_MPH = 2.2369363;

/** Physics runs at a fixed rate so results are reproducible across framerates. */
export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

/** Wheel angular dynamics are stiff, so they are sub-stepped inside each tick. */
export const WHEEL_SUBSTEPS = 4;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
