import * as THREE from 'three';

/**
 * Roadside decoration.
 *
 * Everything is an InstancedMesh, so a scene's worth of markers, trees and
 * pylons costs one draw call per prop type no matter how many there are. They
 * are the main thing giving a sense of speed, so density matters more than
 * detail — spacing is what the eye reads, not geometry.
 */

/** @param {object} entry @returns {THREE.BufferGeometry} */
function geometryFor(entry) {
  const scale = entry.scale ?? 1;
  const h = entry.height;
  switch (entry.type) {
    case 'post':
    case 'distance_marker':
      return new THREE.BoxGeometry(0.16, h ?? 2.4, 0.16);
    case 'hazard_strobe':
      return new THREE.BoxGeometry(0.28, h ?? 2.5, 0.28);
    case 'lamp':
      return new THREE.BoxGeometry(1.6, 0.18, 0.5);
    case 'rock':
      return new THREE.DodecahedronGeometry(0.9 * scale, 0);
    case 'tree':
      return new THREE.ConeGeometry(1.1 * scale, 4.6 * scale, 6);
    case 'pylon':
    case 'timing_tower':
      return new THREE.BoxGeometry(2.2 * scale, h ?? 12, 2.2 * scale);
    case 'neon_arch':
      // Pillars that read as arch uprights at speed; a full arch span would
      // need per-instance multi-mesh and is not worth the draw cost.
      return new THREE.BoxGeometry(0.4, h ?? 6.5, 0.4);
    case 'cat_eye_led':
    case 'runway_light':
      return new THREE.BoxGeometry(0.4 * scale, h ?? 0.2, 0.55 * scale);
    case 'snow_bank':
      return new THREE.BoxGeometry(4.2 * scale, h ?? 1.5, 7 * scale);
    case 'windsock':
      return new THREE.ConeGeometry(0.55 * scale, h ?? 5, 6);
    case 'radar_dish':
      // Wide dish on a stubby base — cylinder reads as a tracking antenna.
      return new THREE.CylinderGeometry(3.6 * scale, 0.9 * scale, h ?? 10, 12);
    case 'magnetic_guide_rail':
      return new THREE.BoxGeometry(0.4, h ?? 0.8, 2.8);
    default:
      return new THREE.BoxGeometry(0.4, h ?? 1, 0.4);
  }
}

/** Prop types whose Y is the top of a hanging fixture, not the centre of a post. */
const HANGING = new Set(['lamp']);

/** Low fixtures that sit on the deck rather than standing as posts. */
const DECK_LEVEL = new Set(['cat_eye_led', 'runway_light', 'magnetic_guide_rail', 'snow_bank']);

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

    for (const entry of def.props) {
      const sides = entry.bothSides ? [-1, 1] : [1];
      const spacing = Math.max(entry.spacing ?? 50, 4);
      const count = Math.ceil(course.runway / spacing) * sides.length;
      if (count <= 0) continue;

      const geo = geometryFor(entry);
      const mat = new THREE.MeshLambertMaterial({
        color: entry.color ?? 0xcccccc,
        emissive: entry.emissive ? entry.color ?? 0xffffff : 0x000000,
        emissiveIntensity: entry.emissive ? 0.9 : 0,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.castShadow = quality.shadows && entry.type !== 'lamp' && !DECK_LEVEL.has(entry.type);
      mesh.frustumCulled = false;

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

/** World Y for the centre of a prop mesh given its authored height. */
function propCentreY(entry) {
  const h = entry.height ?? 2.4;
  if (HANGING.has(entry.type)) return h;
  if (entry.type === 'tree') return h / 2 + 1.6;
  if (DECK_LEVEL.has(entry.type)) return h / 2;
  return h / 2;
}
