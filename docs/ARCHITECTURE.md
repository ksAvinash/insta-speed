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
        World.update(sim, frameDt)   → VehicleView, Chase, TireSmoke, SpeedLines
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
perfectly judged run — coast at speed, then brake flat out at the last possible
moment — takes a set number of seconds. It works from two reference
simulations rather than a search, so it is cheap enough to call on every garage
interaction (the whole 156-pairing matrix builds in well under a second).

1. A flat-out stop is sampled into a table of "distance and time still needed
   from this speed".
2. The run budget is `clamp(2.5 × flat-out braking time, 12 s, 20 s)`.
3. The coasting profile is walked until braking from that point would spend the
   budget. That distance is the target.
4. The target is floored at `1.2 × ideal`, so there is always room to absorb
   crosswind and the cost of steering.

Because the line sits past the flat-out stop, braking at `t=0` always leaves you
short — the player must judge the coast. Deriving everything per vehicle *and*
per launch speed keeps a 100 km/h opening run and a 600 km/h final run both
meaningful, despite stopping distances differing by two orders of magnitude.

Reference runs are made in **still air**. Where the line goes is a purely
longitudinal question, and a laterally unstable vehicle would otherwise drag it
around — the superbike spins itself in a crosswind once braking lifts its rear
wheel, which made the target move *closer* as launch speed rose.

### Why the budget scales

A flat 20 s for everything plays badly at the bottom of the ladder: stopping
from 100 km/h takes ~2.5 s, so the rest is spent holding a straight line waiting
for something to happen. Scaling with the length of the stop makes early runs
brisk (12 s) and the top of every ladder land on the full 20 s.

## Speed progression

Every vehicle has a ladder (`core/speeds.js`): 100 km/h, +50 per rung, with the
vehicle's own top speed as the final rung. A clean stop unlocks the next one,
stored per vehicle in `localStorage`. Locked rungs are shown in the garage
rather than hidden, so the player can see the climb ahead.

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
