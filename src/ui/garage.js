import { VEHICLES } from '../vehicles/registry.js';
import { SCENES } from '../scenes/registry.js';
import { getSurface } from '../physics/Surface.js';
import { buildCourse } from '../core/Game.js';
import { getBest } from '../core/Storage.js';
import { PARTS, MAX_LEVEL, stepFor } from '../vehicles/upgrades.js';
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
    this.partsList = document.getElementById('parts-list');
    this.tierHint = document.getElementById('tier-hint');
    this.creditBalance = document.getElementById('credit-balance');

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

  /**
   * The upgrade shop for the selected vehicle.
   *
   * Rebuilt wholesale on every refresh rather than diffed: it is four rows, and
   * a purchase changes the balance, the pips, the affordability of every other
   * row and the tier line all at once.
   */
  #renderParts() {
    const { game } = this;
    const spec = game.stockVehicle;
    const levels = game.upgrades;
    const credits = game.credits;

    this.creditBalance.textContent = `${int(credits)} cr`;
    this.partsList.innerHTML = '';

    for (const part of PARTS) {
      const level = levels[part.id] ?? 0;
      const cost = game.upgradeCost(part.id);
      const maxed = cost === null;
      const affordable = !maxed && credits >= cost;

      const row = document.createElement('div');
      row.className = 'part';

      const pips = Array.from(
        { length: MAX_LEVEL },
        (_, i) => `<i class="pip${i < level ? ' pip--on' : ''}"></i>`,
      ).join('');

      // The label of the level you are *on*, or of the one you would buy —
      // "what am I about to get" is the only question this row has to answer.
      const fitted = stepFor(spec, part.id, level).label;
      const nextUp = maxed ? null : stepFor(spec, part.id, level + 1).label;

      row.innerHTML = `
        <div class="part-head">
          <span class="part-name">${part.name}</span>
          <span class="part-pips" aria-label="Level ${level} of ${MAX_LEVEL}">${pips}</span>
        </div>
        <p class="part-fitted">${maxed ? fitted : `${fitted} → <b>${nextUp}</b>`}</p>
      `;

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'btn btn--buy';
      buy.disabled = maxed || !affordable;
      buy.textContent = maxed ? 'Fitted' : `${int(cost)} cr`;
      if (!maxed && !affordable) buy.title = `${int(cost - credits)} cr short`;
      buy.addEventListener('click', () => {
        if (!game.buyUpgrade(part.id).ok) return;
        this.refresh();
        this.onChange?.();
      });
      row.append(buy);

      this.partsList.append(row);
    }

    const tier = game.nextTier;
    if (tier) {
      const need = PARTS.filter((p) => p.id !== 'chassis' && (levels[p.id] ?? 0) < tier.level);
      this.tierHint.textContent = need.length
        ? `${tier.kph} km/h needs level ${tier.level} ${listNames(need)}.`
        : `${tier.kph} km/h unlocked — pick it above.`;
    } else if (spec.speedTiers) {
      this.tierHint.textContent = `${game.vehicle.name} is fully built. Ladder runs to ${game.vehicle.maxLaunchKph} km/h.`;
    } else {
      this.tierHint.textContent = `Parts make the ${game.vehicle.name} stop shorter, but its ladder does not extend.`;
    }
  }

  refresh() {
    const { game } = this;
    const spec = game.vehicle;
    const scene = game.scene;

    this.#syncPressed(this.vehicleList, spec.id);
    this.#syncPressed(this.sceneList, scene.id);
    this.#renderSpeeds();
    this.#renderParts();

    const course = buildCourse(spec, scene, game.launchSpeedKph);
    this.course = course;

    // Stats come off the *built* vehicle, so a purchase is visible here
    // immediately — that and the target line moving are the whole feedback loop.
    const stock = game.stockVehicle;
    const grew = (value, base, format) =>
      value === base ? format(value) : `${format(value)} ↑`;

    renderStats(
      this.vehicleStats,
      {
        'Top speed': grew(spec.maxLaunchKph, stock.maxLaunchKph, (v) => `${int(v)} km/h`),
        Mass: grew(spec.mass, stock.mass, kg),
        Brakes: spec.brake.abs ? (stock.brake.abs ? 'ABS' : 'ABS ↑') : 'No ABS',
        Downforce: spec.liftCoefficient < 0 ? (spec.liftCoefficient < stock.liftCoefficient ? 'Yes ↑' : 'Yes') : 'None',
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
        'Time limit': `${course.timeLimit} s`,
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

/** "tyres, brakes and aero" — an Oxford-comma-free list for the tier hint. */
function listNames(parts) {
  const names = parts.map((p) => p.name.toLowerCase());
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
