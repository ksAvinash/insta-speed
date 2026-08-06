import * as THREE from 'three';
import { makeGroundTexture } from './textures.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 top;
  uniform vec3 bottom;
  varying vec3 vWorld;
  void main() {
    float h = normalize(vWorld).y;
    gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.15, 0.6, h)), 1.0);
  }
`;

/** Sky dome, fog, lights and the ground plane, all driven by a scene definition. */
export class Environment {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
  }

  /**
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {{ runway: number }} course
   * @param {{ shadows: boolean }} quality
   */
  build(def, course, quality) {
    this.clear();

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(def.sky.top) },
          bottom: { value: new THREE.Color(def.sky.bottom) },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.#add(sky);

    this.scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);

    const groundTex = makeGroundTexture(def);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, Math.max(6000, course.runway * 2)),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, course.runway / 2);
    ground.receiveShadow = quality.shadows;
    this.#add(ground);

    const hemi = new THREE.HemisphereLight(def.sky.top, def.ground.color, 1.1);
    this.#add(hemi);

    const sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity);
    sun.position.set(...def.sun.position).multiplyScalar(400);
    if (quality.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const c = sun.shadow.camera;
      c.left = -40;
      c.right = 40;
      c.top = 40;
      c.bottom = -40;
      c.near = 1;
      c.far = 900;
      // The shadow frustum tracks the car rather than covering the whole runway.
      this.sunTarget = new THREE.Object3D();
      this.#add(this.sunTarget);
      sun.target = this.sunTarget;
    }
    this.sun = sun;
    this.#add(sun);

    this.#add(new THREE.AmbientLight(def.fog.color, def.tunnel ? 0.7 : 0.35));
  }

  /** Keeps the shadow frustum centred on the car. */
  follow(z) {
    if (!this.sunTarget || !this.sun) return;
    this.sunTarget.position.set(0, 0, z);
    this.sunTarget.updateMatrixWorld();
    this.sun.position.copy(this.sunTarget.position).add(this.#sunOffset());
  }

  #sunOffset() {
    this._offset ??= new THREE.Vector3();
    return this._offset.set(120, 260, -80);
  }

  #add(obj) {
    this.group.add(obj);
    this.disposables.push(obj);
  }

  clear() {
    for (const obj of this.disposables) {
      obj.geometry?.dispose();
      if (obj.material) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    }
    this.group.clear();
    this.disposables = [];
    this.sunTarget = null;
    this.sun = null;
  }
}
