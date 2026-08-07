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

// Same sky, but a larger cooler disc so moonlight reads as a moon, not a star.
const SKY_FRAG_MOON = /* glsl */ `
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
    float band = exp(-h * h * 48.0);
    col = mix(col, horizon, band * 0.35);
    float m = max(dot(dir, normalize(sunDir)), 0.0);
    // Broad pale disc + soft lunar halo.
    col += sunColor * pow(m, 180.0) * 1.1;
    col += sunColor * pow(m, 28.0) * 0.22;
    col += sunColor * pow(m, 6.0) * 0.06;
    // Keep the zenith deep so stars of the lamps pop against it.
    col *= 1.0 - smoothstep(0.25, 1.0, h) * 0.12;
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

    // Soften the sky “sun” disc into a readable moon when the scene asks for one.
    const moonSpec = def.sky?.moon;
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: top },
        bottom: { value: bottom },
        horizon: { value: horizon },
        sunDir: { value: sunDir },
        sunColor: { value: sunColor },
      },
      vertexShader: SKY_VERT,
      fragmentShader: moonSpec ? SKY_FRAG_MOON : SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 16), skyMat);
    this.#add(sky);

    if (moonSpec) this.#addMoon(sunDir, moonSpec);
    if (def.sky?.clouds) this.#addClouds(def, course);

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

  /**
   * Physical moon disc in the sky (matches sunDir so moonlight and disc agree).
   * @param {THREE.Vector3} sunDir
   * @param {boolean|object} spec
   */
  #addMoon(sunDir, spec) {
    const opts = typeof spec === 'object' && spec ? spec : {};
    const dist = opts.distance ?? 1600;
    const radius = opts.radius ?? 48;
    const color = opts.color ?? 0xeef2ff;
    const glowColor = opts.glow ?? 0x9ab4e8;
    const dir = sunDir.clone().normalize();
    // Nudge slightly above the horizon if the authored sun is too low.
    if (dir.y < 0.25) dir.y = 0.35;
    dir.normalize();

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 28, 20),
      new THREE.MeshBasicMaterial({
        color,
        fog: false,
        toneMapped: false,
      }),
    );
    body.position.copy(dir).multiplyScalar(dist);
    // Soft crater-ish dimple: darker sphere offset slightly so the limb reads.
    const shadow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.96, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xc8d0e0,
        fog: false,
        toneMapped: false,
      }),
    );
    shadow.position.copy(body.position).add(dir.clone().multiplyScalar(radius * 0.08));
    shadow.position.x += radius * 0.12;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 2.4, 20, 14),
      new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        side: THREE.BackSide,
      }),
    );
    glow.position.copy(body.position);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 4.2, 16, 12),
      new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        side: THREE.BackSide,
      }),
    );
    halo.position.copy(body.position);

    this.#add(halo);
    this.#add(glow);
    this.#add(shadow);
    this.#add(body);
  }

  /**
   * Soft cloud puffs. Colour/opacity come from the scene so night stays pale
   * grey and monsoon can go blackish-blue storm cover.
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {{ runway: number }} course
   */
  #addClouds(def, course) {
    const clouds = def.sky.clouds;
    const list = Array.isArray(clouds)
      ? clouds
      : this.#defaultClouds(course, typeof clouds === 'number' ? clouds : 4, def);

    const color = def.sky.cloudColor ?? 0x6a7a98;
    const opacity = def.sky.cloudOpacity ?? 0.32;

    // Shared material — one dispose path via traverse in clear().
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this._cloudMat = mat;

    for (const c of list) {
      const scale = c.scale ?? 90;
      const puff = new THREE.Group();
      // 3–4 soft ellipsoids make a cheap cumulus silhouette.
      const lobes = [
        { s: [1.0, 0.42, 0.72], p: [0, 0, 0] },
        { s: [0.72, 0.38, 0.55], p: [0.55, 0.06, 0.18] },
        { s: [0.62, 0.34, 0.5], p: [-0.5, 0.02, 0.12] },
        { s: [0.48, 0.3, 0.4], p: [0.15, 0.12, -0.22] },
      ];
      for (const lobe of lobes) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
        mesh.scale.set(lobe.s[0] * scale, lobe.s[1] * scale, lobe.s[2] * scale);
        mesh.position.set(lobe.p[0] * scale, lobe.p[1] * scale, lobe.p[2] * scale);
        puff.add(mesh);
      }
      // Optional per-cloud darkening for layered storm banks.
      if (c.opacityMul != null && c.opacityMul !== 1) {
        for (const child of puff.children) {
          child.material = mat.clone();
          child.material.opacity = opacity * c.opacityMul;
        }
      }
      const [x, y, z] = c.position ?? [200, 380, 600];
      puff.position.set(x, y, z);
      if (c.rotationY != null) puff.rotation.y = c.rotationY;
      this.group.add(puff);
      this.disposables.push(puff);
    }
  }

  /**
   * Hand-placed default puffs. Storm stages get lower, heavier banks;
   * night stays higher and lighter.
   */
  #defaultClouds(course, count = 4, def) {
    const runway = course?.runway ?? 1200;
    const storm = Boolean(def?.weather?.rain ?? def?.rain);
    if (storm) {
      const slots = [
        { position: [-380, 220, runway * 0.12], scale: 200, rotationY: 0.3, opacityMul: 1.0 },
        { position: [440, 180, runway * 0.28], scale: 240, rotationY: -0.5, opacityMul: 0.95 },
        { position: [-120, 250, runway * 0.42], scale: 280, rotationY: 0.15, opacityMul: 1.05 },
        { position: [300, 200, runway * 0.58], scale: 210, rotationY: 0.9, opacityMul: 0.9 },
        { position: [-480, 230, runway * 0.72], scale: 260, rotationY: -0.2, opacityMul: 1.0 },
        { position: [160, 190, runway * 0.88], scale: 230, rotationY: 0.55, opacityMul: 0.92 },
        { position: [-40, 270, runway * 0.5], scale: 300, rotationY: 0.0, opacityMul: 0.85 },
      ];
      return slots.slice(0, Math.max(1, Math.min(count, slots.length)));
    }
    const slots = [
      { position: [-420, 420, runway * 0.18], scale: 110, rotationY: 0.4 },
      { position: [520, 380, runway * 0.32], scale: 85, rotationY: -0.6 },
      { position: [-180, 460, runway * 0.55], scale: 130, rotationY: 0.2 },
      { position: [360, 400, runway * 0.72], scale: 95, rotationY: 1.1 },
      { position: [-500, 440, runway * 0.88], scale: 100, rotationY: -0.3 },
    ];
    return slots.slice(0, Math.max(1, Math.min(count, slots.length)));
  }

  #add(obj) {
    this.group.add(obj);
    this.disposables.push(obj);
  }

  clear() {
    // Traverse so moon/cloud groups release every child geometry/material.
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m.map?.dispose?.();
          m.dispose?.();
        }
      }
    });
    this.group.clear();
    this.disposables = [];
    this.sunTarget = null;
    this.sun = null;
    this._cloudMat = null;
  }
}
