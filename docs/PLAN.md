# insta-speed — the original build plan

> **Historical document.** This is the plan as approved before implementation
> started, kept for context on *why* the architecture looks the way it does.
> It is not maintained. For current behaviour see
> [ARCHITECTURE.md](ARCHITECTURE.md) and [PHYSICS.md](PHYSICS.md).
>
> **What changed during the build:**
>
> - `buildCourse` was extracted from `Game.js` into `core/course.js`, because
>   the registries' `import.meta.glob` is Vite-only and the tests need it.
> - `render/World.js` was added to compose the render modules, so `main.js`
>   wires one object rather than seven.
> - The physics gained three things the plan did not anticipate: tyre **load
>   sensitivity**, a separately scaled **lateral tyre curve**, and
>   **aerodynamic side force and yaw damping**. Without them every vehicle
>   spins at launch speed. See [DEVLOG.md](DEVLOG.md).
> - Target distance is derived per vehicle from a reference flat-out run
>   (`targetFactor`) rather than being a fixed per-scene number, so the roster
>   stays fair from a 205 kg bike to a 15-tonne truck.
> - The test suite grew a full vehicle × scene matrix asserting each pairing is
>   winnable — not in the original plan, and it caught two design problems.

## Context

`insta-speed` is an empty repo (no commits). We're building a browser game inspired by BeamNG "instant acceleration" crash-test reels: a vehicle is launched instantly to an absurd speed (e.g. 600 km/h), and the entire game is fighting that speed back down to zero with the brakes.

**Core loop:** pick a vehicle → pick a scene → get launched at speed → brake to stop as close as possible to a target line. Stop short = lower score. Cross the line = you hit the wall.

```
[LAUNCH] ============================>  |TARGET|  ##WALL##
         612 km/h        dist to line 1,840 m
```

Decisions confirmed with the user: **precision-stop objective**, **three.js 3D**, **custom vehicle physics model** (no physics engine), **gyroscope = steering only, hold-to-brake**.

Design goals that drive the architecture: adding a vehicle or a scene must be a single data file with no code changes; physics must be genuinely real (not arcade); must run at 60fps on a mid-range phone with no install.

## Stack

- **Vite 8.2** (dev server + static build), vanilla JS + JSDoc typedefs — no framework. UI is a handful of DOM panels over the canvas; a framework would only add weight.
- **three.js 0.185.1** for rendering.
- **No physics engine.** The vehicle model is ours (see below) — the braking feel *is* the game, so we need direct control over it.
- Ships as a static bundle → GitHub Pages. That also gives us HTTPS for free, which the gyroscope requires.

## Architecture

```
src/
  core/     Game.js (state machine)  Loop.js (fixed-step)  Bus.js  Storage.js
  physics/  VehicleSim.js  Tire.js  Surface.js  constants.js
  vehicles/ registry.js  specs/*.js        <- one file per vehicle, pure data
  scenes/   registry.js  defs/*.js         <- one file per scene, pure data
  render/   Renderer.js  Chase.js  RoadBuilder.js  Environment.js  Props.js  VehicleView.js
  input/    InputManager.js  GyroSource.js  KeyboardSource.js  TouchSource.js
  fx/       TireSmoke.js  SpeedLines.js  Audio.js
  ui/       hud.js  garage.js  result.js  styles.css
public/models/                              <- optional .glb drop-in slot
```

**`core/Loop.js`** — fixed-step accumulator: physics at a locked 120 Hz, render interpolates between the last two states. Framerate never changes the result, so scores and ghost replays are valid.

**`core/Game.js`** — states: `menu → garage → countdown → launched → stopped/crashed → result`.

## Physics (`physics/VehicleSim.js`)

Per 1/120s step, integrate longitudinal velocity from the real force balance:

| Force | Model |
|---|---|
| Aero drag | `0.5·ρ·Cd·A·v²` — dominant at launch speed; ρ varies per scene (altitude) |
| Downforce | `0.5·ρ·Cl·A·v²` added to normal load — hypercars really do brake harder when fast |
| Rolling resistance | `Crr·m·g` |
| Brake torque | `input · maxTorque · bias` per axle → `T/r_wheel` at the contact patch |
| Tyre limit | Pacejka magic formula `F = D·sin(C·atan(B·s − E·(B·s − atan(B·s))))` |
| Load transfer | `ΔFz = m·aₓ·h_cg / wheelbase` — front gains, rear unloads |
| Brake fade | rotor temp `dT/dt = P/(m_rotor·c) − k·(T − T_amb)`; pad μ falls past `fadeTempC` |

Two consequences worth calling out, because they're what make it a *game* rather than a slider:

- **Lock-up costs you.** Pacejka peaks near slip ratio ≈ 0.12 then falls off. Stomping the pedal locks the wheels, μ drops, distance grows, smoke pours. Vehicles with `abs: true` modulate torque to hold the peak; vehicles without it don't.
- **Fade is real at these speeds.** A 1,560 kg car at 167 m/s carries ~21 MJ. Dumping that into the rotors heats them past pad limits, so late braking genuinely punishes you on heavy vehicles.

Lateral model keeps steering meaningful even though the track is straight: rear-axle grip loss induces yaw, plus per-scene crosswind and surface patches (wet/gravel) that pull the car off line. Drift too far off the lane and the stop doesn't count.

## Content: adding a vehicle is one file

`src/vehicles/specs/hyper-gt.js` — pure data, zero code:

```js
export default {
  id: 'hyper-gt', name: 'Vector GT-R', class: 'Hypercar',
  mass: 1560, massDistribution: 0.42, wheelbase: 2.7, cgHeight: 0.36,
  wheelRadius: 0.35, frontalArea: 1.9, dragCoefficient: 0.32,
  liftCoefficient: -1.1,                       // negative = downforce
  brake: { maxTorque: 4800, bias: 0.68, abs: true, rotorMass: 9.6, fadeTempC: 620 },
  tire:  { compound: 'semi-slick', B: 11, C: 1.9, D: 1.35, E: 0.97 },
  launchSpeedKph: 600,
  body:  { /* procedural mesh recipe: boxes/wedges, colours, wheel offsets */ },
  model: null,                                 // or 'models/hyper-gt.glb' to use real art
};
```

Registries use `import.meta.glob('./specs/*.js', { eager: true })`, so **dropping the file in is the entire process** — no import line to add. `VehicleView.js` builds a mesh from `body` if `model` is null, otherwise loads the glTF. That means we can ship immediately with procedural low-poly shapes and upgrade any vehicle to real art later without touching code.

Launch set: hypercar, rally hatch, superbike, semi-truck, school bus — deliberately spread across mass, brake power, ABS/no-ABS and CG height so the physics differences are obvious.

Scenes work identically (`src/scenes/defs/*.js`): surface type + grip multiplier, air density, crosswind, runway length, target distance, sky/fog/sun/ground, and an instanced prop list. Launch set: salt flats, tunnel, coastal bridge, snow pass.

## Input (`input/InputManager.js`)

One unified output — `{ steer: -1..1, brake: 0..1 }` — whatever the source.

**Desktop:** ←/→ steer with ramp and return-to-centre; ↓ or Space brakes. The brake ramps 0→1 over ~180 ms rather than snapping, so cadence braking is a real technique.

**Mobile:** tilt to steer, hold anywhere to brake (same ramp, so hold-and-release modulation still works). Three things this needs to get right:

1. **iOS permission** — `DeviceOrientationEvent.requestPermission()` must be called from an actual user gesture and needs HTTPS. It hangs off an "Enable tilt steering" button in the garage.
2. **Calibration** — capture neutral orientation at countdown and steer from the *delta*. Works whether you're sitting up or lying on the sofa. This is what most gyro web games get wrong.
3. **Screen orientation** — whether roll is `gamma` or `−beta` depends on `screen.orientation.angle`; remap on change, with a ~3° deadzone and a low-pass filter to kill jitter.

If permission is denied or there's no sensor, it falls back automatically to on-screen touch steering zones. The game is never unplayable.

## Performance

Quality tiers auto-selected from `devicePixelRatio` plus a 30-frame FPS probe → LOW/MED/HIGH, controlling pixel-ratio cap (≤2), shadows, particle budget and prop draw distance. All roadside props are `InstancedMesh` (thousands of markers, one draw call). The road is a recycled pool of long segments — no per-frame geometry allocation. Physics stays at 120 Hz regardless.

## Build order

1. **M1** Scaffold, render loop, chase camera, a road you fly down. *Feels fast.*
2. **M2** `VehicleSim` + tyre/load-transfer/fade. Debug overlay with live force readout.
3. **M3** InputManager, all three sources, iOS permission flow, calibration.
4. **M4** Vehicle + scene registries, 5 vehicles, 4 scenes, garage UI.
5. **M5** Target line, wall, collision, scoring/ratings, result card, localStorage bests.
6. **M6** Tyre smoke, speed lines, WebAudio (wind, tyre squeal, ABS pulse, impact).
7. **M7** Quality tiers, mobile profiling, GitHub Pages deploy.

## Verification

- `npm run dev` → play on desktop; debug overlay shows speed, per-axle load, slip ratio, rotor temp.
- **Physics sanity script** — assert a 1,500 kg / μ≈1.0 config stops from 100→0 km/h in **39–43 m**, the real-world envelope for a modern performance car. This is the check that "real physics" actually holds.
- **Determinism test** — replay a recorded input array twice, assert identical final distance to the millimetre.
- **Mobile** — `vite --host` over LAN with `@vitejs/plugin-basic-ssl`, since gyro won't fire over plain HTTP. Test on a real iPhone (permission prompt) and a real Android (no prompt), in both portrait and landscape, plus the permission-denied fallback path.
- **Perf** — Chrome DevTools mobile throttling; confirm 60fps sustained on the MED tier.
