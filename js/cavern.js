'use strict';

// La guarida del monstruo (multijugador): una cueva enorme bajo el bosque.
// De día, el monstruo se hace más fuerte con seis actividades; cada una sube un nivel
// y solo se puede hacer una vez al día. De noche sale a la superficie por tres túneles.
const CAVE = { x: -60, y: -40, z: 60, hx: 22, hz: 18, h: 10 };

const MON_STATS = {
  garras: { name: 'Garras', desc: 'Fuerzas pestillos, tablones y trampillas más deprisa. Desde el nivel 1 trepas al tejado.' },
  velocidad: { name: 'Velocidad', desc: 'Corres más y te cansas menos.' },
  resistencia: { name: 'Resistencia', desc: '+50 de vida por nivel.' },
  rugido: { name: 'Rugido', key: 'Q', desc: 'Apaga su linterna y las luces de la cabaña.' },
  olfato: { name: 'Olfato', key: 'V', desc: 'Hueles al guardabosques a través de las paredes.' },
  voces: { name: 'Voces', key: 'R', desc: 'Llamas a su puerta con voz humana.' },
};
const MON_STAT_KEYS = ['garras', 'velocidad', 'resistencia', 'rugido', 'olfato', 'voces'];

// Salidas a la superficie (solo de noche)
const CAVE_EXITS = [
  { name: 'la guarida', x: -69, z: -83 },
  { name: 'el pozo viejo', x: -35.6, z: -43.8 },
  { name: 'el campamento', x: 34.5, z: 55.5 },
];

class Cavern {
  constructor(G) {
    this.G = G;
    this.levels = { garras: 0, velocidad: 0, resistencia: 0, rugido: 0, olfato: 0, voces: 0 };
    this.done = {};
    this.act = null;
    this.bones = [];
    this.carried = 0;
    this.offered = 0;
    this.rats = [];
    this.dripT = 2;
    this.group = new THREE.Group();
    this.surface = new THREE.Group();
    G.scene.add(this.group, this.surface);
    this.build();
    this.buildSurface();
    this.setVisible(false, false);
  }

  P(x, y, z) { return new THREE.Vector3(CAVE.x + x, CAVE.y + y, CAVE.z + z); }

  setVisible(inside, surface) {
    this.group.visible = inside;
    this.surface.visible = surface;
  }

  // Luces de la cueva: solo las crea quien juega de monstruo (al otro no le hacen falta)
  addLights() {
    if (this.lights) return;
    this.lights = [
      [0x40e0b0, 0, 6, -10], [0x40e0b0, -15, 4, 2], [0xff8a40, 15, 5, -10], [0x40e0b0, -16, 4, -12],
      [0xff8a40, 0, 5, 12], [0xff8a40, 18, 4, 6], [0x40e0b0, -18, 4, 12],
    ].map(([c, x, y, z]) => {
      const l = new THREE.PointLight(c, 0.9, 22, 1.2);
      l.position.copy(this.P(x, y, z));
      this.group.add(l);
      return l;
    });
  }

  removeLights() {
    if (!this.lights) return;
    this.lights.forEach((l) => this.group.remove(l));
    this.lights = null;
  }

  // ---------- Construcción ----------
  build() {
    const W = this.G.world;
    const g = this.group;
    const rnd = U.mulberry32(4711);
    const R = (a, b) => a + rnd() * (b - a);
    const { x: CX, y: CY, z: CZ, hx: HX, hz: HZ, h: H } = CAVE;
    const rock = new THREE.MeshLambertMaterial({ map: TEX.stone, color: 0xa08a78, flatShading: true });
    const rockDark = new THREE.MeshLambertMaterial({ map: TEX.stone, color: 0x7a6858, flatShading: true });
    const bone = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 });
    this.boneMat = bone;
    const add = (m, x, y, z) => { m.position.set(CX + x, CY + y, CZ + z); g.add(m); return m; };

    // Suelo, techo y paredes
    const plane = (w, d, mat, y, down) => {
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * d / 4);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
      return add(m, 0, y, 0);
    };
    plane(HX * 2 + 6, HZ * 2 + 6, new THREE.MeshLambertMaterial({ map: TEX.dirt, color: 0x9a8068 }), 0, false);
    plane(HX * 2 + 6, HZ * 2 + 6, rockDark, H, true);
    W.addFloor(CX - HX - 3, CX + HX + 3, CZ - HZ - 3, CZ + HZ + 3, CY);
    const wall = (x0, x1, z0, z1) => {
      add(new THREE.Mesh(boxGeo(x1 - x0, H, z1 - z0, 3), rockDark), (x0 + x1) / 2, H / 2, (z0 + z1) / 2);
      W.addBox(CX + x0, CX + x1, CY, CY + H, CZ + z0, CZ + z1);
    };
    wall(-HX - 2, HX + 2, -HZ - 2, -HZ);
    wall(-HX - 2, HX + 2, HZ, HZ + 2);
    wall(-HX - 2, -HX, -HZ, HZ);
    wall(HX, HX + 2, -HZ, HZ);

    // Zonas que hay que dejar libres (estaciones y túneles)
    this.tunnelX = [-10, 0, 10];
    const keep = [
      { x: 0, z: -HZ, r: 4 }, { x: HX, z: -4, r: 4 }, { x: -HX, z: 10, r: 7 }, { x: 15, z: -12, r: 4 },
      { x: -16, z: -12, r: 4 }, { x: -15, z: 2, r: 6 }, { x: 15, z: 11, r: 4 },
      ...this.tunnelX.map((x) => ({ x, z: HZ, r: 3.2 })),
    ];
    const free = (x, z, pad = 0) => keep.every((k) => Math.hypot(k.x - x, k.z - z) > k.r + pad);
    const blobGeo = new THREE.DodecahedronGeometry(1, 0);
    const blob = (x, z, s, y) => {
      const m = new THREE.Mesh(blobGeo, rnd() < 0.5 ? rock : rockDark);
      m.scale.set(s * R(0.8, 1.3), s * R(0.9, 1.6), s * R(0.8, 1.3));
      m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      return add(m, x, y, z);
    };
    // Rocas que rompen las paredes rectas
    const edge = (x, z) => {
      const s = R(1.3, 2.3);
      if (free(x, z, s)) {
        blob(x, z, s, R(0, 1.2));
        W.addCircle(CX + x, CZ + z, s * 0.95, H, CY);
      }
      blob(x, z, R(1.5, 2.6), R(3.5, H - 0.5));
    };
    for (let x = -HX; x <= HX; x += R(3.2, 4.6)) { edge(x, -HZ); edge(x, HZ); }
    for (let z = -HZ + 3; z <= HZ - 3; z += R(3.2, 4.6)) { edge(-HX, z); edge(HX, z); }

    // Columnas de roca
    [[-6, -5, 1.5], [6, 3, 1.3], [-3, 9, 1.1], [5, -8, 1.2], [-11, -2, 1.0]].forEach(([x, z, r]) => {
      add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 1.25, H, 7), rock), x, H / 2, z);
      W.addCircle(CX + x, CZ + z, r * 1.1, H, CY);
    });
    // Estalactitas y estalagmitas
    for (let i = 0; i < 70; i++) {
      const x = R(-HX + 1, HX - 1), z = R(-HZ + 1, HZ - 1);
      const len = R(0.8, 3.2);
      const c = new THREE.Mesh(new THREE.ConeGeometry(R(0.2, 0.55), len, 5), rnd() < 0.5 ? rock : rockDark);
      c.rotation.x = Math.PI;
      add(c, x, H - len / 2, z);
    }
    for (let i = 0; i < 22; i++) {
      const x = R(-HX + 2, HX - 2), z = R(-HZ + 2, HZ - 2);
      if (!free(x, z, 1) || Math.hypot(x, z) < 4) continue;
      const len = R(0.6, 1.8), r = R(0.25, 0.5);
      add(new THREE.Mesh(new THREE.ConeGeometry(r, len, 5), rock), x, len / 2, z);
      W.addCircle(CX + x, CZ + z, r * 0.9, len, CY);
    }
    // Hongos que brillan
    const fungA = new THREE.MeshBasicMaterial({ color: 0x3fd8a8 });
    const fungB = new THREE.MeshBasicMaterial({ color: 0x9cffd8 });
    const capGeo = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 46; i++) {
      const side = i % 4;
      let x = side < 2 ? R(-HX + 1, HX - 1) : (side === 2 ? -HX + R(0.6, 2) : HX - R(0.6, 2));
      let z = side >= 2 ? R(-HZ + 1, HZ - 1) : (side === 0 ? -HZ + R(0.6, 2) : HZ - R(0.6, 2));
      if (i > 36) { x = R(-HX + 3, HX - 3); z = R(-HZ + 3, HZ - 3); }
      for (let k = 0; k < 4; k++) {
        const cap = new THREE.Mesh(capGeo, rnd() < 0.6 ? fungA : fungB);
        const s = R(0.07, 0.2);
        cap.scale.set(s, s * 0.7, s);
        add(cap, x + R(-0.4, 0.4), R(0, 0.05), z + R(-0.4, 0.4));
      }
    }

    // Lecho del monstruo (punto de aparición)
    this.bedPos = this.P(15, 0, 11);
    const nest = new THREE.Mesh(new THREE.CircleGeometry(2.2, 10), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
    nest.rotation.x = -Math.PI / 2;
    add(nest, 15, 0.02, 11);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(boxGeo(0.07, 0.07, R(0.3, 0.7), 1), bone);
      b.rotation.set(0, R(0, 6), R(-0.3, 0.3));
      add(b, 15 + Math.cos(i * 2.1) * R(0.6, 2.2), 0.06, 11 + Math.sin(i * 2.1) * R(0.6, 2.2));
    }

    // Túneles a la superficie (pared sur)
    this.tunnels = this.tunnelX.map((x, i) => {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.2), MAT.black);
      hole.rotation.y = Math.PI;
      add(hole, x, 2.1, HZ - 0.05);
      blob(x - 2.1, HZ - 0.4, 1.3, 1.2);
      blob(x + 2.1, HZ - 0.4, 1.3, 1.4);
      blob(x, HZ + 0.6, 1.5, 5.2);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: this.labelTex(CAVE_EXITS[i].name.toUpperCase()), transparent: true, depthWrite: false }));
      sign.rotation.y = Math.PI;
      add(sign, x, 4.6, HZ - 2.2);
      return { idx: i, pos: this.P(x, 1.5, HZ - 0.8), exit: CAVE_EXITS[i] };
    });

    this.buildStations(add, rock, rockDark, bone, R);
  }

  labelTex(text) {
    return makeTex(256, 64, (gx, w, h) => {
      gx.clearRect(0, 0, w, h);
      gx.font = 'bold 34px serif';
      gx.textAlign = 'center';
      gx.textBaseline = 'middle';
      gx.fillStyle = 'rgba(255,170,120,0.85)';
      gx.fillText(text, w / 2, h / 2);
    }, { clamp: true });
  }

  buildStations(add, rock, rockDark, bone, R) {
    const { hx: HX, hz: HZ } = CAVE;
    const W = this.G.world;
    const C = (x, z) => ({ x: CAVE.x + x, z: CAVE.z + z });

    // 1. Altar de huesos (resistencia)
    add(new THREE.Mesh(boxGeo(2.6, 1.0, 1.3, 2), rockDark), 0, 0.5, -HZ + 1.6);
    const ac = C(0, -HZ + 1.6);
    W.addBox(ac.x - 1.3, ac.x + 1.3, CAVE.y, CAVE.y + 1.0, ac.z - 0.65, ac.z + 0.65);
    const sk = makeDeerSkull();
    sk.scale.setScalar(2);
    add(sk, 0, 1.0, -HZ + 1.4);
    this.altarBones = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(boxGeo(0.08, 0.08, 0.5, 1), bone);
      b.rotation.y = 0.4 + i * 0.5;
      add(b, -1.0 + (i % 3) * 0.3 + (i > 2 ? 1.4 : 0), 1.04 + Math.floor((i % 3) / 2) * 0.08, -HZ + 1.8 + (i % 2) * 0.2);
      b.visible = false;
      this.altarBones.push(b);
    }

    // 2. Piedra de afilar (garras)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 14), rock);
    wheel.rotation.z = Math.PI / 2;
    add(wheel, HX - 2.2, 1.4, -4);
    this.wheel = wheel;
    add(new THREE.Mesh(boxGeo(0.3, 1.4, 0.3, 1), rockDark), HX - 2.2, 0.6, -5.0);
    add(new THREE.Mesh(boxGeo(0.3, 1.4, 0.3, 1), rockDark), HX - 2.2, 0.6, -3.0);
    const wc = C(HX - 2.2, -4);
    W.addBox(wc.x - 0.4, wc.x + 0.4, CAVE.y, CAVE.y + 2.6, wc.z - 1.3, wc.z + 1.3);

    // 3. Estanque negro (velocidad)
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4.3, 22), new THREE.MeshLambertMaterial({ color: 0x0a1414, emissive: 0x031010 }));
    pond.rotation.x = -Math.PI / 2;
    add(pond, -15, 0.03, 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(R(0.25, 0.5), 0), rock);
      add(r, -15 + Math.cos(a) * 4.5, 0.1, 2 + Math.sin(a) * 4.5);
    }
    const glow = (color, s) => new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.wisp = glow(0x80ffe0);
    this.wisp.scale.set(1.6, 1.6, 1.6);
    this.wisp.visible = false;
    this.group.add(this.wisp);
    this.wispCore = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xd8fff4 }));
    this.wisp.add(this.wispCore);
    this.wispSpots = [
      [-18, -15], [-6, -15], [9, -14], [19, -14], [19, 4], [18, 15], [5, 14], [-6, 14], [-19, 15], [-19, -6],
      [-8, -9], [1, -3], [10, 0], [-1, 5], [11, 8], [-9, 7],
    ];

    // 4. Tótem del rugido (rugido)
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.2, 6), new THREE.MeshLambertMaterial({ map: TEX.deadbark })), 15, 2.1, -12);
    const tc = C(15, -12);
    W.addCircle(tc.x, tc.z, 0.5, 4.2, CAVE.y);
    [1.4, 2.4, 3.4, 4.3].forEach((y, i) => {
      const s = makeDeerSkull();
      s.rotation.y = i * 1.6;
      s.scale.setScalar(1.3);
      add(s, 15, y, -12);
    });
    this.totemTop = this.P(15, 3.4, -12);
    this.eye = glow(0xff3020);
    this.eye.scale.set(0.9, 0.9, 0.9);
    this.eye.visible = false;
    this.group.add(this.eye);
    this.eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff6040 })));

    // 5. Nido de raíces (olfato)
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 10), MAT.black);
    hole.rotation.x = -Math.PI / 2;
    add(hole, -16, 0.03, -12);
    const rootMat = new THREE.MeshLambertMaterial({ map: TEX.deadbark, color: 0x6a5040 });
    for (let i = 0; i < 16; i++) {
      const rt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, R(1.5, 3.5), 5), rootMat);
      rt.rotation.set(R(-1.2, 1.2), R(0, 6), R(-1.2, 1.2));
      add(rt, -16 + R(-1.6, 1.6), R(0.3, 1.4), -12 + R(-1.6, 1.6));
    }
    this.ratMat = new THREE.MeshLambertMaterial({ color: 0x3a3430 });

    // 6. Muro de las voces (voces): cuatro bocas de piedra
    this.faceMats = [];
    this.faces = [6, 8.8, 11.6, 14.4].map((z, i) => {
      const plate = new THREE.Mesh(boxGeo(0.3, 1.5, 1.2, 1), rock);
      add(plate, -HX + 0.15, 1.7, z);
      const m = new THREE.MeshBasicMaterial({ color: 0x1a0c08 });
      this.faceMats.push(m);
      [-0.22, 0.22].forEach((dz) => {
        const e = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), m);
        e.rotation.y = Math.PI / 2;
        add(e, -HX + 0.32, 2.05, z + dz);
      });
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), m);
      mouth.scale.set(1, 1.6, 1);
      mouth.rotation.y = Math.PI / 2;
      add(mouth, -HX + 0.32, 1.45, z);
      return { idx: i, pos: this.P(-HX + 0.4, 1.7, z), lit: 0 };
    });

    this.stations = [
      { id: 'altar', stat: 'resistencia', name: 'Altar de huesos', verb: 'Ofrecer huesos', pos: this.P(0, 1.2, -HZ + 2.4), icon: '☠' },
      { id: 'piedra', stat: 'garras', name: 'Piedra de afilar', verb: 'Afilarte las garras', pos: this.P(HX - 3.2, 1.4, -4), icon: '⚒' },
      { id: 'estanque', stat: 'velocidad', name: 'Estanque negro', verb: 'Perseguir los fuegos fatuos', pos: this.P(-15, 0.4, 2), icon: '≈' },
      { id: 'totem', stat: 'rugido', name: 'Tótem del rugido', verb: 'Rugir ante el tótem', pos: this.P(15, 1.6, -11), icon: '♆' },
      { id: 'nido', stat: 'olfato', name: 'Nido de raíces', verb: 'Despertar a las ratas', pos: this.P(-16, 0.6, -12), icon: '✺' },
      { id: 'voces', stat: 'voces', name: 'Muro de las voces', verb: 'Escuchar a las bocas', pos: this.P(-HX + 1.5, 1.6, 10.2), icon: '☊' },
    ];
    this.stationById = {};
    this.stations.forEach((s) => (this.stationById[s.id] = s));

    this.boneSpots = [
      [-18, -9], [-12, -16], [-2, -11], [7, -16], [12, -6], [20, -10], [20, 8], [8, 16], [-3, 15], [-13, 15],
      [-20, 3], [-8, 3], [3, 9], [9, -2], [-1, -6], [-13, 9],
    ];
    const boneGeo = boxGeo(0.07, 0.07, 0.42, 1);
    this.bones = this.boneSpots.map(([x, z]) => {
      const grp = new THREE.Group();
      [0, 1.3].forEach((r, k) => {
        const b = new THREE.Mesh(boneGeo, bone);
        b.rotation.y = r;
        b.position.set(k * 0.08, 0.04, 0);
        grp.add(b);
      });
      grp.add(glintSprite(0xfff0c0, 0.45, 0.2));
      add(grp, x, 0, z);
      grp.visible = false;
      return { mesh: grp, pos: this.P(x, 0.25, z), active: false };
    });
  }

  // Madrigueras en el bosque (las ven los dos jugadores)
  buildSurface() {
    const rockMat = new THREE.MeshLambertMaterial({ map: TEX.stone, color: 0x5a5048, flatShading: true });
    const rootMat = new THREE.MeshLambertMaterial({ map: TEX.deadbark, color: 0x5a4434 });
    CAVE_EXITS.forEach((e, i) => {
      if (i === 1) return; // por el pozo sale tal cual
      const hole = new THREE.Mesh(new THREE.CircleGeometry(1.15, 10), MAT.black);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(e.x, 0.03, e.z);
      this.surface.add(hole);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + (k % 3) * 0.12, 0), rockMat);
        r.position.set(e.x + Math.cos(a) * 1.35, 0.1, e.z + Math.sin(a) * 1.35);
        r.rotation.set(k, k * 2, 0);
        this.surface.add(r);
      }
      for (let k = 0; k < 4; k++) {
        const rt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 1.6, 5), rootMat);
        rt.position.set(e.x + Math.cos(k * 1.7) * 0.9, 0.2, e.z + Math.sin(k * 1.7) * 0.9);
        rt.rotation.set(1.2, k * 1.7, 0.3);
        this.surface.add(rt);
      }
    });
    this.burrows = CAVE_EXITS.map((e, i) => ({ idx: i, exit: e, pos: new THREE.Vector3(e.x, 0.6, e.z) }));
  }

  // Punto de salida junto a una madriguera, mirando hacia la cabaña
  exitSpot(i) {
    const e = CAVE_EXITS[i];
    const d = Math.hypot(e.x, e.z);
    return { x: e.x - (e.x / d) * 1.8, z: e.z - (e.z / d) * 1.8, yaw: Math.atan2(e.x, e.z) };
  }

  // ---------- Día nuevo ----------
  newDay() {
    this.cancel(null);
    this.done = {};
    this.carried = 0;
    this.offered = 0;
    this.bones.forEach((b) => { b.active = false; b.mesh.visible = false; });
    if (this.levels.resistencia < 3) {
      const idx = this.boneSpots.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 6);
      idx.forEach((i) => { this.bones[i].active = true; this.bones[i].mesh.visible = true; });
    }
    this.altarBones.forEach((b) => (b.visible = false));
  }

  available(st) {
    return this.levels[st.stat] < 3 && !this.done[st.id];
  }

  levelUp(stat, stationId) {
    const G = this.G;
    this.cancel(null);
    this.levels[stat] = Math.min(3, this.levels[stat] + 1);
    this.done[stationId] = true;
    SFX.roar(null, 0.8);
    const info = MON_STATS[stat];
    G.hud.banner(`${info.name.toUpperCase()} · NIVEL ${this.levels[stat]}`, info.desc + (info.key ? ` (tecla ${info.key})` : ''), 5);
    if (G.mp) G.mp.applyMonsterStats();
  }

  cancel(why) {
    if (!this.act) return;
    const id = this.act.id;
    this.act = null;
    this.hideMini();
    this.rats.forEach((r) => this.group.remove(r.mesh));
    this.rats = [];
    this.wisp.visible = false;
    this.eye.visible = false;
    this.faceMats.forEach((m) => m.color.set(0x1a0c08));
    if (why) this.G.hud.msg(why, 5);
    return id;
  }

  // ---------- Interacción ----------
  get interactables() {
    const out = [];
    this.stations.forEach((st) => out.push(this.stationInter(st)));
    this.bones.forEach((b) => {
      if (!b.active) return;
      out.push({
        kind: 'bone', pos: b.pos, r: 0.55,
        prompt: () => ({ title: 'Hueso', lines: ['[E] Cogerlo'], info: ['Llévalos al Altar de huesos'] }),
        act: (key) => {
          if (key !== 'E') return false;
          b.active = false;
          b.mesh.visible = false;
          this.carried++;
          SFX.pickup();
          const left = this.bones.filter((x) => x.active).length;
          this.G.hud.msg(`Llevas ${this.carried} ${this.carried === 1 ? 'hueso' : 'huesos'}${left ? ` · quedan ${left} por la cueva` : ' · llévalos al altar'}`);
          return true;
        },
      });
    });
    if (this.act && this.act.id === 'voces' && this.act.phase === 'input') {
      this.faces.forEach((f) => out.push({
        kind: 'face', pos: f.pos, r: 0.6,
        prompt: () => ({ title: `Boca ${f.idx + 1}`, lines: ['[E] Tocarla'], info: [`Repite la secuencia (${this.act.input}/${this.act.seq.length})`] }),
        act: (key) => key === 'E' && this.touchFace(f.idx),
      }));
    }
    this.tunnels.forEach((t) => out.push({
      kind: 'tunnel', pos: t.pos, r: 1.5,
      prompt: (G) => {
        const night = G.phase === 'night';
        const lines = [];
        const info = [];
        if (!night) {
          lines.push('Aún es de día');
          info.push('Los túneles se abren al caer la noche (20:00)');
        } else if (G.mp && G.mp.downT > 0) {
          lines.push(`Aún estás demasiado débil (${Math.ceil(G.mp.downT)} s)`);
        } else lines.push(`[E] Salir junto a ${t.exit.name}`);
        return { title: `Túnel: ${t.exit.name}`, lines, info };
      },
      act: (key, G) => {
        if (key !== 'E') return false;
        if (G.phase !== 'night') { G.hud.msg('La luz del día te quemaría. Espera a las 20:00.'); return true; }
        if (G.mp && G.mp.downT > 0) { G.hud.msg('Todavía te estás recuperando.'); return true; }
        if (G.mp) G.mp.emerge(t.idx);
        return true;
      },
    }));
    return out;
  }

  stationInter(st) {
    return {
      kind: 'station', pos: st.pos, r: 1.3,
      prompt: () => {
        const stat = MON_STATS[st.stat];
        const lv = this.levels[st.stat];
        const lines = [];
        const info = [`${stat.name}: nivel ${lv}/3${stat.key ? ` · tecla ${stat.key}` : ''}`, stat.desc];
        if (lv >= 3) lines.push('Ya está al máximo');
        else if (this.done[st.id]) lines.push('Ya lo has hecho hoy. Vuelve mañana.');
        else if (st.id === 'altar') {
          lines.push(this.carried ? `[E] Ofrecer ${this.carried} ${this.carried === 1 ? 'hueso' : 'huesos'}` : 'Busca huesos por la cueva');
          info.unshift(`Ofrenda: ${this.offered}/6`);
        } else if (this.act && this.act.id === st.id) lines.push(this.actLine());
        else if (this.act) lines.push('Termina antes lo que estás haciendo');
        else lines.push('[E] ' + st.verb);
        return { title: st.name, lines, info };
      },
      act: (key) => key === 'E' && this.useStation(st),
    };
  }

  actLine() {
    const a = this.act;
    if (!a) return '';
    if (a.id === 'piedra') return '[E / clic] Golpear cuando la aguja esté en la zona roja';
    if (a.id === 'totem') return '[Mantén E] Ruge mirando al ojo que gira';
    if (a.id === 'estanque') return `Atrapa los fuegos fatuos (${a.i}/${a.n})`;
    if (a.id === 'nido') return `Caza ratas a zarpazos (${a.caught}/5)`;
    if (a.id === 'voces') return a.phase === 'show' ? 'Escucha...' : 'Toca las bocas en el mismo orden';
    return '';
  }

  useStation(st) {
    const G = this.G;
    if (!this.available(st)) return true;
    if (st.id === 'altar') {
      if (!this.carried) { G.hud.msg('El altar pide huesos. Están tirados por la cueva.'); return true; }
      this.offered = Math.min(6, this.offered + this.carried);
      this.carried = 0;
      this.altarBones.forEach((b, i) => (b.visible = i < this.offered));
      SFX.woodCrack(st.pos, 0.4);
      if (this.offered >= 6) this.levelUp('resistencia', 'altar');
      else G.hud.msg(`Ofrenda: ${this.offered}/6 huesos`);
      return true;
    }
    if (this.act) {
      if (this.act.id === st.id && st.id === 'piedra') this.strike();
      return true;
    }
    const lv = this.levels[st.stat];
    if (st.id === 'piedra') {
      this.act = { id: 'piedra', x: 0, dir: 1, speed: 0.9 + lv * 0.25, w: 0.2 - lv * 0.03, hits: 0, fails: 0, cool: 0 };
      this.newZone();
      this.showMini('PIEDRA DE AFILAR');
      G.hud.msg('Golpea (E o clic) cuando la aguja pase por la zona roja. 6 aciertos; 3 fallos y se te mella una uña.', 6);
    } else if (st.id === 'estanque') {
      const spots = this.wispSpots.slice().sort(() => Math.random() - 0.5).slice(0, 8);
      this.act = { id: 'estanque', i: 0, n: 8, t: 46 - lv * 3, spots };
      this.placeWisp();
      SFX.chime(this.wisp.position, 1, 0.6);
      G.hud.msg(`Los fuegos fatuos huyen por la cueva. Atrapa los 8 antes de ${this.act.t} segundos.`, 6);
    } else if (st.id === 'totem') {
      this.act = { id: 'totem', p: 0, a: 0, growlT: 0 };
      this.eye.visible = true;
      this.showMini('TÓTEM DEL RUGIDO');
      G.hud.msg('Mantén E para rugir y no pierdas de vista el ojo rojo que gira alrededor del tótem.', 6);
    } else if (st.id === 'nido') {
      this.act = { id: 'nido', caught: 0, t: 75 };
      for (let i = 0; i < 6; i++) this.spawnRat(i);
      SFX.squeak(st.pos);
      G.hud.msg('Salen ratas del nido. Caza 5 a zarpazos (clic) antes de que se escondan.', 6);
    } else if (st.id === 'voces') {
      this.act = { id: 'voces', round: 0, lens: [3, 4, 5].map((n) => n + Math.min(lv, 1)), phase: 'show', seq: [], i: 0, t: 1.0, input: 0 };
      this.newSequence();
      G.hud.msg('Las bocas susurran en orden. Cuando callen, tócalas (E) en el mismo orden.', 6);
    }
    return true;
  }

  // ---------- Piedra de afilar ----------
  newZone() {
    const a = this.act;
    a.z0 = U.range(0.08, 0.92 - a.w);
    a.z1 = a.z0 + a.w;
  }

  strike() {
    const a = this.act;
    if (!a || a.id !== 'piedra' || a.cool > 0) return;
    a.cool = 0.25;
    const st = this.stationById.piedra;
    if (a.x >= a.z0 && a.x <= a.z1) {
      a.hits++;
      SFX.spark(st.pos, true);
      this.G.weapons.swipe();
      if (a.hits >= 6) { this.levelUp('garras', 'piedra'); return; }
      this.newZone();
      a.speed *= 1.08;
    } else {
      a.fails++;
      SFX.spark(st.pos, false);
      if (a.fails >= 3) this.cancel('Se te ha mellado una uña. Vuelve a intentarlo.');
    }
  }

  showMini(title) {
    const el = document.getElementById('mon-mini');
    el.classList.remove('hidden');
    document.getElementById('mm-title').textContent = title;
  }

  hideMini() { document.getElementById('mon-mini').classList.add('hidden'); }

  // ---------- Estanque: fuegos fatuos ----------
  placeWisp() {
    const a = this.act;
    const [x, z] = a.spots[a.i];
    this.wisp.position.copy(this.P(x, 1.3, z));
    this.wisp.visible = true;
  }

  // ---------- Nido: ratas ----------
  spawnRat(i) {
    const m = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(0.14, 0.11, 0.3, 1), this.ratMat);
    body.position.y = 0.07;
    m.add(body);
    const head = new THREE.Mesh(boxGeo(0.09, 0.08, 0.1, 1), this.ratMat);
    head.position.set(0, 0.08, 0.19);
    m.add(head);
    const tail = new THREE.Mesh(boxGeo(0.02, 0.02, 0.3, 1), new THREE.MeshLambertMaterial({ color: 0x8a6a60 }));
    tail.position.set(0, 0.05, -0.3);
    m.add(tail);
    const st = this.stationById.nido;
    const a = (i / 6) * Math.PI * 2;
    const pos = new THREE.Vector3(st.pos.x + Math.cos(a) * 1.2, CAVE.y, st.pos.z + Math.sin(a) * 1.2);
    m.position.copy(pos);
    this.group.add(m);
    this.rats.push({ mesh: m, pos, dir: a, wanderT: 0, target: null, squeakT: U.range(1, 4) });
  }

  updateRats(dt) {
    const P = this.G.player;
    const W = this.G.world;
    this.rats.forEach((r) => {
      const dx = r.pos.x - P.pos.x, dz = r.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      let vx, vz, sp;
      if (d < 7) {
        // Huye, con algún quiebro
        const side = Math.sin(performance.now() * 0.004 + r.dir * 5) * 0.8;
        vx = dx / d + (-dz / d) * side;
        vz = dz / d + (dx / d) * side;
        sp = d < 2.5 ? 4.6 : 3.9;
      } else {
        r.wanderT -= dt;
        if (r.wanderT <= 0 || !r.target) {
          r.wanderT = U.range(1.5, 4);
          r.target = this.P(U.range(-CAVE.hx + 2, CAVE.hx - 2), 0, U.range(-CAVE.hz + 2, CAVE.hz - 2));
        }
        vx = r.target.x - r.pos.x;
        vz = r.target.z - r.pos.z;
        sp = 1.4;
      }
      const l = Math.hypot(vx, vz) || 1;
      r.pos.x += (vx / l) * sp * dt;
      r.pos.z += (vz / l) * sp * dt;
      W.collide(r.pos, 0.18, CAVE.y, 0.3);
      r.mesh.position.set(r.pos.x, CAVE.y + Math.abs(Math.sin(performance.now() * 0.03 + r.dir)) * 0.03, r.pos.z);
      r.mesh.rotation.y = Math.atan2(vx, vz);
      r.squeakT -= dt;
      if (r.squeakT <= 0) { r.squeakT = U.range(2, 5); if (d < 18) SFX.squeak(r.pos); }
    });
  }

  // Zarpazo: ¿ha cazado alguna rata?
  claw() {
    const a = this.act;
    if (!a || a.id !== 'nido') return false;
    const P = this.G.player;
    const f = P.forward();
    const fl = Math.hypot(f.x, f.z) || 1;
    for (let i = 0; i < this.rats.length; i++) {
      const r = this.rats[i];
      const dx = r.pos.x - P.pos.x, dz = r.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.1 && (dx * f.x + dz * f.z) / (fl * (d || 1)) > 0.35) {
        SFX.squeak(r.pos);
        this.group.remove(r.mesh);
        this.rats.splice(i, 1);
        a.caught++;
        if (a.caught >= 5) this.levelUp('olfato', 'nido');
        else this.G.hud.msg(`Rata cazada (${a.caught}/5)`);
        return true;
      }
    }
    return false;
  }

  // ---------- Muro de las voces ----------
  newSequence() {
    const a = this.act;
    const n = a.lens[a.round];
    a.seq = [];
    for (let i = 0; i < n; i++) {
      let k;
      do { k = U.irange(0, 3); } while (i > 0 && k === a.seq[i - 1]);
      a.seq.push(k);
    }
    a.phase = 'show';
    a.i = 0;
    a.t = 1.0;
    a.input = 0;
  }

  lightFace(i, t = 0.55) {
    this.faces[i].lit = t;
    SFX.chime(this.faces[i].pos, [0.75, 0.9, 1.06, 1.26][i], 0.55);
  }

  touchFace(i) {
    const a = this.act;
    if (!a || a.id !== 'voces' || a.phase !== 'input') return true;
    if (a.seq[a.input] !== i) {
      SFX.scream(this.faces[i].pos, 0.35);
      this.G.hud.msg('Las bocas se ríen de ti. Escucha otra vez.', 4);
      a.phase = 'wait';
      a.t = 1.6;
      return true;
    }
    this.lightFace(i, 0.35);
    a.input++;
    if (a.input >= a.seq.length) {
      a.round++;
      if (a.round >= a.lens.length) { this.levelUp('voces', 'voces'); return true; }
      this.G.hud.msg(`Bien. Ronda ${a.round + 1} de ${a.lens.length}.`);
      a.phase = 'wait';
      a.t = 1.2;
      a.next = true;
    }
    return true;
  }

  // ---------- Bucle ----------
  update(dt) {
    const G = this.G;
    const P = G.player;
    const t = performance.now() * 0.001;
    const inCave = P.pos.y < -20;
    this.dripT -= dt;
    if (this.dripT <= 0 && inCave) {
      this.dripT = U.range(1.2, 4);
      SFX.drip(this.P(U.range(-CAVE.hx, CAVE.hx), 6, U.range(-CAVE.hz, CAVE.hz)));
    }
    this.bones.forEach((b, i) => { if (b.active) b.mesh.rotation.y = t * 0.6 + i; });
    this.faces.forEach((f, i) => {
      f.lit = Math.max(0, f.lit - dt);
      this.faceMats[i].color.set(f.lit > 0 ? 0xffb040 : 0x1a0c08);
    });
    const a = this.act;
    if (!a) return;
    const st = this.stationById[a.id];
    const dSt = Math.hypot(P.pos.x - st.pos.x, P.pos.z - st.pos.z);
    if (a.id === 'piedra') {
      a.cool = Math.max(0, a.cool - dt);
      a.x += a.dir * a.speed * dt;
      if (a.x > 1) { a.x = 1; a.dir = -1; }
      if (a.x < 0) { a.x = 0; a.dir = 1; }
      this.wheel.rotation.x += dt * 8;
      document.getElementById('mm-needle').style.left = (a.x * 100).toFixed(1) + '%';
      const z = document.getElementById('mm-zone');
      z.style.left = (a.z0 * 100).toFixed(1) + '%';
      z.style.width = (a.w * 100).toFixed(1) + '%';
      document.getElementById('mm-info').textContent = `Aciertos ${a.hits}/6 · Fallos ${a.fails}/3`;
      if (dSt > 4.5) this.cancel('Te has alejado de la piedra.');
    } else if (a.id === 'estanque') {
      a.t -= dt;
      this.wisp.position.y = CAVE.y + 1.3 + Math.sin(t * 3) * 0.25;
      const s = 1.4 + Math.sin(t * 9) * 0.2;
      this.wisp.scale.set(s, s, s);
      const w = this.wisp.position;
      if (Math.hypot(P.pos.x - w.x, P.pos.z - w.z) < 1.7) {
        a.i++;
        SFX.chime(w, 1 + a.i * 0.08, 0.6);
        if (a.i >= a.n) { this.wisp.visible = false; this.levelUp('velocidad', 'estanque'); return; }
        this.placeWisp();
      }
      if (a.t <= 0) this.cancel('Los fuegos fatuos se apagan. Vuelve al estanque para intentarlo otra vez.');
    } else if (a.id === 'totem') {
      const lv = this.levels.rugido;
      a.a += dt * (0.55 + lv * 0.2);
      const c = this.totemTop;
      const e = this.eye.position.set(c.x + Math.cos(a.a) * 2.0, c.y + Math.sin(a.a * 1.3) * 0.8, c.z + Math.sin(a.a) * 2.0);
      const eye = P.eyePos();
      const to = e.clone().sub(eye);
      const d = to.length();
      const look = P.forward().dot(to.divideScalar(d)) > Math.cos(0.12);
      if (G.inp.use && look && d < 9) {
        a.p += dt / 10;
        a.growlT -= dt;
        if (a.growlT <= 0) { a.growlT = 1.8; SFX.growl(null, 0.5); }
        P.shake = Math.max(P.shake, 0.15);
      } else a.p = Math.max(0, a.p - dt * 0.04);
      document.getElementById('mm-needle').style.left = (a.p * 100).toFixed(1) + '%';
      if (a.p >= 1) { this.eye.visible = false; this.levelUp('rugido', 'totem'); return; }
      const z = document.getElementById('mm-zone');
      z.style.left = '0%';
      z.style.width = (a.p * 100).toFixed(1) + '%';
      document.getElementById('mm-info').textContent = look ? (G.inp.use ? '¡RUGE!' : 'Mantén E') : 'Mira al ojo rojo';
      if (dSt > 10) this.cancel('Te has alejado del tótem.');
    } else if (a.id === 'nido') {
      a.t -= dt;
      this.updateRats(dt);
      if (a.t <= 0) this.cancel('Las ratas que quedaban se han escondido. Vuelve al nido para intentarlo otra vez.');
    } else if (a.id === 'voces') {
      a.t -= dt;
      if (a.phase === 'show' && a.t <= 0) {
        if (a.i < a.seq.length) {
          this.lightFace(a.seq[a.i]);
          a.i++;
          a.t = 0.85 - this.levels.voces * 0.1;
        } else {
          a.phase = 'input';
          a.input = 0;
          G.hud.msg('Tu turno: toca las bocas en el mismo orden.');
        }
      } else if (a.phase === 'wait' && a.t <= 0) {
        if (a.next) { a.next = false; this.newSequence(); } else { a.phase = 'show'; a.i = 0; a.t = 0.6; a.input = 0; }
      }
      if (dSt > 14) this.cancel('Te has alejado del muro.');
    }
  }

  markers() {
    const out = this.stations.filter((s) => this.available(s)).map((s) => ({ pos: s.pos, icon: s.icon, cls: 'story' }));
    if (this.act && this.act.id === 'estanque' && this.wisp.visible) out.push({ pos: this.wisp.position, icon: '✦', cls: 'item' });
    if (this.levels.resistencia < 3 && !this.done.altar) this.bones.forEach((b) => { if (b.active) out.push({ pos: b.pos, icon: '·', cls: 'item' }); });
    return out;
  }

  taskLines() {
    const lines = [];
    this.stations.forEach((s) => {
      const lv = this.levels[s.stat];
      const name = MON_STATS[s.stat].name;
      let state = lv >= 3 ? 'máx.' : this.done[s.id] ? '✓ hoy' : '';
      if (s.id === 'altar' && !state) state = `${this.offered}/6${this.carried ? ` (+${this.carried})` : ''}`;
      lines.push({ t: `${s.icon} ${s.name} · ${name} ${lv}${state ? ' · ' + state : ''}`, done: lv >= 3 || this.done[s.id] });
    });
    if (this.act) lines.unshift({ t: this.actLine() + (this.act.t > 0 && (this.act.id === 'estanque' || this.act.id === 'nido') ? ` · ${Math.ceil(this.act.t)} s` : ''), story: true });
    return lines;
  }
}
