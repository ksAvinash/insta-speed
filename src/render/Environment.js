import * as THREE from 'three';
import { makeGroundTexture } from './textures.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Atmosphere on the existing sky sphere: gradient, horizon haze, soft sun disc.
// Still one draw — no cubemap, no extra geometry.
const SKY_FRAG = /* glsl */ `
  uniform vec3 top;
  uniform vec3 bottom;
  uniform vec3 horizon;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  varying vec3 vWorld;
  void main() {
    vec3 dir = normalize(vWorld);
    float h = dir.y;
    vec3 col = mix(bottom, top, smoothstep(-0.12, 0.55, h));
    // Thin bright band at the horizon — sells distance without a second mesh.
    float band = exp(-h * h * 48.0);
    col = mix(col, horizon, band * 0.42);
    // Soft sun disc + halo (direction from scene sun).
    float sun = max(dot(dir, normalize(sunDir)), 0.0);
    col += sunColor * pow(sun, 512.0) * 1.4;
    col += sunColor * pow(sun, 24.0) * 0.18;
    // Slight darkening at the zenith so the top does not blow out under ACES.
    col *= 1.0 - smoothstep(0.35, 1.0, h) * 0.08;
    gl_FragColor = vec4(col, 1.0);
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

    const top = new THREE.Color(def.sky.top);
    const bottom = new THREE.Color(def.sky.bottom);
    // Horizon leans toward the brighter of the two stops so desert sunsets and
    // cold twilight both get a readable band without per-scene authoring.
    const horizon = bottom.clone().lerp(top, 0.35).multiplyScalar(1.12);
    const sunDir = new THREE.Vector3(...(def.sun.position ?? [0.2, 0.8, -0.3])).normalize();
    const sunColor = new THREE.Color(def.sun.color ?? 0xfff0d0);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: top },
          bottom: { value: bottom },
          horizon: { value: horizon },
          sunDir: { value: sunDir },
          sunColor: { value: sunColor },
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

    // Night / storm stages author a dim sun — pull hemi and ambient down with
    // it so the scene actually *reads* as dark rather than flat grey.
    const sunI = def.sun.intensity ?? 1;
    const nightish = sunI < 0.85;
    const hemiGain = nightish ? 0.55 + sunI * 0.4 : 1.15;
    const hemi = new THREE.HemisphereLight(def.sky.top, def.ground.color, hemiGain);
    this.#add(hemi);

    const sun = new THREE.DirectionalLight(def.sun.color, sunI);
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

    const ambGain = def.tunnel ? 0.75 : nightish ? 0.22 + sunI * 0.25 : 0.38;
    this.#add(new THREE.AmbientLight(def.fog.color, ambGain));
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
