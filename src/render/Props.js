import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Roadside decoration.
 *
 * Everything is an InstancedMesh, so a scene's worth of markers, trees and
 * pylons costs one draw call per prop type no matter how many there are. They
 * are the main thing giving a sense of speed, so density matters more than
 * detail — spacing is what the eye reads, not geometry.
 *
 * `quality.propDistance` budgets how many instances a tier can afford: long
 * runways on low settings are thinned rather than truncated, so the strip
 * still feels continuous under the camera without paying for every cat-eye
 * over two kilometres.
 */

/** @param {object} entry @returns {THREE.BufferGeometry} */
function geometryFor(entry) {
  const scale = entry.scale ?? 1;
  const h = entry.height ?? 2.4;

  switch (entry.type) {
    case 'post':
    case 'distance_marker':
      return new THREE.BoxGeometry(0.18, h, 0.18);

    case 'hazard_strobe': {
      // Post + lamp head.
      const post = new THREE.BoxGeometry(0.2, h * 0.85, 0.2);
      post.translate(0, h * 0.42, 0);
      const head = new THREE.BoxGeometry(0.45, 0.35, 0.45);
      head.translate(0, h * 0.92, 0);
      return mergeGeometries([post, head], false);
    }

    case 'lamp':
      return new THREE.BoxGeometry(1.6, 0.18, 0.5);

    case 'rock':
      return new THREE.DodecahedronGeometry(0.9 * scale, 0);

    case 'tree':
      return new THREE.ConeGeometry(1.1 * scale, 4.6 * scale, 6);

    case 'pylon':
    case 'timing_tower': {
      const body = new THREE.BoxGeometry(2.0 * scale, h * 0.85, 2.0 * scale);
      body.translate(0, h * 0.42, 0);
      const cap = new THREE.BoxGeometry(2.6 * scale, h * 0.12, 2.6 * scale);
      cap.translate(0, h * 0.92, 0);
      const mast = new THREE.BoxGeometry(0.35 * scale, h * 0.2, 0.35 * scale);
      mast.translate(0, h * 1.05, 0);
      return mergeGeometries([body, cap, mast], false);
    }

    case 'neon_arch': {
      // Upright + cross-beam so bothSides reads as a real arch gate at speed.
      const post = new THREE.BoxGeometry(0.35, h, 0.35);
      post.translate(0, h / 2, 0);
      const beam = new THREE.BoxGeometry(0.35, 0.35, h * 0.55);
      beam.translate(0, h * 0.92, h * 0.2);
      return mergeGeometries([post, beam], false);
    }

    case 'cat_eye_led':
    case 'runway_light':
      return new THREE.BoxGeometry(0.4 * scale, h || 0.2, 0.55 * scale);

    case 'snow_bank': {
      // Low wedge bank rather than a flat box.
      const geo = new THREE.BoxGeometry(4.2 * scale, h, 7 * scale);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0 && Math.abs(pos.getX(i)) > 0.5) {
          pos.setY(i, pos.getY(i) * 0.45);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    }

    case 'windsock': {
      const pole = new THREE.CylinderGeometry(0.05, 0.07, h * 0.92, 6);
      pole.translate(0, h * 0.46, 0);
      const sock = new THREE.ConeGeometry(0.5 * scale, h * 0.42, 6);
      sock.rotateX(Math.PI / 2);
      sock.translate(0, h * 0.88, 0.22 * scale);
      return mergeGeometries([pole, sock], false);
    }

    case 'radar_dish': {
      const stand = new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, h * 0.55, 8);
      stand.translate(0, h * 0.28, 0);
      const dish = new THREE.CylinderGeometry(3.2 * scale, 0.6 * scale, h * 0.35, 14);
      dish.translate(0, h * 0.72, 0);
      const hub = new THREE.SphereGeometry(0.35 * scale, 8, 6);
      hub.translate(0, h * 0.55, 0);
      return mergeGeometries([stand, dish, hub], false);
    }

    case 'magnetic_guide_rail': {
      const rail = new THREE.BoxGeometry(0.35, h, 2.8);
      rail.translate(0, h / 2, 0);
      const lip = new THREE.BoxGeometry(0.55, h * 0.25, 2.8);
      lip.translate(0, h * 0.95, 0);
      return mergeGeometries([rail, lip], false);
    }

    default:
      return new THREE.BoxGeometry(0.4, h, 0.4);
  }
}

/** Prop types whose Y is the top of a hanging fixture, not the centre of a post. */
const HANGING = new Set(['lamp']);

/** Low fixtures that sit on the deck rather than standing as posts. */
const DECK_LEVEL = new Set(['cat_eye_led', 'runway_light', 'magnetic_guide_rail', 'snow_bank']);

/**
 * Dense, tiny markers that never leave the near field of the road. Their
 * combined bounding volume spans the whole runway, so frustum culling cannot
 * help — they are the ones the instance budget has to thin first.
 */
const DENSE = new Set(['cat_eye_led', 'runway_light', 'magnetic_guide_rail', 'post', 'distance_marker']);

/**
 * Compound geometries already place their own origin at ground level, so the
 * instance Y should be 0 rather than half-height.
 */
const GROUND_ORIGIN = new Set([
  'neon_arch',
  'windsock',
  'radar_dish',
  'hazard_strobe',
  'timing_tower',
  'pylon',
  'magnetic_guide_rail',
]);

export class Props {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    /** @type {THREE.InstancedMesh[]} */
    this.meshes = [];
  }

  /**
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {{ runway: number, roadWidth: number }} course
   * @param {{ propDistance: number, shadows: boolean }} quality
   */
  build(def, course, quality) {
    this.clear();
    if (!def.props?.length) return;

    // A deterministic PRNG keeps scatter identical between runs, so the scene
    // a player learns is the scene they get next time.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const dummy = new THREE.Object3D();
    const horizon = quality.propDistance ?? 1600;

    for (const entry of def.props) {
      const sides = entry.bothSides ? [-1, 1] : [1];
      const spacing = effectiveSpacing(entry, course, horizon, sides.length);
      const count = Math.ceil(course.runway / spacing) * sides.length;
      if (count <= 0) continue;

      const geo = geometryFor(entry);
      const mat = new THREE.MeshLambertMaterial({
        color: entry.color ?? 0xcccccc,
        emissive: entry.emissive ? entry.color ?? 0xffffff : 0x000000,
        // Slightly hotter emissives so neon / LEDs read at distance without
        // bloom or extra draws.
        emissiveIntensity: entry.emissive ? 1.15 : 0,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.castShadow = quality.shadows && entry.type !== 'lamp' && !DECK_LEVEL.has(entry.type);
      // Sparse landmarks fit a tight-ish bound and cull well; dense strips span
      // the whole runway so culling would never fire — leave them uncullable.
      mesh.frustumCulled = !DENSE.has(entry.type);

      let i = 0;
      for (let z = 0; z < course.runway; z += spacing) {
        for (const side of sides) {
          const scatter = entry.scatter ? (rand() - 0.5) * entry.scatter : 0;
          const lateral = entry.lateral ?? course.roadWidth / 2 + 2;
          const height = propCentreY(entry);

          dummy.position.set(side * (lateral + Math.abs(scatter)), height, z + scatter);
          dummy.rotation.set(0, entry.type === 'windsock' ? 0 : rand() * Math.PI, 0);
          dummy.updateMatrix();
          if (i < count) mesh.setMatrixAt(i++, dummy.matrix);
        }
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;

      this.group.add(mesh);
      this.meshes.push(mesh);
    }
  }

  clear() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.clear();
    this.meshes = [];
  }
}

/**
 * Stretch spacing when the authored density would exceed what this tier's
 * propDistance budget can afford across the full runway.
 *
 * @param {object} entry
 * @param {{ runway: number }} course
 * @param {number} horizon quality.propDistance
 * @param {number} sideCount
 */
function effectiveSpacing(entry, course, horizon, sideCount) {
  const authored = Math.max(entry.spacing ?? 50, 4);
  // Budget ≈ how many of this prop you would see in a sliding window of
  // `horizon` metres, with a little slack for both directions of travel.
  const windowSlots = Math.max(8, Math.ceil((horizon * 2.2) / authored) * sideCount);
  const fullCount = Math.ceil(course.runway / authored) * sideCount;
  if (fullCount <= windowSlots) return authored;
  return course.runway / (windowSlots / sideCount);
}

/** World Y for the centre of a prop mesh given its authored height. */
function propCentreY(entry) {
  if (GROUND_ORIGIN.has(entry.type)) return 0;
  const h = entry.height ?? 2.4;
  if (HANGING.has(entry.type)) return h;
  if (entry.type === 'tree') return h / 2 + 1.6;
  if (DECK_LEVEL.has(entry.type)) return h / 2;
  return h / 2;
}
