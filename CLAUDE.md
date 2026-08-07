# CLAUDE.md

Guidance for AI agents working on this repository. Read this before changing
anything in `src/physics/` or `src/render/Chase.js` — both contain fixes for
non-obvious bugs that are easy to reintroduce.

## What this project is

`insta-speed` is a browser game. The player is launched instantly at up to
600 km/h and must stop on a target line using only the brakes. It runs on
desktop and phones with no install.

The design brief was: real physics, vehicles and scenery that are trivial to
add, works on mobile and desktop. Those three constraints explain most of the
architecture.

## Stack

- **Vite 8**, vanilla JS with JSDoc types. No framework — the UI is a handful of
  DOM panels over a canvas.
- **three.js 0.185** for rendering.
- **No physics engine.** The vehicle model is hand-written because the braking
  feel *is* the game.
- Node's built-in test runner (`node --test`). No test framework dependency.

## Commands

```bash
npm run dev        # https://localhost:5173 (HTTPS is deliberate, see below)
npm run dev:mobile # same, bound to the LAN for phone testing
npm test           # 136 tests, ~3s
npm run build      # static bundle into dist/
```

## Layout

```
src/
  core/     Game.js (state machine)  Loop.js (fixed step)  course.js  speeds.js
            score.js  Bus.js  Storage.js
  physics/  VehicleSim.js  Tire.js  Surface.js  constants.js
  vehicles/ registry.js  specs/*.js     <- one data file per vehicle
  scenes/   registry.js  defs/*.js      <- one data file per scene
  render/   Renderer  World  Environment  RoadBuilder  Props  VehicleView  Chase  trackFrame  textures
  input/    InputManager  GyroSource  KeyboardSource  TouchSource
  fx/       TireSmoke  SkidMarks  SpeedLines  Audio
  ui/       garage  hud  result  format  styles.css
```

`docs/` holds deeper references: [ARCHITECTURE.md](docs/ARCHITECTURE.md),
[PHYSICS.md](docs/PHYSICS.md), [ADDING_CONTENT.md](docs/ADDING_CONTENT.md),
[PLAN.md](docs/PLAN.md), [DEVLOG.md](docs/DEVLOG.md).

## Conventions that matter

**World axes.** Forward is `+Z`, up is `+Y`. Vehicle geometry also faces `+Z`.
`sim.x` is distance travelled; `sim.y` is lateral offset from the centreline,
positive to the driver's right.

**The lateral axis is mirrored on the way out** — looking along `+Z`, world
`+X` is on the *left* of the screen. Always position objects via
`render/trackFrame.js` (`worldX`, `worldYaw`). Skipping it reverses steering
while the physics, HUD and off-road check all still agree with each other.
Effects should read `VehicleView.wheelWorldPositions()` rather than redoing the
transform themselves.

**Units are SI everywhere in the sim** — metres, kilograms, seconds, newtons,
radians. Only the UI converts to km/h.

**Physics is fixed-step at 120 Hz** and must stay deterministic. Never read
`performance.now()`, `Math.random()`, or frame delta inside `VehicleSim`. There
is a test asserting identical results for identical input sequences; keep it
passing.

**`core/course.js` must not import the registries.** The registries use Vite's
`import.meta.glob`, which does not exist under plain node, so anything the test
suite needs has to stay out of that import chain. This is why `buildCourse`
lives in its own module and `Game.js` re-exports it.

**Private class methods cannot be rebound.** `this.#foo = this.#foo.bind(this)`
throws at runtime. Event handlers and rAF callbacks are declared as
arrow-function class fields instead (see `Loop.js`, `GyroSource.js`,
`KeyboardSource.js`). Do not "tidy" these back into methods.

## Traps — bugs already fixed here, do not reintroduce

1. **Follow-camera lag.** `Chase.js` smooths the camera offset *relative to the
   car*, never an absolute world position. Exponentially smoothing a target
   moving at 160 m/s leaves lag proportional to speed — it once put the camera
   21 m behind when it was configured for 7 m.

2. **ABS must modulate, not release.** Dumping caliper pressure to zero spins
   the wheel back up and stops *worse* than simply locking. The controller
   servos pressure toward peak slip with a floor of 0.15.

3. **Crosswind is measured against the air, not the ground.** Sideslip uses
   `vy - crosswind`. If you compute side force from ground-frame velocity the
   car never reaches equilibrium and accelerates sideways forever.

4. **Tyre load sensitivity is load-bearing, not cosmetic.** Without it the
   braking-loaded front axle gains grip in exact proportion to load, which tips
   every vehicle into oversteer and an unrecoverable spin.

5. **Base FOV must not ratchet.** `Renderer.designFov` is the resting value the
   chase rig boosts away from. Reading the base back off `camera.fov` compounds
   the boost run over run.

6. **The render frame is mirrored.** See the axes note above. Every fix for
   "steering goes the wrong way" that negates the *input* or the *physics* is
   wrong — the mirror belongs in `render/trackFrame.js` alone.

7. **Course reference runs use still air.** `buildCourse` strips the crosswind
   before measuring, or an unstable vehicle spins during the measurement and
   drags the target line with it.

8. **Effects have to be told the run is over.** The sim stops being stepped at
   the finish but keeps its final state, so anything reading `sim.ax`,
   `slipIntensity` or `sim.v` carries on forever — camera shake buzzing behind
   the result card, smoke pouring out of a parked car. `World.update` takes a
   `live` flag; pass `game.state !== 'result'`.

9. **Road width and crosswind are one setting.** Narrowing the roads by 30%
   made Storm Deck Bridge unwinnable for the superbike at its old 7 m/s, which
   lifts its rear wheel under braking and drifts 9 m with a driver actively
   correcting. Changing either needs the test matrix re-run.

## Tuned vs. derived values

Most of the model is derived from real vehicle dynamics. Three constants are
tuned for playability and are commented as such in `VehicleSim.js` — treat them
as game-design knobs, not physics:

- `YAW_DAMPING` (45) — aerodynamic yaw damping. An honest road-car value spins
  every vehicle at 600 km/h, which is realistic but unplayable.
- `SIDE_FORCE_COEFF` (0.55) and the default `aeroCpOffset` (−0.1), which places
  the centre of pressure behind the CG so vehicles weathercock straight.
- `LATERAL_GRIP` (1.08) — how much higher a tyre's lateral friction peak sits
  above its longitudinal one. Without this margin, braking at the limit leaves
  literally zero steering and any breeze ends the run.

## Testing expectations

`test/physics.test.js` validates the model against reality. The anchor is that a
1,500 kg car at μ≈1.0 stops from 100 km/h in **39–43 m**. If a physics change
moves that number outside the window, the change is wrong — not the test.

`test/course.test.js` runs all 5 vehicles against all 4 scenes across the speed
ladder and asserts each pairing is winnable: a lane-keeping driver stays on the
road, and the target line is reachable. It also checks that a perfectly judged
run lands on par, that the judgement window has not grown with the ladder, and
that target distance grows monotonically with launch speed. **Any new vehicle or
scene automatically joins this matrix** once added to the import list at the top
of the file. Add it there.

`test/score.test.js` covers `core/score.js` — kept registry-free for exactly
that reason. The load-bearing case is that a quick stop 200 m short of the line
scores zero: pace is multiplied by precision, never added beside it.

The run clock has assertions on both sides: no properly driven run in the matrix
may use more than 80% of its limit, and a run nursed down to a crawl must be
caught by it. The second test only uses calm scenes — a superbike left crawling
in a crosswind is blown off the road before the clock gets to it.

Note the deliberate choice of a *lane-keeping* driver rather than a passive one.
A car left completely unsteered in a crosswind genuinely does get blown off the
road, so requiring the sim to drive itself would test the wrong thing.

## Mobile specifics

The dev server is HTTPS on purpose. `DeviceOrientationEvent` only fires in a
secure context, so tilt steering silently does nothing over plain HTTP — this
wastes a lot of debugging time if you forget it.

iOS additionally requires `DeviceOrientationEvent.requestPermission()` to be
called from inside a real user gesture. It hangs off the garage button. If it is
denied or unavailable, `InputManager.needsSteerPads` becomes true and on-screen
arrows appear. Never let the game reach a state with no working steering input.

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`, which tests, builds and
publishes to GitHub Pages. `vite.config.js` sets `base: './'` so asset URLs stay
relative and work from the `/insta-speed/` project-page subpath.
