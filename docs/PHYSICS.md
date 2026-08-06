# The physics model

Everything here lives in `src/physics/`. It is deterministic, DOM-free, SI
units throughout, and integrated at a fixed 120 Hz.

## Why it is hand-written

A physics engine would give collisions and suspension for free, but the braking
feel *is* this game. Every interesting mechanic — lock-up costing distance,
downforce making the car brake hardest when fastest, rotors fading mid-stop — is
a property of the longitudinal model, which is exactly the part an off-the-shelf
raycast-vehicle controller hides behind a friction coefficient.

## Force balance

Each 1/120 s step, longitudinal velocity is integrated from:

| Force | Model | Notes |
| --- | --- | --- |
| Aero drag | `½·ρ·Cd·A·v²` | Dominant at launch. ρ varies per scene (altitude). |
| Downforce | `½·ρ·Cl·A·v²` | Added to normal load. `Cl` negative means downforce. |
| Rolling resistance | `Crr·Fz` | Per-surface `Crr`, only while moving. |
| Brake torque | `input · maxTorque · bias · fade` | Split per axle by brake bias. |
| Tyre force | Pacejka, limited by `μ·Fz` | The actual constraint most of the time. |
| Load transfer | `ΔFz = m·aₓ·h_cg / L` | Front gains under braking, rear unloads. |

Wheel angular dynamics are sub-stepped 4× inside each tick (effectively 480 Hz)
because they are stiff relative to body motion.

## Tyres

### Pacejka magic formula

```
μ(s) = D · sin(C · atan(B·s − E·(B·s − atan(B·s))))
```

Grip rises steeply, peaks a little past 0.1 slip, then falls away. That falloff
is the whole reason locking up costs you distance rather than saving it —
`peakSlip()` finds the maximum numerically and caches it per compound, and ABS
targets exactly that point.

### Sign convention

Slip ratio is `(ω·r − v) / |v|` — negative under braking, `−1` when fully
locked. A rearward friction force applied *below* the axle rolls the wheel
forward, which is what spins a locked wheel back up on release:

```
I·dω/dt = −T_brake·sign(ω) − Fx·r
```

### Load sensitivity

```js
loadSensitivity(load, reference, k = 0.14)  // → 1 − k·(load/reference − 1)
```

A tyre carrying twice the load does **not** make twice the grip. This is not a
detail — see [DEVLOG.md](DEVLOG.md). Without it, the braking-loaded front axle
gains grip in exact proportion to transferred load, which tips every vehicle
into oversteer and, above the resulting critical speed, an unrecoverable spin
from the smallest disturbance.

### Lateral curve

Slip *angle* in radians is a different quantity from slip *ratio*. Reusing the
longitudinal `B` unchanged gives roughly twice a real tyre's cornering
stiffness, so `lateralCurve()` rescales it (`B × 0.5` by default, overridable
per compound with `lateralB`).

### Friction ellipse

```js
lateralCapacity(μ, Fz, Fx)  // → √((μ·Fz)² − Fx²)
```

Brake at the absolute limit and there is nothing left to steer with. The
capacity is evaluated against a *lateral* μ that is `LATERAL_GRIP` (1.08) times
the longitudinal peak, because a tyre's lateral friction peak genuinely sits
above its longitudinal one. That margin is what lets a car braking flat out
still hold a line against a crosswind.

## Brakes

### Fade

Rotor temperature is integrated from the energy actually going into the disc:

```
dT/dt = (P_brake − cooling·(T − T_ambient)) / (m_rotor · c)
```

with `c = 460 J/(kg·K)` for cast iron and cooling scaling with airflow (speed).
Pad friction is flat until `fadeTempC`, then falls linearly to 40% over the next
300 °C.

This matters enormously here. A 1,560 kg car at 167 m/s carries ~21 MJ; dumping
that into the discs cooks them long before the car has stopped, so late braking
genuinely punishes you. `rotorMass` in a spec is the **total for both discs on
that axle**.

### ABS

A servo, not a switch. It modulates caliper pressure toward peak slip at
`ABS_SERVO_RATE` (full swing in ~4 ticks, 33 ms) with a pressure floor of 0.15.

Releasing the brake outright — which an earlier version did — spins the wheel
back up and loses *more* distance than simply locking. There is a test asserting
ABS beats a locked skid; keep it.

## Lateral dynamics

A linear bicycle model with friction-circle capping. The track is straight, but
braking unloads the rear axle and crosswind pushes the car around, so holding a
line is real work — and if you spend all the grip on braking there is none left
to steer with.

```
αf = atan((vy + a·r) / v) − δ
αr = atan((vy − b·r) / v)
m(v̇y + v·r) = Fyf·cos δ + Fyr + F_aero
Izz·ṙ = a·Fyf·cos δ − b·Fyr + M_aero
```

`a` is CG-to-front-axle, `b` is CG-to-rear. A front weight fraction of 0.42 puts
the CG nearer the rear, so `a` is the *longer* arm.

Steering authority tapers as `clamp(28/v, 0.06, 1)` so the car is controllable at
600 km/h rather than twitching into the barrier.

## Aerodynamic side force and yaw

Sideslip is measured against the **air**, not the ground:

```js
const airSideVel = this.vy - this.crosswind;
const beta = Math.atan2(airSideVel, vSafe);
```

Once the car has been pushed along with the wind, the relative airflow
straightens out and the force decays, so it settles at an offset instead of
accelerating sideways for the whole run. Computing this in the ground frame is a
bug that is very easy to write and quite hard to spot.

The centre of pressure sits *behind* the CG (`aeroCpOffset` defaults to −0.1 of
wheelbase), so side force yaws the nose into the wind and the vehicle
weathercocks straight. Ordinary road cars are the other way round and are
directionally unstable because of it; anything built to survive 600 km/h carries
enough rear aero to move it back — the same reason land-speed cars run tail fins.

## Tuned vs. derived

Most constants are real vehicle-dynamics values. These three are game-design
knobs, tuned for playability and commented as such in the source:

| Constant | Value | Why it is tuned |
| --- | --- | --- |
| `YAW_DAMPING` | 45 | Aerodynamic yaw-rate damping. The reference area and length are the vehicle's own side area and wheelbase, not a standard normalisation, so this is not comparable to a published `Cn_r`. An honest road-car value spins every vehicle at 600 km/h — realistic, unplayable. |
| `SIDE_FORCE_COEFF` | 0.55 | Side force per radian of aerodynamic sideslip. Within a plausible band for a car, chosen at the low end so crosswind is correctable. |
| `LATERAL_GRIP` | 1.08 | Lateral friction peak relative to longitudinal. Real, but the exact figure is picked so full braking retains ~40% lateral capacity. |

Being explicit about this matters: a future change that "corrects" these toward
textbook values will make every scene with wind unwinnable.

## Determinism

`VehicleSim` never reads `performance.now()`, `Math.random()`, or a frame delta.
Prop scatter uses a seeded LCG in the render layer, never the sim. A test
asserts that replaying an identical input sequence twice produces identical
final state to the millimetre — this is what makes leaderboards and replays
meaningful, and it must keep passing.

## Validation

The anchor test: a 1,500 kg car with μ≈1.0 must stop from 100 km/h in **39–43 m**,
the real-world envelope for a modern performance car. If a physics change moves
that outside the window, the change is wrong.

Supporting assertions: ABS beats a locked skid; lower-grip surfaces lengthen the
stop; braking transfers load forward; rotors heat and fade cuts pad friction;
downforce shortens a high-speed stop; a locked wheel grips less than one at peak
slip; the friction circle leaves nothing lateral at the longitudinal limit.
