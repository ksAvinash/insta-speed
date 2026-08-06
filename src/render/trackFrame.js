/**
 * Track frame → world frame.
 *
 * The simulation works in a track frame where `+y` is the driver's right and
 * `+yaw` turns right. The scene runs along `+Z`, and with the camera looking
 * that way, world `+X` lands on the **left** of the screen — the handedness
 * flips. So the lateral axis is mirrored on the way out.
 *
 * Anything that positions an object from sim state must go through here.
 * Skipping it makes steering appear reversed: pressing right sends the car
 * left, while the physics, the HUD and the off-road check all still agree with
 * each other, which makes it a genuinely confusing bug to chase.
 */

/** Sim lateral offset (+ = driver's right) → world X. */
export const worldX = (lateral) => -lateral;

/** Sim heading (+ = turning right) → world Y rotation. */
export const worldYaw = (yaw) => -yaw;
