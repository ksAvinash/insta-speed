# Adding vehicles and scenes

Both registries glob their directories (`import.meta.glob(..., { eager: true })`),
so **dropping a file in is the entire process**. There is no import list to
update and no registration call to make.

The one thing you must also do is add it to the test matrix — see the end.

## A vehicle

Create `src/vehicles/specs/my-car.js`:

```js
/** @type {import('../registry.js').VehicleSpec} */
export default {
  id: 'my-car',              // stable — saved scores are keyed on it
  name: 'My Car',
  class: 'Coupe',            // shown under the name in the garage
  blurb: 'One line of flavour for the garage.',

  mass: 1400,                // kg
  massDistribution: 0.55,    // FRONT weight fraction, 0-1
  wheelbase: 2.6,            // m
  cgHeight: 0.5,             // m — drives load transfer, so it matters a lot
  wheelRadius: 0.33,         // m
  unsprungMassPerAxle: 45,   // kg, optional (defaults to 3% of mass)

  frontalArea: 2.1,          // m²
  dragCoefficient: 0.31,
  liftCoefficient: -0.3,     // NEGATIVE is downforce
  aeroBalance: 0.5,          // optional, front share of downforce
  sideArea: 4.2,             // m², for crosswind
  maxSteerAngle: 0.44,       // rad at the road wheel

  brake: {
    maxTorque: 7000,         // N·m, total across both axles
    bias: 0.65,              // front share
    abs: true,
    absHz: 15,
    rotorMass: 15,           // kg — BOTH discs on an axle, not one
    fadeTempC: 600,
  },
  tire: { compound: 'road', B: 10, C: 1.9, D: 1.2, E: 0.97 },

  launchSpeedKph: 450,
  model: null,
  body: { parts: [...], wheels: {...} },
};
```

### Choosing numbers that work

- **`D` is peak friction coefficient.** ~0.85 truck, ~1.15 road tyre, ~1.35
  semi-slick, ~1.45 sport bike. `B` is stiffness (8–12), `C` shape (1.75–1.9),
  `E` falloff (0.96–0.98).
- **`maxTorque` must be able to lock the wheels**, or the brake pedal never
  reaches the tyre limit and ABS has nothing to do. A rough floor is
  `D · m · g · wheelRadius`; set it comfortably above that. A downforce car
  needs much more, since grip at speed is far higher than at rest.
- **`cgHeight` and `wheelbase` together decide the character.** The superbike's
  0.62 m CG on a 1.42 m wheelbase transfers so much load that the rear wheel
  lifts outright under hard braking — a real stoppie, and it leaves the bike
  with no lateral grip at all.
- **`rotorMass` and `fadeTempC` decide whether fade is the limiting factor.**
  The heavy vehicles fade long before they run out of grip, which is their whole
  personality.

### The body recipe

`body` builds a mesh from primitives, which is how the entire launch roster
works — no art pipeline needed. Local axes: `+Z` forward, `+Y` up, `+X` right.

```js
body: {
  parts: [
    { shape: 'box',      size: [w, h, d], pos: [x, y, z], color: 0xd81f36 },
    { shape: 'wedge',    size: [w, h, d], pos: [...], color: 0x2b2f36 },
    { shape: 'cylinder', size: [rTop, rBottom, height], pos: [...] },
    { shape: 'sphere',   size: [radius], pos: [...] },
    { shape: 'box', size: [...], pos: [...], color: 0xf2f2f2, emissive: 0xfff0c0 },
  ],
  wheels: {
    radius: 0.33, width: 0.24,
    track: 1.52,        // 0 for a two-wheeler — one wheel per axle on the centreline
    front: 1.28,        // Z offset of the front axle
    rear: -1.24,        // Z offset of the rear axle
    color: 0x18181c,
  },
}
```

`wedge` is a box with its top face tapered in, which reads as a cabin or a
fairing. Parts accept an optional `rot: [x, y, z]` in radians.

### Using real art instead

Set `model: 'models/my-car.glb'` and drop the file in `public/models/`. It is
loaded lazily (`GLTFLoader` is a separate chunk, only fetched when needed) and
replaces the procedural body while the wheels and brake lights keep working. If
the load fails it falls back to `body`, so always provide one.

## A scene

Create `src/scenes/defs/my-place.js`:

```js
/** @type {import('../registry.js').SceneDef} */
export default {
  id: 'my-place',
  name: 'Somewhere',
  blurb: 'One line for the picker.',

  surface: 'tarmac',      // key into physics/Surface.js
  gripMultiplier: 1,      // extra scaling on top of the surface
  airDensity: 1.225,      // kg/m³ — lower at altitude means less drag to help you
  crosswind: 0,           // m/s, positive pushes right
  ambientTempC: 20,       // how fast rotors shed heat

  targetFactor: 1.3,      // target line = flat-out stopping distance × this
  roadWidth: 20,          // m — leaving it is a fail
  wallOffset: 40,         // m past the line
  tunnel: false,

  sky:    { top: 0x2f6fd0, bottom: 0xbfe0f5 },
  fog:    { color: 0xdff0fb, density: 0.00035 },
  sun:    { color: 0xfff6e0, intensity: 2.6, position: [-0.4, 0.8, 0.35] },
  ground: { color: 0xf0ece0, accent: 0xdcd6c4 },
  road:   { color: 0xb9b09a, secondary: 0xa39a84 },

  props: [
    { type: 'post', spacing: 100, lateral: 17, height: 3.2, color: 0xd94b2b, bothSides: true },
    { type: 'tree', spacing: 26, lateral: 16, scatter: 7, scale: 1.5, color: 0x1f3b2c, bothSides: true },
  ],
};
```

Available surfaces: `tarmac`, `concrete`, `salt`, `wet`, `gravel`, `snow`, `ice`.
Prop types: `post`, `lamp`, `rock`, `tree`, `pylon`.

### Scene design notes

- **Make the road visibly distinct from the ground.** Leaving the road is a fail
  condition, so its edges must be unmistakable. The salt flats originally had a
  road almost the same colour as the salt and it was unplayable.
- **`targetFactor` is the difficulty dial.** 1.22 is tight, 1.35 is generous. It
  is a multiplier of each vehicle's own stopping distance, so it stays fair
  across the whole roster automatically.
- **Crosswind is powerful.** Above about 7 m/s, high-sided vehicles become very
  hard and the superbike — which lifts its rear wheel under braking — can become
  genuinely unwinnable. Check the test matrix after changing it.
- **Prop spacing sells speed more than prop detail does.** Tighter spacing reads
  as faster.

## Wire it into the tests

`test/course.test.js` cannot use the registries, because `import.meta.glob` is a
Vite transform that does not exist under plain node. Add your file to the
explicit import list at the top:

```js
import myCar from '../src/vehicles/specs/my-car.js';
const VEHICLES = [hyperGt, rallyHatch, superbike, semiTruck, schoolBus, myCar];
```

It then automatically joins the full matrix, which asserts for every
vehicle × scene pairing that a lane-keeping driver stays on the road and that
the target line is reachable. Run `npm test`.

If your addition fails those, the pairing is not winnable — fix the numbers
rather than the test.
