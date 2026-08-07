# Architecture

How the pieces fit together, and why they are split the way they are.

## Layering

```
                    main.js  (wiring only)
                        |
    +---------+---------+---------+----------+
    |         |         |         |          |
  core/    physics/   input/    render/     ui/
                        \         /
                         \       /
                          fx/  (reads sim state, writes nothing)
```

Nothing below `main.js` imports `main.js`. `core/` never imports `render/` or
`ui/`; it communicates outward through `core/Bus.js`, a ~20-line pub/sub. This
is what lets the physics run headless under `node --test` with no DOM at all.

## Module responsibilities

### `core/`

| File | Role |
| --- | --- |
| `Game.js` | State machine and scoring. Owns the `VehicleSim` and the current course. |
| `Loop.js` | Fixed-timestep accumulator. Calls `update(dt)` at exactly 120 Hz and `render(alpha, frameDt)` once per frame. |
| `course.js` | Course layout maths. Deliberately free of registry imports so tests can use it. |
| `Bus.js` | Pub/sub. Events: `statechange`, `countdown`, `launched`, `result`, `course`, `selection`. |
| `Storage.js` | `localStorage` personal bests and settings, keyed `vehicleId::sceneId`. |

**Game states:** `garage → countdown → running → result`, plus `result → garage`
and `result → countdown` (retry). `document.body.dataset.state` mirrors the
current state so CSS can react to it.

### `physics/`

Pure, deterministic, DOM-free. See [PHYSICS.md](PHYSICS.md) for the model
itself. `VehicleSim` is the only stateful class; `Tire.js` and `Surface.js` are
stateless lookups and formulas.

### `render/`

`World.js` composes everything else so `main.js` talks to one object. Scene
geometry and the vehicle rebuild independently — changing car in the garage does
not rebuild the runway.

`Renderer.js` owns quality tiering. It guesses a tier from the device profile,
then `probe()` watches the first 40 frames and demotes if the measured framerate
cannot hold up. `onTierChange` rebuilds only what the tier actually affects.

### `input/`

Three sources collapse into one `{ steer, brake }` pair in `InputManager`.
Digital sources are ramped (180 ms rise, 120 ms fall) so a keyboard or a screen
tap still produces analogue brake pressure — cadence braking is a real
technique on every device. Tilt is already analogue and bypasses the ramp.

### `ui/`

Plain DOM over the canvas. `hud.js` caches element references and diffs every
value against its last write, so the browser is never asked to re-layout text
that has not changed.

## The frame

```
Loop.#tick(now)
  ├─ accumulate frame delta (clamped to 0.25 s so a backgrounded tab cannot teleport the car)
  ├─ while (accumulator >= 1/120):
  │     InputManager.update(dt) → { steer, brake }
  │     Game.update(dt, input)  → VehicleSim.step(dt, input)
  └─ render(alpha, frameDt):
        Renderer.probe(frameDt)
        World.update(sim, dt, live)  → VehicleView, Chase, TireSmoke,
                                       SkidMarks, SpeedLines
        Audio.update(sim, frameDt)
        Hud.update(sim, distanceToTarget)
        Renderer.render()
```

Physics stepping and rendering are fully decoupled. A 60 Hz laptop and a 120 Hz
phone produce byte-identical stops from identical inputs.

## Coordinates and units

Forward is `+Z`, up is `+Y`. Vehicle geometry also faces `+Z`.

The sim works in its own track frame: `sim.x` is distance travelled, `sim.y` is
lateral offset from the centreline (positive to the driver's right), `sim.yaw`
is heading relative to the track.

**The lateral axis is mirrored on the way out**, via `render/trackFrame.js`.
Looking along `+Z`, world `+X` lands on the *left* of the screen — the
handedness flips:

```js
import { worldX, worldYaw } from './trackFrame.js';
mesh.position.set(worldX(sim.y), 0, sim.x);   // worldX(v) === -v
mesh.rotation.y = worldYaw(sim.yaw);          // worldYaw(v) === -v
```

Anything positioning an object from sim state must go through those helpers, or
steering appears reversed. That bug is genuinely hard to spot, because the
physics, the HUD and the off-road check all still agree with each other — only
the picture disagrees. Effects should take wheel positions from
`VehicleView.wheelWorldPositions()` instead of redoing the transform.

Everything in the sim is SI — metres, kilograms, seconds, newtons, radians. Only
the HUD converts to km/h and degrees.

## Course layout

`buildCourse(spec, scene, launchSpeedKph)` places the target line so that a
perfectly judged run — coast for `COAST_SECONDS`, then brake flat out and never
lift — stops exactly on it. It works from two reference simulations rather than
a search, so it is cheap enough to call on every garage interaction (the whole
matrix builds in well under a second).

1. A flat-out stop is sampled into a table of "distance and time still needed
   from this speed".
2. The coasting profile is walked for `COAST_SECONDS` — the judgement window,
   the same at every rung.
3. Where braking from that point would stop is the target.
4. The target is floored at `1.2 × ideal`, so there is always room to absorb
   crosswind and the cost of steering.
5. `runSeconds` falls out of the above: coast plus stop. That is **par**, and
   the pace half of the score is measured against it.
6. `timeLimit` is `ceil(par × 1.7 + 2)`, rounded to whole seconds for display.
   Overrunning it ends the run like hitting the wall does.

A single global limit cannot work when par spans 6 s to 27 s across the matrix,
so it is derived per pairing like everything else. It is deliberately loose —
the worst well-driven run in the test matrix uses 55% of it. The clock is a
backstop against nursing the car down to a crawl, not a race against par; pace
scoring already handles the middle ground.

Because the line sits past the flat-out stop, braking at `t=0` always leaves you
short — the player must judge the coast. Deriving everything per vehicle *and*
per launch speed keeps a 100 km/h opening run and a 600 km/h final run both
meaningful, despite stopping distances differing by two orders of magnitude.

Reference runs are made in **still air**. Where the line goes is a purely
longitudinal question, and a laterally unstable vehicle would otherwise drag it
around — the superbike spins itself in a crosswind once braking lifts its rear
wheel, which made the target move *closer* as launch speed rose.

### Why the judgement window is fixed

The original design budgeted a *total* run time that grew with the ladder — 12 s
at the bottom, 20 s at the top. What that actually bought with each unlock was
more road to sit on at constant speed before anything happened, which is the
least interesting part of a run. Holding the window at a flat 3.5 s means an
unlock changes the stop rather than the wait: same time to place the car,
against a stop that is now four times longer. Course length still grows with
speed, because braking distance does, but only by as much as physics forces.

## Scoring

`core/score.js` is registry-free and unit-tested on its own. Precision is
`accuracy²` over a window of `max(20 m, 12% of the course)`; pace is
`par / elapsed`, capped at 1. Pace is **multiplied** by accuracy rather than
added beside it — otherwise the quickest run available would be to brake at
launch, stop 200 m short in record time, and collect the pace half anyway.

## Speed progression

Every vehicle has a ladder (`core/speeds.js`): 100 km/h, +100 per rung, with the
vehicle's own top speed as the final rung. A clean stop unlocks the next one,
stored per vehicle in `localStorage`, and the result card's primary button
launches straight into it. Locked rungs are shown in the garage rather than
hidden, so the player can see the climb ahead.

A 50 km/h step was the original increment and half the ladder read as the same
run twice; `clampToLadder` snaps stale saved progress back onto the coarser
ladder.

`spec.maxLaunchKph` is therefore a *cap*, not the speed you launch at.

## Rendering choices worth knowing

**The road is two triangles.** A single plane with a repeating canvas texture,
not a pool of recycled segments. Nothing about the road changes along its length,
so one draw call does the whole runway.

**All props are `InstancedMesh`** — one draw call per prop type regardless of
count. Placement uses a seeded LCG so the scene a player learns is the scene
they get next time.

**All textures are generated on a canvas at runtime** (`render/textures.js`).
The build ships no image assets, and scene colours are pure data.

**The shadow frustum follows the car** rather than covering the whole runway,
which would need an impractically large shadow map for a 4 km course.

## Performance targets

60 fps on a mid-range phone. Levers, in order of impact: pixel-ratio cap (≤2),
shadows, particle budget, prop draw distance. The physics rate is never reduced —
it is cheap relative to rendering and lowering it would break determinism.

Bundle is ~160 KB gzipped, almost entirely three.js. `GLTFLoader` is split into
its own chunk and only fetched if a vehicle spec sets `model`.
