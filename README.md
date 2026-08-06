# insta-speed

A browser braking game. You are launched instantly at 600 km/h and have exactly
one job: stop on the line.

```
[LAUNCH] ============================>  |TARGET|  ##WALL##
         612 km/h        dist to line 1,840 m
```

No install, no plugins. Runs on desktop and on phones.

## Running it

```bash
npm install
npm run dev          # https://localhost:5173
npm test             # physics + course suites
npm run build        # static bundle in dist/
```

For testing on a real phone:

```bash
npm run dev:mobile   # binds to your LAN
```

The dev server is HTTPS on purpose. The device orientation sensor only fires in
a secure context, so tilt steering silently does nothing over plain HTTP. You
will have to accept the self-signed certificate warning on the phone.

## Controls

|            | Steer                       | Brake                       |
| ---------- | --------------------------- | --------------------------- |
| Desktop    | ← / → or A / D              | ↓, S or Space               |
| Phone      | Tilt, or on-screen arrows   | Hold anywhere on the screen |

Brake input ramps rather than snapping on, so it is analogue on every device —
holding, releasing and re-applying is a real technique.

Tilt steering has to be switched on from the garage, because iOS only grants the
sensor from inside a user gesture. It calibrates to however you are holding the
phone at the start of each run, so sitting up or lying down both work. If
permission is refused or there is no sensor, on-screen arrows appear instead.

## How it works

The target line sits beyond the distance the car needs to stop flat out, so
braking at `t=0` leaves you well short. The whole game is judging the coast.

Physics runs at a fixed 120 Hz, independent of framerate, so the same inputs
always produce the same stop.

- **Tyres** use a Pacejka magic-formula curve, so grip peaks a little past 0.1
  slip and falls away after — locking up genuinely costs you distance. Load
  sensitivity means an axle carrying twice the load does not make twice the grip.
- **Load transfer** shifts weight forward under braking. On the superbike it
  lifts the rear wheel outright.
- **Aero** drag and downforce both scale with v², so the hypercar brakes hardest
  when it is fastest and loses grip as it slows.
- **Brake fade** is modelled from rotor temperature. A 600 km/h stop dumps
  roughly 20 MJ into the discs and they lose bite long before you are stopped.
- **ABS** modulates caliper pressure toward peak slip. Vehicles without it lock,
  smoke, and take much longer.

## Adding a vehicle

Drop a file in `src/vehicles/specs/`. That is the entire process — the registry
globs the directory, so there is no import list to update.

```js
export default {
  id: 'my-car',
  name: 'My Car',
  class: 'Coupe',
  mass: 1400,
  massDistribution: 0.55,   // front weight fraction
  wheelbase: 2.6,
  cgHeight: 0.5,
  wheelRadius: 0.33,
  frontalArea: 2.1,
  dragCoefficient: 0.31,
  liftCoefficient: -0.3,    // negative is downforce
  brake: { maxTorque: 7000, bias: 0.65, abs: true, rotorMass: 15, fadeTempC: 600 },
  tire: { B: 10, C: 1.9, D: 1.2, E: 0.97 },
  launchSpeedKph: 450,
  body: { parts: [...], wheels: {...} },  // primitives, see existing specs
  model: null,              // or 'models/my-car.glb' to use real art instead
};
```

`body` is a recipe of boxes, wedges and cylinders, which is how the whole launch
roster is built — no art pipeline required. Setting `model` to a glTF path in
`public/models/` swaps in a real mesh instead, loaded lazily.

Scenes work identically from `src/scenes/defs/`: surface grip, air density,
crosswind, colours and instanced roadside props.

## Tests

`npm test` covers two things. `test/physics.test.js` checks the model against
reality — most importantly that a 1,500 kg car with μ≈1.0 stops from 100 km/h in
39–43 m, the real-world envelope for a modern performance car. `test/course.test.js`
runs every vehicle against every scene and asserts each pairing is actually
winnable: a lane-keeping driver stays on the road, and the target line is
reachable.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Pages serves over HTTPS, which is what tilt
steering needs. Enable Pages with "GitHub Actions" as the source.
