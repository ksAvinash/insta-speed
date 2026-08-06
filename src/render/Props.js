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
  switch (entry.type) {
    case 'post':
      return new THREE.BoxGeometry(0.16, entry.height ?? 2.4, 0.16);
    case 'lamp':
      return new THREE.BoxGeometry(1.6, 0.18, 0.5);
    case 'rock':
      return new THREE.DodecahedronGeometry(0.9 * scale, 0);
    case 'tree':
      return new THREE.ConeGeometry(1.1 * scale, 4.6 * scale, 6);
    case 'pylon':
      return new THREE.BoxGeometry(1.4, entry.height ?? 24, 1.4);
    default:
      return new THREE.BoxGeometry(0.4, 1, 0.4);
  }
}

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
      mesh.castShadow = quality.shadows && entry.type !== 'lamp';
      mesh.frustumCulled = false;

      let i = 0;
      for (let z = 0; z < course.runway; z += spacing) {
        for (const side of sides) {
          const scatter = entry.scatter ? (rand() - 0.5) * entry.scatter : 0;
          const lateral = entry.lateral ?? course.roadWidth / 2 + 2;
          const height =
            entry.type === 'lamp'
              ? entry.height ?? 6
              : (entry.height ?? 2.4) / 2 + (entry.type === 'tree' ? 1.6 : 0);

          dummy.position.set(side * (lateral + Math.abs(scatter)), height, z + scatter);
          dummy.rotation.set(0, rand() * Math.PI, 0);
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
