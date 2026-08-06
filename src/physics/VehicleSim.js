import {
  pacejka,
  peakSlip,
  slipRatio,
  lateralCapacity,
  loadSensitivity,
  lateralCurve,
} from './Tire.js';
import { getSurface } from './Surface.js';
import {
  G,
  AIR_DENSITY_SEA_LEVEL,
  AMBIENT_TEMP_C,
  ROTOR_SPECIFIC_HEAT,
  ROTOR_COOLING_BASE,
  ROTOR_COOLING_PER_MS,
  WHEEL_SUBSTEPS,
  KPH_TO_MS,
  MS_TO_KPH,
  clamp,
} from './constants.js';

/** Side-force coefficient per radian of aerodynamic sideslip. */
const SIDE_FORCE_COEFF = 0.55;
/**
 * Aerodynamic yaw-rate damping, per unit of q*A*L. Tuned rather than taken
 * from a coefficient table — the reference area and length here are the
 * vehicle's own side area and wheelbase, not a standard normalisation. It is
 * the single strongest influence on how controllable a vehicle is at these
 * speeds, so it is deliberately set high enough that a crosswind produces a
 * correctable drift rather than a spin.
 */
const YAW_DAMPING = 45;
/** How much higher a tyre's lateral friction peak sits above its longitudinal one. */
const LATERAL_GRIP = 1.08;

/**
 * Longitudinal + lateral vehicle dynamics.
 *
 * The vehicle is launched instantly at `launchSpeedKph` and the player's only
 * job is to bring it to rest on a line. Everything that makes that hard is
 * modelled here: the tyre curve falling off past its peak (so locking up costs
 * you distance), load transfer unloading the rear axle, aerodynamic drag and
 * downforce that both scale with v^2, and rotors that lose bite as they cook.
 *
 * State is integrated at a fixed timestep by core/Loop.js, so a given sequence
 * of inputs always produces exactly the same stop.
 */
export class VehicleSim {
  /**
   * @param {import('../vehicles/registry.js').VehicleSpec} spec
   * @param {import('../scenes/registry.js').SceneDef} scene
   * @param {{ launchSpeedKph?: number }} [options] launch speed comes from the
   *   player's progression, so it is per-run rather than a property of the car
   */
  constructor(spec, scene, options = {}) {
    this.spec = spec;
    this.launchSpeedKph = options.launchSpeedKph ?? spec.maxLaunchKph ?? 400;
    this.setScene(scene);
    this.reset();
  }

  /** @param {number} kph */
  setLaunchSpeed(kph) {
    this.launchSpeedKph = kph;
  }

  /** @param {import('../scenes/registry.js').SceneDef} scene */
  setScene(scene) {
    this.scene = scene;
    this.surface = getSurface(scene.surface);
    this.grip = this.surface.grip * (scene.gripMultiplier ?? 1);
    this.airDensity = scene.airDensity ?? AIR_DENSITY_SEA_LEVEL;
    this.crosswind = scene.crosswind ?? 0;
    this.ambientTemp = scene.ambientTempC ?? AMBIENT_TEMP_C;
  }

  reset() {
    const s = this.spec;

    // Geometry: `a` is CG-to-front-axle, `b` is CG-to-rear. A front weight
    // fraction of 0.42 means the CG sits nearer the rear, so `a` is the longer arm.
    this.a = s.wheelbase * (1 - s.massDistribution);
    this.b = s.wheelbase * s.massDistribution;
    this.yawInertia = s.mass * s.wheelbase * s.wheelbase * 0.28;

    // Rotational inertia of one axle's worth of wheels.
    const unsprung = s.unsprungMassPerAxle ?? s.mass * 0.03;
    this.wheelInertia = Math.max(0.4, 0.6 * unsprung * s.wheelRadius ** 2);

    this.tireCurve = s.tire;
    this.lateralTire = lateralCurve(s.tire);
    this.peak = peakSlip(s.tire);

    // Static axle loads, used as the reference for tyre load sensitivity.
    const weight = s.mass * G;
    this.staticLoad = {
      front: weight * s.massDistribution,
      rear: weight * (1 - s.massDistribution),
    };
    this.muScale = { front: 1, rear: 1 };

    this.x = 0; // distance travelled along the track, m
    this.y = 0; // lateral offset from the centreline, m
    this.yaw = 0; // heading relative to the track, rad
    this.yawRate = 0;
    this.v = this.launchSpeedKph * KPH_TO_MS;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;

    this.omega = {
      front: this.v / s.wheelRadius,
      rear: this.v / s.wheelRadius,
    };
    this.slip = { front: 0, rear: 0 };
    this.force = { front: 0, rear: 0 };
    this.load = { front: 0, rear: 0 };
    this.rotorTemp = { front: this.ambientTemp, rear: this.ambientTemp };
    this.absGate = { front: 1, rear: 1 };
    this.absTimer = { front: 0, rear: 0 };
    this.absActive = false;

    this.brakeInput = 0;
    this.steerInput = 0;
    this.steerAngle = 0;
    this.stopped = false;
    this.elapsed = 0;
  }

  get speedKph() {
    return this.v * MS_TO_KPH;
  }

  /** Deceleration in g — what the HUD meter shows. */
  get gForce() {
    return -this.ax / G;
  }

  get locked() {
    return {
      front: this.omega.front < 1e-3 && this.v > 1,
      rear: this.omega.rear < 1e-3 && this.v > 1,
    };
  }

  /** Peak tyre slip magnitude across both axles — drives smoke and squeal. */
  get slipIntensity() {
    const s = Math.max(Math.abs(this.slip.front), Math.abs(this.slip.rear));
    return clamp((s - this.peak.slip) / (1 - this.peak.slip), 0, 1);
  }

  /**
   * Brake pad friction falls off once the rotor cooks past its rated
   * temperature. At launch speeds the energy dump is enormous, so this is a
   * mechanic the player actually feels rather than a rounding error.
   */
  padFriction(temp) {
    const fadeTemp = this.spec.brake.fadeTempC ?? 600;
    if (temp <= fadeTemp) return 1;
    return 1 - 0.6 * clamp((temp - fadeTemp) / 300, 0, 1);
  }

  /**
   * Advance one fixed timestep.
   * @param {number} dt seconds
   * @param {{ steer: number, brake: number }} input
   */
  step(dt, input) {
    if (this.stopped) return;

    const s = this.spec;
    const brake = clamp(input.brake, 0, 1);
    const steer = clamp(input.steer, -1, 1);
    this.brakeInput = brake;
    this.steerInput = steer;
    this.elapsed += dt;

    const r = s.wheelRadius;
    const q = 0.5 * this.airDensity * this.v * this.v; // dynamic pressure
    const drag = q * s.dragCoefficient * s.frontalArea;
    const downforce = q * Math.max(0, -s.liftCoefficient) * s.frontalArea;

    // --- vertical loads -----------------------------------------------------
    // Load transfer uses the previous step's acceleration; at 120 Hz the lag is
    // imperceptible and it avoids an implicit solve.
    const weight = s.mass * G;
    const aeroBalance = s.aeroBalance ?? s.massDistribution;
    const transfer = (s.mass * this.ax * s.cgHeight) / s.wheelbase;
    const FzF = Math.max(0, weight * s.massDistribution + downforce * aeroBalance - transfer);
    const FzR = Math.max(
      0,
      weight * (1 - s.massDistribution) + downforce * (1 - aeroBalance) + transfer,
    );
    this.load.front = FzF;
    this.load.rear = FzR;
    this.muScale.front = loadSensitivity(FzF, this.staticLoad.front);
    this.muScale.rear = loadSensitivity(FzR, this.staticLoad.rear);

    // --- brake torque -------------------------------------------------------
    const bias = s.brake.bias ?? 0.65;
    const maxTorque = s.brake.maxTorque;
    const torqueCmd = {
      front: brake * maxTorque * bias * this.padFriction(this.rotorTemp.front),
      rear: brake * maxTorque * (1 - bias) * this.padFriction(this.rotorTemp.rear),
    };

    this.#updateAbs(dt, torqueCmd);

    const torque = {
      front: torqueCmd.front * this.absGate.front,
      rear: torqueCmd.rear * this.absGate.rear,
    };

    // --- wheel + longitudinal dynamics -------------------------------------
    // Wheel spin-up is stiff relative to body motion, so sub-step it.
    const sub = dt / WHEEL_SUBSTEPS;
    const Fz = { front: FzF, rear: FzR };
    let axAccum = 0;

    for (let i = 0; i < WHEEL_SUBSTEPS; i++) {
      let tractive = 0;

      for (const axle of /** @type {const} */ (['front', 'rear'])) {
        const sr = clamp(slipRatio(this.omega[axle], r, this.v), -1, 1);
        const mu = pacejka(sr, this.tireCurve) * this.grip * this.muScale[axle];
        const Fx = mu * Fz[axle];
        this.slip[axle] = sr;
        this.force[axle] = Fx;
        tractive += Fx;

        // A rearward friction force applied below the axle rolls the wheel
        // forward — this is what spins a locked wheel back up on release.
        const tireTorque = -Fx * r;
        const brakeTorque = torque[axle];

        if (this.omega[axle] <= 1e-4 && tireTorque <= brakeTorque) {
          this.omega[axle] = 0; // brakes hold it locked
        } else {
          this.omega[axle] += ((tireTorque - brakeTorque) / this.wheelInertia) * sub;
          if (this.omega[axle] < 0) this.omega[axle] = 0;
        }
      }

      const rolling =
        this.v > 0.05 ? this.surface.rollingResistance * (FzF + FzR) : 0;
      const net = tractive - drag - rolling;
      const accel = net / s.mass;
      axAccum += accel;

      this.v += accel * sub;
      if (this.v < 0) this.v = 0;
    }

    this.ax = axAccum / WHEEL_SUBSTEPS;

    // --- rotor temperature --------------------------------------------------
    for (const axle of /** @type {const} */ (['front', 'rear'])) {
      const rotorMass = s.brake.rotorMass ?? 8;
      const power = Math.abs(torque[axle] * this.omega[axle]);
      const cooling =
        (ROTOR_COOLING_BASE + ROTOR_COOLING_PER_MS * this.v) *
        (this.rotorTemp[axle] - this.ambientTemp);
      const capacity = rotorMass * ROTOR_SPECIFIC_HEAT;
      this.rotorTemp[axle] += ((power - cooling) / capacity) * dt;
      if (this.rotorTemp[axle] < this.ambientTemp) this.rotorTemp[axle] = this.ambientTemp;
    }

    this.#stepLateral(dt, steer, FzF, FzR);

    if (this.v <= 0.05) {
      this.v = 0;
      this.vy = 0;
      this.yawRate = 0;
      this.stopped = true;
    }
  }

  /**
   * ABS holds slip near the peak of the tyre curve by pulsing the calipers.
   * Vehicles without it simply lock, which is exactly the point of fitting some
   * of the roster with drums and no electronics.
   */
  #updateAbs(dt, torqueCmd) {
    if (!this.spec.brake.abs) {
      this.absGate.front = 1;
      this.absGate.rear = 1;
      this.absActive = false;
      return;
    }

    // A real ABS modulates caliper pressure toward a target slip rather than
    // releasing the brake outright — dumping to zero would spin the wheel back
    // up and lose more distance than simply locking. `ABS_SERVO_RATE` sets how
    // fast pressure can swing across its full range (~4 ticks, i.e. 33 ms).
    const ABS_SERVO_RATE = 30;
    const PRESSURE_FLOOR = 0.15;
    let active = false;

    for (const axle of /** @type {const} */ (['front', 'rear'])) {
      if (torqueCmd[axle] <= 0 || this.v <= 2) {
        this.absGate[axle] = 1;
        continue;
      }

      const slipMag = Math.abs(this.slip[axle]);
      const error = (this.peak.slip - slipMag) / this.peak.slip;
      const delta = clamp(error, -1, 1) * ABS_SERVO_RATE * dt;
      this.absGate[axle] = clamp(this.absGate[axle] + delta, PRESSURE_FLOOR, 1);

      if (this.absGate[axle] < 0.95) active = true;
    }

    this.absActive = active;
  }

  /**
   * Linear bicycle model with friction-circle capping. The track is straight,
   * but braking hard unloads the rear axle and crosswind pushes the car around,
   * so holding a line is a real task — and if you use all the grip for braking
   * there is none left to steer with.
   */
  #stepLateral(dt, steer, FzF, FzR) {
    const s = this.spec;

    if (this.v < 1) {
      this.vy *= 0.8;
      this.yawRate *= 0.8;
      this.x += this.v * dt;
      return;
    }

    // Steering authority tapers with speed so the car is controllable at 600 km/h.
    const maxSteer = s.maxSteerAngle ?? 0.42;
    const authority = clamp(28 / Math.max(this.v, 28), 0.06, 1);
    this.steerAngle = steer * maxSteer * authority;

    const vSafe = Math.max(this.v, 3);
    const alphaF = Math.atan2(this.vy + this.a * this.yawRate, vSafe) - this.steerAngle;
    const alphaR = Math.atan2(this.vy - this.b * this.yawRate, vSafe);

    // The combined-slip envelope is an ellipse, not a circle: a tyre's lateral
    // peak sits a little above its longitudinal peak. That margin is what lets
    // a car braking flat out still hold a line against a crosswind — with a
    // true circle there would be exactly nothing left and any breeze would
    // carry it off the road.
    const lateralMu = this.peak.mu * (this.tireCurve.lateralGrip ?? LATERAL_GRIP) * this.grip;
    const capF = lateralCapacity(lateralMu * this.muScale.front, FzF, this.force.front);
    const capR = lateralCapacity(lateralMu * this.muScale.rear, FzR, this.force.rear);

    const gripF = this.grip * this.muScale.front;
    const gripR = this.grip * this.muScale.rear;
    let FyF = clamp(-pacejka(alphaF, this.lateralTire) * gripF * FzF, -capF, capF);
    let FyR = clamp(-pacejka(alphaR, this.lateralTire) * gripR * FzR, -capR, capR);

    // --- aerodynamic side force and yaw ------------------------------------
    //
    // Sideslip is measured against the *air*, not the ground. Once the car has
    // been pushed along with a crosswind the relative airflow straightens out
    // and the force decays, so it settles at an offset rather than
    // accelerating sideways for the whole run.
    const sideArea = s.sideArea ?? s.frontalArea * 2.4;
    const airSideVel = this.vy - this.crosswind;
    const beta = Math.atan2(airSideVel, vSafe);
    const qRel = 0.5 * this.airDensity * (this.v * this.v + airSideVel * airSideVel);
    const aeroSide = -qRel * sideArea * SIDE_FORCE_COEFF * beta;

    // Centre of pressure sits behind the centre of gravity, so side force
    // yaws the nose into the wind and the car weathercocks straight. Ordinary
    // road cars are the other way round and are directionally unstable because
    // of it; anything built to survive 600 km/h carries enough rear aero to
    // move it back, for the same reason land-speed cars run tail fins.
    const cpArm = (s.aeroCpOffset ?? -0.1) * s.wheelbase;
    const yawDamp =
      -qRel * sideArea * s.wheelbase * (s.aeroYawDamping ?? YAW_DAMPING) *
      ((s.wheelbase * this.yawRate) / (2 * vSafe));

    const cosd = Math.cos(this.steerAngle);
    this.ay = (FyF * cosd + FyR + aeroSide) / s.mass;
    this.vy += (this.ay - this.v * this.yawRate) * dt;

    const moment = this.a * FyF * cosd - this.b * FyR + aeroSide * cpArm + yawDamp;
    this.yawRate += (moment / this.yawInertia) * dt;

    // Blend lateral motion out as the car comes to rest.
    const settle = clamp((this.v - 1) / 4, 0, 1);
    this.vy *= 0.999 * settle + (1 - settle) * 0.85;
    this.yawRate *= 0.998 * settle + (1 - settle) * 0.85;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.x += (this.v * cy - this.vy * sy) * dt;
    this.y += (this.v * sy + this.vy * cy) * dt;
    this.yaw += this.yawRate * dt;
  }

  /** Snapshot used for render interpolation. */
  snapshot(out = {}) {
    out.x = this.x;
    out.y = this.y;
    out.yaw = this.yaw;
    out.v = this.v;
    out.omegaFront = this.omega.front;
    out.omegaRear = this.omega.rear;
    out.steerAngle = this.steerAngle;
    return out;
  }
}
