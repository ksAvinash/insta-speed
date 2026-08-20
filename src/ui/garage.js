import { VEHICLES } from '../vehicles/registry.js';
import { SCENES } from '../scenes/registry.js';
import { getSurface } from '../physics/Surface.js';
import { buildCourse } from '../core/Game.js';
import { getBest } from '../core/Storage.js';
import { PARTS, MAX_LEVEL, stepFor } from '../vehicles/upgrades.js';
import { int, metres } from './format.js';

/** Hex colour string from a three.js-style 0xRRGGBB number. */
function hex(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

/**
 * SVG arc path for one of N equal "circle-cuts" around a 48×48 ring.
 * Gaps between segments so they read as discrete progress slots.
 * @param {number} index 0-based segment
 * @param {number} total usually MAX_LEVEL (3)
 */
function upgradeCutPath(index, total) {
  const cx = 24;
  const cy = 24;
  const r = 20;
  const gapDeg = 14;
  const sweep = 360 / total - gapDeg;
  // Start at top (−90°), then walk clockwise by index.
  const startDeg = -90 + index * (360 / total) + gapDeg / 2;
  const endDeg = startDeg + sweep;
  const toRad = (d) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = sweep > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Primary paint from a vehicle body recipe (first non-glass, non-emissive part). */
function vehiclePaint(spec) {
  const parts = spec.body?.parts ?? [];
  for (const p of parts) {
    if (p.glass || p.emissive) continue;
    if (p.color != null) return hex(p.color);
  }
  return '#c8d0da';
}

function vehicleAccent(spec) {
  const parts = spec.body?.parts ?? [];
  for (const p of parts) {
    if (p.role === 'trim' && p.color != null) return hex(p.color);
  }
  return '#1a1e24';
}

function vehicleKind(spec) {
  const cls = (spec.class ?? '').toLowerCase();
  const id = spec.id ?? '';
  if (cls.includes('bike') || id.includes('bike')) return 'bike';
  if (cls.includes('truck') || id.includes('truck')) return 'truck';
  return 'car';
}

/** CSS silhouette markup for a vehicle (reused in square + menu thumbs). */
function vehiclePreviewHtml() {
  return `
    <span class="vp-body"></span>
    <span class="vp-cabin"></span>
    <span class="vp-wheel vp-wheel--f"></span>
    <span class="vp-wheel vp-wheel--r"></span>
  `;
}

/** CSS landscape markup for a scene. */
function scenePreviewHtml() {
  return `
    <span class="sp-sky"></span>
    <span class="sp-horizon"></span>
    <span class="sp-ground"></span>
    <span class="sp-road"></span>
  `;
}

/** @param {HTMLElement} el @param {import('../vehicles/registry.js').VehicleSpec} spec */
function paintVehiclePreview(el, spec) {
  if (!el) return;
  el.classList.add('pick-preview', 'pick-preview--vehicle');
  el.dataset.kind = vehicleKind(spec);
  el.style.setProperty('--paint', vehiclePaint(spec));
  el.style.setProperty('--accent', vehicleAccent(spec));
  el.innerHTML = vehiclePreviewHtml();
}

/** @param {HTMLElement} el @param {import('../scenes/registry.js').SceneDef} scene */
function paintScenePreview(el, scene) {
  if (!el) return;
  el.classList.add('pick-preview', 'pick-preview--scene');
  el.style.setProperty('--sky-top', hex(scene.sky?.top ?? 0x1a2030));
  el.style.setProperty('--sky-bot', hex(scene.sky?.bottom ?? 0x405060));
  el.style.setProperty('--ground', hex(scene.ground?.color ?? 0x2a2e36));
  el.style.setProperty('--road', hex(scene.road?.color ?? 0x1a1e24));
  el.style.setProperty(
    '--accent',
    hex(scene.ground?.accent ?? scene.road?.secondary ?? 0x4dff92),
  );
  el.innerHTML = scenePreviewHtml();
}

/**
 * Garage: square pickers with in-box arrow; image menus for vehicle/scene.
 */
export class Garage {
  /** @param {import('../core/Game.js').Game} game */
  constructor(game, onChange) {
    this.game = game;
    this.onChange = onChange;

    this.root = document.getElementById('garage');
    this.vehicleTile = document.getElementById('vehicle-tile');
    this.sceneTile = document.getElementById('scene-tile');
    this.vehicleToggle = document.getElementById('vehicle-toggle');
    this.sceneToggle = document.getElementById('scene-toggle');
    this.vehicleMenu = document.getElementById('vehicle-menu');
    this.sceneMenu = document.getElementById('scene-menu');
    this.vehiclePreview = document.getElementById('vehicle-preview');
    this.scenePreview = document.getElementById('scene-preview');
    this.vehicleCaption = document.getElementById('vehicle-caption');
    this.sceneCaption = document.getElementById('scene-caption');
    this.speedList = document.getElementById('speed-list');
    this.speedReadout = document.getElementById('speed-readout');
    this.bestLine = document.getElementById('best-line');
    this.partsList = document.getElementById('parts-list');
    this.creditBalance = document.getElementById('credit-balance');
    this.upgradeHint = document.getElementById('upgrade-hint');

    this.#buildVehicleMenu();
    this.#buildSceneMenu();

    this.vehicleToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = this.vehicleToggle.getAttribute('aria-expanded') !== 'true';
      this.#setOpen('vehicle', open);
      if (open) this.#setOpen('scene', false);
    });

    this.sceneToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = this.sceneToggle.getAttribute('aria-expanded') !== 'true';
      this.#setOpen('scene', open);
      if (open) this.#setOpen('vehicle', false);
    });

    // Close menus when tapping outside either tile or menu.
    document.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (this.vehicleTile?.contains(t) || this.sceneTile?.contains(t)) return;
      if (this.vehicleMenu?.contains(t) || this.sceneMenu?.contains(t)) return;
      this.#setOpen('vehicle', false);
      this.#setOpen('scene', false);
    });

    // Keep open menus inside the viewport on rotate / resize / chrome shifts.
    this.onViewportChange = () => {
      if (this.vehicleToggle?.getAttribute('aria-expanded') === 'true') {
        this.#positionMenu(this.vehicleToggle, this.vehicleMenu);
      }
      if (this.sceneToggle?.getAttribute('aria-expanded') === 'true') {
        this.#positionMenu(this.sceneToggle, this.sceneMenu);
      }
    };
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
    // Visual viewport (iOS URL bar) moves without a window resize.
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    window.visualViewport?.addEventListener('scroll', this.onViewportChange);
  }

  #setOpen(which, open) {
    const toggle = which === 'vehicle' ? this.vehicleToggle : this.sceneToggle;
    const menu = which === 'vehicle' ? this.vehicleMenu : this.sceneMenu;
    const tile = which === 'vehicle' ? this.vehicleTile : this.sceneTile;
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('is-open', open);
    tile?.classList.toggle('is-open', open);
    menu.hidden = !open;
    if (open) {
      // Fixed to the viewport so #garage overflow cannot clip it, then clamped.
      this.#positionMenu(toggle, menu);
    } else {
      this.#clearMenuPosition(menu);
    }
    this.root?.classList.toggle(
      'has-menu-open',
      this.vehicleToggle?.getAttribute('aria-expanded') === 'true' ||
        this.sceneToggle?.getAttribute('aria-expanded') === 'true',
    );
  }

  /**
   * Pin the image menu to the viewport with fixed coordinates so parent
   * overflow / chrome cannot clip it. Prefers below the square, flips above
   * when short on room, and clamps left/right into the safe band.
   * @param {HTMLElement} toggle
   * @param {HTMLElement} menu
   */
  #positionMenu(toggle, menu) {
    if (!toggle || !menu || menu.hidden) return;

    const gap = 6;
    const pad = 10;
    const rect = toggle.getBoundingClientRect();
    // visualViewport tracks the on-screen area when mobile URL bars collapse.
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    const vh = vv?.height ?? window.innerHeight;
    // getBoundingClientRect is in layout viewport; offset* maps into visual.
    const ox = vv?.offsetLeft ?? 0;
    const oy = vv?.offsetTop ?? 0;

    const menuWidth = Math.min(280, Math.max(168, vw - pad * 2));
    const minL = ox + pad;
    const maxR = ox + vw - pad;

    // Prefer left-aligning with the tile; if that overruns, slide left.
    let left = rect.left;
    if (left + menuWidth > maxR) left = maxR - menuWidth;
    if (left < minL) left = minL;

    // Available room relative to the visual viewport.
    const spaceBelow = oy + vh - rect.bottom - pad;
    const spaceAbove = rect.top - oy - pad;
    const preferBelow = spaceBelow >= 150 || spaceBelow >= spaceAbove;

    menu.style.position = 'fixed';
    menu.style.left = `${Math.round(left)}px`;
    menu.style.right = 'auto';
    menu.style.width = `${Math.round(menuWidth)}px`;
    menu.style.zIndex = '40';

    if (preferBelow) {
      const top = rect.bottom + gap;
      const maxHeight = Math.max(110, Math.min(spaceBelow - gap, Math.min(360, vh * 0.55)));
      menu.style.top = `${Math.round(top)}px`;
      menu.style.bottom = 'auto';
      menu.style.maxHeight = `${Math.round(maxHeight)}px`;
    } else {
      // Distance from the layout viewport bottom to just above the tile.
      const bottom = window.innerHeight - rect.top + gap;
      const maxHeight = Math.max(110, Math.min(spaceAbove - gap, Math.min(360, vh * 0.55)));
      menu.style.top = 'auto';
      menu.style.bottom = `${Math.round(bottom)}px`;
      menu.style.maxHeight = `${Math.round(maxHeight)}px`;
    }
  }

  /** @param {HTMLElement|null} menu */
  #clearMenuPosition(menu) {
    if (!menu) return;
    menu.style.position = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.width = '';
    menu.style.maxHeight = '';
    menu.style.zIndex = '';
  }

  #buildVehicleMenu() {
    if (!this.vehicleMenu) return;
    this.vehicleMenu.innerHTML = '';
    for (const item of VEHICLES) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'pick-option';
      opt.role = 'option';
      opt.dataset.id = item.id;
      opt.setAttribute('aria-selected', 'false');

      const thumb = document.createElement('span');
      thumb.className = 'pick-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      const art = document.createElement('span');
      paintVehiclePreview(art, item);
      thumb.append(art);

      const body = document.createElement('span');
      body.className = 'pick-option-body';
      body.innerHTML = `
        <span class="pick-option-name">${item.name}</span>
        <span class="pick-option-sub">${item.class ?? ''} · ${int(item.maxLaunchKph)} km/h</span>
      `;

      opt.append(thumb, body);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.select(item.id, null);
        this.#setOpen('vehicle', false);
        this.refresh();
        this.onChange?.();
      });
      this.vehicleMenu.append(opt);
    }
  }

  #buildSceneMenu() {
    if (!this.sceneMenu) return;
    this.sceneMenu.innerHTML = '';
    for (const item of SCENES) {
      const surface = getSurface(item.surface);
      const grip = Math.round(surface.grip * (item.gripMultiplier ?? 1) * 100);
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'pick-option';
      opt.role = 'option';
      opt.dataset.id = item.id;
      opt.setAttribute('aria-selected', 'false');

      const thumb = document.createElement('span');
      thumb.className = 'pick-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      const art = document.createElement('span');
      paintScenePreview(art, item);
      thumb.append(art);

      const body = document.createElement('span');
      body.className = 'pick-option-body';
      body.innerHTML = `
        <span class="pick-option-name">${item.name}</span>
        <span class="pick-option-sub">${surface.label} · ${grip}% grip</span>
      `;

      opt.append(thumb, body);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.select(null, item.id);
        this.#setOpen('scene', false);
        this.refresh();
        this.onChange?.();
      });
      this.sceneMenu.append(opt);
    }
  }

  #syncMenuSelection(menu, activeId) {
    if (!menu) return;
    for (const opt of menu.querySelectorAll('.pick-option')) {
      opt.setAttribute('aria-selected', String(opt.dataset.id === activeId));
    }
  }

  #renderVehiclePreview() {
    const stock = this.game.stockVehicle;
    if (this.vehicleCaption) this.vehicleCaption.textContent = stock.name;
    paintVehiclePreview(this.vehiclePreview, stock);
    this.#syncMenuSelection(this.vehicleMenu, this.game.vehicleId);
  }

  #renderScenePreview() {
    const scene = this.game.scene;
    if (this.sceneCaption) this.sceneCaption.textContent = scene.name;
    paintScenePreview(this.scenePreview, scene);
    this.#syncMenuSelection(this.sceneMenu, this.game.sceneId);
  }

  #renderSpeeds() {
    const { game } = this;
    if (!this.speedList) return;
    const ladder = game.ladder;
    const unlocked = game.unlockedSpeed;
    /** How many rungs are visible in the rail viewport at once. */
    const VISIBLE = 4;

    if (this.speedReadout) {
      this.speedReadout.textContent = `${int(game.launchSpeedKph)} km/h`;
    }

    this.speedList.innerHTML = '';
    this.speedList.dataset.visible = String(VISIBLE);
    for (const kph of ladder) {
      const locked = kph > unlocked;
      const selected = kph === game.launchSpeedKph;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'speed-node';
      node.dataset.id = String(kph);
      node.disabled = locked;
      node.setAttribute('aria-pressed', String(selected));
      if (locked) node.setAttribute('aria-label', `${kph} km/h, locked`);
      node.innerHTML = `
        <span class="speed-node-dot"></span>
        <span class="speed-node-val">${locked ? '🔒' : kph}</span>
      `;
      node.addEventListener('click', () => {
        game.selectSpeed(kph);
        this.refresh();
        this.onChange?.();
      });
      this.speedList.append(node);
    }

    // Viewport holds 4 rungs; default to the last 4, or keep the selected rung in view.
    requestAnimationFrame(() => this.#scrollSpeedRail(VISIBLE));
  }

  /**
   * Pin the rail so four rungs show. Prefer the tail of the ladder (last 4);
   * if the selected rung sits earlier, scroll it into the window instead.
   * @param {number} visible
   */
  #scrollSpeedRail(visible = 4) {
    const rail = this.speedList;
    if (!rail) return;
    const nodes = [...rail.querySelectorAll('.speed-node')];
    if (nodes.length === 0) return;

    const selIdx = nodes.findIndex((n) => n.getAttribute('aria-pressed') === 'true');
    const lastStart = Math.max(0, nodes.length - visible);
    // Selected among the last 4 → show the end; otherwise show selected at top.
    const targetIdx = selIdx >= 0 && selIdx < lastStart ? selIdx : lastStart;
    const target = nodes[targetIdx];
    if (!target) return;

    // Offset relative to the first node — avoids scrollIntoView moving the page.
    const base = nodes[0].offsetTop;
    rail.scrollTop = Math.max(0, target.offsetTop - base);
  }

  #renderParts() {
    const { game } = this;
    if (!this.partsList || !this.creditBalance) return;
    const spec = game.stockVehicle;
    const levels = game.upgrades;
    const credits = game.credits;

    this.creditBalance.textContent = `$${int(credits)}`;
    this.partsList.innerHTML = '';

    // Glyph + short label for each bay part.
    const icons = {
      tyres: { glyph: '◎', label: 'Tyres' },
      brakes: { glyph: '▣', label: 'Brakes' },
      aero: { glyph: '▲', label: 'Aero' },
      chassis: { glyph: '⬡', label: 'Chassis' },
    };

    for (const part of PARTS) {
      const level = levels[part.id] ?? 0;
      const cost = game.upgradeCost(part.id);
      const maxed = cost === null;
      const affordable = !maxed && credits >= cost;
      const nextLabel = maxed ? 'Maxed' : stepFor(spec, part.id, level + 1).label;
      const fitted = stepFor(spec, part.id, level).label;
      const meta = icons[part.id] ?? { glyph: '●', label: part.name };

      // Whole orb is the buy control — tap to spend credits on the next cut.
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `upgrade-orb${maxed ? ' is-maxed' : ''}${!affordable && !maxed ? ' is-locked' : ''}`;
      btn.dataset.part = part.id;
      btn.disabled = maxed || !affordable;
      btn.setAttribute(
        'aria-label',
        maxed
          ? `${part.name}, maxed, ${fitted}`
          : `${part.name}, level ${level} of ${MAX_LEVEL}, next ${nextLabel}, $${int(cost)}`,
      );
      if (!maxed && !affordable) btn.title = `$${int(cost - credits)} short`;
      else btn.title = maxed ? fitted : `${nextLabel} · $${int(cost)}`;

      // Three arc "circle-cuts" around the icon — filled = levels owned.
      const cuts = Array.from({ length: MAX_LEVEL }, (_, i) => {
        const on = i < level ? ' is-on' : '';
        return `<path class="upgrade-cut${on}" d="${upgradeCutPath(i, MAX_LEVEL)}" />`;
      }).join('');

      btn.innerHTML = `
        <span class="upgrade-ring" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48" focusable="false">
            ${cuts}
          </svg>
        </span>
        <span class="upgrade-glyph" aria-hidden="true">${meta.glyph}</span>
        <span class="upgrade-name">${meta.label}</span>
        <span class="upgrade-meta">${maxed ? 'MAX' : `$${int(cost)}`}</span>
      `;

      btn.addEventListener('click', () => {
        if (!game.buyUpgrade(part.id).ok) return;
        this.refresh();
        this.onChange?.();
      });

      // Hover / focus shows the next step under the row.
      const showHint = () => {
        if (!this.upgradeHint) return;
        this.upgradeHint.textContent = maxed
          ? `${part.name} · ${fitted}`
          : `${part.name} → ${nextLabel}${affordable ? '' : ' · need more $'}`;
      };
      btn.addEventListener('pointerenter', showHint);
      btn.addEventListener('focus', showHint);

      this.partsList.append(btn);
    }

    if (this.upgradeHint && !this.upgradeHint.textContent) {
      this.upgradeHint.textContent = 'Tap an upgrade to fit the next level';
    }
  }

  refresh() {
    const { game } = this;
    this.#renderVehiclePreview();
    this.#renderScenePreview();
    this.#renderSpeeds();
    this.#renderParts();

    const course = buildCourse(game.vehicle, game.scene, game.launchSpeedKph);
    this.course = course;

    if (this.bestLine) {
      const best = getBest(game.vehicleId, game.sceneId);
      const line = `<span class="best-stat">LINE <b>${metres(course.target)}</b></span>
        <span class="best-stat">COAST <b>${course.coastSeconds.toFixed(1)}s</b></span>`;
      this.bestLine.innerHTML = best
        ? `${line}<span class="best-stat best-stat--record">PB <b>${int(best.score)}</b></span>`
        : line;
    }
  }

  show() {
    this.#setOpen('vehicle', false);
    this.#setOpen('scene', false);
    this.refresh();
    this.root.hidden = false;
  }

  hide() {
    this.#setOpen('vehicle', false);
    this.#setOpen('scene', false);
    this.root.hidden = true;
  }
}
