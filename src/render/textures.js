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
  const { c, ctx } = canvas(256, 512);
  const base = hex(def.road.color);
  const alt = hex(def.road.secondary ?? def.road.color);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);

  // Subtle longitudinal streaking so the surface has grain to read speed from.
  ctx.fillStyle = alt;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 12 + Math.random() * 60);
  }
  ctx.globalAlpha = 1;

  // Solid edge lines.
  ctx.fillStyle = '#f2f2f0';
  ctx.fillRect(8, 0, 7, 512);
  ctx.fillRect(241, 0, 7, 512);

  // Dashed centre line: two dashes per tile.
  ctx.fillStyle = '#f2f2f0';
  for (let i = 0; i < 2; i++) ctx.fillRect(124, i * 256 + 40, 8, 176);

  return finish(c, 1, runway / TILE_METRES);
}

/** @param {import('../scenes/registry.js').SceneDef} def */
export function makeGroundTexture(def) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = hex(def.ground.color);
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = hex(def.ground.accent ?? def.ground.color);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 220; i++) {
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return finish(c, 240, 240, 4);
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
