import { Environment } from './Environment.js';
import { RoadBuilder } from './RoadBuilder.js';
import { Props } from './Props.js';
import { VehicleView } from './VehicleView.js';
import { Chase } from './Chase.js';
import { TireSmoke } from '../fx/TireSmoke.js';
import { SpeedLines } from '../fx/SpeedLines.js';
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
    this.speedLines = new SpeedLines(scene);

    renderer.onTierChange = (_name, quality) => {
      // Rebuild only what the tier actually changes.
      if (this.currentScene && this.currentCourse) {
        this.props.build(this.currentScene, this.currentCourse, quality);
        this.environment.build(this.currentScene, this.currentCourse, quality);
      }
      if (this.currentSpec) this.vehicle.build(this.currentSpec, quality);
    };
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
    this.smoke.setTint(getSurface(def.surface).smokeColor);
    this.smoke.reset();
  }

  /** @param {import('../vehicles/registry.js').VehicleSpec} spec */
  buildVehicle(spec) {
    this.currentSpec = spec;
    this.vehicle.build(spec, this.renderer.quality);
    this.chase.configure(spec);
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   */
  update(sim, dt) {
    this.vehicle.update(sim, dt);
    this.chase.update(sim, dt);
    this.smoke.update(sim, dt);
    this.speedLines.update(sim, this.renderer.camera, dt);
    this.environment.follow(sim.x);
  }

  /** Slow orbit around the selected vehicle while in the garage. */
  showcase(spec, time) {
    this.vehicle.root.position.set(0, 0, 0);
    this.vehicle.root.rotation.y = 0;
    this.vehicle.chassis.rotation.set(0, 0, 0);
    this.chase.showcase(spec, time);
  }
}
