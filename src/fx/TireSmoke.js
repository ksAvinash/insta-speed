import * as THREE from 'three';

/**
 * Tyre smoke, emitted from the contact patches in proportion to how far past
 * the grip peak the tyres are. It is the main feedback channel telling the
 * player they are braking too hard for the surface — long before the stopping
 * distance shows it.
 */

function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class TireSmoke {
  /** @param {THREE.Scene} scene */
  constructor(scene, count = 300) {
    this.count = count;
    this.texture = makePuffTexture();

    this.positions = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.velocities = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.cursor = 0;
    this.emitAccumulator = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
        tint: { value: new THREE.Color(0xcfcfd4) },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (320.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 tint;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(tint, tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.geometry = geo;
    scene.add(this.points);
    this.reset();
  }

  /** @param {string} color css colour from the surface definition */
  setTint(color) {
    this.material.uniforms.tint.value.set(color);
  }

  reset() {
    this.alphas.fill(0);
    this.life.fill(0);
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  #spawn(x, y, z, speed) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;

    this.positions[i * 3] = x + (Math.random() - 0.5) * 0.4;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;

    // Kicked backwards out of the contact patch, then it billows upward.
    this.velocities[i * 3] = (Math.random() - 0.5) * 2.2;
    this.velocities[i * 3 + 1] = 0.7 + Math.random() * 1.6;
    this.velocities[i * 3 + 2] = -speed * 0.06 - Math.random() * 3;

    this.sizes[i] = 1.6 + Math.random() * 2.4;
    this.maxLife[i] = 0.9 + Math.random() * 1.1;
    this.life[i] = this.maxLife[i];
    this.alphas[i] = 0.5 + Math.random() * 0.3;
  }

  /**
   * @param {import('../physics/VehicleSim.js').VehicleSim} sim
   * @param {number} dt
   * @param {import('three').Vector3[]} contactPoints world-space wheel contact
   *   patches, taken from the scene graph rather than recomputed from sim state
   */
  update(sim, dt, contactPoints) {
    const intensity = sim.slipIntensity;

    if (intensity > 0.02 && sim.v > 3 && contactPoints?.length) {
      // Emission is rate-based so it does not thin out at high framerates.
      this.emitAccumulator += intensity * 140 * dt;

      while (this.emitAccumulator >= 1) {
        this.emitAccumulator -= 1;
        const p = contactPoints[(Math.random() * contactPoints.length) | 0];
        this.#spawn(p.x, p.y, p.z, sim.v);
      }
    } else {
      this.emitAccumulator = 0;
    }

    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      const k = this.life[i] / this.maxLife[i];
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.velocities[i * 3 + 1] *= 0.985;
      this.sizes[i] += dt * 5.5;
      this.alphas[i] = k * k * 0.65;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
