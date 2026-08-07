import * as THREE from 'three';

/**
 * Camera-following rain curtain.
 *
 * Thin streak instances recycle in a box around the car/camera so cost stays
 * flat (one draw) and the storm always fills the frame at speed. Disabled when
 * the scene has no weather.rain — zero GPU when dry.
 */
export class Rain {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.enabled = false;
    this.mesh = null;
    this._positions = null;
    this._count = 0;
    this._wind = 1.6;
    this._fall = 28;
  }

  /**
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {{ pixelRatio?: number }} quality
   */
  build(def, quality) {
    this.clear();
    const rain = def.weather?.rain ?? def.rain;
    if (!rain) {
      this.enabled = false;
      this.group.visible = false;
      return;
    }

    this.enabled = true;
    this.group.visible = true;
    const intensity = typeof rain === 'object' ? (rain.intensity ?? 1) : 1;
    // Low tiers keep the mood without spending a full high-tier streak budget.
    const base = (quality.pixelRatio ?? 1) < 1.25 ? 120 : 240;
    this._count = Math.floor(base * intensity);
    this._wind = typeof rain === 'object' ? (rain.wind ?? def.crosswind ?? 1.6) : (def.crosswind ?? 1.6);
    this._fall = typeof rain === 'object' ? (rain.fall ?? 28) : 28;

    const positions = new Float32Array(this._count * 3);
    this.#scatter(positions);
    this._positions = positions;

    // Slightly long thin boxes read as streaks at speed; cheaper than lines.
    const geo = new THREE.BoxGeometry(0.018, 0.85, 0.018);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa8c0d8,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, this._count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    // Tilt streaks into the wind so they don't fall dead-vertical.
    const tilt = Math.atan2(this._wind * 0.35, this._fall) * 0.85;
    for (let i = 0; i < this._count; i++) {
      const ix = i * 3;
      dummy.position.set(positions[ix], positions[ix + 1], positions[ix + 2]);
      dummy.rotation.set(0, 0, -tilt);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.mesh = mesh;
    this._dummy = dummy;
    this._tilt = tilt;
    this.group.add(mesh);
  }

  /**
   * @param {{ x: number, y: number, z: number } | THREE.Vector3} anchor car/camera world pos
   * @param {number} dt
   * @param {boolean} [live]
   */
  update(anchor, dt, live = true) {
    if (!this.enabled || !this.mesh || !this._positions) return;

    const ax = anchor.x ?? 0;
    const az = anchor.z ?? 0;
    // Volume rides with the car so the curtain always fills the frame.
    this.group.position.set(ax, 0, az);

    if (!live) return;

    const pos = this._positions;
    const fall = this._fall * dt;
    const wind = this._wind * dt * 0.55;
    const dummy = this._dummy;
    const tilt = this._tilt;
    const halfW = 14;
    const halfD = 22;
    const top = 18;

    for (let i = 0; i < this._count; i++) {
      const ix = i * 3;
      pos[ix] += wind;
      pos[ix + 1] -= fall * (0.85 + (i % 5) * 0.06);
      // Subtle forward drift so rain doesn't look glued to the car.
      pos[ix + 2] -= fall * 0.08;

      if (pos[ix + 1] < 0) {
        pos[ix] = (Math.random() - 0.5) * halfW * 2;
        pos[ix + 1] = top * (0.4 + Math.random() * 0.6);
        pos[ix + 2] = (Math.random() - 0.5) * halfD * 2;
      } else if (pos[ix] > halfW) {
        pos[ix] -= halfW * 2;
      } else if (pos[ix] < -halfW) {
        pos[ix] += halfW * 2;
      }

      dummy.position.set(pos[ix], pos[ix + 1], pos[ix + 2]);
      dummy.rotation.set(0, 0, -tilt);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** @param {Float32Array} positions */
  #scatter(positions) {
    const halfW = 14;
    const halfD = 22;
    const top = 18;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (Math.random() - 0.5) * halfW * 2;
      positions[i + 1] = Math.random() * top;
      positions[i + 2] = (Math.random() - 0.5) * halfD * 2;
    }
  }

  clear() {
    if (this.mesh) {
      this.mesh.geometry?.dispose();
      this.mesh.material?.dispose();
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    this._positions = null;
    this._count = 0;
    this.enabled = false;
    this.group.visible = false;
  }
}
