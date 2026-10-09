'use strict';

// Mundo: escena, cielo, suelo, camino, árboles, colisiones y suelos transitables.
class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.floors = [];
    this.circles = [];
    this.grid = new Map();
    this.cell = 6;
    this.interactables = [];
    this.pathPts = [];
    this.landmarks = {};
    this.rng = U.mulberry32(CFG.SEED);
  }

  // ---------- Colisiones ----------
  addBox(minX, maxX, minY, maxY, minZ, maxZ, opts = {}) {
    const b = {
      minX, maxX, minY, maxY, minZ, maxZ,
      solid: opts.solid !== undefined ? opts.solid : true,
      sight: opts.sight !== undefined ? opts.sight : true,
      bullets: opts.bullets !== undefined ? opts.bullets : true,
      owner: opts.owner || null,
      slab: !!opts.slab,
      furniture: !!opts.furniture,
    };
    this.colliders.push(b);
    return b;
  }

  // y0: altura de la base (0 en la superficie; las rocas de la cueva están bajo tierra)
  addCircle(x, z, r, h = 20, y0 = 0) {
    const c = { x, z, r, h, y0 };
    this.circles.push(c);
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(c);
    return c;
  }

  key(i, j) { return i * 10007 + j; }

  circlesNear(x, z) {
    const out = [];
    const ci = Math.floor(x / this.cell), cj = Math.floor(z / this.cell);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const arr = this.grid.get(this.key(i, j));
        if (arr) for (let k = 0; k < arr.length; k++) out.push(arr[k]);
      }
    }
    return out;
  }

  addFloor(minX, maxX, minZ, maxZ, h) {
    const f = { minX, maxX, minZ, maxZ, h: typeof h === 'function' ? h : () => h };
    this.floors.push(f);
    return f;
  }

  // Altura del suelo más alto que esté por debajo de (fromY + escalón).
  getFloorY(x, z, fromY) {
    const lim = fromY + CFG.PLAYER.step;
    // El terreno (y=0) existe en todas partes; los sótanos quedan por debajo
    let best = lim >= 0 ? 0 : -Infinity;
    for (let i = 0; i < this.floors.length; i++) {
      const f = this.floors[i];
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
        const h = f.h(x, z);
        if (h <= lim && h > best) best = h;
      }
    }
    return best === -Infinity ? fromY : best;
  }

  // Empuja una posición (x,z) fuera de cajas y troncos.
  collide(p, radius, feetY, height, ignoreOwner, skipFurniture) {
    const headY = feetY + height;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.colliders.length; i++) {
        const b = this.colliders[i];
        if (!b.solid) continue;
        if (ignoreOwner && b.owner === ignoreOwner) continue;
        if (skipFurniture && b.furniture) continue;
        if (b.maxY <= feetY + 0.05 || b.minY >= headY) continue;
        if (p.x < b.minX - radius || p.x > b.maxX + radius || p.z < b.minZ - radius || p.z > b.maxZ + radius) continue;
        const cx = U.clamp(p.x, b.minX, b.maxX);
        const cz = U.clamp(p.z, b.minZ, b.maxZ);
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        } else {
          const l = p.x - b.minX, r = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
          const m = Math.min(l, r, t, bt);
          if (m === l) p.x = b.minX - radius;
          else if (m === r) p.x = b.maxX + radius;
          else if (m === t) p.z = b.minZ - radius;
          else p.z = b.maxZ + radius;
        }
      }
      {
        const near = this.circlesNear(p.x, p.z);
        for (let i = 0; i < near.length; i++) {
          const c = near[i];
          // Troncos de superficie: solo a ras de suelo. Rocas de la cueva: en su franja de altura.
          if (c.y0 === 0 ? feetY >= 2 || headY <= 0 : feetY >= c.y0 + c.h || headY <= c.y0) continue;
          const dx = p.x - c.x, dz = p.z - c.z;
          const rr = c.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = c.x + (dx / d) * rr;
            p.z = c.z + (dz / d) * rr;
          }
        }
      }
    }
    const W = CFG.WORLD;
    p.x = U.clamp(p.x, W.minX + 2, W.maxX - 2);
    p.z = U.clamp(p.z, W.minZ + 2, W.maxZ - 2);
  }

  // Primer choque de un rayo con cajas. filter(b) decide qué cajas cuentan.
  raycastBoxes(o, d, maxT, filter) {
    let best = Infinity, hit = null;
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (filter && !filter(b)) continue;
      const t = U.rayBox(o, d, b, Math.min(maxT, best));
      if (t < best) { best = t; hit = b; }
    }
    return { t: best, box: hit };
  }

  raycastTrees(o, d, maxT) {
    // Recorre el rayo por pasos sobre la rejilla de troncos
    let best = Infinity;
    const seen = new Set();
    const steps = Math.ceil(maxT / (this.cell * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxT, s * this.cell * 0.5);
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const near = this.circlesNear(x, z);
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (seen.has(c)) continue;
        seen.add(c);
        const th = U.rayCylinder(o, d, c.x, c.z, c.r, c.y0, c.y0 + c.h, Math.min(maxT, best));
        if (th < best) best = th;
      }
      if (best < t) break;
    }
    return best;
  }

  lineOfSight(a, b, filterFn) {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-4) return true;
    d.x /= len; d.y /= len; d.z /= len;
    const r = this.raycastBoxes(a, d, len, filterFn || ((bx) => bx.sight));
    return r.t >= len - 0.05;
  }

  // ---------- Construcción ----------
  build() {
    this.planLandmarks();
    this.buildLights();
    this.buildGround();
    this.buildPath();
    this.buildTrees();
    this.buildProps();
    return this;
  }

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xb8c4c8, 0x2a2418, 0.85);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2c0, 0.65);
    this.sun.position.set(40, 60, 20);
    s.add(this.sun);
    s.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0x404858, 0.3);
    s.add(this.ambient);
    s.fog = new THREE.FogExp2(0x7d8a86, 0.02);
    s.background = new THREE.Color(0x7d8a86);
  }

  // daylight: 0 (noche cerrada) .. 1 (pleno día); dusk: 0..1 tinte rojizo
  updateSky(daylight, dusk) {
    const dayCol = new THREE.Color(0x7f8c88);
    const duskCol = new THREE.Color(0x5b3a34);
    const nightCol = new THREE.Color(0x040608);
    const c = nightCol.clone().lerp(dayCol, daylight);
    c.lerp(duskCol, dusk * 0.6);
    this.scene.background.copy(c);
    this.scene.fog.color.copy(c);
    this.scene.fog.density = U.lerp(0.046, 0.02, daylight);
    this.hemi.intensity = U.lerp(0.13, 0.85, daylight);
    this.hemi.color.set(daylight > 0.3 ? 0xb8c4c8 : 0x6070a0);
    this.sun.intensity = U.lerp(0.1, 0.65, daylight);
    this.sun.color.set(dusk > 0.3 ? 0xff9a60 : daylight > 0.3 ? 0xffe2c0 : 0x8090c0);
    this.ambient.intensity = U.lerp(0.03, 0.15, daylight);
  }

  buildGround() {
    // Suelo en 4 piezas que dejan un hueco bajo la cabaña (allí está el sótano)
    const W = CFG.WORLD;
    const X0 = W.minX - 100, X1 = W.maxX + 100, Z0 = W.minZ - 100, Z1 = W.maxZ + 100;
    const hx0 = -5.2, hx1 = 5.2, hz0 = -4.2, hz1 = 4.2;
    const piece = (a, b, c, d) => {
      const w = b - a, h = d - c;
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (a + uv.getX(i) * w) / 4, (-c - uv.getY(i) * h) / 4);
      const m = new THREE.Mesh(g, MAT.grass);
      m.rotation.x = -Math.PI / 2;
      m.position.set((a + b) / 2, 0, (c + d) / 2);
      this.scene.add(m);
    };
    piece(X0, X1, Z0, hz0);
    piece(X0, X1, hz1, Z1);
    piece(X0, hx0, hz0, hz1);
    piece(hx1, X1, hz0, hz1);
  }

  buildPath() {
    const V = CFG.WORLD.village;
    const pts = [
      [0, 6.5], [4, 12], [14, 18], [28, 17], [42, 10], [56, 13], [70, 21],
      [86, 16], [100, 6], [114, 1], [128, -4], [V.x - 8, V.z], [V.x + 12, V.z],
    ].map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts);
    const N = 260;
    const samples = curve.getSpacedPoints(N);
    this.pathPts = samples;
    const pos = [], uvs = [], idx = [];
    let acc = 0;
    for (let i = 0; i <= N; i++) {
      const p = samples[i];
      const nxt = samples[Math.min(N, i + 1)], prv = samples[Math.max(0, i - 1)];
      const tx = nxt.x - prv.x, tz = nxt.z - prv.z;
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const hw = 1.3 + Math.sin(i * 0.7) * 0.15;
      if (i > 0) acc += samples[i].distanceTo(samples[i - 1]);
      pos.push(p.x + nx * hw, 0.03, p.z + nz * hw, p.x - nx * hw, 0.03, p.z - nz * hw);
      uvs.push(0, acc / 3, 1, acc / 3);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = MAT.dirt.clone();
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    this.scene.add(new THREE.Mesh(g, mat));
  }

  distToPath(x, z) {
    let best = Infinity;
    const pts = this.pathPts;
    for (let i = 0; i < pts.length; i += 2) {
      const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  isOnPath(x, z) {
    if (x < -3 || x > CFG.WORLD.village.x + 14) return false;
    return this.distToPath(x, z) < 1.4;
  }

  buildTrees() {
    const W = CFG.WORLD, V = W.village;
    const rnd = this.rng;
    const pines = [], deads = [];
    const step = 4.3;
    for (let x = W.minX; x < W.maxX; x += step) {
      for (let z = W.minZ; z < W.maxZ; z += step) {
        if (rnd() < 0.18) continue;
        const px = x + (rnd() - 0.5) * step * 0.9;
        const pz = z + (rnd() - 0.5) * step * 0.9;
        const dc = Math.hypot(px, pz);
        if (dc < W.cabinClear + rnd() * 4) continue;
        if (Math.hypot(px - V.x, pz - V.z) < V.r + 6 + rnd() * 4) continue;
        if (this.distToPath(px, pz) < 3 + rnd() * 1.5) continue;
        if (this.reserved && this.reserved.some((r) => Math.hypot(px - r.x, pz - r.z) < r.r)) continue;
        if (rnd() < 0.16) deads.push({ x: px, z: pz, h: 6 + rnd() * 6, r: 0.18 + rnd() * 0.12, rot: rnd() * 6.28 });
        else pines.push({ x: px, z: pz, h: 8 + rnd() * 9, r: 0.22 + rnd() * 0.18, rot: rnd() * 6.28 });
      }
    }
    // Árboles del borde: muro visual denso
    this.treeCount = pines.length + deads.length;
    // Registro de árboles (el número de cada uno es igual en todos los aparatos: sirve para talarlos)
    this.trees = [];
    pines.forEach((t) => { t.kind = 'pine'; t.id = this.trees.length; this.trees.push(t); });
    deads.forEach((t) => { t.kind = 'dead'; t.id = this.trees.length; this.trees.push(t); });

    const chunk = 50;
    const groups = new Map();
    const addTo = (kind, t) => {
      const k = Math.floor(t.x / chunk) + ':' + Math.floor(t.z / chunk);
      if (!groups.has(k)) groups.set(k, { pines: [], deads: [] });
      groups.get(k)[kind].push(t);
    };
    pines.forEach((t) => addTo('pines', t));
    deads.forEach((t) => addTo('deads', t));

    const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6, 1, true);
    trunkGeo.translate(0, 0.5, 0);
    const coneGeo = new THREE.ConeGeometry(1, 1, 7, 1, true);
    coneGeo.translate(0, 0.5, 0);
    const branchGeo = new THREE.CylinderGeometry(0.5, 1, 1, 4, 1, true);
    branchGeo.translate(0, 0.5, 0);
    const foliageMat = MAT.needles.clone();
    foliageMat.side = THREE.DoubleSide;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();

    groups.forEach((gr) => {
      const P = gr.pines, D = gr.deads;
      if (P.length) {
        const trunks = new THREE.InstancedMesh(trunkGeo, MAT.bark, P.length);
        const cones = new THREE.InstancedMesh(coneGeo, foliageMat, P.length * 3);
        P.forEach((t, i) => {
          q.setFromEuler(e.set(0, t.rot, 0));
          m4.compose(v.set(t.x, 0, t.z), q, sc.set(t.r, t.h * 0.55, t.r));
          trunks.setMatrixAt(i, m4);
          for (let k = 0; k < 3; k++) {
            const y = t.h * (0.22 + k * 0.22);
            const rad = t.h * (0.3 - k * 0.075);
            const hh = t.h * (0.42 - k * 0.06);
            m4.compose(v.set(t.x, y, t.z), q, sc.set(rad, hh, rad));
            cones.setMatrixAt(i * 3 + k, m4);
          }
          t.circle = this.addCircle(t.x, t.z, t.r + 0.08, t.h);
          t.circle.tree = t;
          t.mesh = { trunks, i, tops: cones, n: 3 };
          this.keepTreeMatrices(t);
        });
        trunks.computeBoundingSphere();
        cones.computeBoundingSphere();
        this.scene.add(trunks, cones);
      }
      if (D.length) {
        const trunks = new THREE.InstancedMesh(trunkGeo, MAT.deadbark, D.length);
        const branches = new THREE.InstancedMesh(branchGeo, MAT.deadbark, D.length * 4);
        D.forEach((t, i) => {
          q.setFromEuler(e.set(0, t.rot, 0));
          m4.compose(v.set(t.x, 0, t.z), q, sc.set(t.r, t.h, t.r));
          trunks.setMatrixAt(i, m4);
          for (let k = 0; k < 4; k++) {
            const y = t.h * (0.45 + k * 0.12);
            const a = t.rot + k * 1.9;
            q.setFromEuler(e.set(0.9 + k * 0.1, a, 0, 'YXZ'));
            m4.compose(v.set(t.x, y, t.z), q, sc.set(t.r * 0.35, t.h * (0.35 - k * 0.05), t.r * 0.35));
            branches.setMatrixAt(i * 4 + k, m4);
          }
          t.circle = this.addCircle(t.x, t.z, t.r + 0.08, t.h);
          t.circle.tree = t;
          t.mesh = { trunks, i, tops: branches, n: 4 };
          this.keepTreeMatrices(t);
        });
        trunks.computeBoundingSphere();
        branches.computeBoundingSphere();
        this.scene.add(trunks, branches);
      }
    });
  }

  buildProps() {
    const rnd = this.rng;
    const W = CFG.WORLD, V = W.village;
    const s = this.scene;

    // Rocas y arbustos
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    const rocks = [], bushes = [];
    for (let i = 0; i < 260; i++) {
      const x = U.lerp(W.minX, W.maxX, rnd()), z = U.lerp(W.minZ, W.maxZ, rnd());
      if (Math.hypot(x, z) < 12 || Math.hypot(x - V.x, z - V.z) < V.r + 2 || this.distToPath(x, z) < 2.5) continue;
      if (this.reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.r)) continue;
      if (rnd() < 0.35) rocks.push({ x, z, s: 0.4 + rnd() * 1.1, r: rnd() * 6 });
      else bushes.push({ x, z, s: 0.5 + rnd() * 0.8, r: rnd() * 6 });
    }
    const rockMat = MAT.stone;
    const bushMat = MAT.needles;
    const rm = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    const bm = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    rocks.forEach((r, i) => {
      q.setFromEuler(e.set(r.r, r.r * 2, 0));
      m4.compose(v.set(r.x, r.s * 0.3, r.z), q, sc.set(r.s, r.s * 0.7, r.s * 1.1));
      rm.setMatrixAt(i, m4);
      if (r.s > 0.7) this.addCircle(r.x, r.z, r.s * 0.9, r.s);
    });
    bushes.forEach((b, i) => {
      q.setFromEuler(e.set(0, b.r, 0));
      m4.compose(v.set(b.x, b.s * 0.45, b.z), q, sc.set(b.s * 1.2, b.s * 0.8, b.s * 1.2));
      bm.setMatrixAt(i, m4);
    });
    rm.computeBoundingSphere();
    bm.computeBoundingSphere();
    s.add(rm, bm);

    // Pozo abandonado
    const well = this.landmarks.well;
    const wellG = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 10, 1, true), MAT.stone);
    ring.material = MAT.stone.clone();
    ring.material.side = THREE.DoubleSide;
    ring.position.y = 0.45;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 10), MAT.black);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.3;
    const post1 = new THREE.Mesh(boxGeo(0.15, 2.2, 0.15), MAT.planks);
    post1.position.set(-1.05, 1.1, 0);
    const post2 = post1.clone();
    post2.position.x = 1.05;
    const beam = new THREE.Mesh(boxGeo(2.4, 0.15, 0.15), MAT.planks);
    beam.position.y = 2.15;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), MAT.dark);
    rope.position.y = 1.35;
    wellG.add(ring, hole, post1, post2, beam, rope);
    wellG.position.set(well.x, 0, well.z);
    s.add(wellG);
    this.addCircle(well.x, well.z, 1.2, 1);

    // Tumba en un claro
    const grave = this.landmarks.grave;
    const cross = new THREE.Group();
    const v1 = new THREE.Mesh(boxGeo(0.12, 1.3, 0.1), MAT.deadbark);
    v1.position.y = 0.65;
    const h1 = new THREE.Mesh(boxGeo(0.7, 0.1, 0.1), MAT.deadbark);
    h1.position.y = 0.95;
    const mound = new THREE.Mesh(boxGeo(0.9, 0.25, 1.9), MAT.dirt);
    mound.position.set(0, 0.1, 1.1);
    cross.add(v1, h1, mound);
    cross.position.set(grave.x, 0, grave.z);
    cross.rotation.y = 0.4;
    s.add(cross);

    // Figuras de palos colgadas (ambiente)
    const stickMat = MAT.deadbark;
    const totemSpots = this.landmarks.totems;
    totemSpots.forEach((p, i) => {
      const g = new THREE.Group();
      const a = new THREE.Mesh(boxGeo(0.05, 0.9, 0.05), stickMat);
      const b = new THREE.Mesh(boxGeo(0.7, 0.05, 0.05), stickMat);
      b.position.y = 0.2;
      const l1 = new THREE.Mesh(boxGeo(0.05, 0.6, 0.05), stickMat);
      l1.position.set(-0.15, -0.6, 0);
      l1.rotation.z = -0.35;
      const l2 = l1.clone();
      l2.position.x = 0.15;
      l2.rotation.z = 0.35;
      const str = new THREE.Mesh(boxGeo(0.01, 1.2, 0.01), MAT.dark);
      str.position.y = 1.05;
      g.add(a, b, l1, l2, str);
      g.position.set(p.x, 2.6 + (i % 3) * 0.4, p.z);
      g.rotation.y = i * 1.3;
      g.userData.swing = i;
      s.add(g);
      (this.swingers = this.swingers || []).push(g);
    });

    // Tienda de campaña abandonada
    const camp = this.landmarks.camp;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0x445a2e, side: THREE.DoubleSide }));
    tent.position.set(camp.x, 0.8, camp.z);
    tent.rotation.y = Math.PI / 4;
    tent.scale.set(1, 1, 1.4);
    s.add(tent);
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.7, 8), MAT.dark);
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(camp.x + 2.4, 0.03, camp.z + 1);
    s.add(ash);
    this.addCircle(camp.x, camp.z, 1.2, 1.6);
  }

  // Lugares con nombre (se reservan antes de plantar árboles)
  planLandmarks() {
    this.landmarks = {
      well: { x: -38, z: -46 },
      grave: { x: 62, z: -62 },
      camp: { x: 38, z: 52 },
      totems: [
        { x: -22, z: 30 }, { x: -30, z: 34 }, { x: -26, z: 40 },
        { x: 90, z: -30 }, { x: 96, z: -36 },
        { x: 20, z: -40 },
      ],
      lair: { x: -70, z: -84 },
      // Caravana de la investigadora (junto al camino) y fortín del cazador (en mitad del bosque)
      caravan: { x: 47, z: 22 },
      fort: { x: 82, z: 54 },
    };
    const L = this.landmarks;
    // Árboles con marcas de garras entre el pozo y la guarida
    L.claws = [0.18, 0.4, 0.62, 0.84].map((t, i) => ({
      x: U.lerp(L.well.x, L.lair.x, t) + (i % 2 ? 3 : -3),
      z: U.lerp(L.well.z, L.lair.z, t) + (i % 2 ? -2 : 2),
    }));
    this.reserved = [
      { x: L.well.x, z: L.well.z, r: 5 },
      { x: L.grave.x, z: L.grave.z, r: 6 },
      { x: L.camp.x, z: L.camp.z, r: 6 },
      { x: L.lair.x, z: L.lair.z, r: 11 },
      { x: L.caravan.x, z: L.caravan.z, r: 7 },
      { x: L.fort.x, z: L.fort.z, r: 13 },
      // Campo de tiro del cazador (hacia el este del fortín)
      { x: L.fort.x + 20, z: L.fort.z, r: 9 },
      { x: L.fort.x + 35, z: L.fort.z, r: 9 },
      ...L.claws.map((c) => ({ x: c.x, z: c.z, r: 2.5 })),
    ];
  }

  update(dt, time) {
    if (this.swingers) {
      this.swingers.forEach((g) => {
        g.rotation.y += Math.sin(time * 0.7 + g.userData.swing) * dt * 0.3;
        g.rotation.z = Math.sin(time * 1.1 + g.userData.swing) * 0.06;
      });
    }
  }

  // ---------- Tala de árboles ----------
  // Árbol en pie más cercano que corta el rayo (hasta maxT)
  raycastTree(o, d, maxT) {
    let best = null, bt = maxT;
    const near = this.circlesNear(o.x + d.x * maxT * 0.5, o.z + d.z * maxT * 0.5);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (!c.tree || c.tree.felled) continue;
      const t = U.rayCylinder(o, d, c.x, c.z, c.r + 0.15, 0, 3, bt);
      if (t < bt) { bt = t; best = c.tree; }
    }
    return best ? { tree: best, t: bt } : null;
  }

  // Copia de cómo es el árbol en pie (para volver a plantarlo al empezar otra partida)
  keepTreeMatrices(t) {
    const M = t.mesh;
    const m = new THREE.Matrix4();
    M.trunks.getMatrixAt(M.i, m);
    t.standing = { trunk: m.clone(), tops: [] };
    for (let k = 0; k < M.n; k++) {
      M.tops.getMatrixAt(M.i * M.n + k, m);
      t.standing.tops.push(m.clone());
    }
  }

  restoreTrees() {
    this.trees.forEach((t) => {
      if (!t.felled) return;
      t.felled = false;
      const M = t.mesh;
      M.trunks.setMatrixAt(M.i, t.standing.trunk);
      M.trunks.instanceMatrix.needsUpdate = true;
      t.standing.tops.forEach((m, k) => M.tops.setMatrixAt(M.i * M.n + k, m));
      M.tops.instanceMatrix.needsUpdate = true;
      t.circle.h = t.h;
    });
  }

  // Deja el árbol en un tocón (se ve y choca como un tronco bajito)
  fellTree(t) {
    if (!t || t.felled) return false;
    t.felled = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rot, 0));
    const M = t.mesh;
    m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.r * 1.08, t.kind === 'pine' ? 0.42 : 0.5, t.r * 1.08));
    M.trunks.setMatrixAt(M.i, m4);
    M.trunks.instanceMatrix.needsUpdate = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < M.n; k++) M.tops.setMatrixAt(M.i * M.n + k, zero);
    M.tops.instanceMatrix.needsUpdate = true;
    t.circle.h = 0.45;
    return true;
  }

  // Punto aleatorio libre en el bosque
  randomForestPoint(minD, maxD, from = { x: 0, z: 0 }, avoidVillage = true) {
    const V = CFG.WORLD.village;
    for (let tries = 0; tries < 200; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = U.range(minD, maxD);
      const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
      const W = CFG.WORLD;
      if (x < W.minX + 8 || x > W.maxX - 8 || z < W.minZ + 8 || z > W.maxZ - 8) continue;
      if (avoidVillage && Math.hypot(x - V.x, z - V.z) < V.r + 8) continue;
      if (Math.hypot(x, z) < 14) continue;
      const near = this.circlesNear(x, z);
      if (near.some((c) => c.y0 === 0 && Math.hypot(c.x - x, c.z - z) < c.r + 1.2)) continue;
      return { x, z };
    }
    return { x: from.x + 20, z: from.z + 20 };
  }
}
