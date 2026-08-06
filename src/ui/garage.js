import { VEHICLES } from '../vehicles/registry.js';
import { SCENES } from '../scenes/registry.js';
import { getSurface } from '../physics/Surface.js';
import { buildCourse } from '../core/Game.js';
import { getBest } from '../core/Storage.js';
import { int, metres, kg, renderStats } from './format.js';

/** Vehicle and location pickers, plus the live course preview for the pairing. */
export class Garage {
  /** @param {import('../core/Game.js').Game} game */
  constructor(game, onChange) {
    this.game = game;
    this.onChange = onChange;

    this.root = document.getElementById('garage');
    this.vehicleList = document.getElementById('vehicle-list');
    this.sceneList = document.getElementById('scene-list');
    this.vehicleStats = document.getElementById('vehicle-stats');
    this.sceneStats = document.getElementById('scene-stats');
    this.bestLine = document.getElementById('best-line');

    this.#buildChips(this.vehicleList, VEHICLES, (v) => v.class, (id) => {
      this.game.select(id, null);
      this.refresh();
      this.onChange?.();
    });

    this.#buildChips(this.sceneList, SCENES, (s) => getSurface(s.surface).label, (id) => {
      this.game.select(null, id);
      this.refresh();
      this.onChange?.();
    });
  }

  #buildChips(container, items, subtitle, onPick) {
    container.innerHTML = '';
    for (const item of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.id = item.id;
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML = `${item.name}<small>${subtitle(item)}</small>`;
      chip.addEventListener('click', () => onPick(item.id));
      container.append(chip);
    }
  }

  #syncPressed(container, activeId) {
    for (const chip of container.children) {
      chip.setAttribute('aria-pressed', String(chip.dataset.id === activeId));
    }
  }

  refresh() {
    const { game } = this;
    const spec = game.vehicle;
    const scene = game.scene;

    this.#syncPressed(this.vehicleList, spec.id);
    this.#syncPressed(this.sceneList, scene.id);

    const course = buildCourse(spec, scene);
    this.course = course;

    renderStats(
      this.vehicleStats,
      {
        'Launch speed': `${int(spec.launchSpeedKph)} km/h`,
        Mass: kg(spec.mass),
        Brakes: spec.brake.abs ? 'ABS' : 'No ABS',
        Downforce: spec.liftCoefficient < 0 ? 'Yes' : 'None',
      },
      spec.blurb,
    );

    const surface = getSurface(scene.surface);
    renderStats(
      this.sceneStats,
      {
        Surface: surface.label,
        Grip: `${Math.round(surface.grip * (scene.gripMultiplier ?? 1) * 100)}%`,
        Crosswind: scene.crosswind ? `${scene.crosswind} m/s` : 'Calm',
        'Target line': metres(course.target),
      },
      scene.blurb,
    );

    const best = getBest(spec.id, scene.id);
    this.bestLine.innerHTML = best
      ? `Personal best on this pairing: <b>${int(best.score)}</b> — stopped ${best.errorM.toFixed(2)} m from the line.`
      : `Flat-out from the launch you would stop in ${metres(course.ideal)}. The line is at ${metres(course.target)}, so you have to wait before you brake.`;
  }

  show() {
    this.refresh();
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
