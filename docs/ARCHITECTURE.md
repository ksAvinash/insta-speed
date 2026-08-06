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

Forward is `+Z`, right is `+X`, up is `+Y`. Vehicle geometry also faces `+Z`.

The sim works in its own track frame: `sim.x` is distance travelled, `sim.y` is
lateral offset from the centreline, `sim.yaw` is heading relative to the track.
Mapping to the scene is therefore:

```js
mesh.position.set(sim.y, 0, sim.x);
mesh.rotation.y = sim.yaw;
```

Everything in the sim is SI — metres, kilograms, seconds, newtons, radians. Only
the HUD converts to km/h and degrees.

## Course layout

`buildCourse(spec, scene)` runs a full-brake reference simulation to find the
vehicle's flat-out stopping distance, then places the target line beyond it:

```
target = ideal × scene.targetFactor     (typically 1.22–1.35)
wall   = target + scene.wallOffset
runway = wall + 300
```

This is the central design decision. Because the line sits past the flat-out
stop, braking at `t=0` always leaves you short — the player must judge a coast
phase. Deriving it per vehicle keeps a 205 kg superbike and a 15-tonne truck
equally challenged despite stopping distances differing by an order of
magnitude.

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
