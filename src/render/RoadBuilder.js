import * as THREE from 'three';
import {
  makeRoadTexture,
  makeHazardTexture,
  makeCheckerTexture,
  makeCurtainTexture,
} from './textures.js';

/**
 * The road, the target line you are aiming to stop on, and the wall waiting
 * just past it.
 *
 * The whole runway is a single two-triangle plane with a repeating texture
 * rather than a pool of recycled segments — at these speeds nothing about the
 * road changes along its length, so one draw call does the entire job.
 *
 * A lead-in apron extends *behind* the launch (z < 0) so the car does not
 * appear to spawn at the edge of the world, and a zebra crossing marks z = 0.
 */
export class RoadBuilder {
  /**
   * Metres of road painted behind the launch point. Long enough that the
   * chase camera and garage showcase always see asphalt under the wheels.
   */
  static LEAD_IN = 55;

  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    /** Objects whose opacity pulses so the line reads as active, not painted. */
    this.pulsing = [];
    this.pulse = 0;
  }

  /**
   * @param {import('../scenes/registry.js').SceneDef} def
   * @param {{ target: number, wall: number, runway: number, roadWidth: number }} course
   */
  build(def, course) {
    this.clear();
    const { roadWidth, runway, target, wall } = course;
    const lead = RoadBuilder.LEAD_IN;
    // Full strip: lead-in behind the start + course runway ahead.
    const totalLen = runway + lead;
    // Centre of the plane so it spans [-lead, runway].
    const roadMidZ = (runway - lead) / 2;

    const roadTex = makeRoadTexture(def, roadWidth, totalLen);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, totalLen),
      new THREE.MeshLambertMaterial({ map: roadTex }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, roadMidZ);
    road.receiveShadow = true;
    this.#add(road);

    // Raised kerbs — two long boxes, one draw each. Huge readability win for
    // "still on the road" without any per-frame cost.
    this.#buildKerbs(def, roadWidth, totalLen, roadMidZ);

    if (def.tunnel) this.#buildTunnel(def, course, lead, totalLen, roadMidZ);

    this.#buildStartMark(roadWidth);
    this.#buildTargetLine(target, roadWidth);
    this.#buildWall(wall, roadWidth);
  }

  /**
   * Launch pad at z = 0: a zebra crossing so the start reads as a real place
   * on the road rather than an empty void edge.
   */
  #buildStartMark(roadWidth) {
    const WHITE = 0xf4f6f8;
    const ACCENT = 0xf5d13a;

    // Classic zebra: white bars across the road (X), spaced along travel (Z).
    const barCount = 6;
    const barW = 0.75;
    const gap = 0.7;
    const pitch = barW + gap;
    const bandDepth = barCount * pitch - gap;
    const barLen = roadWidth * 0.92;
    const barMat = new THREE.MeshBasicMaterial({ color: WHITE, toneMapped: false });
    const barGeo = new THREE.PlaneGeometry(barLen, barW);
    const z0 = -bandDepth / 2 + barW / 2;

    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0, 0.022, z0 + i * pitch);
      this.#add(bar, { shared: true });
    }

    // Thin lines bracketing the zebra.
    for (const z of [-bandDepth / 2 - 0.3, bandDepth / 2 + 0.3]) {
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth * 0.96, 0.28),
        new THREE.MeshBasicMaterial({ color: WHITE, toneMapped: false }),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(0, 0.023, z);
      this.#add(edge);
    }

    // Side posts at the start grid.
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2e34 });
    const postGeo = new THREE.BoxGeometry(0.35, 0.7, 0.35);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set((side * roadWidth) / 2 + side * 0.4, 0.35, 0);
      this.#add(post, { shared: true });

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, 0.5),
        new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false }),
      );
      cap.position.set((side * roadWidth) / 2 + side * 0.4, 0.72, 0);
      this.#add(cap);
    }
  }

  /**
   * The target line, built to be unmissable.
   *
   * Judging a braking point is the entire game, so the line cannot be something
   * you hunt for — at 600 km/h a flat stripe on the road is under the nose
   * before it resolves. It is therefore marked four ways at four distances: a
   * light curtain visible above the horizon line, a gantry over the road,
   * braking boards counting down the approach, and only then paint on the
   * ground.
   */
  #buildTargetLine(target, roadWidth) {
    const GREEN = 0x4dff92;
    const hazard = makeHazardTexture('#39e07a', '#0d2b18');

    // 1. Light curtain. A tall translucent wall of green standing on the line —
    // the only marker that is still visible when the road itself has shrunk to
    // a thread in the distance.
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth + 2, 10),
      new THREE.MeshBasicMaterial({
        map: makeCurtainTexture('#4dff92'),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );
    curtain.position.set(0, 5, target);
    this.#add(curtain);
    this.pulsing.push({ material: curtain.material, base: 0.42, swing: 0.14 });

    // 2. Gantry, so the line is readable over the crest of the bonnet.
    const postGeo = new THREE.BoxGeometry(0.5, 9, 0.5);
    const postMat = new THREE.MeshLambertMaterial({ map: hazard });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set((side * (roadWidth + 1.6)) / 2, 4.5, target);
      this.#add(post, { shared: true });

      // Glowing column up each post — reads at any light level, unlike the
      // hazard stripes, which need the scene's sun to show up at all.
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 9, 0.16),
        new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false, fog: false }),
      );
      glow.position.set((side * (roadWidth + 1.6)) / 2, 4.5, target - 0.34);
      this.#add(glow);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(roadWidth + 2.2, 1.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1c2b22 }),
    );
    beam.position.set(0, 9, target);
    this.#add(beam);

    const beamGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth + 2.2, 0.5),
      new THREE.MeshBasicMaterial({
        color: GREEN,
        transparent: true,
        opacity: 0.9,
        // Faces the approach, and a plane only has one — without this the beam
        // reads as a black bar until you are past it.
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      }),
    );
    beamGlow.position.set(0, 9, target - 0.26);
    this.#add(beamGlow);
    this.pulsing.push({ material: beamGlow.material, base: 0.75, swing: 0.25 });

    // 3. Braking boards down the approach, the way a circuit counts a driver
    // into a corner. Spacing is a fraction of the course, so a 1.4 km run at
    // 600 km/h gets its warning at the same *time* out as a 130 m course.
    const spacing = Math.max(25, target * 0.09);
    for (let i = 1; i <= 3; i++) {
      const z = target - i * spacing;
      if (z < 12) break;
      for (const side of [-1, 1]) {
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(1.9, 1.4),
          new THREE.MeshBasicMaterial({
            color: GREEN,
            transparent: true,
            opacity: 0.95 - i * 0.16,
            side: THREE.DoubleSide,
            toneMapped: false,
          }),
        );
        board.position.set((side * (roadWidth + 3.4)) / 2, 1.9, z);
        board.rotation.y = side * -0.22;
        this.#add(board);

        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 1.9, 0.16),
          new THREE.MeshLambertMaterial({ color: 0x2a3a31 }),
        );
        post.position.set((side * (roadWidth + 3.4)) / 2, 0.95, z);
        this.#add(post);
      }
    }

    // 4. Paint. A chequered band across the road with a hard emissive edge at
    // the exact target, so the last few metres of judgement have something
    // precise to aim at rather than a fat glowing stripe.
    const checker = makeCheckerTexture('#eafff2', '#0d2b18', Math.max(4, Math.round(roadWidth / 2)));
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, 3),
      new THREE.MeshBasicMaterial({ map: checker, toneMapped: false }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.set(0, 0.018, target + 1.5);
    this.#add(band);

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, 0.7),
      new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.02, target);
    this.#add(line);

    // Approach chevrons, tightening toward the line, scaled to the course so
    // they still lead the eye in on a long run.
    const reach = Math.max(1, target / 260);
    for (let i = 1; i <= 7; i++) {
      const chevron = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth * 0.82, 0.8),
        new THREE.MeshBasicMaterial({
          color: GREEN,
          transparent: true,
          opacity: 0.16 + i * 0.08,
          toneMapped: false,
        }),
      );
      chevron.rotation.x = -Math.PI / 2;
      chevron.position.set(0, 0.015, target - i * i * 1.6 * reach);
      this.#add(chevron);
    }

    this.targetMarker = line;
  }

  /**
   * Breathes the line's glow. Movement is what the eye picks out of a static
   * scene, and it costs two opacity writes a frame.
   * @param {number} dt
   */
  update(dt) {
    if (!this.pulsing.length) return;
    this.pulse += dt * 2.6;
    const wave = Math.sin(this.pulse) * 0.5 + 0.5;
    for (const { material, base, swing } of this.pulsing) {
      material.opacity = base - swing + swing * 2 * wave;
    }
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

  #buildKerbs(def, roadWidth, length, midZ) {
    const half = roadWidth / 2 + 0.18;
    // Pale / hazard-ish on bright scenes, darker on night decks.
    const pale = (def.road?.color ?? 0) > 0x888888;
    const mat = new THREE.MeshLambertMaterial({
      color: pale ? 0x1a1f24 : 0xe8e8ec,
    });
    const geo = new THREE.BoxGeometry(0.36, 0.22, length);
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(geo, mat);
      kerb.position.set(side * half, 0.1, midZ);
      kerb.receiveShadow = true;
      this.#add(kerb, { shared: true });
    }
  }

  #buildTunnel(def, course, lead, totalLen, roadMidZ) {
    const radius = course.roadWidth * 0.78;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, totalLen, 20, 1, true),
      new THREE.MeshLambertMaterial({
        color: def.ground.accent ?? 0x22262c,
        side: THREE.BackSide,
        emissive: def.road?.secondary ?? 0x061018,
        emissiveIntensity: 0.12,
      }),
    );
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, radius * 0.34, roadMidZ);
    this.#add(shell);

    // Sparse rib rings — InstancedMesh so hundreds stay one draw.
    // Span the lead-in as well so the tunnel does not open at the car's rear.
    const ribCount = Math.min(90, Math.floor(totalLen / 28));
    if (ribCount > 0) {
      const ribGeo = new THREE.TorusGeometry(radius * 0.98, 0.08, 6, 20);
      const ribMat = new THREE.MeshBasicMaterial({
        color: def.road?.secondary ?? 0x06b6d4,
        transparent: true,
        opacity: 0.55,
        toneMapped: false,
      });
      const ribs = new THREE.InstancedMesh(ribGeo, ribMat, ribCount);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < ribCount; i++) {
        const z = -lead + (i + 0.5) * (totalLen / ribCount);
        dummy.position.set(0, radius * 0.34, z);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        ribs.setMatrixAt(i, dummy.matrix);
      }
      ribs.instanceMatrix.needsUpdate = true;
      this.#add(ribs);
    }
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
    this.pulsing = [];
  }
}
