# insta-speed

A browser braking game. You are launched instantly at speed and have exactly one
job: stop on the line. Start at 100 km/h and work up to 600.

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

Tilt steering is the default on phones and tablets. iOS only grants the sensor
from inside a user gesture, so the first tap in the garage is used to ask for
it; everywhere else it is live from load. It calibrates to however you are
holding the phone at the start of each run, so sitting up or lying down both
work. If permission is refused or there is no sensor, on-screen arrows appear
instead, and the garage toggle turns tilt off for good.

## How it works

You start every vehicle at 100 km/h and unlock the next rung — 100 km/h faster —
by bringing the previous one to a clean stop, up to the vehicle's top speed. The
button on the result card launches straight into the rung you just won.

The target line sits beyond the distance the car needs to stop flat out, so
braking at `t=0` leaves you well short. The whole game is judging the coast.
Every course gives you the same 3.5-second judgement window before the braking
point arrives, at every rung: unlocking 500 km/h changes what the stop demands
of you, not how long you sit at speed waiting for it.

Points come from two things. **Precision** is how close to the line you stopped,
squared, so the last metre is worth more than the first ten. **Pace** is how
little time the run took against par for the course, which rewards staying at
speed and committing late. Pace is multiplied by precision, so stopping 200 m
short in record time is worth nothing.

The run clock sits at the top of the screen with the limit under it. Each
pairing gets its own limit, derived from par — 12 s for a hypercar at 100 km/h
on tarmac, 48 s for a loaded truck at 320 km/h on snow. It is generous: a
well-driven run uses at most 55% of it. What it exists to stop is shedding the
speed early and then trickling the last stretch at walking pace to guarantee the
line, which otherwise takes three times as long as committing properly.

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
  maxLaunchKph: 450,      // top of this vehicle's speed ladder
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
runs every vehicle against every scene across the speed ladder and asserts each
pairing is actually winnable: a lane-keeping driver stays on the road, and the
target line is reachable.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Pages serves over HTTPS, which is what tilt
steering needs. Enable Pages with "GitHub Actions" as the source.
