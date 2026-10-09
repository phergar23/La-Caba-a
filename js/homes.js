'use strict';

// Casas de los papeles. De noche cada uno se encierra en la suya y cada una se defiende distinto:
//  - Caravana de la investigadora: puerta, una ventana y tres trampas de flash alrededor que ciegan
//    al monstruo (y de paso le sacan una foto).
//  - Fortín del cazador: dos plantas de troncos, puerta reforzada, troneras arriba para disparar
//    y cencerros alrededor del claro que avisan de por dónde viene.
//  - Ayuntamiento (alcalde): muros de piedra, sin ventanas que se abran y una puerta maciza muy
//    difícil de forzar. La campana de alarma lo espanta, pero todo el pueblo la oye.
// El guardabosques sigue en la cabaña (cabin.js).

// Puerta con pestillo y tablones, en una pared a lo largo de X o de Z (como las de la cabaña)
class HomeDoor {
  // o: { name, axis: 'x'|'z', a0, a1, wc, inside, y0, h, lockFactor, boardHp, logs }
  constructor(home, o) {
    this.home = home;
    this.kind = 'door';
    this.name = o.name;
    this.axis = o.axis || 'x';
    this.a0 = o.a0; this.a1 = o.a1; this.wc = o.wc; this.inside = o.inside;
    this.y0 = o.y0 || 0;
    this.h = o.h || 2.18;
    this.lockFactor = o.lockFactor || 1;
    this.boardHpMax = o.boardHp || CFG.INTRUDER.boardHp;
    this.logs = !!o.logs;
    this.open = false;
    this.anim = 0;
    this.bolted = false;
    this.boards = 0;
    this.boardHp = this.boardHpMax;
    this.pick = 0;
    this.shake = 0;
    const X = this.axis === 'x';
    const w = this.a1 - this.a0;
    const am = (this.a0 + this.a1) / 2;
    // Punto de la pared: a lo largo (a), altura (y) y n metros hacia el interior (signo de inside)
    const P = (a, y, n) => (X ? new THREE.Vector3(a, y, this.wc + n) : new THREE.Vector3(this.wc + n, y, a));
    // En el grupo de la hoja, X local va a lo largo de la pared; el interior queda en Z local = li
    this.base = X ? 0 : -Math.PI / 2;
    this.li = X ? this.inside : -this.inside;
    const g = home.group;

    this.pivot = new THREE.Group();
    this.pivot.position.copy(P(this.a0, this.y0, 0));
    this.pivot.rotation.y = this.base;
    const panel = new THREE.Mesh(boxGeo(w - 0.02, this.h, 0.08, 1.2), o.mat || MAT.door);
    panel.position.set(w / 2, this.h / 2 + 0.01, 0);
    this.pivot.add(panel);
    const knob = new THREE.Mesh(boxGeo(0.06, 0.06, 0.24, 1), MAT.metal);
    knob.position.set(w - 0.15, 1.0, 0);
    this.pivot.add(knob);
    this.boltMesh = new THREE.Mesh(boxGeo(0.22, 0.05, 0.05, 1), MAT.metal);
    this.boltMesh.position.set(w - 0.2, 1.3, this.li * 0.07);
    this.pivot.add(this.boltMesh);
    g.add(this.pivot);

    this.boardMeshes = [];
    for (let i = 0; i < 2; i++) {
      const mat = this.logs ? MAT.bark : MAT.plankBoard;
      const b = new THREE.Mesh(X ? boxGeo(w + 0.4, 0.22, 0.1, 1) : boxGeo(0.1, 0.22, w + 0.4, 1), mat);
      b.position.copy(P(am, this.y0 + 0.8 + i * 0.8, this.inside * 0.2));
      if (X) b.rotation.z = i ? 0.08 : -0.1; else b.rotation.x = i ? 0.08 : -0.1;
      b.visible = false;
      g.add(b);
      this.boardMeshes.push(b);
    }

    const W = home.world;
    const top = this.y0 + this.h + 0.07;
    this.collider = X
      ? W.addBox(this.a0, this.a1, this.y0, top, this.wc - 0.13, this.wc + 0.13, { owner: this })
      : W.addBox(this.wc - 0.13, this.wc + 0.13, this.y0, top, this.a0, this.a1, { owner: this });
    const n0 = Math.min(this.wc, this.wc + this.inside * 1.2), n1 = Math.max(this.wc, this.wc + this.inside * 1.2);
    this.openCollider = X
      ? W.addBox(this.a0 - 0.25, this.a0 + 0.05, this.y0, top, n0, n1, { owner: this, sight: false })
      : W.addBox(n0, n1, this.y0, top, this.a0 - 0.25, this.a0 + 0.05, { owner: this, sight: false });
    this.openCollider.solid = false;

    this.pos = P(am, this.y0 + 1.2, 0);
    this.r = 0.75;
    this.outside = P(am, 0, -this.inside * 0.85);
    this.insideSpot = P(am, this.y0, this.inside * 0.9);
  }

  isPlayerInside(p) {
    const c = this.axis === 'x' ? p.z : p.x;
    return (c - this.wc) * this.inside > 0;
  }

  setOpen(v, byIntruder) {
    if (this.open === v) return;
    this.open = v;
    SFX.creak(this.pos, byIntruder ? 1 : 0.6, v ? 0.9 : 0.5);
    if (!v) setTimeout(() => SFX.bang(this.pos, 0.35), 350);
  }

  setBolt(v) {
    if (this.bolted === v) return;
    this.bolted = v;
    if (v) this.pick = 0;
    SFX.bolt(this.pos, v);
  }

  get secure() { return !this.open && (this.bolted || this.boards > 0); }

  addBoard() {
    this.boards++;
    this.boardHp = this.boardHpMax;
    SFX.hammer(this.pos);
  }

  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim += U.clamp(target - this.anim, -dt * 2.2, dt * 2.2);
    const sh = this.shake > 0 ? Math.sin(performance.now() * 0.08) * 0.03 * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.pivot.rotation.y = this.base - this.li * this.anim * 1.75 + sh;
    this.collider.solid = this.anim < 0.5;
    this.collider.sight = this.anim < 0.5;
    this.collider.bullets = this.anim < 0.5;
    this.openCollider.solid = this.anim > 0.9;
    this.boltMesh.position.x = (this.a1 - this.a0) - (this.bolted ? 0.05 : 0.25);
    this.boardMeshes.forEach((b, i) => (b.visible = i < this.boards));
  }

  // ¿Con qué se atranca? (tablones)
  barricadeWith() { return 'plank'; }

  prompt(G) {
    const p = G.player.pos;
    const inside = this.isPlayerInside(p);
    const lines = [];
    const info = [];
    const bw = this.barricadeWith(G);
    const tLine = `[T] Atrancar con tablón (${G.inv.planks})`;
    if (inside) {
      if (this.boards > 0) {
        lines.push('[E] Quitar ' + (this.logs ? 'una tranca' : 'tablón'));
        if (this.boards < 2) lines.push(tLine);
        lines.push(this.bolted ? '[Q] Quitar pestillo' : '[Q] Echar pestillo');
      } else if (this.open) {
        lines.push('[E] Cerrar');
      } else {
        lines.push(this.bolted ? '[E] Abrir (tiene el pestillo)' : '[E] Abrir');
        lines.push(this.bolted ? '[Q] Quitar pestillo' : '[Q] Echar pestillo');
        lines.push(tLine);
      }
      info.push('Pestillo: ' + (this.bolted ? 'ECHADO' : 'quitado'));
      if (this.boards) info.push((this.logs ? 'Trancas: ' : 'Tablones: ') + this.boards + '/2');
      if (this.lockFactor > 1) info.push('Puerta maciza: cuesta mucho forzarla');
      if (this.pick > 0.05 && this.bolted) info.push('Hay arañazos recientes en el cerrojo...');
    } else {
      lines.push(this.open ? '[E] Cerrar' : '[E] Abrir');
    }
    return { title: this.name, lines, info };
  }

  act(key, G) {
    const inside = this.isPlayerInside(G.player.pos);
    if (key === 'E') {
      if (inside && this.boards > 0) {
        this.boards--;
        G.inv.planks++;
        SFX.woodCrack(this.pos, 0.5);
        G.hud.msg('Quitas una tranca de la puerta.');
        return true;
      }
      if (this.open) { this.setOpen(false); return true; }
      if (this.bolted) {
        SFX.click(this.pos, 0.5);
        G.hud.msg(inside ? 'Tiene el pestillo echado (Q para quitarlo).' : 'Está cerrada por dentro.');
        return true;
      }
      this.setOpen(true);
      return true;
    }
    if (key === 'Q' && inside) {
      if (this.open) { G.hud.msg('Cierra la puerta primero.'); return true; }
      this.setBolt(!this.bolted);
      return true;
    }
    if (key === 'T' && inside) {
      if (this.open) { G.hud.msg('Cierra la puerta primero.'); return true; }
      if (this.boards >= 2) { G.hud.msg('No caben más trancas.'); return true; }
      if (G.inv.planks <= 0) { G.hud.msg('No tienes tablones. Cómpralos en el pueblo.'); return true; }
      G.inv.planks--;
      this.addBoard();
      G.hud.msg('Atrancas la puerta con un tablón.');
      return true;
    }
    return false;
  }
}

// Casa de un papel: puertas, ventanas, por dónde entra el monstruo y lo propio de cada una
class Home {
  constructor(H, id, name) {
    this.H = H;
    this.G = H.G;
    this.id = id;
    this.name = name;
    this.world = H.G.world;
    this.group = new THREE.Group();
    H.G.scene.add(this.group);
    this.doors = [];
    this.windows = [];
    this.entries = [];
    this.inter = [];
    this.active = false;
  }

  get refs() { return [...this.doors, ...this.windows]; }
  get owner() { return this.G.role === this.id; }

  addEntry(ref, gather) {
    this.entries.push({ type: ref.kind, ref, outside: ref.outside, gather: new THREE.Vector3(gather.x, 0, gather.z), home: this });
  }

  contains(p) {
    const R = this.inner;
    return p.x > R.minX && p.x < R.maxX && p.z > R.minZ && p.z < R.maxZ && p.y > R.minY - 0.5 && p.y < R.maxY;
  }

  // Siguiente punto para llegar a "to" sin chocar con la casa (como la cabaña)
  routeAround(from, to) {
    const R = this.rect;
    if (!U.segRect(from.x, from.z, to.x, to.z, R)) return to;
    const C = this.corners;
    const clear = (a, b) => !U.segRect(a.x, a.z, b.x, b.z, R);
    let best = null, bl = Infinity;
    for (let i = 0; i < 4; i++) {
      const ci = C[i];
      if (!clear(from, ci)) continue;
      const d0 = Math.hypot(ci.x - from.x, ci.z - from.z);
      if (clear(ci, to)) {
        const l = d0 + Math.hypot(to.x - ci.x, to.z - ci.z);
        if (l < bl) { bl = l; best = ci; }
      }
      [C[(i + 1) % 4], C[(i + 3) % 4]].forEach((cj) => {
        if (clear(cj, to)) {
          const l = d0 + Math.hypot(cj.x - ci.x, cj.z - ci.z) + Math.hypot(to.x - cj.x, to.z - cj.z);
          if (l < bl) { bl = l; best = ci; }
        }
      });
    }
    return best || to;
  }

  setRect(minX, maxX, minZ, maxZ, margin = 0.35) {
    this.rect = { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
    const m = margin + 0.7;
    this.corners = [
      new THREE.Vector3(minX - m, 0, minZ - m), new THREE.Vector3(maxX + m, 0, minZ - m),
      new THREE.Vector3(maxX + m, 0, maxZ + m), new THREE.Vector3(minX - m, 0, maxZ + m),
    ];
  }

  get interactables() {
    if (!this.active) return [];
    return [...this.doors, ...this.windows, ...this.inter.filter((i) => !i.enabled || i.enabled())];
  }

  reset() {
    this.doors.forEach((d) => { d.open = false; d.anim = 0; d.bolted = false; d.boards = 0; d.pick = 0; d.boardHp = d.boardHpMax; });
    this.windows.forEach((w) => { w.glass = true; w.boards = 0; w.rip = 0; });
  }

  update(dt) {
    this.doors.forEach((d) => d.update(dt));
    this.windows.forEach((w) => w.update(dt));
  }

  onNight() {}
  onDawn() {}
  repellers() { return []; }
  special() { return 0; }
  applySpecial() {}

  // Cama: dormir hasta la tarde (como la de la cabaña)
  addBed(pos, title) {
    const G = this.G;
    this.inter.push({
      kind: 'bed', pos, r: 0.9,
      enabled: () => this.owner,
      prompt: () => ({ title, lines: [G.phase === 'day' && G.clock < CFG.TIME.SLEEP_TO - 30 ? '[E] Dormir hasta las 18:00' : '[E] Dormir'], info: [] }),
      act: (key) => (key === 'E' ? (G.bed.act('E'), true) : false),
    });
  }

  // ¿Está el monstruo a menos de r metros de p? (modo historia o su posición en multijugador)
  monsterNear(p, r) {
    const G = this.G;
    const I = G.intruder;
    let m = null;
    if (I.netMode) m = G.mp && G.mp.monsterPos();
    else if (I.mesh.visible && !['off', 'gone', 'apparition'].includes(I.state)) m = I.pos;
    if (!m) return false;
    return Math.hypot(m.x - p.x, m.z - p.z) < r && Math.abs(m.y - (p.y || 0)) < 4;
  }
}

// ---------- Caravana de la investigadora ----------
class CaravanHome extends Home {
  constructor(H) {
    super(H, 'investigator', 'la caravana');
    const G = this.G;
    const W = this.world;
    const L = W.landmarks.caravan;
    const cx = L.x, cz = L.z;
    this.center = new THREE.Vector3(cx, 0, cz);
    const g = this.group;
    const box = (x0, x1, y0, y1, z0, z1, mat, collide = true, opts) => {
      const m = new THREE.Mesh(boxGeo(x1 - x0, y1 - y0, z1 - z0, 1), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.add(m);
      if (collide) W.addBox(x0, x1, y0, y1, z0, z1, opts);
      return m;
    };
    const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
    const X0 = cx - 2.4, X1 = cx + 2.4, Z0 = cz - 1.1, Z1 = cz + 1.1, FY = 0.45, TY = 2.95, BY = 0.3;
    const dA = cx + 0.5, dB = cx + 1.3, wA = cx - 1.8, wB = cx - 0.8, wY0 = 1.35, wY1 = 2.1;
    // Paredes: solo el choque (lo que se ve es la carrocería redondeada de abajo)
    [[X0, X1, 0, TY, Z1 - 0.1, Z1], [X0, X0 + 0.1, 0, TY, Z0, Z1], [X1 - 0.1, X1, 0, TY, Z0, Z1],
      [X0, wA, 0, TY, Z0, Z0 + 0.1], [wA, wB, 0, wY0, Z0, Z0 + 0.1], [wA, wB, wY1, TY, Z0, Z0 + 0.1],
      [wB, dA, 0, TY, Z0, Z0 + 0.1], [dA, dB, FY + 2.17, TY, Z0, Z0 + 0.1], [dB, X1, 0, TY, Z0, Z0 + 0.1],
    ].forEach((b) => W.addBox(...b));

    // ---------- Carrocería de caravana antigua: morros redondeados y pintura a dos colores ----------
    const cream = lam(0xe6dfcc);
    const teal = lam(0x3d7a80);
    const chrome = lam(0xc8ccd0);
    const RT = 0.75, RB = 0.18;
    const hx0 = X0 - cx, hx1 = X1 - cx;
    const outline = (p, x0, y0, x1, y1, rt, rb) => {
      p.moveTo(x0 + rb, y0);
      p.lineTo(x1 - rb, y0);
      p.absarc(x1 - rb, y0 + rb, rb, -Math.PI / 2, 0, false);
      p.lineTo(x1, y1 - rt);
      p.absarc(x1 - rt, y1 - rt, rt, 0, Math.PI / 2, false);
      p.lineTo(x0 + rt, y1);
      p.absarc(x0 + rt, y1 - rt, rt, Math.PI / 2, Math.PI, false);
      p.lineTo(x0, y0 + rb);
      p.absarc(x0 + rb, y0 + rb, rb, Math.PI, Math.PI * 1.5, false);
      return p;
    };
    // Techo, morros y bajos: el perfil hueco estirado a lo ancho
    const shell = outline(new THREE.Shape(), hx0, BY, hx1, TY, RT, RB);
    shell.holes.push(outline(new THREE.Path(), hx0 + 0.08, BY + 0.08, hx1 - 0.08, TY - 0.08, RT - 0.08, RB - 0.06));
    const shellMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shell, { depth: Z1 - Z0, bevelEnabled: false, curveSegments: 6 }), cream);
    shellMesh.position.set(cx, 0, Z0);
    g.add(shellMesh);
    // Laterales: chapa pintada por fuera, madera por dentro (con los huecos de la puerta y la ventana)
    const paintTex = makeTex(512, 256, (gg, w, h) => {
      const row = (y) => h * (1 - (y - BY) / (TY - BY));
      gg.fillStyle = '#e4dcc4';
      gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#3d7a80';
      gg.fillRect(0, row(1.15), w, h - row(1.15));
      gg.fillRect(0, row(1.4), w, row(1.33) - row(1.4));
      gg.fillStyle = '#c4c8cc';
      gg.fillRect(0, row(1.22), w, row(1.15) - row(1.22));
      gg.fillStyle = '#f4f4f4';
      gg.fillRect(0, row(1.22), w, 1);
      // Paso de rueda
      const wx = ((cx - 0.3 - X0) / (X1 - X0)) * w, wr = (0.5 / (X1 - X0)) * w;
      gg.fillStyle = '#1a1816';
      gg.beginPath();
      gg.ellipse(wx, row(0.38), wr, row(0.38) - row(0.9), 0, Math.PI, 0);
      gg.fill();
      // Juntas de la chapa con remaches
      for (let k = 1; k < 6; k++) {
        const x = (k / 6) * w;
        gg.fillStyle = 'rgba(0,0,0,0.14)';
        gg.fillRect(x, 0, 1, h);
        gg.fillStyle = 'rgba(90,90,90,0.45)';
        for (let y = 4; y < h; y += 9) gg.fillRect(x + 2, y, 2, 2);
      }
      // Churretes de lluvia, óxido y barro
      for (let i = 0; i < 70; i++) {
        gg.fillStyle = `rgba(60,50,30,${(0.04 + Math.random() * 0.08).toFixed(2)})`;
        gg.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, 10 + Math.random() * h * 0.5);
      }
      for (let i = 0; i < 40; i++) {
        gg.fillStyle = `rgba(${110 + Math.random() * 40 | 0},60,30,${(0.15 + Math.random() * 0.3).toFixed(2)})`;
        gg.fillRect(Math.random() * w, h - Math.random() * h * 0.25, 2 + Math.random() * 6, 2 + Math.random() * 5);
      }
      const grd = gg.createLinearGradient(0, h * 0.8, 0, h);
      grd.addColorStop(0, 'rgba(40,30,20,0)');
      grd.addColorStop(1, 'rgba(40,30,20,0.55)');
      gg.fillStyle = grd;
      gg.fillRect(0, h * 0.8, w, h * 0.2);
    }, { clamp: true });
    const paint = new THREE.MeshLambertMaterial({ map: paintTex });
    const panelMat = new THREE.MeshLambertMaterial({ map: MAT.planks.map, color: 0xe0c49a });
    const sideShape = (holes) => {
      const sh = outline(new THREE.Shape(), hx0, BY, hx1, TY, RT, RB);
      holes.forEach(([a0, a1, y0, y1]) => {
        const hp = new THREE.Path();
        hp.moveTo(a0, y0);
        hp.lineTo(a1, y0);
        hp.lineTo(a1, y1);
        hp.lineTo(a0, y1);
        hp.lineTo(a0, y0);
        sh.holes.push(hp);
      });
      return sh;
    };
    const panel = (shape, uvFn, mat, z, flip) => {
      const geo = new THREE.ShapeGeometry(shape, 6);
      const pa = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pa.count; i++) uv.setXY(i, ...uvFn(pa.getX(i), pa.getY(i)));
      uv.needsUpdate = true;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, 0, z);
      if (flip) m.scale.z = -1;
      g.add(m);
      return m;
    };
    const outUV = (x, y) => [(x - hx0) / (hx1 - hx0), (y - BY) / (TY - BY)];
    const inUV = (x, y) => [x * 0.5, y * 0.5];
    const front = sideShape([[dA - cx, dB - cx, FY, FY + 2.17], [wA - cx, wB - cx, wY0, wY1]]);
    const back = sideShape([]);
    panel(front, outUV, paint, Z0 - 0.012, true);
    panel(front, inUV, panelMat, Z0 + 0.11, false);
    panel(back, outUV, paint, Z1 + 0.012, false);
    panel(back, inUV, panelMat, Z1 - 0.11, true);
    // Morros: franja verde y cromada, ventana delantera, pilotos traseros
    [[X0 - 0.014, X0], [X1, X1 + 0.014]].forEach(([a, b]) => {
      box(a, b, BY + RB, 1.15, Z0 + 0.05, Z1 - 0.05, teal, false);
      box(a - 0.004, b + 0.004, 1.15, 1.22, Z0 + 0.03, Z1 - 0.03, chrome, false);
    });
    box(X1 + 0.01, X1 + 0.03, 1.5, 2.15, cz - 0.62, cz + 0.62, chrome, false);
    box(X1 + 0.02, X1 + 0.04, 1.56, 2.09, cz - 0.56, cz + 0.56, MAT.dark, false);
    box(X1 + 0.02, X1 + 0.12, 2.2, 2.26, cz - 0.7, cz + 0.7, chrome, false);
    const tail = new THREE.MeshBasicMaterial({ color: 0x601010 });
    [Z0 + 0.25, Z1 - 0.25].forEach((z) => box(X0 - 0.03, X0 - 0.01, 0.62, 0.8, z - 0.1, z + 0.1, tail, false));
    box(X0 - 0.03, X0 - 0.015, 0.6, 0.78, cz - 0.25, cz + 0.25, lam(0xd8c040), false);
    // Ventanas del lado de atrás (con cortinas corridas)
    [cx - 1.2, cx + 1.2].forEach((x) => {
      box(x - 0.5, x + 0.5, 1.35, 2.1, Z1 + 0.014, Z1 + 0.03, chrome, false);
      box(x - 0.44, x + 0.44, 1.41, 2.04, Z1 + 0.02, Z1 + 0.036, MAT.dark, false);
    });
    // Ruedas con tapacubos y lanza de enganche con bombonas
    [Z0 - 0.06, Z1 + 0.06].forEach((z) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 12), MAT.dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(cx - 0.3, 0.38, z);
      g.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 10), chrome);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(cx - 0.3, 0.38, z);
      g.add(hub);
    });
    [-1, 1].forEach((sd) => {
      const bar = box(0, 1.28, 0.42, 0.5, -0.04, 0.04, MAT.metal, false);
      bar.position.set(X1 + 0.58, 0.46, cz + sd * 0.28);
      bar.rotation.y = sd * Math.atan2(0.55, 1.15);
    });
    box(X1 + 1.1, X1 + 1.32, 0.42, 0.56, cz - 0.07, cz + 0.07, MAT.metal, false);
    box(X1 + 0.92, X1 + 0.98, 0.1, 0.5, cz - 0.03, cz + 0.03, MAT.metal, false);
    const jw = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8), MAT.dark);
    jw.rotation.x = Math.PI / 2;
    jw.position.set(X1 + 0.95, 0.09, cz);
    g.add(jw);
    [[0xd8641c, -0.2], [0x9aa0a4, 0.2]].forEach(([col, dz]) => {
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.56, 10), lam(col));
      bt.position.set(X1 + 0.45, 0.78, cz + dz);
      g.add(bt);
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 6), MAT.metal);
      valve.position.set(X1 + 0.45, 1.1, cz + dz);
      g.add(valve);
    });
    W.addBox(X1 + 0.28, X1 + 0.62, 0, 1.1, cz - 0.38, cz + 0.38);
    // En el techo: antena de televisión, claraboya y antena parabólica
    box(cx - 1.8, cx - 1.76, TY, TY + 1.2, cz + 0.55, cz + 0.59, MAT.metal, false);
    box(cx - 2.05, cx - 1.55, TY + 1.0, TY + 1.04, cz + 0.55, cz + 0.59, MAT.metal, false);
    box(cx - 1.95, cx - 1.65, TY + 0.8, TY + 0.83, cz + 0.55, cz + 0.59, MAT.metal, false);
    box(cx - 0.6, cx - 0.1, TY - 0.02, TY + 0.12, cz - 0.35, cz + 0.15, lam(0xb8b4a8), false);
    box(cx - 0.62, cx - 0.08, TY + 0.12, TY + 0.15, cz - 0.37, cz + 0.17, lam(0x9a968c), false);
    box(cx + 1.05, cx + 1.11, TY - 0.05, TY + 0.4, cz + 0.27, cz + 0.33, MAT.metal, false);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.05, 0.14, 12, 1, true), lam(0xd8d8d0, { side: THREE.DoubleSide }));
    dish.position.set(cx + 1.08, TY + 0.5, cz + 0.3);
    dish.rotation.set(0.9, 0, 0.3);
    g.add(dish);
    // Escalón de la puerta
    box(dA + 0.02, dB - 0.02, 0.18, 0.22, Z0 - 0.42, Z0 - 0.02, MAT.metal, false);
    box(dA + 0.04, dA + 0.07, 0, 0.18, Z0 - 0.4, Z0 - 0.05, MAT.metal, false);
    box(dB - 0.07, dB - 0.04, 0, 0.18, Z0 - 0.4, Z0 - 0.05, MAT.metal, false);
    W.addFloor(dA, dB, Z0 - 0.42, Z0 - 0.02, 0.22);

    // ---------- Toldo a rayas con guirnalda de bombillas, mesa y sillas de camping ----------
    const awTex = makeTex(64, 16, (gg, w, h) => {
      for (let i = 0; i < 8; i++) {
        gg.fillStyle = i % 2 ? '#e8dcc0' : '#b8442a';
        gg.fillRect((i * w) / 8, 0, w / 8, h);
      }
      gg.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 30; i++) gg.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    }, { clamp: true });
    const awMat = new THREE.MeshLambertMaterial({ map: awTex, side: THREE.DoubleSide });
    const AW0 = cx - 0.65, AW1 = cx + 2.25, AD = 2.0, AH0 = 2.72, AH1 = 2.12;
    const slope = Math.atan2(AH0 - AH1, AD);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(AW1 - AW0, Math.hypot(AD, AH0 - AH1)), awMat);
    aw.rotation.x = -Math.PI / 2 - slope;
    aw.position.set((AW0 + AW1) / 2, (AH0 + AH1) / 2, Z0 - AD / 2);
    g.add(aw);
    const val = new THREE.Mesh(new THREE.PlaneGeometry(AW1 - AW0, 0.24), awMat);
    val.position.set((AW0 + AW1) / 2, AH1 - 0.12, Z0 - AD);
    g.add(val);
    box(AW0, AW1, AH0 - 0.04, AH0 + 0.04, Z0 - 0.06, Z0 - 0.015, MAT.metal, false);
    [AW0 + 0.05, AW1 - 0.05].forEach((x) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, AH1, 6), MAT.metal);
      pole.position.set(x, AH1 / 2, Z0 - AD + 0.03);
      g.add(pole);
    });
    this.bulbs = [];
    const bulbCols = [0xffd890, 0xff6a4a, 0x8ad0ff, 0x9aff8a];
    const wire = new THREE.MeshBasicMaterial({ color: 0x151515 });
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = AW0 + 0.1 + t * (AW1 - AW0 - 0.2);
      const y = AH1 - 0.3 - Math.sin(t * Math.PI * 2) ** 2 * 0.1;
      const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
      const bm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), mat);
      bm.position.set(x, y, Z0 - AD + 0.02);
      g.add(bm);
      if (i < 10) {
        const seg = new THREE.Mesh(boxGeo((AW1 - AW0 - 0.2) / 10, 0.01, 0.01, 1), wire);
        seg.position.set(x + (AW1 - AW0 - 0.2) / 20, y + 0.05, Z0 - AD + 0.02);
        g.add(seg);
      }
      this.bulbs.push({ mat, on: bulbCols[i % 4] });
    }
    // Mesa plegable y dos sillas
    const tx = cx - 0.2, tz = Z0 - 1.7;
    box(tx - 0.38, tx + 0.38, 0.7, 0.74, tz - 0.27, tz + 0.27, lam(0xe0e0d8), false);
    [[-0.32, -0.22], [0.32, -0.22], [-0.32, 0.22], [0.32, 0.22]].forEach(([dx, dz]) => box(tx + dx - 0.015, tx + dx + 0.015, 0, 0.7, tz + dz - 0.015, tz + dz + 0.015, MAT.metal, false));
    W.addBox(tx - 0.38, tx + 0.38, 0, 0.74, tz - 0.27, tz + 0.27, { furniture: true });
    const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8), lam(0x2a5a3a));
    thermos.position.set(tx + 0.18, 0.87, tz);
    g.add(thermos);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8), lam(0xd8d0c0));
    mug.position.set(tx - 0.12, 0.79, tz + 0.08);
    g.add(mug);
    const chairMat = lam(0x5a6a3a);
    [[tx - 0.75, tz + 0.05, 0.4], [tx + 0.05, tz - 0.62, Math.PI / 2 + 0.3]].forEach(([x, z, ry]) => {
      const ch = new THREE.Group();
      const seat = new THREE.Mesh(boxGeo(0.44, 0.04, 0.42, 1), chairMat);
      seat.position.y = 0.42;
      ch.add(seat);
      const backr = new THREE.Mesh(boxGeo(0.44, 0.42, 0.04, 1), chairMat);
      backr.position.set(0, 0.66, 0.2);
      backr.rotation.x = -0.15;
      ch.add(backr);
      [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]].forEach(([dx, dz]) => {
        const l = new THREE.Mesh(boxGeo(0.025, 0.42, 0.025, 1), MAT.metal);
        l.position.set(dx, 0.21, dz);
        ch.add(l);
      });
      ch.position.set(x, 0, z);
      ch.rotation.y = ry;
      g.add(ch);
    });

    // ---------- Dentro: litera, cocinita, mesa de la radio y el tablón de la investigación ----------
    box(X0 + 0.1, X1 - 0.1, FY - 0.08, FY, Z0 + 0.1, Z1 - 0.1, MAT.planks, false);
    W.addFloor(X0 + 0.1, X1 - 0.1, Z0 - 0.02, Z1 - 0.1, FY);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), lam(0x7a3a2a));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cx + 0.2, FY + 0.006, cz - 0.15);
    g.add(rug);
    box(X0 + 0.1, cx - 0.9, FY, FY + 0.5, cz + 0.15, Z1 - 0.1, MAT.fabric, true, { furniture: true });
    box(X0 + 0.14, cx - 0.94, FY + 0.5, FY + 0.56, cz + 0.2, Z1 - 0.14, lam(0x7a2f3a), false);
    box(X0 + 0.16, X0 + 0.58, FY + 0.5, FY + 0.66, cz + 0.3, Z1 - 0.2, lam(0xd8d4c8), false);
    box(X0 + 0.1, cx - 0.9, 2.0, 2.05, cz + 0.5, Z1 - 0.1, panelMat, false);
    for (let i = 0; i < 6; i++) box(X0 + 0.2 + i * 0.1, X0 + 0.27 + i * 0.1, 2.05, 2.28 - (i % 3) * 0.04, cz + 0.6, cz + 0.85, lam([0x6a2a1a, 0x2a3a5a, 0x5a5a2a][i % 3]), false);
    // Cortinas de la ventana delantera y de las de atrás (corridas)
    const curt = lam(0xb88a38);
    [wA - 0.02, wB - 0.22].forEach((x) => box(x, x + 0.24, wY0 - 0.12, wY1 + 0.12, Z0 + 0.13, Z0 + 0.16, curt, false));
    box(wA - 0.08, wB + 0.08, wY1 + 0.04, wY1 + 0.2, Z0 + 0.12, Z0 + 0.17, curt, false);
    [cx - 1.2, cx + 1.2].forEach((x) => box(x - 0.5, x + 0.5, 1.3, 2.15, Z1 - 0.16, Z1 - 0.13, curt, false));
    // Cocinita junto a la puerta
    box(cx + 1.4, X1 - 0.1, FY, FY + 0.85, Z0 + 0.1, Z0 + 0.52, panelMat, true, { furniture: true });
    box(cx + 1.38, X1 - 0.08, FY + 0.85, FY + 0.89, Z0 + 0.1, Z0 + 0.55, lam(0xb8b8b0), false);
    box(cx + 1.55, cx + 1.95, FY + 0.885, FY + 0.895, Z0 + 0.18, Z0 + 0.45, MAT.metal, false);
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 8), lam(0xb03a2a));
    kettle.position.set(cx + 2.12, FY + 0.97, Z0 + 0.32);
    g.add(kettle);
    box(cx + 1.4, X1 - 0.1, 2.05, 2.55, Z0 + 0.1, Z0 + 0.42, panelMat, false);
    // Mesa de la radio (con armario debajo)
    box(cx + 1.5, X1 - 0.1, FY + 0.72, FY + 0.78, cz + 0.2, Z1 - 0.1, MAT.planks, true, { furniture: true });
    box(cx + 1.55, X1 - 0.15, FY, FY + 0.72, cz + 0.3, Z1 - 0.12, panelMat, true, { furniture: true });
    const radio = new THREE.Mesh(boxGeo(0.4, 0.22, 0.16, 1), lam(0x4a3020));
    radio.position.set(cx + 1.95, FY + 0.89, cz + 0.7);
    g.add(radio);
    box(cx + 1.8, cx + 1.82, FY + 1.0, FY + 1.5, cz + 0.7, cz + 0.72, MAT.metal, false);
    this.radioPos = new THREE.Vector3(cx + 1.95, FY + 0.95, cz + 0.6);
    // Tablón de corcho con fotos, recortes y el hilo rojo
    const bz = Z1 - 0.125;
    box(cx + 0.2, cx + 1.9, 1.5, 2.35, bz - 0.02, bz + 0.01, lam(0xa8784a), false);
    const photoTex = makeTex(16, 16, (gg, w, h) => {
      gg.fillStyle = '#e8e4d8';
      gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#2a2a26';
      gg.fillRect(2, 2, w - 4, h - 5);
      gg.fillStyle = '#5a5a50';
      gg.fillRect(6, 4, 3, 7);
      gg.fillRect(5, 5, 5, 2);
    }, { clamp: true });
    const photoMat = new THREE.MeshLambertMaterial({ map: photoTex });
    const pins = [[cx + 0.45, 2.15], [cx + 0.85, 1.75], [cx + 1.3, 2.18], [cx + 1.65, 1.7], [cx + 0.5, 1.68], [cx + 1.1, 1.95]];
    pins.forEach(([x, y], i) => {
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(i === 5 ? 0.3 : 0.2, i === 5 ? 0.22 : 0.16), i === 5 ? MAT.paper : photoMat);
      ph.position.set(x, y, bz - 0.025);
      ph.rotation.set(0, Math.PI, (i % 3 - 1) * 0.12);
      g.add(ph);
    });
    const red = new THREE.MeshBasicMaterial({ color: 0xb01818 });
    [[0, 1], [1, 2], [2, 3], [1, 4], [5, 3]].forEach(([a, b]) => {
      const [x0, y0] = pins[a], [x1, y1] = pins[b];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const th = new THREE.Mesh(boxGeo(len, 0.008, 0.008, 1), red);
      th.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.05, bz - 0.032);
      th.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      g.add(th);
    });
    // Lámpara del techo
    this.ceilMat = new THREE.MeshBasicMaterial({ color: 0x4a4030 });
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), this.ceilMat);
    shade.rotation.x = Math.PI;
    shade.position.set(cx, TY - 0.1, cz);
    g.add(shade);
    this.lamp = new THREE.PointLight(0xffd090, 0, 9, 1.4);
    this.lamp.position.set(cx, 2.5, cz);
    g.add(this.lamp);
    this.inner = { minX: X0 + 0.1, maxX: X1 - 0.1, minZ: Z0 + 0.05, maxZ: Z1 - 0.1, minY: 0, maxY: TY };
    this.setRect(X0, X1, Z0, Z1);

    // Puerta (pestillo) y ventana (se puede tapiar)
    this.door = new HomeDoor(this, { name: 'Puerta de la caravana', axis: 'x', a0: dA, a1: dB, wc: Z0 + 0.05, inside: 1, y0: FY, h: 2.15, mat: lam(0xd6ccb0) });
    this.doors.push(this.door);
    // Ojo de buey en la puerta
    [-1, 1].forEach((sd) => {
      const ring = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), chrome);
      ring.position.set((dB - dA) / 2, 1.6, sd * 0.042);
      if (sd < 0) ring.rotation.y = Math.PI;
      this.door.pivot.add(ring);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), MAT.dark);
      glass.position.set((dB - dA) / 2, 1.6, sd * 0.045);
      if (sd < 0) glass.rotation.y = Math.PI;
      this.door.pivot.add(glass);
    });
    this.window = new CabinWindow(this, { name: 'Ventana de la caravana', axis: 'x', a0: wA, a1: wB, y0: wY0, y1: wY1, wc: Z0 + 0.05, inside: 1 });
    this.windows.push(this.window);
    this.addEntry(this.door, { x: cx + 0.9, z: cz - 4.5 });
    this.addEntry(this.window, { x: cx - 1.3, z: cz - 4.5 });
    this.addBed(new THREE.Vector3(cx - 1.6, FY + 0.6, cz + 0.6), 'Litera');

    // Trampas de flash alrededor de la caravana
    this.traps = [[cx - 4.6, cz - 3.6], [cx + 5.2, cz - 3.4], [cx + 0.4, cz + 4.4]].map(([x, z], k) => {
      const tg = new THREE.Group();
      [0, 2.1, 4.2].forEach((a) => {
        const leg = new THREE.Mesh(boxGeo(0.03, 1.1, 0.03, 1), MAT.metal);
        leg.position.set(Math.sin(a) * 0.18, 0.5, Math.cos(a) * 0.18);
        leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
        tg.add(leg);
      });
      const cam = new THREE.Mesh(boxGeo(0.2, 0.14, 0.12, 1), MAT.dark);
      cam.position.y = 1.08;
      tg.add(cam);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x300000 });
      const bulb = new THREE.Mesh(boxGeo(0.07, 0.07, 0.07, 1), bulbMat);
      bulb.position.set(0, 1.22, 0);
      tg.add(bulb);
      tg.position.set(x, 0, z);
      tg.rotation.y = Math.atan2(x - cx, z - cz);
      g.add(tg);
      const light = new THREE.PointLight(0xf4f0ff, 0, 18, 1.2);
      light.position.set(x, 1.3, z);
      g.add(light);
      const t = { k, pos: new THREE.Vector3(x, 0, z), armed: true, bulbMat, light, flashT: 0 };
      this.inter.push({
        kind: 'trap', pos: new THREE.Vector3(x, 1.1, z), r: 0.6,
        prompt: () => (this.owner
          ? { title: 'Trampa de flash', lines: [t.armed ? 'Armada' : '[E] Armarla'], info: ['Si se acerca, el fogonazo lo ciega y le hace una foto'] }
          : { title: 'Trampa de flash de la investigadora', lines: [], info: [t.armed ? 'Armada' : 'Disparada'] }),
        act: (key) => {
          if (key !== 'E' || !this.owner || t.armed) return key === 'E';
          t.armed = true;
          SFX.click(t.pos, 0.6);
          G.hud.msg('Trampa armada. Si algo grande pasa cerca, saltará el flash.');
          return true;
        },
      });
      return t;
    });
    this.trapR = 3.4;
  }

  reset() {
    super.reset();
    this.traps.forEach((t) => { t.armed = true; t.flashT = 0; });
  }

  // Bits de las trampas armadas
  special() { return this.traps.reduce((a, t, k) => a | (t.armed ? 1 << k : 0), 0); }

  applySpecial(v) { this.traps.forEach((t, k) => (t.armed = !!(v & (1 << k)))); }

  fireTrap(t, remote) {
    const G = this.G;
    t.armed = false;
    t.flashT = 0.35;
    SFX.shutter();
    SFX.bang(t.pos, 0.5);
    if (remote) return;
    // Quien manda en la caravana decide el efecto
    const I = G.intruder;
    if (G.mp) G.mp.emit({ t: 'trap', k: t.k, x: Math.round(t.pos.x * 10) / 10, z: Math.round(t.pos.z * 10) / 10 });
    else if (I.scare) I.scare('La trampa de flash lo ciega: retrocede.');
    const R = G.roles;
    if (R.role === 'investigator') {
      if ((R.photosTonight || 0) < 2) {
        R.photosTonight = (R.photosTonight || 0) + 1;
        R.got.foto++;
        G.hud.msg(`¡La trampa de flash ha saltado y le ha hecho una foto nítida! (Fotos sin enviar: ${R.got.foto})`, 6);
      } else G.hud.msg('¡La trampa de flash ha saltado!', 4);
    }
  }

  update(dt) {
    super.update(dt);
    const G = this.G;
    const lit = this.active && G.daylight < 0.5;
    if (lit !== this.litShown) {
      this.litShown = lit;
      this.lamp.intensity = lit ? 1.0 : 0;
      this.ceilMat.color.set(lit ? 0xffe0a0 : 0x4a4030);
      this.bulbs.forEach((b) => b.mat.color.set(lit ? b.on : 0x2a2a2a));
    }
    const blink = Math.sin(performance.now() * 0.006) > 0.6;
    this.traps.forEach((t) => {
      t.flashT = Math.max(0, t.flashT - dt);
      t.light.intensity = t.flashT > 0 ? 7 * (t.flashT / 0.35) : 0;
      t.bulbMat.color.set(t.flashT > 0 ? 0xffffff : this.active && t.armed && blink ? 0xff2010 : 0x300000);
      // Salta si el monstruo pasa cerca (lo decide quien vive aquí)
      if (this.active && this.owner && t.armed && G.phase === 'night' && this.monsterNear(t.pos, this.trapR)) this.fireTrap(t, false);
    });
  }
}

// ---------- Fortín del cazador ----------
// Un fortín de troncos de dos plantas en mitad del bosque: abajo, la puerta reforzada, la
// ventana y el banco de trabajo; arriba (más ancha, volada sobre la de abajo), el arsenal, el
// catre y las troneras para disparar. Alrededor, cencerros que suenan si algo grande cruza el
// claro, y al este, el campo de tiro.
const FT = (() => {
  const c = { x: 82, z: 54 };
  const X0 = c.x - 3.5, X1 = c.x + 3.5, Z0 = c.z - 3.5, Z1 = c.z + 3.5;
  return {
    c, X0, X1, Z0, Z1, FY: 3.0, UH: 2.7, OV: 0.6,
    SX0: X0 + 1.0, SX1: X0 + 5.4, SZ0: Z0 + 0.15, SZ1: Z0 + 1.35,
  };
})();

// Troncos redondos (InstancedMesh): runs = [{ axis, c, a0, a1, y }]
function buildLogRuns(group, runs, R, mats) {
  const geo = new THREE.CylinderGeometry(R, R, 1, 7, 1);
  geo.rotateZ(Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, mats, runs.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  runs.forEach((l, i) => {
    const len = l.a1 - l.a0, mid = (l.a0 + l.a1) / 2;
    const r = 0.94 + ((i * 37) % 11) / 100;
    if (l.axis === 'x') { ps.set(mid, l.y, l.c); q.identity(); } else { ps.set(l.c, l.y, mid); q.copy(qz); }
    sc.set(len, r, r);
    inst.setMatrixAt(i, mtx.compose(ps, q, sc));
  });
  group.add(inst);
  return inst;
}

// Materiales de tronco: corteza por el lado y anillos en las puntas
function logMaterials(tint = 0xc8a070) {
  const endTex = makeTex(32, 32, (gg, w, h) => {
    gg.fillStyle = '#b08850';
    gg.fillRect(0, 0, w, h);
    for (let r = 15; r > 1; r -= 2.5) {
      gg.strokeStyle = r % 5 < 2.5 ? '#8a6438' : '#c49a60';
      gg.beginPath();
      gg.arc(16 + Math.random(), 16 + Math.random(), r, 0, Math.PI * 2);
      gg.stroke();
    }
    gg.fillStyle = '#4a3420';
    gg.fillRect(15, 15, 2, 2);
  }, { clamp: true });
  const side = new THREE.MeshLambertMaterial({ map: MAT.bark.map, color: tint });
  const end = new THREE.MeshLambertMaterial({ map: endTex });
  return [side, end, end];
}

class FortHome extends Home {
  constructor(H) {
    super(H, 'hunter', 'el fortín');
    const G = this.G;
    const W = this.world;
    const g = this.group;
    const { c, X0, X1, Z0, Z1, FY, UH, OV, SX0, SX1, SZ0, SZ1 } = FT;
    const UX0 = X0 - OV, UX1 = X1 + OV, UZ0 = Z0 - OV, UZ1 = Z1 + OV, TOP = FY + UH;
    this.center = new THREE.Vector3(c.x, 0, c.z);
    this.FY = FY;
    const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
    const box = (x0, x1, y0, y1, z0, z1, mat, collide = false, opts) => {
      const m = new THREE.Mesh(boxGeo(x1 - x0, y1 - y0, z1 - z0, 1.4), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.add(m);
      if (collide) W.addBox(x0, x1, y0, y1, z0, z1, opts);
      return m;
    };
    const chink = new THREE.MeshLambertMaterial({ map: MAT.plaster.map, color: 0x4a3c2e });
    const logMats = logMaterials(0xb89060);
    const dark = lam(0x2a2018);
    const iron = MAT.metal;

    // ---------- Planta baja ----------
    const dA = c.x - 0.7, dB = c.x + 0.7, DT = 2.3;
    const wA = c.z - 0.5, wB = c.z + 0.5, wY0 = 1.0, wY1 = 1.8;
    // Zócalo de piedra
    box(X0 - 0.15, X1 + 0.15, 0, 0.35, Z0 - 0.15, Z1 + 0.15, MAT.stone);
    // Paredes (relleno entre troncos) con la puerta al sur y la ventana al oeste
    box(X0, X1, 0, FY, Z0, Z0 + 0.14, chink, true);
    box(X1 - 0.14, X1, 0, FY, Z0, Z1, chink, true);
    box(X0, dA, 0, FY, Z1 - 0.14, Z1, chink, true);
    box(dB, X1, 0, FY, Z1 - 0.14, Z1, chink, true);
    box(dA, dB, DT, FY, Z1 - 0.14, Z1, chink, true);
    box(X0, X0 + 0.14, 0, FY, Z0, wA, chink, true);
    box(X0, X0 + 0.14, 0, FY, wB, Z1, chink, true);
    box(X0, X0 + 0.14, 0, wY0, wA, wB, chink, true);
    box(X0, X0 + 0.14, wY1, FY, wA, wB, chink, true);
    box(X0 + 0.14, X1 - 0.14, -0.05, 0.02, Z0 + 0.14, Z1 - 0.14, MAT.planks);

    // ---------- Planta de arriba, volada sobre la de abajo, con troneras ----------
    const slitY0 = FY + 1.15, slitY1 = FY + 1.5, slitW = 0.7;
    const slitsX = [c.x - 2.1, c.x + 2.1], slitsZ = [c.z - 2.1, c.z + 2.1];
    const upWall = (axis, wc, a0, a1, slits) => {
      // axis 'x': pared a lo largo de X en z = wc; 'z': a lo largo de Z en x = wc
      const T = 0.16;
      const seg = (s0, s1, y0, y1) => (axis === 'x'
        ? box(s0, s1, y0, y1, wc - T / 2, wc + T / 2, chink, true)
        : box(wc - T / 2, wc + T / 2, y0, y1, s0, s1, chink, true));
      let p = a0;
      slits.forEach((sc) => {
        seg(p, sc - slitW / 2, FY, TOP);
        seg(sc - slitW / 2, sc + slitW / 2, FY, slitY0);
        seg(sc - slitW / 2, sc + slitW / 2, slitY1, TOP);
        p = sc + slitW / 2;
      });
      seg(p, a1, FY, TOP);
    };
    upWall('x', UZ0 + 0.08, UX0, UX1, slitsX);
    upWall('x', UZ1 - 0.08, UX0, UX1, slitsX);
    upWall('z', UX0 + 0.08, UZ0 + 0.16, UZ1 - 0.16, slitsZ);
    upWall('z', UX1 - 0.08, UZ0 + 0.16, UZ1 - 0.16, slitsZ);
    // Forjado de arriba con el hueco de la escalera
    const slab = (x0, x1, z0, z1) => {
      box(x0, x1, FY - 0.22, FY, z0, z1, MAT.planks);
      W.addFloor(x0, x1, z0, z1, FY);
      W.addBox(x0, x1, FY - 0.22, FY, z0, z1, { solid: false, slab: true });
    };
    slab(UX0 + 0.16, UX1 - 0.16, SZ1 + 0.1, UZ1 - 0.16);
    slab(SX1, UX1 - 0.16, UZ0 + 0.16, SZ1 + 0.1);
    slab(UX0 + 0.16, SX0, UZ0 + 0.16, SZ1 + 0.1);
    slab(SX0, SX1, UZ0 + 0.16, SZ0);
    // Vigas que asoman bajo el vuelo
    for (let x = X0 + 0.4; x < X1; x += 1.2) {
      box(x - 0.09, x + 0.09, FY - 0.42, FY - 0.22, UZ0, Z0, dark);
      box(x - 0.09, x + 0.09, FY - 0.42, FY - 0.22, Z1, UZ1, dark);
    }
    for (let z = Z0 + 0.4; z < Z1; z += 1.2) {
      box(UX0, X0, FY - 0.42, FY - 0.22, z - 0.09, z + 0.09, dark);
      box(X1, UX1, FY - 0.42, FY - 0.22, z - 0.09, z + 0.09, dark);
    }
    // Techo de dentro y tejado a cuatro aguas con remate
    box(UX0 + 0.16, UX1 - 0.16, TOP - 0.05, TOP, UZ0 + 0.16, UZ1 - 0.16, MAT.planks);
    const roofR = ((UX1 - UX0) / 2 + 0.6) * Math.SQRT2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(roofR, 2.4, 4, 1, true), new THREE.MeshLambertMaterial({ map: MAT.roof.map, color: 0xb89a80, emissive: 0x2a1a10, side: THREE.DoubleSide }));
    roof.position.set(c.x, TOP + 1.2, c.z);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6), dark);
    finial.position.set(c.x, TOP + 2.7, c.z);
    g.add(finial);
    // Cornamenta en lo alto
    [-1, 1].forEach((sd) => {
      const ant = new THREE.Mesh(boxGeo(0.05, 0.55, 0.05, 1), lam(0xd8ccb0));
      ant.position.set(c.x + sd * 0.2, TOP + 3.25, c.z);
      ant.rotation.z = -sd * 0.6;
      g.add(ant);
      const tine = new THREE.Mesh(boxGeo(0.04, 0.25, 0.04, 1), lam(0xd8ccb0));
      tine.position.set(c.x + sd * 0.3, TOP + 3.2, c.z);
      tine.rotation.z = sd * 0.3;
      g.add(tine);
    });
    // Chimenea de piedra
    box(X1 - 1.1, X1 - 0.4, TOP - 0.3, TOP + 2.2, Z0 + 0.6, Z0 + 1.3, MAT.stone);

    // ---------- Troncos de las paredes (cruzados en las esquinas) ----------
    const R = 0.15, ST = 0.3, OVL = 0.3;
    const runs = [];
    const add = (axis, cc, a0, a1, y) => runs.push({ axis, c: cc, a0, a1, y });
    for (let i = 0; R + i * ST < FY - 0.1; i++) {
      const y = 0.35 + R + i * ST;
      if (y > FY) break;
      add('x', Z0 + 0.07, X0 - OVL, X1 + OVL, y);
      if (y < DT) { add('x', Z1 - 0.07, X0 - OVL, dA, y); add('x', Z1 - 0.07, dB, X1 + OVL, y); } else add('x', Z1 - 0.07, X0 - OVL, X1 + OVL, y);
    }
    for (let i = 0; 0.35 + (i + 1) * ST < FY - 0.05; i++) {
      const y = 0.35 + (i + 0.5) * ST + R;
      add('z', X1 - 0.07, Z0 - OVL, Z1 + OVL, y);
      if (y + R > wY0 + 0.04 && y - R < wY1 - 0.04) { add('z', X0 + 0.07, Z0 - OVL, wA, y); add('z', X0 + 0.07, wB, Z1 + OVL, y); } else add('z', X0 + 0.07, Z0 - OVL, Z1 + OVL, y);
    }
    // Arriba, con las troneras
    const upRuns = (axis, cc, a0, a1, slits, phase) => {
      for (let i = 0; ; i++) {
        const y = FY + R + (i + phase) * ST;
        if (y > TOP - 0.05) break;
        const cut = y + R > slitY0 + 0.03 && y - R < slitY1 - 0.03;
        if (!cut) { add(axis, cc, a0 - OVL, a1 + OVL, y); continue; }
        let p = a0 - OVL;
        slits.forEach((sc) => { add(axis, cc, p, sc - slitW / 2, y); p = sc + slitW / 2; });
        add(axis, cc, p, a1 + OVL, y);
      }
    };
    upRuns('x', UZ0 + 0.08, UX0, UX1, slitsX, 0);
    upRuns('x', UZ1 - 0.08, UX0, UX1, slitsX, 0);
    upRuns('z', UX0 + 0.08, UZ0, UZ1, slitsZ, 0.5);
    upRuns('z', UX1 - 0.08, UZ0, UZ1, slitsZ, 0.5);
    buildLogRuns(g, runs, R, logMats);

    // ---------- Escalera (sube de este a oeste, pegada a la pared norte) ----------
    const run = SX1 - SX0;
    for (let i = 0; i < 12; i++) {
      const xb = SX1 - (i * run) / 12, xa = SX1 - ((i + 1) * run) / 12;
      box(xa, xb, 0, ((i + 1) * FY) / 12, SZ0, SZ1, MAT.planks);
    }
    W.addFloor(SX0, SX1, SZ0, SZ1, (x) => U.clamp(((SX1 - x) / run) * FY, 0, FY));
    W.addBox(SX0, SX1 - 2.2, 0, 1.0, SZ0, SZ1);
    // Barandilla del hueco
    box(SX0 + 0.5, SX1, FY + 0.95, FY + 1.03, SZ1 + 0.05, SZ1 + 0.13, MAT.door);
    for (let x = SX0 + 0.6; x < SX1; x += 0.5) box(x - 0.03, x + 0.03, FY, FY + 0.95, SZ1 + 0.06, SZ1 + 0.12, MAT.door);
    box(SX1, SX1 + 0.08, FY, FY + 1.03, SZ0, SZ1 + 0.13, MAT.door);
    W.addBox(SX0 + 0.5, SX1 + 0.1, FY, FY + 1.05, SZ1 + 0.03, SZ1 + 0.15, { sight: false, bullets: false });
    W.addBox(SX1, SX1 + 0.1, FY, FY + 1.05, SZ0, SZ1 + 0.15, { sight: false, bullets: false });
    this.stair = { SX0, SX1, SZ0, SZ1 };
    this.stairBottom = new THREE.Vector3(SX1 + 0.45, 0, (SZ0 + SZ1) / 2);
    this.stairTop = new THREE.Vector3(SX0 - 0.5, FY, (SZ0 + SZ1) / 2);

    // ---------- Planta baja: banco de trabajo, barriles, estufa, pieles ----------
    box(X1 - 0.75, X1 - 0.15, 0, 0.85, c.z + 0.2, c.z + 2.4, MAT.planks, true, { furniture: true });
    box(X1 - 0.7, X1 - 0.5, 0.85, 1.0, c.z + 0.6, c.z + 1.1, iron);
    for (let i = 0; i < 3; i++) {
      const tool = new THREE.Mesh(boxGeo(0.04, 0.45, 0.12, 1), [iron, dark][i % 2]);
      tool.position.set(X1 - 0.16, 1.5, c.z + 0.6 + i * 0.6);
      g.add(tool);
    }
    [[X0 + 0.5, Z1 - 0.6], [X0 + 1.05, Z1 - 0.55]].forEach(([x, z]) => {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.85, 10), lam(0x6a4428));
      br.position.set(x, 0.43, z);
      g.add(br);
      W.addCircle(x, z, 0.3, 0.85);
    });
    const rug = new THREE.Mesh(new THREE.CircleGeometry(0.9, 9), lam(0x5a4632));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.3, 1, 1);
    rug.position.set(c.x - 0.6, 0.03, c.z + 1.2);
    g.add(rug);
    this.stoveMat = new THREE.MeshBasicMaterial({ color: 0x1a0c06 });
    box(X0 + 0.2, X0 + 0.9, 0, 0.8, Z1 - 2.4, Z1 - 1.6, dark, true, { furniture: true });
    const grate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), this.stoveMat);
    grate.position.set(X0 + 0.905, 0.4, Z1 - 2.0);
    grate.rotation.y = Math.PI / 2;
    g.add(grate);

    // ---------- Arriba: arsenal, cepos, munición, catre y trofeo ----------
    const gunMetal = lam(0x1e1e22);
    const stockWood = lam(0x6a3e1c);
    // Armero contra la pared norte (de arriba)
    const rackZ = UZ0 + 0.22;
    box(c.x - 1.6, c.x + 1.8, FY + 0.05, FY + 0.15, rackZ - 0.05, rackZ + 0.18, MAT.door);
    box(c.x - 1.6, c.x + 1.8, FY + 1.75, FY + 1.85, rackZ - 0.05, rackZ + 0.12, MAT.door);
    // Tablero claro detrás, para que las armas destaquen
    box(c.x - 1.65, c.x + 1.85, FY + 0.15, FY + 1.75, rackZ - 0.1, rackZ - 0.04, lam(0x8a6a44));
    box(c.x - 1.7, c.x + 1.9, FY + 1.85, FY + 1.95, rackZ - 0.08, rackZ + 0.02, lam(0x5a3a1c));
    const longGun = (x, len, stockCol) => {
      const gg = new THREE.Group();
      const barrel = new THREE.Mesh(boxGeo(0.035, len * 0.62, 0.035, 1), gunMetal);
      barrel.position.y = len * 0.6;
      gg.add(barrel);
      const stock = new THREE.Mesh(boxGeo(0.06, len * 0.42, 0.08, 1), stockCol);
      stock.position.y = len * 0.2;
      gg.add(stock);
      gg.position.set(x, FY + 0.15, rackZ + 0.05);
      gg.rotation.z = 0.06;
      g.add(gg);
    };
    longGun(c.x - 1.3, 1.6, stockWood);
    longGun(c.x - 0.8, 1.6, stockWood);
    longGun(c.x - 0.3, 1.45, lam(0x4a2c14));
    longGun(c.x + 0.2, 1.3, stockWood);
    // Ballesta colgada
    box(c.x + 0.8, c.x + 1.0, FY + 1.1, FY + 1.6, rackZ, rackZ + 0.06, stockWood);
    box(c.x + 0.55, c.x + 1.25, FY + 1.5, FY + 1.54, rackZ, rackZ + 0.06, gunMetal);
    box(c.x + 1.35, c.x + 1.75, FY + 1.0, FY + 1.6, rackZ, rackZ + 0.04, lam(0x3a4a2a));
    // Cepos colgados en la pared este (de arriba)
    const trapMat = lam(0x5a5650);
    for (let i = 0; i < 4; i++) {
      const tr = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 5, 12, Math.PI), trapMat);
      tr.position.set(UX1 - 0.22, FY + 1.1 + (i % 2) * 0.55, c.z - 1.6 + Math.floor(i / 2) * 0.7);
      tr.rotation.set(0, Math.PI / 2, i % 2 ? Math.PI : 0);
      g.add(tr);
    }
    // Mesa con cajas de munición y el mapa de caza
    box(c.x - 0.9, c.x + 0.9, FY + 0.72, FY + 0.78, c.z - 0.2, c.z + 0.8, MAT.planks, true, { furniture: true });
    [[c.x - 0.8, c.z - 0.1], [c.x + 0.8, c.z - 0.1], [c.x - 0.8, c.z + 0.7], [c.x + 0.8, c.z + 0.7]].forEach(([x, z]) => box(x - 0.04, x + 0.04, FY, FY + 0.72, z - 0.04, z + 0.04, MAT.planks));
    [[-0.55, 0x3a4a2a], [-0.2, 0x3a4a2a], [0.5, 0x6a5a2a]].forEach(([dx, col]) => box(c.x + dx - 0.15, c.x + dx + 0.15, FY + 0.78, FY + 0.95, c.z + 0.05, c.z + 0.35, lam(col)));
    const mapTop = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), MAT.paper);
    mapTop.rotation.x = -Math.PI / 2;
    mapTop.position.set(c.x + 0.2, FY + 0.785, c.z + 0.55);
    g.add(mapTop);
    // Catre y piel de lobo
    box(UX0 + 0.25, UX0 + 1.05, FY, FY + 0.45, c.z + 0.6, UZ1 - 0.3, MAT.fabric, true, { furniture: true });
    box(UX0 + 0.28, UX0 + 1.02, FY + 0.45, FY + 0.5, c.z + 1.0, UZ1 - 0.33, lam(0x3a4a2a));
    const pelt = new THREE.Mesh(new THREE.CircleGeometry(0.7, 7), lam(0x7a7068));
    pelt.rotation.x = -Math.PI / 2;
    pelt.scale.set(1.5, 1, 1);
    pelt.position.set(c.x + 0.5, FY + 0.01, c.z + 2.2);
    g.add(pelt);
    // Cabeza de ciervo en la pared sur (de arriba)
    const trophy = new THREE.Group();
    trophy.add(new THREE.Mesh(boxGeo(0.28, 0.42, 0.22, 1), lam(0x7a5a3a)));
    [-1, 1].forEach((sd) => {
      const a = new THREE.Mesh(boxGeo(0.03, 0.5, 0.03, 1), lam(0xd8ccb0));
      a.position.set(sd * 0.16, 0.4, 0);
      a.rotation.z = -sd * 0.6;
      trophy.add(a);
    });
    const plaque = new THREE.Mesh(boxGeo(0.5, 0.6, 0.05, 1), MAT.door);
    plaque.position.z = -0.12;
    trophy.add(plaque);
    trophy.position.set(c.x + 1.6, FY + 1.9, UZ1 - 0.2);
    trophy.rotation.y = Math.PI;
    g.add(trophy);
    this.upLight = new THREE.PointLight(0xffc080, 0, 9, 1.4);
    this.upLight.position.set(c.x, TOP - 0.6, c.z);
    g.add(this.upLight);
    this.downLight = new THREE.PointLight(0xffb070, 0, 7, 1.5);
    this.downLight.position.set(c.x, FY - 0.7, c.z + 1);
    g.add(this.downLight);
    // Quinqué sobre el armero
    this.rackLight = new THREE.PointLight(0xffb060, 0, 4.5, 1.6);
    this.rackLight.position.set(c.x + 0.1, FY + 2.15, rackZ + 0.9);
    g.add(this.rackLight);
    box(c.x - 0.02, c.x + 0.22, FY + 1.95, FY + 2.2, rackZ + 0.05, rackZ + 0.25, this.lanternMat2 = new THREE.MeshBasicMaterial({ color: 0x3a3020 }));

    // ---------- Fuera: faroles, leñera, astas sobre la puerta, cencerros ----------
    this.lanternMat = new THREE.MeshBasicMaterial({ color: 0x3a3020 });
    [dA - 0.45, dB + 0.45].forEach((x) => {
      box(x - 0.03, x + 0.03, 2.05, 2.1, Z1 + 0.05, Z1 + 0.35, iron);
      box(x - 0.08, x + 0.08, 1.72, 1.98, Z1 + 0.26, Z1 + 0.42, this.lanternMat);
      box(x - 0.1, x + 0.1, 1.98, 2.02, Z1 + 0.24, Z1 + 0.44, dark);
    });
    [-1, 1].forEach((sd) => {
      const a = new THREE.Mesh(boxGeo(0.05, 0.6, 0.05, 1), lam(0xd8ccb0));
      a.position.set(c.x + sd * 0.25, DT + 0.35, Z1 + 0.18);
      a.rotation.z = -sd * 0.7;
      g.add(a);
    });
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4 - row; i++) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 7), logMats);
        l.rotation.x = Math.PI / 2;
        l.position.set(X1 + 0.35 + (i + row * 0.5) * 0.31, 0.15 + row * 0.27, c.z + 0.5);
        g.add(l);
      }
    }
    W.addBox(X1 + 0.15, X1 + 1.6, 0, 0.8, c.z - 0.3, c.z + 1.3);
    // Cencerros en postes alrededor del claro: suenan si algo grande pasa cerca
    this.bells = [0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const x = c.x + Math.cos(a) * 10.5, z = c.z + Math.sin(a) * 10.5;
      const post = new THREE.Mesh(boxGeo(0.08, 1.3, 0.08, 1), MAT.door);
      post.position.set(x, 0.65, z);
      g.add(post);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 6), lam(0x8a6a30));
      bell.position.set(x, 1.15, z);
      g.add(bell);
      const dir = ['este', 'sureste', 'suroeste', 'oeste', 'noroeste', 'noreste'][k];
      return { pos: new THREE.Vector3(x, 0, z), mesh: bell, dir, t: 0 };
    });

    this.inner = { minX: X0 + 0.14, maxX: X1 - 0.14, minZ: Z0 + 0.14, maxZ: Z1 - 0.14, minY: 0, maxY: TOP };
    this.upper = { minX: UX0 + 0.16, maxX: UX1 - 0.16, minZ: UZ0 + 0.16, maxZ: UZ1 - 0.16 };
    this.setRect(X0, X1, Z0, Z1);

    // ---------- Puerta reforzada y ventana ----------
    this.door = new HomeDoor(this, { name: 'Puerta del fortín', axis: 'x', a0: dA, a1: dB, wc: Z1 - 0.07, inside: -1, h: 2.25, lockFactor: 1.8, boardHp: 150, mat: lam(0x5a3a1e) });
    this.doors.push(this.door);
    // Herrajes de la puerta
    [0.5, 1.7].forEach((y) => {
      const strap = new THREE.Mesh(boxGeo(1.36, 0.08, 0.1, 1), iron);
      strap.position.set(0.7, y, 0);
      this.door.pivot.add(strap);
    });
    this.window = new CabinWindow(this, { name: 'Ventana del fortín', axis: 'z', a0: wA, a1: wB, y0: wY0, y1: wY1, wc: X0 + 0.07, inside: 1 });
    this.windows.push(this.window);
    this.addEntry(this.door, { x: c.x, z: Z1 + 3.5 });
    this.addEntry(this.window, { x: X0 - 3.5, z: c.z });
    this.addBed(new THREE.Vector3(UX0 + 0.65, FY + 0.6, c.z + 1.6), 'Catre del fortín');

    // ---------- Campo de tiro al este ----------
    this.bench = new THREE.Vector3(UX1 + 2.6, 0, c.z);
    box(this.bench.x - 0.4, this.bench.x + 0.4, 0, 0.9, c.z - 0.9, c.z + 0.9, MAT.planks, true, { furniture: true });
    box(this.bench.x - 0.45, this.bench.x + 0.45, 0.9, 0.96, c.z - 1.0, c.z + 1.0, MAT.door);
    const targetTex = makeTex(64, 64, (gg, w, h) => {
      gg.fillStyle = '#e8dcc0';
      gg.fillRect(0, 0, w, h);
      [[30, '#e8dcc0'], [26, '#2a2a2a'], [20, '#e8dcc0'], [14, '#a02a1a'], [8, '#e8dcc0'], [4, '#a02a1a']].forEach(([r, col]) => {
        gg.fillStyle = col;
        gg.beginPath();
        gg.arc(32, 32, r, 0, Math.PI * 2);
        gg.fill();
      });
    }, { clamp: true });
    const tMat = new THREE.MeshLambertMaterial({ map: targetTex, side: THREE.DoubleSide });
    this.targets = [[11, -3], [15, 3], [20, -1], [25, 4], [30, -4], [34, 1]].map(([dx, dz], k) => {
      const x = this.bench.x + dx, z = c.z + dz;
      const post = new THREE.Mesh(boxGeo(0.1, 0.5, 0.6, 1), MAT.door);
      post.position.set(x, 0.25, z);
      g.add(post);
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.5, z);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), tMat);
      disc.position.y = 0.7;
      disc.rotation.y = -Math.PI / 2;
      pivot.add(disc);
      const stick = new THREE.Mesh(boxGeo(0.05, 0.3, 0.05, 1), MAT.door);
      stick.position.y = 0.15;
      pivot.add(stick);
      pivot.rotation.z = -Math.PI / 2 + 0.05;
      g.add(pivot);
      return { k, pivot, center: new THREE.Vector3(x, 1.2, z), up: 0, want: 0, r: 0.42 };
    });
  }

  // Dentro: la planta de arriba es más ancha que la de abajo
  contains(p) {
    if (p.y > this.FY - 0.5 && p.y < this.inner.maxY) {
      const U2 = this.upper;
      return p.x > U2.minX && p.x < U2.maxX && p.z > U2.minZ && p.z < U2.maxZ;
    }
    return super.contains(p);
  }

  // De una planta a otra por la escalera (para el monstruo de la historia)
  waypoint(from, to) {
    const S = this.stair;
    const up = (p) => p.y > 1.8;
    const onStair = from.x > S.SX0 - 0.3 && from.x < S.SX1 + 0.2 && from.z > S.SZ0 + 0.02 && from.z < S.SZ1 - 0.02 && (from.x > S.SX1 - 0.6 || from.y > 0.25);
    if (onStair) return up(to) ? this.stairTop : this.stairBottom;
    if (up(from) === up(to)) return to;
    if (!up(from)) return Math.hypot(from.x - this.stairBottom.x, from.z - this.stairBottom.z) < 0.4 ? this.stairTop : this.stairBottom;
    return Math.hypot(from.x - this.stairTop.x, from.z - this.stairTop.z) < 0.4 ? this.stairBottom : this.stairTop;
  }

  update(dt) {
    super.update(dt);
    const G = this.G;
    const night = this.active && G.daylight < 0.5;
    if (night !== this.litShown) {
      this.litShown = night;
      this.lanternMat.color.set(night ? 0xffc060 : 0x3a3020);
      this.upLight.intensity = night ? 1.6 : 0.35;
      this.downLight.intensity = night ? 1.1 : 0.3;
      this.rackLight.intensity = night ? 1.4 : 0.5;
      this.lanternMat2.color.set(night ? 0xffc060 : 0x6a5030);
    }
    const t = performance.now() * 0.001;
    const k = night ? 0.75 + Math.sin(t * 9) * 0.15 + Math.random() * 0.1 : 0;
    this.stoveMat.color.setRGB(0.1 + k, 0.05 + k * 0.45, 0.02 + k * 0.08);
    // Dianas: se levantan y se tumban
    this.targets.forEach((tg) => {
      tg.up += U.clamp(tg.want - tg.up, -dt * 5, dt * 5);
      tg.pivot.rotation.z = (-Math.PI / 2 + 0.05) * (1 - tg.up);
    });
    // Cencerros: si algo grande cruza el claro, suenan (lo oye quien vive aquí)
    this.bells.forEach((b) => {
      b.t = Math.max(0, b.t - dt);
      b.mesh.rotation.z = b.t > 0 ? Math.sin(t * 30) * 0.5 * (b.t / 2) : 0;
      if (this.active && this.owner && G.phase === 'night' && b.t <= 0 && this.monsterNear(b.pos, 3.5)) {
        b.t = 2;
        SFX.chime(b.pos, 1.6, 0.9);
        setTimeout(() => SFX.chime(b.pos, 1.4, 0.8), 180);
        G.hud.alert('CENCERROS · LADO ' + b.dir.toUpperCase());
      }
    });
  }
}

// ---------- Ayuntamiento (alcalde) ----------
// Dos plantas. Abajo, el salón de plenos; arriba, el despacho con el mapa del pueblo (farolas y
// cámaras), el monitor de las cámaras del bosque, el sofá y la cuerda de la campana.
const TH = { FY: 3.3, SX0: 165.0, SX1: 169.4, SZ0: -16.2, SZ1: -15.0 };

class TownHallHome extends Home {
  constructor(H) {
    super(H, 'mayor', 'el ayuntamiento');
    const G = this.G;
    const W = this.world;
    const b = G.village.buildings.find((x) => x.id === 'ayuntamiento');
    this.building = b;
    const g = this.group;
    this.center = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    this.inner = { minX: b.x0 + 0.25, maxX: b.x1 - 0.25, minZ: b.z0 + 0.25, maxZ: b.z1 - 0.25, minY: 0, maxY: b.h };
    this.setRect(b.x0, b.x1, b.z0, b.z1);
    const box = (x0, x1, y0, y1, z0, z1, mat, collide = false, opts) => {
      const m = new THREE.Mesh(boxGeo(x1 - x0, y1 - y0, z1 - z0, 1.2), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.add(m);
      if (collide) W.addBox(x0, x1, y0, y1, z0, z1, opts);
      return m;
    };
    const I = this.inner, FY = TH.FY;

    // ---------- Segunda planta: forjado con el hueco de la escalera ----------
    const slab = (x0, x1, z0, z1) => {
      box(x0, x1, FY - 0.22, FY, z0, z1, MAT.planks);
      W.addFloor(x0, x1, z0, z1, FY);
      W.addBox(x0, x1, FY - 0.22, FY, z0, z1, { solid: false, slab: true });
    };
    slab(I.minX, I.maxX, TH.SZ1 + 0.1, I.maxZ);
    slab(TH.SX1, I.maxX, I.minZ, TH.SZ1 + 0.1);
    // Vigas vistas bajo el forjado
    for (let x = I.minX + 0.8; x < I.maxX; x += 1.6) box(x - 0.08, x + 0.08, FY - 0.42, FY - 0.22, TH.SZ1 + 0.1, I.maxZ, MAT.door);
    // Escalera contra la pared norte: sube hacia el este
    const run = TH.SX1 - TH.SX0;
    for (let i = 0; i < 14; i++) {
      const xa = TH.SX0 + (i * run) / 14, xb = TH.SX0 + ((i + 1) * run) / 14;
      box(xa, xb, 0, ((i + 1) * FY) / 14, TH.SZ0, TH.SZ1, MAT.planks);
    }
    W.addFloor(TH.SX0, TH.SX1, TH.SZ0, TH.SZ1, (x) => U.clamp(((x - TH.SX0) / run) * FY, 0, FY));
    W.addBox(TH.SX0 + 1.6, TH.SX1, 0, 1.0, TH.SZ0, TH.SZ1);
    // Barandilla del hueco (arriba) y pasamanos de la escalera
    box(I.minX, TH.SX1, FY + 0.95, FY + 1.03, TH.SZ1 + 0.05, TH.SZ1 + 0.13, MAT.door);
    for (let x = I.minX + 0.3; x < TH.SX1; x += 0.55) box(x - 0.03, x + 0.03, FY, FY + 0.95, TH.SZ1 + 0.06, TH.SZ1 + 0.12, MAT.door);
    W.addBox(I.minX, TH.SX1, FY, FY + 1.05, TH.SZ1 + 0.03, TH.SZ1 + 0.15, { sight: false, bullets: false });
    for (let i = 0; i <= 6; i++) {
      const x = TH.SX0 + (i * run) / 6;
      const y = (i / 6) * FY;
      box(x - 0.03, x + 0.03, y, y + 0.9, TH.SZ1 - 0.06, TH.SZ1, MAT.door);
    }
    const rail = box(TH.SX0, TH.SX1, 0.9, 0.96, TH.SZ1 - 0.07, TH.SZ1 + 0.01, MAT.door);
    rail.position.y = FY / 2 + 0.93;
    rail.rotation.z = Math.atan2(FY, run);
    rail.scale.x = Math.hypot(run, FY) / run;
    this.stairBottom = new THREE.Vector3(TH.SX0 - 0.45, 0, (TH.SZ0 + TH.SZ1) / 2);
    this.hallPoint = new THREE.Vector3(166.5, 0, -12.3);
    this.leafRect = { minX: 163.7, maxX: 165.75, minZ: -13.35, maxZ: -12.25 };
    this.stairTop = new THREE.Vector3(TH.SX1 + 0.5, FY, (TH.SZ0 + TH.SZ1) / 2);
    // Lámpara de la planta baja
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), bulbMat);
    bulb.position.set(168, FY - 0.6, -11.5);
    g.add(bulb);
    this.downLight = new THREE.PointLight(0xffd8a0, 0, 9, 1.5);
    this.downLight.position.set(168, FY - 0.8, -11.5);
    g.add(this.downLight);

    // ---------- Fachada: reloj, balcón, ventanas de arriba y bandera ----------
    const fx = b.x0 - 0.02;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
    face.position.set(fx - 0.05, 5.55, -12);
    face.rotation.y = -Math.PI / 2;
    g.add(face);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 20), MAT.metal);
    rim.position.set(fx - 0.06, 5.55, -12);
    rim.rotation.y = -Math.PI / 2;
    g.add(rim);
    const handMat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
    const hand = (len, w) => {
      const pv = new THREE.Group();
      const m = new THREE.Mesh(boxGeo(0.02, len, w, 1), handMat);
      m.position.y = len / 2;
      pv.add(m);
      pv.position.set(fx - 0.09, 5.55, -12);
      g.add(pv);
      return pv;
    };
    this.hourHand = hand(0.36, 0.06);
    this.minHand = hand(0.52, 0.035);
    // Balcón sobre la puerta
    const BY = FY + 0.15;
    box(b.x0 - 1.0, b.x0, FY, BY, -13.4, -10.6, MAT.stone);
    box(b.x0 - 1.0, b.x0 - 0.94, BY, BY + 0.9, -13.4, -10.6, MAT.metal);
    box(b.x0 - 1.0, b.x0, BY + 0.86, BY + 0.92, -13.4, -13.34, MAT.metal);
    box(b.x0 - 1.0, b.x0, BY + 0.86, BY + 0.92, -10.66, -10.6, MAT.metal);
    for (let z = -13.3; z < -10.6; z += 0.25) box(b.x0 - 0.99, b.x0 - 0.95, BY, BY + 0.88, z - 0.015, z + 0.015, MAT.metal);
    // Ventanas de arriba (se iluminan de noche)
    this.winMat = new THREE.MeshBasicMaterial({ color: 0x2a2620 });
    const shutter = new THREE.MeshLambertMaterial({ color: 0x2e4a3a });
    const win = (x, z, rot, y = FY + 1.5) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), this.winMat);
      w.position.set(x, y, z);
      w.rotation.y = rot;
      g.add(w);
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.35), MAT.door);
      fr.position.set(x, y, z);
      fr.rotation.y = rot;
      fr.position.x += Math.sin(rot) * -0.005;
      fr.position.z += Math.cos(rot) * -0.005;
      g.add(fr);
      // Contraventanas verdes abiertas y alféizar de piedra
      const nx = Math.sin(rot), nz = Math.cos(rot);
      [-1, 1].forEach((sd) => {
        const sh = new THREE.Mesh(boxGeo(0.44, 1.3, 0.04, 1), shutter);
        sh.position.set(x + Math.cos(rot) * sd * 0.76 + nx * 0.03, y, z - Math.sin(rot) * sd * 0.76 + nz * 0.03);
        sh.rotation.y = rot;
        g.add(sh);
      });
      const sill = new THREE.Mesh(boxGeo(1.25, 0.08, 0.16, 1), trim);
      sill.position.set(x + nx * 0.07, y - 0.68, z + nz * 0.07);
      sill.rotation.y = rot;
      g.add(sill);
    };
    // Piedra clara de las molduras: imposta entre plantas, cornisa, esquinas y la portada
    const trim = new THREE.MeshLambertMaterial({ map: MAT.stone.map, color: 0xd8d0bc });
    [[b.x0 - 0.08, b.x0, b.z0 - 0.08, b.z1 + 0.08], [b.x1, b.x1 + 0.08, b.z0 - 0.08, b.z1 + 0.08],
      [b.x0, b.x1, b.z0 - 0.08, b.z0], [b.x0, b.x1, b.z1, b.z1 + 0.08]].forEach(([x0, x1, z0, z1]) => {
      box(x0, x1, FY - 0.14, FY, z0, z1, trim);
      box(x0 - (x0 < b.x0 ? 0.08 : 0), x1 + (x1 > b.x1 ? 0.08 : 0), b.h - 0.18, b.h, z0 - (z0 < b.z0 ? 0.08 : 0), z1 + (z1 > b.z1 ? 0.08 : 0), trim);
    });
    const qGeo = new THREE.BoxGeometry(1, 1, 1);
    const quoins = [];
    [[b.x0, b.z0, -1, -1], [b.x1, b.z0, 1, -1], [b.x0, b.z1, -1, 1], [b.x1, b.z1, 1, 1]].forEach(([x, z, sx, sz]) => {
      for (let y = 0.15, i = 0; y < b.h - 0.3; y += 0.5, i++) {
        const along = i % 2 ? 0.55 : 0.32;
        quoins.push([x - sx * along / 2 + sx * 0.02, y + 0.2, z + sz * 0.02, along + 0.04, 0.4, 0.06 + 0.04]);
        quoins.push([x + sx * 0.02, y + 0.2, z - sz * (i % 2 ? 0.32 : 0.55) / 2 + sz * 0.02, 0.1, 0.4, (i % 2 ? 0.32 : 0.55) + 0.04]);
      }
    });
    const qm = new THREE.InstancedMesh(qGeo, trim, quoins.length);
    const qmx = new THREE.Matrix4();
    quoins.forEach(([x, y, z, w, h, d], i) => qm.setMatrixAt(i, qmx.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d))));
    g.add(qm);
    // Portada: jambas, dintel y dos faroles a los lados de la puerta
    box(b.x0 - 0.14, b.x0, 0, 2.62, -12.98, -12.7, trim);
    box(b.x0 - 0.14, b.x0, 0, 2.62, -11.3, -11.02, trim);
    box(b.x0 - 0.18, b.x0, 2.42, 2.66, -13.06, -10.94, trim);
    box(b.x0 - 0.3, b.x0, 0, 0.04, -13.1, -10.9, trim);
    this.doorLampMat = new THREE.MeshBasicMaterial({ color: 0x3a3428 });
    [-13.45, -10.55].forEach((z) => {
      box(b.x0 - 0.3, b.x0, 2.28, 2.32, z - 0.02, z + 0.02, MAT.metal);
      box(b.x0 - 0.38, b.x0 - 0.2, 1.9, 2.22, z - 0.09, z + 0.09, this.doorLampMat);
      box(b.x0 - 0.4, b.x0 - 0.18, 2.22, 2.27, z - 0.11, z + 0.11, MAT.dark);
      box(b.x0 - 0.4, b.x0 - 0.18, 1.86, 1.9, z - 0.11, z + 0.11, MAT.dark);
    });
    [-14.6, -9.4].forEach((z) => win(fx - 0.02, z, -Math.PI / 2));
    [165.6, 168, 170.4].forEach((x) => win(x, b.z1 + 0.02, 0));
    [165.6, 168, 170.4].forEach((x) => win(x, b.z0 - 0.02, Math.PI));
    [165.6, 170.4].forEach((x) => { win(x, b.z1 + 0.02, 0, 1.55); win(x, b.z0 - 0.02, Math.PI, 1.55); });
    const pole = box(168 - 0.04, 168 + 0.04, b.h + 1.6, b.h + 3.6, -12.04, -11.96, MAT.metal);
    pole.visible = true;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color: 0x8a1a1a, side: THREE.DoubleSide }));
    cloth.position.set(168, b.h + 3.25, -11.5);
    cloth.rotation.y = Math.PI / 2;
    g.add(cloth);
    this.flagCloth = cloth;

    // ---------- Despacho de arriba ----------
    const upLight = new THREE.PointLight(0xffd8a0, 0, 10, 1.4);
    upLight.position.set(168, b.h - 0.7, -11.5);
    g.add(upLight);
    this.upLight = upLight;
    box(I.minX, I.maxX, FY, FY + 0.02, TH.SZ1 + 0.1, I.maxZ, new THREE.MeshLambertMaterial({ color: 0x5a2a20 }));
    // Mesa del mapa
    box(166.3, 168.9, FY + 0.78, FY + 0.86, -12.4, -10.8, MAT.door, true, { furniture: true });
    [[166.4, -12.3], [168.8, -12.3], [166.4, -10.9], [168.8, -10.9]].forEach(([x, z]) => box(x - 0.05, x + 0.05, FY, FY + 0.78, z - 0.05, z + 0.05, MAT.door));
    this.mapTex = makeTex(256, 192, (gg, w, h) => this.drawMiniMap(gg, w, h), { clamp: true, linear: true });
    const mapTop = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshLambertMaterial({ map: this.mapTex }));
    mapTop.rotation.x = -Math.PI / 2;
    mapTop.position.set(167.6, FY + 0.87, -11.6);
    g.add(mapTop);
    // Mesa de vigilancia con tres pantallas
    box(170.9, 171.7, FY + 0.74, FY + 0.8, -13.0, -10.2, MAT.door, true, { furniture: true });
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0x0c140c });
    [-12.4, -11.6, -10.8].forEach((z, i) => {
      box(171.3, 171.6, FY + 0.8, FY + 1.35 + (i === 1 ? 0.1 : 0), z - 0.36, z + 0.36, MAT.dark);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42 + (i === 1 ? 0.1 : 0)), this.screenMat);
      sc.position.set(171.28, FY + 1.08 + (i === 1 ? 0.05 : 0), z);
      sc.rotation.y = -Math.PI / 2;
      g.add(sc);
    });
    // Estantería con archivadores
    box(164.3, 164.7, FY, FY + 2.2, -10.5, -8.2, MAT.door, true, { furniture: true });
    for (let i = 0; i < 4; i++) box(164.32, 164.68, FY + 0.3 + i * 0.5, FY + 0.34 + i * 0.5, -10.45, -8.25, MAT.planks);
    // Sofá del despacho (cama)
    box(167.3, 169.1, FY, FY + 0.45, -8.55, -7.85, new THREE.MeshLambertMaterial({ color: 0x5a2020 }), true, { furniture: true });
    box(167.3, 169.1, FY + 0.45, FY + 0.95, -7.95, -7.8, new THREE.MeshLambertMaterial({ color: 0x4a1818 }));
    this.addBed(new THREE.Vector3(168.2, FY + 0.6, -8.2), 'Sofá del despacho');
    // Retrato del alcalde y alfombra
    const portrait = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
    portrait.position.set(168, FY + 1.8, I.maxZ - 0.01);
    portrait.rotation.y = Math.PI;
    g.add(portrait);

    // Puerta maciza en el hueco de la fachada oeste (sustituye a la del pueblo cuando hay alcalde)
    this.door = new HomeDoor(this, { name: 'Puerta del ayuntamiento', axis: 'z', a0: -12.7, a1: -11.3, wc: b.x0 + 0.125, inside: 1, h: 2.38, lockFactor: 2.2, boardHp: 140 });
    this.doors.push(this.door);
    this.addEntry(this.door, { x: b.x0 - 3.5, z: -12 });

    // Campana de alarma: la cuerda baja hasta el rellano de arriba
    const rope = new THREE.Mesh(boxGeo(0.04, 2.0, 0.04, 1), new THREE.MeshLambertMaterial({ color: 0xb09a60 }));
    rope.position.set(171.3, FY + 2.2, -15.8);
    g.add(rope);
    this.bellPos = new THREE.Vector3(168, 7.5, -12);
    this.ringsMax = 3;
    this.rings = 3;
    this.bellR = 40;
    this.inter.push({
      kind: 'bell', pos: new THREE.Vector3(171.3, FY + 1.4, -15.8), r: 0.6,
      prompt: () => (this.owner
        ? { title: 'Campana de alarma', lines: [this.rings > 0 ? `[E] Tocarla (quedan ${this.rings} esta noche)` : 'Ya no quedan toques esta noche'], info: ['Lo espanta, pero el pueblo entero la oye (+6 rumores)'] }
        : { title: 'Campana de alarma', lines: [], info: ['Solo la toca el alcalde'] }),
      act: (key) => {
        if (key !== 'E' || !this.owner) return key === 'E';
        if (this.rings <= 0) { G.hud.msg('No puedes volver a tocarla esta noche: los vecinos ya están despiertos.'); return true; }
        this.ring(false);
        return true;
      },
    });
    this.inter.push({
      kind: 'map', pos: new THREE.Vector3(167.6, FY + 0.9, -11.6), r: 1.0,
      prompt: () => (this.owner
        ? { title: 'Mapa del pueblo', lines: ['[E] Usar el mapa: farolas y cámaras'], info: [`Farolas encendidas ${this.litCount()}/${this.maxLit}`] }
        : { title: 'Mapa del pueblo', lines: [], info: ['Es el mapa del alcalde'] }),
      act: (key) => {
        if (key !== 'E' || !this.owner) return key === 'E';
        G.openTownMap();
        return true;
      },
    });
    this.inter.push({
      kind: 'monitor', pos: new THREE.Vector3(171.3, FY + 1.1, -11.6), r: 0.8,
      prompt: () => (this.owner
        ? { title: 'Cámaras del bosque', lines: ['[E] Mirar las cámaras'], info: [`${this.cams.length} cámaras · visión nocturna`] }
        : { title: 'Cámaras del bosque', lines: [], info: ['Es el puesto de vigilancia del alcalde'] }),
      act: (key) => {
        if (key !== 'E' || !this.owner) return key === 'E';
        G.openMonitor(this.cams, 'town');
        return true;
      },
    });

    // ---------- Farolas del pueblo y cámaras del bosque ----------
    this.lamps = G.village.lamps;
    this.maxLit = 3;
    this.lampR = 5;
    this.buildCams();
    this.sighting = null;
  }

  // Cámaras municipales en postes, por el bosque
  buildCams() {
    const G = this.G;
    const W = this.world;
    const L = W.landmarks;
    const pts = W.pathPts;
    const defs = [];
    [[0.12, 'Camino (cabaña)'], [0.34, 'Camino (puente)'], [0.56, 'Camino (bosque)'], [0.8, 'Camino (pueblo)']].forEach(([f, name]) => {
      const i = Math.floor(pts.length * f);
      const a = pts[i], bb = pts[Math.min(pts.length - 1, i + 6)];
      const tx = bb.x - a.x, tz = bb.z - a.z, tl = Math.hypot(tx, tz) || 1;
      defs.push({ name, x: a.x - (tz / tl) * 2.3, z: a.z + (tx / tl) * 2.3, lx: a.x + (tx / tl) * 16, lz: a.z + (tz / tl) * 16 });
    });
    defs.push({ name: 'Pozo viejo', x: L.well.x + 3.5, z: L.well.z + 3.5, lx: L.well.x, lz: L.well.z });
    defs.push({ name: 'Campamento', x: L.camp.x + 4, z: L.camp.z - 4, lx: L.camp.x, lz: L.camp.z });
    defs.push({ name: 'Caravana', x: L.caravan.x + 6, z: L.caravan.z - 6.5, lx: L.caravan.x, lz: L.caravan.z });
    defs.push({ name: 'Fortín', x: L.fort.x - 9, z: L.fort.z + 9, lx: L.fort.x, lz: L.fort.z });
    defs.push({ name: 'Cabaña del guarda', x: 9, z: 9, lx: 0, lz: 0 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
    this.cams = defs.map((d, k) => {
      const pole = new THREE.Mesh(boxGeo(0.08, 3.2, 0.08, 1), MAT.metal);
      pole.position.set(d.x, 1.6, d.z);
      this.group.add(pole);
      const head = new THREE.Group();
      head.add(new THREE.Mesh(boxGeo(0.16, 0.14, 0.3, 1), new THREE.MeshLambertMaterial({ color: 0xd8d4c8 })));
      const led = new THREE.Mesh(boxGeo(0.03, 0.03, 0.02, 1), ledMat);
      led.position.set(0.05, 0.05, -0.16);
      head.add(led);
      head.position.set(d.x, 3.25, d.z);
      head.lookAt(new THREE.Vector3(d.lx, 1, d.lz));
      this.group.add(head);
      const viewCam = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 90);
      viewCam.position.set(d.x, 3.2, d.z);
      viewCam.lookAt(new THREE.Vector3(d.lx, 0.8, d.lz));
      const fwd = new THREE.Vector3(d.lx - d.x, 0, d.lz - d.z).normalize();
      return { k, name: d.name, pos: new THREE.Vector3(d.x, 3.2, d.z), fwd, viewCam, seenT: -1 };
    });
  }

  // Mapa pequeño de la mesa (dibujo fijo)
  drawMiniMap(g, w, h) {
    g.fillStyle = '#c8b890';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a4630';
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    const W = this.world;
    const B = CFG.WORLD;
    const sx = (x) => 10 + ((x - B.minX) / (B.maxX - B.minX)) * (w - 20);
    const sz = (z) => 10 + ((z - B.minZ) / (B.maxZ - B.minZ)) * (h - 20);
    g.fillStyle = '#8a9a6a';
    for (let i = 0; i < 300; i++) g.fillRect(10 + Math.random() * (w - 20), 10 + Math.random() * (h - 20), 2, 2);
    g.strokeStyle = '#7a5a3a';
    g.lineWidth = 2;
    g.beginPath();
    W.pathPts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sz(p.z)) : g.moveTo(sx(p.x), sz(p.z))));
    g.stroke();
    g.fillStyle = '#4a3a2a';
    this.G.village.buildings.forEach((bb) => g.fillRect(sx(bb.x0), sz(bb.z0), Math.max(2, sx(bb.x1) - sx(bb.x0)), Math.max(2, sz(bb.z1) - sz(bb.z0))));
    g.fillRect(sx(-5), sz(-4), 4, 4);
    g.fillStyle = '#a02a1a';
    g.font = 'bold 10px monospace';
    g.fillText('ROBLEDAL', sx(140), sz(-40));
  }

  litCount() { return this.lamps.filter((l) => l.on && !l.broken).length; }

  // Encender o apagar una farola desde el mapa (como mucho maxLit a la vez)
  toggleLamp(k) {
    const G = this.G;
    const l = this.lamps[k];
    if (!l || !this.owner) return false;
    if (l.broken) { G.hud.msg(`La farola de ${l.name} está rota. Mañana la arreglan.`); return false; }
    if (!l.on && this.litCount() >= this.maxLit) { G.hud.msg(`La central solo da para ${this.maxLit} farolas a la vez. Apaga otra.`); return false; }
    l.on = !l.on;
    SFX.click(null, 0.5);
    return true;
  }

  breakLamp(k, remote) {
    const l = this.lamps[k];
    if (!l || l.broken) return;
    l.broken = true;
    l.brokeAt = performance.now();
    SFX.glass(new THREE.Vector3(l.pos.x, 3.7, l.pos.z));
    if (!remote && this.owner) this.G.hud.msg(`¡Han reventado la farola de ${l.name}!`, 5);
  }

  ring(remote) {
    const G = this.G;
    SFX.bell(this.bellPos);
    if (remote) return;
    this.rings--;
    const I = G.intruder;
    if (G.mp) G.mp.emit({ t: 'bell', x: Math.round(this.center.x), z: Math.round(this.center.z) });
    else if (I.scare && I.mesh.visible && Math.hypot(I.pos.x - this.center.x, I.pos.z - this.center.z) < this.bellR) I.scare('El tañido de la campana lo espanta.');
    if (G.roles.role === 'mayor') G.roles.addRumors(6, 'Todo el pueblo ha oído la campana');
  }

  // De una planta a otra por la escalera (para el monstruo de la historia)
  waypoint(from, to) {
    const up = (p) => p.y > 1.8;
    // En la escalera (no al lado): sigue hacia la planta del objetivo
    const onStair = from.x > TH.SX0 - 0.2 && from.x < TH.SX1 + 0.3 && from.z > TH.SZ0 + 0.02 && from.z < TH.SZ1 - 0.02 && (from.x < TH.SX0 + 0.6 || from.y > 0.25);
    if (onStair) return up(to) ? this.stairTop : this.stairBottom;
    if (up(from) === up(to)) return up(from) ? to : this.groundRoute(from, to);
    if (!up(from)) return Math.hypot(from.x - this.stairBottom.x, from.z - this.stairBottom.z) < 0.4 ? this.stairTop : this.groundRoute(from, this.stairBottom);
    return Math.hypot(from.x - this.stairTop.x, from.z - this.stairTop.z) < 0.4 ? this.stairBottom : this.stairTop;
  }

  // Planta baja: la hoja de la puerta abierta tapa el paso entre la entrada y la escalera,
  // así que de un lado al otro se pasa por un punto del salón
  groundRoute(from, to) {
    if (!this.door.open || !U.segRect(from.x, from.z, to.x, to.z, this.leafRect)) return to;
    return Math.hypot(from.x - this.hallPoint.x, from.z - this.hallPoint.z) < 0.4 ? to : this.hallPoint;
  }

  // Cuando hay alcalde, la puerta del pueblo deja paso a la suya y él manda en las farolas
  setActive(v) {
    this.active = v;
    const b = this.building;
    b.homeOverride = v;
    b.pivot.visible = !v;
    this.door.pivot.visible = v;
    this.door.collider.solid = v;
    if (!v) { this.door.open = false; this.door.anim = 0; }
    this.G.village.lampCtl = v ? this : null;
  }

  reset() {
    super.reset();
    this.rings = this.ringsMax;
    // De día el ayuntamiento abre: la puerta empieza abierta
    this.door.open = true;
    this.door.anim = 1;
    this.lamps.forEach((l, k) => { l.on = k < 3; l.broken = false; });
    this.sighting = null;
    this.cams.forEach((c) => (c.seenT = -1));
  }

  onNight() { this.rings = this.ringsMax; }

  // Al amanecer arreglan las farolas rotas
  onDawn() { this.lamps.forEach((l) => (l.broken = false)); }

  special() {
    let on = 0, br = 0;
    this.lamps.forEach((l, k) => { if (l.on) on |= 1 << k; if (l.broken) br |= 1 << k; });
    return [this.rings, on, br];
  }

  applySpecial(v) {
    if (!Array.isArray(v)) return;
    this.rings = v[0] | 0;
    this.lamps.forEach((l, k) => {
      const br = !!(v[2] & (1 << k));
      if (br && !l.broken) SFX.glass(new THREE.Vector3(l.pos.x, 3.7, l.pos.z));
      l.on = !!(v[1] & (1 << k));
      // Recién reventada aquí: el estado del alcalde aún no lo sabe
      if (!br && l.broken && performance.now() - (l.brokeAt || 0) < 2500) return;
      l.broken = br;
    });
  }

  // Farolas encendidas: lo espantan (y en multijugador le queman)
  repellers() {
    if (!this.active || this.G.phase !== 'night') return [];
    return this.lamps.filter((l) => l.lit).map((l) => ({ pos: l.pos, r: this.lampR, lamp: l, dps: 9 }));
  }

  // ¿Lo ve alguna cámara o está bajo una farola? (para el mapa)
  watch() {
    const G = this.G;
    const I = G.intruder;
    let m = null;
    if (I.netMode) m = G.mp && G.mp.monsterPos();
    else if (I.mesh.visible && !['off', 'gone'].includes(I.state)) m = I.pos;
    const now = performance.now();
    if (!m) return;
    const c3 = new THREE.Vector3(m.x, m.y + 1.4, m.z);
    this.cams.forEach((c) => {
      const d = Math.hypot(m.x - c.pos.x, m.z - c.pos.z);
      if (d > 32) return;
      const dir = new THREE.Vector3(m.x - c.pos.x, 0, m.z - c.pos.z).normalize();
      if (dir.dot(c.fwd) < 0.55 || !G.world.lineOfSight(c.pos, c3)) return;
      if (c.seenT < 0 || now - c.seenT > 12000) {
        if (this.owner && G.phase === 'night') G.hud.alert(`MOVIMIENTO · CÁMARA ${c.name.toUpperCase()}`);
      }
      c.seenT = now;
      this.sighting = { x: m.x, z: m.z, t: now, by: 'cámara ' + c.name };
    });
    this.lamps.forEach((l) => {
      if (l.lit && Math.hypot(m.x - l.pos.x, m.z - l.pos.z) < this.lampR + 2) this.sighting = { x: m.x, z: m.z, t: now, by: 'farola de ' + l.name };
    });
  }

  update(dt) {
    const G = this.G;
    // Reloj de la fachada (hora del juego)
    const c = G.clock % (24 * 60);
    this.minHand.rotation.x = ((c % 60) / 60) * Math.PI * 2;
    this.hourHand.rotation.x = (((c / 60) % 12) / 12) * Math.PI * 2;
    if (this.flagCloth) this.flagCloth.rotation.y = Math.PI / 2 + Math.sin(performance.now() * 0.002) * 0.15;
    const dark = G.daylight < 0.5;
    this.winMat.color.set(this.active && dark ? 0xffcf80 : 0x2a2620);
    this.doorLampMat.color.set(this.active && dark ? 0xffd890 : 0x3a3428);
    if (!this.active) return;
    super.update(dt);
    this.upLight.intensity = dark ? 1.1 : 0.3;
    this.downLight.intensity = dark ? 0.9 : 0.25;
    const t = performance.now() * 0.001;
    this.screenMat.color.set(Math.sin(t * 2) > -0.9 ? 0x6fa070 : 0x8fc090);
    this.watch();
  }
}

class HomeManager {
  constructor(G) {
    this.G = G;
    this.caravan = new CaravanHome(this);
    this.fort = new FortHome(this);
    this.townhall = new TownHallHome(this);
    this.list = [this.caravan, this.fort, this.townhall];
    this.byRole = { investigator: this.caravan, hunter: this.fort, mayor: this.townhall };
    this.townhall.setActive(false);
  }

  get(role) { return this.byRole[role] || null; }

  // Casas en uso según los papeles de la partida
  activate(roles) {
    this.list.forEach((h) => {
      const on = roles.includes(h.id);
      if (h.setActive) h.setActive(on); else h.active = on;
      h.reset();
    });
  }

  get active() { return this.list.filter((h) => h.active); }

  get interactables() {
    const out = [];
    this.list.forEach((h) => h.interactables.forEach((i) => out.push(i)));
    return out;
  }

  // Casa (en uso) en la que está una posición
  homeAt(p) { return this.list.find((h) => h.active && h.contains(p)) || null; }

  repellers() {
    const out = [];
    this.list.forEach((h) => h.repellers().forEach((r) => out.push(r)));
    return out;
  }

  onNight() { this.list.forEach((h) => h.active && h.onNight()); }
  onDawn() { this.list.forEach((h) => h.active && h.onDawn()); }
  update(dt) { this.list.forEach((h) => h.update(dt)); }
}
