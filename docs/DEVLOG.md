# Devlog — bugs found during the build

Kept because every one of these is easy to reintroduce, and because the
diagnosis is more useful than the fix. Ordered by how much they mattered.

## 1. ABS stopped the car *worse* than locking the wheels

**Symptom.** The first physics test run failed two assertions: the 100→0 km/h
stop came out at 44.5 m (window was 39–43), and a locked-wheel skid stopped in
41.8 m while ABS took 44.5 m.

**Diagnosis.** The controller was a bang-bang switch — when slip exceeded a
threshold it set brake torque to *zero*, held for 40% of a cycle, then restored
full pressure. With no brake torque the wheel spins back up, grip collapses
toward zero during the release phase, and the duty-cycle average lands well
below peak.

**Fix.** Model it as what a real ABS is: a servo regulating caliper pressure
toward peak slip, full swing in ~4 ticks (33 ms), with a pressure floor of 0.15
rather than zero. Real systems dump to a *hold* pressure, never fully release.

**Guard.** `test/physics.test.js` asserts ABS beats a locked skid.

## 2. The car spun out braking in a straight line

**Symptom.** In the browser, holding the brake with zero steering input ended in
"Left the road" after 2.9 s. Yaw reached −70° in 1.7 s — a violent spin, not a
gentle drift.

**Diagnosis.** Instrumenting the run showed yaw rate diverging exponentially.
Two compounding causes:

- **Missing tyre load sensitivity.** Cornering stiffness was proportional to
  vertical load, so the axle that gained load under braking gained grip in exact
  proportion. Statically the vehicle was neutral (`a·Cf = b·Cr`), but load
  transfer forward tipped it into oversteer, and an oversteering vehicle above
  its critical speed diverges from *any* disturbance. At 167 m/s, everything is
  above critical speed.
- **Lateral cornering stiffness ~2× too high.** Slip *angle* in radians is a
  different quantity from slip *ratio*, but the same Pacejka `B` was used for
  both, giving ~28·Fz per radian where a real tyre is 12–18.

**Fix.** Added `loadSensitivity()` (peak μ falls as load rises) and
`lateralCurve()` (rescales `B` for slip angle).

**Note.** This one is genuinely marginal physics, not a pure bug. A real car
braking at 2.4 g from 600 km/h *is* unstable — the source reel is BeamNG at
600 mph precisely because vehicles there spin and disintegrate. Making it
playable required the tuned aero terms documented in [PHYSICS.md](PHYSICS.md).

## 3. Crosswind accelerated the car sideways forever

**Symptom.** After fixing the spin, cars still drifted off the road in every
scene with wind. Zero-wind scenes were perfectly stable (0.0 m drift), which
localised it immediately.

**Diagnosis.** Side force was computed from ground-frame velocity, so it never
decayed. A car already moving downwind at the wind speed still felt full side
force — there was no equilibrium, only constant lateral acceleration.

**Fix.** Measure sideslip against the air: `beta = atan2(vy − crosswind, v)`.
Once the car has been pushed along with the wind, relative airflow straightens
out and the force decays.

**Method note.** A parameter sweep (`aeroCpOffset` × `aeroYawDamping`) was worth
far more than continued algebra here — it showed within seconds that centre-of-
pressure position barely mattered and yaw damping dominated, which is not what I
had assumed.

## 4. The chase camera lagged 21 m behind

**Symptom.** In screenshots the car was a tiny speck in the distance, despite
`chase.distance` being 7.3 m.

**Diagnosis.** Probing the live scene gave the answer in one shot: configured
distance 7.30 m, actual camera-to-car distance **21.44 m**. The camera smoothed
its *absolute world position* toward a target moving at 130 m/s. Exponential
smoothing toward a moving target has steady-state lag proportional to target
velocity — at 60 fps with k≈0.14, roughly `6.2 × 2.17 m/frame ≈ 13 m` of extra
lag on top of the nominal offset.

**Fix.** Smooth the *offset relative to the car*, then add it to the car's
current position. Offsets change slowly, so they can be damped freely with no
speed-dependent error.

**Lesson.** Two rounds of reasoning about FOV and look-ahead produced nothing;
one direct measurement of the actual camera position solved it. Measure the
thing.

## 5. Private methods cannot be rebound

**Symptom.** Blank page, `TypeError: Private method '#onOrientation' is not
writable`.

**Diagnosis.** `this.#onOrientation = this.#onOrientation.bind(this)` is invalid
— private methods are non-writable. The same pattern was in three files
(`GyroSource`, `KeyboardSource`, `Loop`); the first one to construct threw and
took the whole app down.

**Fix.** Declare them as arrow-function class fields instead, which also keeps
the listener reference stable so `removeEventListener` works.

## Smaller ones

- **Base FOV ratcheted between runs.** `Chase.configure()` captured `baseFov`
  from the *current* `camera.fov`, which was already boosted from the previous
  run. Now `Renderer.designFov` is the single source of truth.
- **HUD flags rendered off-centre.** Hidden flags used `opacity: 0` and still
  occupied layout, so a single lit flag sat off-centre by its dormant
  neighbours' width. Switched to `display: none`.
- **The result card was see-through**, letting the wall's hazard stripes and the
  green target line bleed through the text.
- **The salt-flats road was invisible** against the salt — nearly identical
  colours. Since leaving the road is a fail condition, its edges have to read.
- **`buildCourse` was unusable from tests.** It lived in `Game.js`, which imports
  the registries, which use Vite's `import.meta.glob`. Extracted to
  `core/course.js` with no registry imports.

## What the test matrix caught

Beyond individual bugs, running all 5 vehicles × 4 scenes surfaced two design
problems no unit test would have:

- **Storm Deck Bridge at 11 m/s was unwinnable for the superbike**, which lifts
  its rear wheel under braking and therefore has no lateral grip at all.
  Reduced to 7 m/s.
- **Holding a lane costs up to 16% of stopping distance**, because steering and
  braking share one friction budget. That is a real and desirable mechanic, but
  it means an open-loop "brake at the perfect moment" driver always overshoots —
  worth knowing before tuning `targetFactor`.
