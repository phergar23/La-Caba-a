'use strict';

// El pueblo de Robledal: plaza, armería de Anselmo y varios locales en los que se puede entrar
// (taberna, casa de Remedios, ayuntamiento, ferretería e iglesia).
class Village {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.npcs = [];
    this.byId = {};
    this.buildings = [];
    this.interactables = [];
    const V = CFG.WORLD.village;
    this.center = new THREE.Vector3(V.x, 0, V.z);
    this.isOpen = true;
  }

  box(minX, maxX, minY, maxY, minZ, maxZ, mat, collide = true, tex = 2, opts) {
    const m = new THREE.Mesh(boxGeo(maxX - minX, maxY - minY, maxZ - minZ, tex), mat);
    m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.group.add(m);
    if (collide) this.world.addBox(minX, maxX, minY, maxY, minZ, maxZ, opts);
    return m;
  }

  // Tejado a dos aguas (prisma triangular)
  roof(cx, cz, w, d, y, h, alongX) {
    const shape = new THREE.Shape();
    const half = (alongX ? d : w) / 2 + 0.35;
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, h);
    shape.lineTo(-half, 0);
    const len = (alongX ? w : d) + 0.5;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    const m = new THREE.Mesh(geo, MAT.roof);
    m.position.set(cx, y, cz);
    if (alongX) m.rotation.y = Math.PI / 2;
    this.group.add(m);
  }

  sign(text, sub, w, h, pos, rotY, colors = ['#2a1a10', '#e8c890']) {
    const tex = makeTex(128, 32, (g, cw, ch) => {
      g.fillStyle = colors[0];
      g.fillRect(0, 0, cw, ch);
      g.strokeStyle = colors[1];
      g.lineWidth = 2;
      g.strokeRect(2, 2, cw - 4, ch - 4);
      g.fillStyle = colors[1];
      g.textAlign = 'center';
      g.font = 'bold 12px monospace';
      g.fillText(text, 64, sub ? 15 : 20);
      if (sub) {
        g.font = '8px monospace';
        g.fillText(sub, 64, 26);
      }
    }, { clamp: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.copy(pos);
    m.rotation.y = rotY;
    this.group.add(m);
    return m;
  }

  // Casa cerrada (solo decorado)
  house(cx, cz, w, d, facing, wallMat) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const h = 3.2;
    this.box(x0, x1, 0, h, z0, z1, wallMat, true, 2);
    this.roof(cx, cz, w, d, h, 1.8, w > d);
    const f = facing;
    const dir = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[f];
    const fx = cx + dir[0] * (w / 2 + 0.02), fz = cz + dir[1] * (d / 2 + 0.02);
    const alongX = f === 'n' || f === 's';
    const door = new THREE.Mesh(boxGeo(alongX ? 1.0 : 0.05, 2.0, alongX ? 0.05 : 1.0, 1), MAT.door);
    door.position.set(fx, 1.0, fz);
    this.group.add(door);
    [-1, 1].forEach((sd) => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), MAT.litWindow);
      win.position.set(fx + (alongX ? sd * 1.8 : dir[0] * 0.01), 1.7, fz + (alongX ? dir[1] * 0.01 : sd * 1.8));
      win.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[f];
      this.group.add(win);
    });
  }

  // Local con interior: paredes con hueco de puerta, suelo, techo, tejado y puerta que se cierra de noche.
  // door.side: lado de la fachada ('n' = z0, 's' = z1, 'w' = x0, 'e' = x1); door.c: centro del hueco
  building(o) {
    const { x0, x1, z0, z1 } = o;
    const h = o.h || 3.4;
    const T = 0.25;
    const W = this.world;
    const mat = o.mat || MAT.logs;
    const dw = 1.4, dh = 2.4;
    const side = o.door.side;
    const dc = o.door.c;
    const wallX = (z, zz, hole) => {
      if (!hole) { this.box(x0, x1, 0, h, z, zz, mat, true, 1.6); return; }
      this.box(x0, dc - dw / 2, 0, h, z, zz, mat, true, 1.6);
      this.box(dc + dw / 2, x1, 0, h, z, zz, mat, true, 1.6);
      this.box(dc - dw / 2, dc + dw / 2, dh, h, z, zz, mat, true, 1.6);
    };
    const wallZ = (x, xx, hole) => {
      if (!hole) { this.box(x, xx, 0, h, z0 + T, z1 - T, mat, true, 1.6); return; }
      this.box(x, xx, 0, h, z0 + T, dc - dw / 2, mat, true, 1.6);
      this.box(x, xx, 0, h, dc + dw / 2, z1 - T, mat, true, 1.6);
      this.box(x, xx, dh, h, dc - dw / 2, dc + dw / 2, mat, true, 1.6);
    };
    wallX(z0, z0 + T, side === 'n');
    wallX(z1 - T, z1, side === 's');
    wallZ(x0, x0 + T, side === 'w');
    wallZ(x1 - T, x1, side === 'e');
    this.box(x0 + T, x1 - T, -0.05, 0.03, z0 + T, z1 - T, o.floor || MAT.planks, false, 2);
    this.box(x0, x1, h - 0.12, h, z0, z1, MAT.planks, false, 2);
    if (o.roof !== false) this.roof((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, o.roofH || 1.8, x1 - x0 > z1 - z0);

    // Puerta (abierta en horario; cerrada y bloqueada fuera de horario)
    const alongX = side === 'n' || side === 's';
    const wc = side === 'n' ? z0 + T / 2 : side === 's' ? z1 - T / 2 : side === 'w' ? x0 + T / 2 : x1 - T / 2;
    const outward = side === 'n' || side === 'w' ? -1 : 1;
    const pivot = new THREE.Group();
    const panel = new THREE.Mesh(boxGeo(alongX ? dw : 0.07, dh - 0.02, alongX ? 0.07 : dw, 1), MAT.door);
    if (alongX) {
      pivot.position.set(dc - dw / 2, 0, wc);
      panel.position.set(dw / 2, dh / 2, 0);
    } else {
      pivot.position.set(wc, 0, dc - dw / 2);
      panel.position.set(0, dh / 2, dw / 2);
    }
    pivot.add(panel);
    this.group.add(pivot);
    const lock = alongX
      ? W.addBox(dc - dw / 2, dc + dw / 2, 0, dh, wc - 0.13, wc + 0.13)
      : W.addBox(wc - 0.13, wc + 0.13, 0, dh, dc - dw / 2, dc + dw / 2);
    const doorOut = alongX ? new THREE.Vector3(dc, 0, wc + outward * 1.2) : new THREE.Vector3(wc + outward * 1.2, 0, dc);
    // Bombilla interior
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd8a0 }));
    bulb.position.set((x0 + x1) / 2, h - 0.45, (z0 + z1) / 2);
    this.group.add(bulb);
    // Ventanas iluminadas en las fachadas laterales
    if (o.sign) {
      const sp = alongX ? new THREE.Vector3(dc, dh + 0.55, wc + outward * 0.16) : new THREE.Vector3(wc + outward * 0.16, dh + 0.55, dc);
      const rot = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
      this.sign(o.sign[0], o.sign[1], 2.8, 0.7, sp, rot, o.signColors);
    }
    const b = {
      id: o.id, name: o.name, x0, x1, z0, z1, h, side, alongX, pivot, lock, doorOut, anim: 1, open: true,
      inside: (p) => p.x > x0 + T && p.x < x1 - T && p.z > z0 + T && p.z < z1 - T && p.y < h,
      outward,
    };
    this.buildings.push(b);
    return b;
  }

  npc(id, name, look, pos, rotY, building, extra = {}) {
    const mesh = makeHuman(look);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
    const n = { id, name, look, mesh, building, baseRot: rotY, sit: !!extra.sit, lines: extra.lines || [], vendor: extra.vendor || null };
    this.npcs.push(n);
    this.byId[id] = n;
    const self = this;
    this.interactables.push({
      kind: 'npc', npc: n, pos: pos.clone().setY(extra.sit ? 1.1 : 1.5), r: extra.r || 0.8,
      enabled: () => mesh.visible,
      prompt: (G) => {
        const hasMission = (G.story && G.story.hasTalk(id)) || (G.missions && G.missions.hasTalk(id));
        const lines = [];
        const roleTalk = G.roles && G.roles.hasTalk(id);
        if (roleTalk) lines.push('[E] ' + roleTalk);
        // La investigadora puede entrevistarle (una vez al día)
        if (G.interview && G.interview.can(id)) lines.push('[Q] Entrevistar');
        if (hasMission) lines.push('[E] Hablar (encargo)');
        else if (n.vendor) lines.push(G.shopOpen() ? '[E] Comprar' : '[E] Hablar');
        else lines.push('[E] Hablar');
        return { title: name, lines, info: [] };
      },
      act: (key, G) => {
        if (key === 'Q' && G.interview && G.interview.can(id)) return G.interview.start(id);
        if (key !== 'E') return false;
        if (G.roles && G.roles.talkTo(id)) return true;
        if (G.story && G.story.talkTo(id)) return true;
        if (G.missions && G.missions.talkTo(id)) return true;
        if (n.vendor) {
          if (!G.shopOpen()) { G.hud.say(name, `Ya hemos cerrado. Vete ${G.homeTo()} antes de que oscurezca.`); return true; }
          G.openShop(n.vendor);
          return true;
        }
        // Cada vecino te habla según quién seas (guardabosques, investigadora, cazador o alcalde)
        const lines = roleLines(id, G.role) || n.lines;
        if (lines.length) G.hud.say(name, U.pick(lines));
        return true;
      },
    });
    return n;
  }

  build() {
    const c = this.center;
    const W = this.world;

    // Casas cerradas
    this.house(c.x + 14, c.z + 11, 6.5, 5, 'n', MAT.plaster);
    this.house(c.x - 4, c.z + 24, 6, 5, 'n', MAT.logs);

    // ---------- Taberna El Ciervo Blanco ----------
    const tb = this.building({ id: 'taberna', name: 'Taberna', x0: 145, x1: 156, z0: 5, z1: 13, door: { side: 'n', c: 150.5 }, sign: ['CIERVO BLANCO', 'TABERNA'] });
    this.box(146.5, 152.5, 0, 1.1, 10.6, 11.2, MAT.planks, true, 1, { furniture: true });
    this.box(146.5, 152.5, 1.1, 1.18, 10.5, 11.3, MAT.door, false, 1);
    this.box(146, 153, 0.9, 2.2, 12.45, 12.75, MAT.planks, false, 1);
    for (let i = 0; i < 14; i++) {
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 6), new THREE.MeshLambertMaterial({ color: [0x2a5a2a, 0x6a3a1a, 0x8a8a6a][i % 3] }));
      bt.position.set(146.3 + (i % 7) * 0.95, i < 7 ? 1.32 : 1.92, 12.6);
      this.group.add(bt);
    }
    [[148, 7.6], [153.5, 7.6], [153.5, 10.6]].forEach(([x, z]) => {
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), MAT.planks);
      tt.position.set(x, 0.78, z);
      this.group.add(tt);
      this.box(x - 0.05, x + 0.05, 0, 0.75, z - 0.05, z + 0.05, MAT.dark, false, 1);
      W.addBox(x - 0.45, x + 0.45, 0, 0.8, z - 0.45, z + 0.45, { furniture: true, sight: false, bullets: false });
      [[-0.8, 0], [0.8, 0]].forEach(([dx, dz]) => this.box(x + dx - 0.18, x + dx + 0.18, 0, 0.45, z + dz - 0.18, z + dz + 0.18, MAT.planks, false, 1));
    });
    // Cabeza de "ciervo" en la pared
    const trophy = new THREE.Group();
    trophy.add(new THREE.Mesh(boxGeo(0.3, 0.45, 0.2, 1), new THREE.MeshLambertMaterial({ color: 0xc9bfa6 })));
    [-1, 1].forEach((sd) => {
      const a = new THREE.Mesh(boxGeo(0.03, 0.5, 0.03, 1), new THREE.MeshLambertMaterial({ color: 0xc9bfa6 }));
      a.position.set(sd * 0.15, 0.4, 0);
      a.rotation.z = -sd * 0.6;
      trophy.add(a);
    });
    const plaque = new THREE.Mesh(boxGeo(0.5, 0.6, 0.05, 1), MAT.door);
    plaque.position.z = -0.12;
    trophy.add(plaque);
    trophy.position.set(155.62, 2.3, 9);
    trophy.rotation.y = -Math.PI / 2;
    this.group.add(trophy);
    this.npc('tabernero', 'Ramón (tabernero)', { shirt: 0xd8d4c8, pants: 0x2a2a2a, hair: 0x1a1a1a, apron: 0x3a2a1a }, new THREE.Vector3(149.5, 0, 12.0), Math.PI, tb, {
      vendor: 'taberna', r: 1.0,
    });
    this.npc('parroquiano1', 'Parroquiano', { shirt: 0x4a3a2a, pants: 0x2a2a30, hair: 0x6a6a6a, hat: 0x3a2a1a }, new THREE.Vector3(148.8, 0, 7.6), -Math.PI / 2, tb, {
      sit: true, lines: TAVERN_LINES.a,
    });
    this.npc('parroquiano2', 'Parroquiana', { shirt: 0x6a2a4a, pants: 0x2a2a2a, hair: 0x8a5a2a }, new THREE.Vector3(152.7, 0, 7.6), Math.PI / 2, tb, {
      sit: true, lines: TAVERN_LINES.b,
    });

    // ---------- Casa de Remedios (curandera) ----------
    const rm = this.building({ id: 'remedios', name: 'Casa de Remedios', x0: 134, x1: 141.5, z0: 4, z1: 10, door: { side: 'n', c: 138 }, mat: MAT.plaster, sign: ['REMEDIOS', 'HIERBAS Y CURAS'], signColors: ['#1e2a18', '#d8e0b0'] });
    this.box(136.5, 139.5, 0, 0.8, 6.3, 7.2, MAT.planks, true, 1, { furniture: true });
    this.box(134.4, 141.1, 0, 2.0, 9.3, 9.7, MAT.planks, false, 1);
    for (let i = 0; i < 16; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 6), new THREE.MeshLambertMaterial({ color: [0x5a7a3a, 0x8a5a2a, 0x3a5a6a, 0x7a3a3a][i % 4] }));
      jar.position.set(134.7 + (i % 8) * 0.8, i < 8 ? 0.95 : 1.65, 9.5);
      this.group.add(jar);
    }
    for (let i = 0; i < 9; i++) {
      const herb = new THREE.Mesh(boxGeo(0.12, 0.4, 0.12, 1), MAT.needles);
      herb.position.set(135 + i * 0.75, 2.85, 5 + (i % 2) * 0.6);
      this.group.add(herb);
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 8), MAT.dark);
    pot.position.set(140.6, 0.25, 4.9);
    this.group.add(pot);
    this.npc('remedios', 'Remedios (curandera)', { shirt: 0x3a2a3a, pants: 0x3a2a3a, hair: 0xd8d8d8, skin: 0xd0a888, apron: 0x6a5a3a }, new THREE.Vector3(138, 0, 8.3), Math.PI, rm, {
      vendor: 'remedios',
    });

    // ---------- Ayuntamiento ----------
    // Dos plantas: abajo, el salón de plenos; arriba, el despacho del alcalde (homes.js)
    const ay = this.building({ id: 'ayuntamiento', name: 'Ayuntamiento', x0: 164, x1: 172, z0: -16.5, z1: -7.5, h: 6.6, roofH: 2.2, door: { side: 'w', c: -12 }, mat: MAT.stone, sign: ['AYUNTAMIENTO', 'ROBLEDAL'], signColors: ['#d8d0b8', '#2a2018'] });
    this.box(169.2, 170.0, 0, 0.85, -13.6, -10.4, MAT.door, true, 1, { furniture: true });
    // Buzones junto a la puerta, por fuera
    this.box(163.3, 163.8, 0, 1.4, -15.2, -14.4, MAT.metal, false, 1);
    this.box(163.3, 163.8, 0, 1.4, -14.2, -13.4, MAT.metal, false, 1);
    const flag = new THREE.Mesh(boxGeo(0.04, 2.2, 0.04, 1), MAT.metal);
    flag.position.set(171.4, 1.1, -15.6);
    this.group.add(flag);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshLambertMaterial({ color: 0x8a1a1a, side: THREE.DoubleSide }));
    cloth.position.set(171.4, 1.95, -15.25);
    cloth.rotation.y = Math.PI / 2;
    this.group.add(cloth);
    const wanted = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.8), new THREE.MeshLambertMaterial({ map: TEX.poster }));
    wanted.position.set(167.5, 1.6, -7.77);
    wanted.rotation.y = Math.PI;
    this.group.add(wanted);
    this.interactables.push({
      kind: 'board', pos: new THREE.Vector3(167.5, 1.6, -7.85), r: 0.6,
      prompt: () => ({ title: 'Cartel', lines: ['[E] Leer'], info: [] }),
      act: (key, G) => { if (key !== 'E') return false; G.readNote(NOTES.poster); return true; },
    });
    this.npc('alcalde', 'Don Severino (alcalde)', { shirt: 0x2a2a34, pants: 0x1a1a22, hair: 0x9a9a9a, skin: 0xd8a888 }, new THREE.Vector3(171.3, 0, -12), -Math.PI / 2, ay, {
      lines: [
        'El ayuntamiento agradece su labor, guarda. Siga así.',
        'De lo de Tomás no hablamos. Un desgraciado accidente.',
        'Si encuentra algo raro en el bosque, me lo trae a mí. A nadie más.',
      ],
    });

    // ---------- Ferretería de Julián ----------
    const fe = this.building({ id: 'ferreteria', name: 'Ferretería', x0: 132, x1: 139.5, z0: -23.5, z1: -17, door: { side: 's', c: 136 }, sign: ['FERRETERÍA JULIÁN', 'HERRAMIENTAS · ELECTRÓNICA'], signColors: ['#1a2230', '#c8d8e8'] });
    this.box(134, 138.4, 0, 1.05, -20.6, -20.1, MAT.planks, true, 1, { furniture: true });
    this.box(132.4, 132.9, 0, 2.2, -23.1, -17.6, MAT.planks, false, 1);
    this.box(138.6, 139.1, 0, 2.2, -23.1, -21.0, MAT.planks, false, 1);
    for (let i = 0; i < 10; i++) {
      const tool = new THREE.Mesh(boxGeo(0.3, 0.2, 0.25, 1), new THREE.MeshLambertMaterial({ color: [0xb04020, 0x2a5a8a, 0x8a8a2a, 0x5a5a5a][i % 4] }));
      tool.position.set(132.65, 0.7 + (i % 2) * 0.8, -22.6 + Math.floor(i / 2) * 1.1);
      this.group.add(tool);
    }
    const genDisplay = new THREE.Mesh(boxGeo(0.8, 0.5, 0.6, 1), new THREE.MeshLambertMaterial({ color: 0x7a2a1e }));
    genDisplay.position.set(138.6, 0.25, -22.4);
    this.group.add(genDisplay);
    for (let i = 0; i < 3; i++) {
      const cam = new THREE.Mesh(boxGeo(0.14, 0.12, 0.26, 1), new THREE.MeshLambertMaterial({ color: 0xd0d0c8 }));
      cam.position.set(134.6 + i * 0.6, 1.16, -20.35);
      this.group.add(cam);
    }
    this.npc('julian', 'Julián (ferretero)', { shirt: 0x2a4a7a, pants: 0x2a4a7a, hair: 0x5a3a1a, hat: 0xa8a020 }, new THREE.Vector3(136, 0, -21.5), 0, fe, {
      vendor: 'julian', r: 1.0,
    });

    // ---------- Iglesia ----------
    const ch = this.building({ id: 'iglesia', name: 'Iglesia', x0: 165, x1: 173, z0: -29.5, z1: -21.5, door: { side: 'w', c: -25.5 }, h: 5, mat: MAT.stone, roofH: 2.6, floor: MAT.stone });
    for (let r = 0; r < 4; r++) {
      [-27.6, -23.4].forEach((z) => this.box(166.5 + r * 1.4, 167.1 + r * 1.4, 0, 0.5, z - 1.0, z + 1.0, MAT.planks, true, 1, { furniture: true }));
    }
    this.box(171.2, 172.2, 0, 1.0, -26.6, -24.4, MAT.stone, true, 1, { furniture: true });
    const crossV = new THREE.Mesh(boxGeo(0.1, 1.4, 0.1, 1), MAT.door);
    crossV.position.set(172.7, 2.6, -25.5);
    const crossH = new THREE.Mesh(boxGeo(0.1, 0.1, 0.8, 1), MAT.door);
    crossH.position.set(172.7, 2.9, -25.5);
    this.group.add(crossV, crossH);
    const candleMat = new THREE.MeshBasicMaterial({ color: 0xffd070 });
    for (let i = 0; i < 6; i++) {
      const cd = new THREE.Mesh(boxGeo(0.04, 0.16 + (i % 3) * 0.06, 0.04, 1), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
      cd.position.set(171.4 + (i % 2) * 0.6, 1.1, -26.4 + i * 0.36);
      this.group.add(cd);
      const fl = new THREE.Mesh(boxGeo(0.03, 0.05, 0.03, 1), candleMat);
      fl.position.set(cd.position.x, 1.22 + (i % 3) * 0.03, cd.position.z);
      this.group.add(fl);
    }
    // Campanario
    this.box(173, 176.5, 0, 11, -27.5, -23.5, MAT.stone, true, 2);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.7, 3.5, 4), MAT.roof);
    spire.position.set(174.75, 12.75, -25.5);
    spire.rotation.y = Math.PI / 4;
    this.group.add(spire);
    const belfry = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), MAT.black);
    belfry.position.set(176.52, 9.2, -25.5);
    belfry.rotation.y = Math.PI / 2;
    this.group.add(belfry);
    this.bellPos = new THREE.Vector3(174.75, 9.5, -25.5);
    this.npc('cura', 'Padre Elías', { shirt: 0x141414, pants: 0x141414, hair: 0x7a7a7a, skin: 0xd8b090 }, new THREE.Vector3(170.4, 0, -25.5), -Math.PI / 2, ch, {
      lines: [
        'Rezo por usted cada noche, guarda. Por usted y por Tomás.',
        'En el libro de difuntos de esta parroquia hay demasiados guardas forestales.',
        'Dicen que lo que ronda el bosque era un cazador que no supo volver. Yo no lo creo.',
        'Cuando llamen a su puerta de madrugada, pregúntese quién en su sano juicio pasea por ese bosque.',
      ],
    });

    // ---------- Armería / ultramarinos (abierta por delante con mostrador) ----------
    const sx = c.x + 2, sz = c.z - 15;
    const sx0 = sx - 4, sx1 = sx + 4, sz0 = sz - 3.5, sz1 = sz + 3;
    this.box(sx0, sx1, 0, 3.4, sz0, sz0 + 0.25, MAT.logs, true, 1.6);
    this.box(sx0, sx0 + 0.25, 0, 3.4, sz0, sz1, MAT.logs, true, 1.6);
    this.box(sx1 - 0.25, sx1, 0, 3.4, sz0, sz1, MAT.logs, true, 1.6);
    this.box(sx0, sx - 2, 0, 3.4, sz1 - 0.25, sz1, MAT.logs, true, 1.6);
    this.box(sx + 2, sx1, 0, 3.4, sz1 - 0.25, sz1, MAT.logs, true, 1.6);
    this.box(sx - 2, sx + 2, 2.5, 3.4, sz1 - 0.25, sz1, MAT.logs, true, 1.6);
    this.box(sx - 2, sx + 2, 0, 1.05, sz1 - 0.6, sz1 - 0.1, MAT.planks, true, 1);
    this.box(sx0 + 0.25, sx1 - 0.25, -0.05, 0.02, sz0 + 0.25, sz1 - 0.25, MAT.planks, false, 2);
    this.roof(sx, (sz0 + sz1) / 2, 8.6, 7.1, 3.4, 1.6, true);
    this.box(sx0 + 0.3, sx1 - 0.3, 0, 2.2, sz0 + 0.25, sz0 + 0.7, MAT.planks, false, 1);
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(boxGeo(0.35, 0.3, 0.3, 1), new THREE.MeshLambertMaterial({ color: [0x6b4a2a, 0x3d5a3a, 0x7a2a20, 0x2a3a5a][i % 4] }));
      b.position.set(sx0 + 0.8 + (i % 5) * 1.4, i < 5 ? 0.9 : 1.7, sz0 + 0.5);
      this.group.add(b);
    }
    for (let i = 0; i < 3; i++) {
      const gun = new THREE.Mesh(boxGeo(1.1, 0.07, 0.05, 1), MAT.dark);
      gun.position.set(sx - 1.5 + i * 1.5, 2.6, sz0 + 0.3);
      gun.rotation.z = 0.15;
      this.group.add(gun);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshLambertMaterial({ map: TEX.shopSign }));
    sign.position.set(sx, 3.0, sz1 + 0.03);
    this.group.add(sign);
    this.shopPos = new THREE.Vector3(sx, 1.2, sz1 - 0.4);
    const ans = this.npc('anselmo', 'Anselmo (armería)', { shirt: 0x5a4a3a, pants: 0x2a2a2a, hair: 0x9a9a9a, skin: 0xc89878, apron: 0x7a6a50 }, new THREE.Vector3(sx, 0, sz1 - 1.3), 0, null, {
      vendor: 'anselmo', r: 1.4,
    });
    // El mostrador queda entre el jugador y Anselmo: el punto de interacción está en el mostrador
    this.interactables[this.interactables.length - 1].pos = this.shopPos;
    this.shopkeeper = ans.mesh;

    // Tablón de anuncios con el cartel de "SE BUSCA"
    const bx = c.x - 5, bz = c.z - 7;
    this.box(bx - 1.2, bx - 1.1, 0, 2.2, bz - 0.05, bz + 0.05, MAT.planks, true, 1);
    this.box(bx + 1.1, bx + 1.2, 0, 2.2, bz - 0.05, bz + 0.05, MAT.planks, true, 1);
    this.box(bx - 1.1, bx + 1.1, 1.0, 2.1, bz - 0.04, bz + 0.04, MAT.planks, true, 1);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.8), new THREE.MeshLambertMaterial({ map: TEX.poster }));
    poster.position.set(bx - 0.2, 1.55, bz + 0.05);
    this.group.add(poster);
    const poster2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), MAT.paper);
    poster2.position.set(bx + 0.55, 1.45, bz + 0.05);
    poster2.rotation.z = 0.1;
    this.group.add(poster2);
    this.boardPos = new THREE.Vector3(bx, 1.5, bz + 0.1);
    this.interactables.push({
      kind: 'board', pos: this.boardPos, r: 1.0,
      prompt: () => ({ title: 'Tablón de anuncios', lines: ['[E] Leer'], info: [] }),
      act: (key, G) => { if (key !== 'E') return false; G.readNote(NOTES.poster); return true; },
    });

    // Cartel de entrada
    const ex = 132, ez = -6.5;
    this.box(ex - 0.05, ex + 0.05, 0, 1.6, ez - 0.05, ez + 0.05, MAT.planks, false, 1);
    const vs = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshLambertMaterial({ map: TEX.villageSign, side: THREE.DoubleSide }));
    vs.position.set(ex, 1.6, ez);
    vs.rotation.y = Math.PI / 2;
    this.group.add(vs);

    // Farolas (si hay alcalde, las enciende y apaga él desde el mapa del ayuntamiento)
    this.lampOn = new THREE.MeshBasicMaterial({ color: 0xffd08a });
    this.lampOff = new THREE.MeshBasicMaterial({ color: 0x2a2620 });
    this.lampBroken = new THREE.MeshBasicMaterial({ color: 0x120e0c });
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lamps = [
      ['la plaza (fuente)', c.x - 6, c.z + 4], ['la plaza (armería)', c.x + 7, c.z - 3], ['la calle del oeste', c.x - 16, c.z - 2],
      ['la puerta del ayuntamiento', 161.5, -14.6], ['detrás del ayuntamiento', 174.6, -10], ['la iglesia', 162.4, -24.6],
      ['la taberna', 153.6, 2.8], ['la entrada del pueblo', 127, -3],
    ].map(([name, x, z], k) => {
      this.box(x - 0.08, x + 0.08, 0, 3.6, z - 0.08, z + 0.08, MAT.metal, true, 1);
      const arm = new THREE.Mesh(boxGeo(0.5, 0.05, 0.05, 1), MAT.metal);
      arm.position.set(x, 3.55, z);
      this.group.add(arm);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 4), MAT.metal);
      cap.position.set(x, 3.98, z);
      cap.rotation.y = Math.PI / 4;
      this.group.add(cap);
      const head = new THREE.Mesh(boxGeo(0.3, 0.32, 0.3, 1), this.lampOn);
      head.position.set(x, 3.72, z);
      this.group.add(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(1.8, 1.8, 1.8);
      glow.position.set(x, 3.7, z);
      this.group.add(glow);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 18), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.05, z);
      this.group.add(pool);
      return { k, name, pos: new THREE.Vector3(x, 0, z), head, glow, pool, lit: true };
    });
    this.light = new THREE.PointLight(0xffc070, 1.2, 34, 1.3);
    this.light.position.set(c.x, 4.5, c.z);
    this.group.add(this.light);

    // Vecinos en la plaza
    this.npc('vecina', 'Vecina', { shirt: 0x6a2a3a, pants: 0x3a3030, hair: 0xdddddd, skin: 0xd0a080 }, new THREE.Vector3(c.x - 9, 0, c.z + 7.5), 2.6, null, { lines: VILLAGER_LINES.a });
    this.npc('vecino', 'Vecino', { shirt: 0x2f4a2f, pants: 0x303838, hair: 0x2a1a0a, hat: 0x4a3a28 }, new THREE.Vector3(c.x + 9, 0, c.z + 3), -1.9, null, { lines: VILLAGER_LINES.b });
    this.box(c.x - 10, c.x - 8, 0.4, 0.5, c.z + 8, c.z + 8.6, MAT.planks, true, 1);
    return this;
  }

  // ¿Está el jugador dentro de algún local?
  buildingAt(p) {
    return this.buildings.find((b) => b.inside(p)) || null;
  }

  update(dt, G) {
    const night = G.daylight < 0.35;
    // Farolas: solas al anochecer, o como las haya dejado el alcalde
    const ctl = this.lampCtl;
    this.lamps.forEach((l) => {
      const lit = ctl ? night && l.on && !l.broken : night;
      l.lit = lit;
      l.head.material = lit ? this.lampOn : ctl && l.broken ? this.lampBroken : this.lampOff;
      l.glow.visible = lit;
      l.pool.visible = lit;
    });
    this.light.intensity = (ctl ? this.lamps[0].lit || this.lamps[1].lit : night) ? 1.3 : 0.15;
    const open = G.phase === 'day' && G.clock >= CFG.TIME.OPEN && G.clock < CFG.TIME.KICK_OUT;
    // Al cerrar, echan al jugador a la calle
    if (this.isOpen && !open) {
      const b = this.buildingAt(G.player.pos);
      // El alcalde no se va: el ayuntamiento es su casa
      if (b && !(b.homeOverride && G.role === 'mayor')) {
        G.player.pos.copy(b.doorOut);
        G.player.vel.set(0, 0, 0);
        G.hud.say(b.name, G.role === 'mayor' ? 'Cerramos, alcalde. Enciérrese en el ayuntamiento, que se hace de noche.' : `Cerramos. Vete ${G.homeTo()}, que se hace de noche.`);
      }
    }
    this.isOpen = open;
    this.buildings.forEach((b) => {
      // Con alcalde, la puerta del ayuntamiento es la suya (homes.js)
      if (b.homeOverride) { b.lock.solid = false; b.lock.sight = false; return; }
      b.anim += U.clamp((open ? 1 : 0) - b.anim, -dt * 2, dt * 2);
      const ang = b.anim * 1.6 * b.outward;
      b.pivot.rotation.y = b.alongX ? ang : -ang;
      b.lock.solid = b.anim < 0.5;
      b.lock.sight = b.anim < 0.5;
    });
    const p = G.player.pos;
    this.npcs.forEach((n) => {
      // Los de la plaza se van al anochecer; los de los locales, al cerrar
      // away: está sentado en el pleno del ayuntamiento (pleno.js pone allí su doble)
      n.mesh.visible = n.hidden || n.away ? false : n.building || n.id === 'anselmo' ? open : !night && G.clock < CFG.TIME.SHOP_CLOSE && G.phase === 'day';
      if (!n.mesh.visible) return;
      animateHuman(n.mesh, dt, 0, { sit: n.sit });
      if (n.sit) n.mesh.position.y = -0.35;
      const dx = p.x - n.mesh.position.x, dz = p.z - n.mesh.position.z;
      if (dx * dx + dz * dz < 36 && !n.sit) {
        const target = Math.atan2(dx, dz);
        const delta = U.wrapAngle(target - n.baseRot);
        const goal = n.baseRot + U.clamp(delta, -1.2, 1.2);
        n.mesh.rotation.y += U.wrapAngle(goal - n.mesh.rotation.y) * Math.min(1, dt * 3);
      }
    });
  }

  contains(p) {
    return Math.hypot(p.x - this.center.x, p.z - this.center.z) < CFG.WORLD.village.r;
  }
}

const VILLAGER_LINES = {
  a: [
    'Tomás, el guarda de antes, compraba tablones cada semana. Cada semana.',
    'Yo de noche no abro la puerta. Ni aunque llamen por mi nombre.',
    'Los turistas no hacen caso. Se meten en el bosque y luego hay que ir a buscarlos.',
    '¿Tú también oyes pasos en el tejado? No, claro. Tú vives más lejos...',
  ],
  b: [
    'Anselmo cierra a las siete y media. Ni un minuto más.',
    'Si ves luces rojas entre los árboles, no son luciérnagas.',
    'El ayuntamiento paga por cada excursionista que devuelvas sano. Algo es algo.',
    'Echa los pestillos. Todos. Y vuelve a comprobarlos.',
  ],
};

const TAVERN_LINES = {
  a: [
    'Paco dice que anoche fue a pedir ayuda a tu cabaña y no le abriste. ¿Seguro que era Paco?',
    'Los de verdad llevan farol. Lo otro no necesita luz para ver.',
    'Ese generador tuyo se oye desde el camino. Igual que se oye desde el bosque.',
  ],
  b: [
    'Mi primo puso cámaras en su granja. En la grabación de la noche solo se veían dos puntos rojos.',
    'Si alguien llama a tu puerta de madrugada, mira primero por la ventana. Siempre.',
    'Remedios sabe más de lo que cuenta. Llévale setas y a lo mejor te cuenta algo.',
  ],
};
