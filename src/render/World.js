import * as THREE from 'three';
import { Environment } from './Environment.js';
import { RoadBuilder } from './RoadBuilder.js';
import { Props } from './Props.js';
import { VehicleView } from './VehicleView.js';
import { Chase } from './Chase.js';
import { TireSmoke } from '../fx/TireSmoke.js';
import { SkidMarks } from '../fx/SkidMarks.js';
import { SpeedLines } from '../fx/SpeedLines.js';
import { Rain } from '../fx/Rain.js';
import { getSurface } from '../physics/Surface.js';

/**
 * Composes everything that lives in the 3D scene, so `main.js` only has to talk
 * to one object. Scene geometry and the vehicle are rebuilt independently —
 * changing car in the garage does not rebuild the runway.
 */
export class World {
  /** @param {import('./Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    const scene = renderer.scene;

    this.environment = new Environment(scene);
    this.road = new RoadBuilder(scene);
    this.props = new Props(scene);
    this.vehicle = new VehicleView(scene);
    this.chase = new Chase(renderer);
    this.smoke = new TireSmoke(scene, renderer.quality.smoke);
    this.skid = new SkidMarks(scene);
    this.speedLines = new SpeedLines(scene, renderer.quality.streaks ?? 70);
    this.rain = new Rain(scene);
    this.#buildContactShadow(scene);

    renderer.onTierChange = (_name, quality) => {
      // Rebuild only what the tier actually changes — including the smoke and
      // streak pools, so a demote drops GPU work as well as resolution.
      this.smoke.setBudget(quality.smoke);
      this.speedLines.setBudget(quality.streaks ?? 70);
      this.contactShadow.visible = Boolean(quality.contactShadow);
      if (this.currentScene && this.currentCourse) {
        this.props.build(this.currentScene, this.currentCourse, quality);
        this.environment.build(this.currentScene, this.currentCourse, quality);
        this.rain.build(this.currentScene, quality);
      }
      if (this.currentSpec) this.vehicle.build(this.currentSpec, quality);
    };

    this.contactShadow.visible = Boolean(renderer.quality.contactShadow);
  }

  /** Soft ground blob under the car — high tier only, one transparent plane. */
  #buildContactShadow(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);

    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 5.2),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
        toneMapped: false,
      }),
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.02;
    this.contactShadow.renderOrder = 0;
    scene.add(this.contactShadow);
  }

  /**
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {ReturnType<import('../core/Game.js').buildCourse>} course
   */
  buildScene(def, course) {
    const quality = this.renderer.quality;
    this.currentScene = def;
    this.currentCourse = course;

    this.environment.build(def, course, quality);
    this.road.build(def, course);
    this.props.build(def, course, quality);
    this.rain.build(def, quality);
    this.smoke.setTint(getSurface(def.surface).smokeColor);
    this.smoke.reset();
    this.skid.setScene(def);
    this.skid.reset();
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  buildVehicle(spec) {
    this.currentSpec = spec;
    this.vehicle.build(spec, this.renderer.quality);
    this.chase.configure(spec);
    this.skid.setVehicle(spec);

    // Scale the contact blob to the vehicle footprint.
    const track = spec.body?.wheels?.track ?? 1.6;
    const wheelbase = spec.wheelbase ?? 2.5;
    this.contactShadow.scale.set(
      Math.max(0.7, track * 0.85 + 0.4),
      Math.max(0.9, wheelbase * 0.55 + 0.6),
      1,
    );
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   * @param {boolean} [live] false once the run has ended. The sim stops being
   *   stepped but keeps its final state, so without this every effect that
   *   reads it — camera shake, smoke, skid marks — carries on as though the car
   *   were still sliding, behind the result card.
   */
  update(sim, dt, live = true) {
    this.vehicle.update(sim, dt);
    this.chase.update(sim, dt, live);
    const patches = this.vehicle.wheelWorldPositions();
    this.smoke.update(sim, dt, patches, live);
    this.skid.update(sim, patches, this.vehicle.wheels, live);
    this.speedLines.update(sim, this.renderer.camera, dt, live);
    this.road.update(dt);
    this.environment.follow(sim.x);
    this.rain.update(this.vehicle.root.position, dt, live);
    this.#followContactShadow();
  }

  #followContactShadow() {
    if (!this.contactShadow.visible) return;
    const root = this.vehicle.root;
    this.contactShadow.position.x = root.position.x;
    this.contactShadow.position.z = root.position.z;
    this.contactShadow.rotation.z = -root.rotation.y;
  }

  /** Slow orbit around the selected vehicle while in the garage. */
  showcase(spec, time) {
    // Pin the car on the pad before the camera orbits — vehicle.update() may
    // still spin the wheels from the idle sim, but must not walk the root.
    this.vehicle.root.position.set(0, 0, 0);
    this.vehicle.root.rotation.y = 0;
    this.vehicle.chassis.rotation.set(0, 0, 0);
    this.vehicle.chassis.position.y = this.vehicle.chassisBaseY ?? 0;
    this.chase.showcase(spec, time);
    this.environment.follow(0);
    // Keep monsoon rain alive in the garage so the stage preview feels wet.
    this.rain.update(this.vehicle.root.position, 1 / 60, true);
    this.#followContactShadow();
  }
}
