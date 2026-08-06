import * as THREE from 'three';
import { makeRoadTexture, makeHazardTexture } from './textures.js';

/**
 * The road, the target line you are aiming to stop on, and the wall waiting
 * just past it.
 *
 * The whole runway is a single two-triangle plane with a repeating texture
 * rather than a pool of recycled segments — at these speeds nothing about the
 * road changes along its length, so one draw call does the entire job.
 */
export class RoadBuilder {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
  }

  /**
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {{ target: number, wall: number, runway: number, roadWidth: number }} course
   */
  build(def, course) {
    this.clear();
    const { roadWidth, runway, target, wall } = course;

    const roadTex = makeRoadTexture(def, roadWidth, runway);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, runway),
      new THREE.MeshLambertMaterial({ map: roadTex }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, runway / 2);
    road.receiveShadow = true;
    this.#add(road);

    if (def.tunnel) this.#buildTunnel(def, course);

    this.#buildTargetLine(target, roadWidth);
    this.#buildWall(wall, roadWidth);
  }

  #buildTargetLine(target, roadWidth) {
    const hazard = makeHazardTexture('#39e07a', '#0d2b18');

    // The line itself: emissive so it reads from a kilometre out.
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x4dff92, toneMapped: false }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.02, target);
    this.#add(line);

    // Approach chevrons, tightening toward the line.
    for (let i = 1; i <= 6; i++) {
      const chevron = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth * 0.8, 0.7),
        new THREE.MeshBasicMaterial({
          color: 0x4dff92,
          transparent: true,
          opacity: 0.14 + i * 0.07,
          toneMapped: false,
        }),
      );
      chevron.rotation.x = -Math.PI / 2;
      chevron.position.set(0, 0.015, target - i * i * 1.6);
      this.#add(chevron);
    }

    // Gantry so the line is visible over the crest of the bonnet.
    const postGeo = new THREE.BoxGeometry(0.5, 7, 0.5);
    const postMat = new THREE.MeshLambertMaterial({ map: hazard });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set((side * (roadWidth + 1.6)) / 2, 3.5, target);
      this.#add(post, { shared: true });
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(roadWidth + 2.2, 0.7, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1c2b22 }),
    );
    beam.position.set(0, 7, target);
    this.#add(beam);

    this.targetMarker = line;
  }

  #buildWall(wall, roadWidth) {
    const hazard = makeHazardTexture('#f5d13a', '#1b1b1f');
    hazard.repeat.set(6, 1);

    const block = new THREE.Mesh(
      new THREE.BoxGeometry(roadWidth + 8, 5.5, 2.4),
      new THREE.MeshLambertMaterial({ map: hazard }),
    );
    block.position.set(0, 2.75, wall);
    block.castShadow = true;
    this.#add(block);
  }

  #buildTunnel(def, course) {
    const radius = course.roadWidth * 0.78;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, course.runway, 18, 1, true),
      new THREE.MeshLambertMaterial({ color: def.ground.accent ?? 0x22262c, side: THREE.BackSide }),
    );
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, radius * 0.34, course.runway / 2);
    this.#add(shell);
  }

  #add(obj, opts = {}) {
    this.group.add(obj);
    this.disposables.push({ obj, shared: opts.shared ?? false });
  }

  clear() {
    const seen = new Set();
    for (const { obj } of this.disposables) {
      if (!seen.has(obj.geometry)) {
        obj.geometry?.dispose();
        seen.add(obj.geometry);
      }
      if (obj.material && !seen.has(obj.material)) {
        obj.material.map?.dispose();
        obj.material.dispose();
        seen.add(obj.material);
      }
    }
    this.group.clear();
    this.disposables = [];
  }
}
