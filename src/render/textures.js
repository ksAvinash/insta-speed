import * as THREE from 'three';

/** Canvas-generated textures — keeps the build asset-free and instantly themeable. */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function finish(c, repeatX, repeatY, aniso = 8) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * One tile covers `TILE_METRES` of road. Edge lines run continuously and the
 * centre line dashes, which is what actually sells the speed at 600 km/h.
 */
export const TILE_METRES = 24;

/**
 * @param {import('../scenes/registry.js').SceneDef} def
 * @param {number} roadWidth
 * @param {number} runway
 */
export function makeRoadTexture(def, roadWidth, runway) {
  // 512 tall tiles: same one plane at runtime, sharper grain at speed.
  const { c, ctx } = canvas(256, 512);
  const base = hex(def.road.color);
  const alt = hex(def.road.secondary ?? def.road.color);
  const surface = def.surface ?? 'tarmac';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);

  // Subtle vignette at the lane edges so the road reads as a channel.
  const edgeShade = ctx.createLinearGradient(0, 0, 256, 0);
  edgeShade.addColorStop(0, 'rgba(0,0,0,0.22)');
  edgeShade.addColorStop(0.12, 'rgba(0,0,0,0)');
  edgeShade.addColorStop(0.88, 'rgba(0,0,0,0)');
  edgeShade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, 256, 512);

  // Surface-specific grain. Same draw cost as the old random streaks — just
  // more intentional so each venue reads at a glance.
  if (surface === 'salt') {
    // Crushed salt: pale flecks and soft cracks.
    ctx.fillStyle = alt;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 90; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 3, 8 + Math.random() * 40);
    }
    ctx.strokeStyle = alt;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, Math.random() * 512);
      ctx.lineTo(Math.random() * 256, Math.random() * 512);
      ctx.stroke();
    }
  } else if (surface === 'ice_tarmac' || surface === 'ice' || surface === 'snow') {
    // Dark tarmac under translucent ice sheen + sparse white flecks.
    ctx.fillStyle = alt;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 50; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 20 + Math.random() * 80);
    }
    ctx.fillStyle = '#e8f4ff';
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (surface === 'carbon_mesh') {
    // Indigo grid weave for the maglev deck.
    ctx.strokeStyle = alt;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (let x = 0; x < 256; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y < 512; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = alt;
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 2, 10 + Math.random() * 30);
    }
  } else if (surface === 'polished_concrete' || surface === 'concrete') {
    // Clean industrial slab with fine longitudinal polish lines.
    ctx.fillStyle = alt;
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * 256;
      ctx.fillRect(x, 0, 1, 512);
    }
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 8 + Math.random() * 20, 2);
    }
  } else if (surface === 'dry_cracked_asphalt') {
    // Coarse aggregate + occasional crack.
    ctx.fillStyle = alt;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 100; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 6 + Math.random() * 50);
    }
    ctx.strokeStyle = '#1c1917';
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      let x = Math.random() * 256;
      let y = Math.random() * 512;
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (Math.random() - 0.5) * 40;
        y += 10 + Math.random() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (surface === 'wet') {
    // Rain-soaked blacktop: long mirror streaks + soft puddle pools.
    ctx.fillStyle = alt;
    ctx.globalAlpha = 0.42;
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * 256;
      ctx.fillRect(x, 0, 1 + Math.random() * 2.5, 512);
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#9ab0c4';
    for (let i = 0; i < 14; i++) {
      const x = 20 + Math.random() * 216;
      const y = Math.random() * 512;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + Math.random() * 22, 4 + Math.random() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1, 18 + Math.random() * 50);
    }
  } else {
    // Default tarmac: longitudinal streaking for speed grain.
    ctx.fillStyle = alt;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 512;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 12 + Math.random() * 60);
    }
  }
  ctx.globalAlpha = 1;

  // Solid edge lines — high contrast so leaving the road is never ambiguous.
  const lightEdge = surface === 'salt' || surface === 'ice_tarmac' || surface === 'snow';
  const edge = lightEdge ? '#1a1f24' : '#f2f2f0';
  const outer = lightEdge ? '#0a0c10' : '#ffffff';
  ctx.fillStyle = outer;
  ctx.fillRect(4, 0, 4, 512);
  ctx.fillRect(248, 0, 4, 512);
  ctx.fillStyle = edge;
  ctx.fillRect(10, 0, 8, 512);
  ctx.fillRect(238, 0, 8, 512);

  // Rumble ticks just inside the edge — motion cue at speed, free in the map.
  ctx.fillStyle = edge;
  ctx.globalAlpha = 0.55;
  for (let y = 0; y < 512; y += 28) {
    ctx.fillRect(20, y, 10, 10);
    ctx.fillRect(226, y, 10, 10);
  }
  ctx.globalAlpha = 1;

  // Dashed centre line: two dashes per tile.
  ctx.fillStyle = edge;
  for (let i = 0; i < 2; i++) ctx.fillRect(122, i * 256 + 36, 12, 168);

  return finish(c, 1, runway / TILE_METRES, 12);
}

/** @param {import('../scenes/registry.js').SceneDef} def */
export function makeGroundTexture(def) {
  const { c, ctx } = canvas(128, 128);
  const base = hex(def.ground.color);
  const accent = hex(def.ground.accent ?? def.ground.color);
  const surface = def.surface ?? 'tarmac';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);

  if (surface === 'salt') {
    // Blinding salt crust with soft mottling + faint polygonal cracks.
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 280; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      let x = Math.random() * 128;
      let y = Math.random() * 128;
      ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        x += (Math.random() - 0.5) * 28;
        y += (Math.random() - 0.5) * 28;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (surface === 'wet') {
    // Dark wet verge — dull asphalt shoulders, faint rain sheen.
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 180; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#8aa0b4';
    for (let i = 0; i < 24; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 8 + Math.random() * 20, 1);
    }
  } else if (surface === 'ice_tarmac' || surface === 'snow' || surface === 'ice') {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 200; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 128, Math.random() * 128, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 14, 2);
    }
  } else if (surface === 'dry_cracked_asphalt') {
    // Mojave sand / dirt.
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 260; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 8 + Math.random() * 16, 1);
    }
  } else if (surface === 'carbon_mesh' || surface === 'polished_concrete') {
    // Dark void / industrial void around the deck.
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 120; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    }
  } else {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 220; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  return finish(c, 240, 240, 4);
}

/**
 * A vertical fade for the target line's light curtain: solid at the road,
 * nothing at the top.
 *
 * The gradient is baked into the colour rather than the alpha because the
 * curtain blends additively — a uniform pane of green lightened the entire sky
 * behind it on the approach, which read as a filter over the camera instead of
 * a marker standing on the road.
 */
export function makeCurtainTexture(color = '#4dff92') {
  const { c, ctx } = canvas(8, 128);
  const grad = ctx.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Chequered banding for the target line. Nothing else in the game reads as
 * "this is the line" from a kilometre out as immediately as a chequered flag.
 * @param {number} squares across the width of the road
 */
export function makeCheckerTexture(colorA = '#ffffff', colorB = '#0d1a12', squares = 2) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = colorB;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  return finish(c, squares, 1, 4);
}

/** Chevron banding for the target gantry and the wall face. */
export function makeHazardTexture(colorA = '#f5d13a', colorB = '#1b1b1f') {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = colorB;
  ctx.lineWidth = 0;
  for (let i = -128; i < 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i + 32 - 128, 128);
    ctx.lineTo(i - 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  return finish(c, 1, 1, 4);
}
