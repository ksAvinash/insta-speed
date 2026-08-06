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
    this.speedList = document.getElementById('speed-list');
    this.speedHint = document.getElementById('speed-hint');
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

  /**
   * The speed ladder. Locked rungs are shown rather than hidden, so the player
   * can see what they are working toward.
   */
  #renderSpeeds() {
    const { game } = this;
    const ladder = game.ladder;
    const unlocked = game.unlockedSpeed;
    const top = ladder[ladder.length - 1];

    this.speedList.innerHTML = '';
    for (const kph of ladder) {
      const locked = kph > unlocked;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--speed';
      chip.dataset.id = String(kph);
      chip.disabled = locked;
      chip.setAttribute('aria-pressed', String(kph === game.launchSpeedKph));
      if (locked) chip.setAttribute('aria-label', `${kph} km/h, locked`);
      chip.innerHTML = locked ? `🔒 ${kph}` : `${kph}<small>km/h</small>`;
      chip.addEventListener('click', () => {
        game.selectSpeed(kph);
        this.refresh();
        this.onChange?.();
      });
      this.speedList.append(chip);
    }

    this.speedHint.textContent =
      unlocked >= top
        ? `Every speed unlocked on the ${game.vehicle.name}. Top speed is ${top} km/h.`
        : `Stop cleanly to unlock ${
            ladder[ladder.indexOf(unlocked) + 1] ?? top
          } km/h. Ladder runs to ${top} km/h.`;
  }

  refresh() {
    const { game } = this;
    const spec = game.vehicle;
    const scene = game.scene;

    this.#syncPressed(this.vehicleList, spec.id);
    this.#syncPressed(this.sceneList, scene.id);
    this.#renderSpeeds();

    const course = buildCourse(spec, scene, game.launchSpeedKph);
    this.course = course;

    renderStats(
      this.vehicleStats,
      {
        'Top speed': `${int(spec.maxLaunchKph)} km/h`,
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
    const setup = `At ${int(game.launchSpeedKph)} km/h the line is ${metres(
      course.target,
    )} away — brake flat out from the launch and you stop in ${metres(
      course.ideal,
    )}, so coast about ${course.coastSeconds.toFixed(1)} s first.`;
    this.bestLine.innerHTML = best
      ? `${setup} <b>Best here: ${int(best.score)}</b> (${best.errorM.toFixed(2)} m off).`
      : setup;
  }

  show() {
    this.refresh();
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
