'use strict';

// Papeles humanos con objetivo propio: el guardabosques (la historia de Tomás), la investigadora,
// el cazador y el alcalde. Se juegan en el modo historia y en el multijugador (con el monstruo).
// Todos pasan la noche en la cabaña; de día cada uno hace lo suyo.

const ROLE_INFO = {
  ranger: {
    name: 'Guardabosques', the: 'el guardabosques',
    look: { shirt: 0x55623a, pants: 0x3a3226, hat: 0x5b4a2c, hair: 0x2a1d12, backpack: 0x4a3a28 },
    desc: 'Vive en la cabaña. De día hace encargos y compra en el pueblo; de noche la defiende.',
  },
  investigator: {
    name: 'Investigadora', the: 'la investigadora',
    look: { shirt: 0x9a8458, pants: 0x3a3430, hat: 0x2e2620, hair: 0x2a1d12, backpack: 0x3a3028 },
    desc: 'Vive en una caravana junto al camino. Quiere demostrar que el monstruo existe: huellas, fotos, su voz y su sangre.',
  },
  hunter: {
    name: 'Cazador', the: 'el cazador',
    look: { shirt: 0x5a6a3a, pants: 0x3a3226, hat: 0x7a4a1a, hair: 0x3b2716, backpack: 0x4a3a28 },
    desc: 'Vive en un fortín en mitad del bosque. Practica tiro, pone cepos y escondites y quiere cobrarse la pieza.',
  },
  mayor: {
    name: 'Alcalde', the: 'el alcalde',
    look: { shirt: 0x2a2a34, pants: 0x1e1e26, hair: 0x9a9a9a, skin: 0xd8a888 },
    desc: 'Vive en el ayuntamiento. Que el pueblo no se entere de nada: borra huellas, arranca pasquines y calma a los vecinos.',
  },
  monster: {
    name: 'Monstruo', the: 'el monstruo',
    desc: 'De día se hace más fuerte en su guarida. De noche sale a cazar.',
  },
};
const HUMAN_ROLES = ['ranger', 'investigator', 'hunter', 'mayor'];
const OPTIONAL_ROLES = ['investigator', 'hunter', 'mayor'];
const ROLE_ORDER = ['ranger', 'monster', 'investigator', 'hunter', 'mayor'];

const ROLE_CFG = {
  investigator: {
    money: 40, payPerProof: 10, photoClear: 9, photoZoom: 18, photoMax: 30, flashCd: 7, scareR: 14, recRange: 20, recCd: 25,
    anoms: 3, payPerAnom: 15, specialAt: 5, specialPay: 40,
    req: { story: { foto: 2, huellas: 5, voz: 2, sangre: 1, testimonio: 2 }, mp: { foto: 1, huellas: 3, voz: 1, sangre: 1, testimonio: 1 } },
    payPerExclusive: 35, spyRange: 70, trackTime: 120,
  },
  hunter: { money: 60 },
  mayor: {
    money: 90, salary: 25, start: 20, max: 100,
    perPrint: 8, perPoster: 6, perNeighbor: 5, calm: 4, speech: 10, perProof: 4, dossier: 20, perDeath: 12,
  },
};
const PROOF_KEYS = ['foto', 'huellas', 'voz', 'sangre', 'testimonio'];
const PROOF_NAMES = { foto: 'Foto nítida', huellas: 'Huellas', voz: 'Grabación de su voz', sangre: 'Muestra de sangre', testimonio: 'Testimonio' };

// Sitios de las fachadas del pueblo donde aparecen pasquines (x, y, z, giro)
const POSTER_SPOTS = [
  [149, 1.6, 13.03, 0], [156.03, 1.6, 9, Math.PI / 2], [144.97, 1.6, 9, -Math.PI / 2],
  [137.5, 1.6, 10.03, 0], [133.97, 1.6, 7, -Math.PI / 2],
  [168, 1.6, -16.53, Math.PI], [170, 1.6, -7.47, 0], [172.03, 1.6, -12, Math.PI / 2],
  [135.5, 1.6, -23.53, Math.PI], [131.97, 1.6, -20, -Math.PI / 2], [139.53, 1.6, -20, Math.PI / 2],
  [169, 1.6, -21.47, 0], [164, 1.6, 7.53, 0], [160.72, 1.6, 5, -Math.PI / 2], [147.5, 1.6, 15.47, Math.PI],
];
const NEIGHBOR_IDS = ['tabernero', 'parroquiano1', 'parroquiano2', 'remedios', 'julian', 'cura', 'anselmo', 'vecina', 'vecino'];
const CALM_LINES = [
  'Tranquilo, alcalde. Si usted dice que son lobos, serán lobos.',
  'Bueno... si el ayuntamiento lo tiene controlado, me quedo más tranquila.',
  'Usted sabrá. Pero yo esta noche duermo con la escopeta.',
  'Vale, vale. No diré nada en la taberna. De momento.',
  'Si me lo dice usted... Pero que arreglen la farola de mi calle.',
];

// Lo que puede esconder el bosque (anomalías que encuentra el medidor de campo de la investigadora)
const ANOMALIES = [
  'Un reloj de pulsera parado a las 3:33',
  'La placa de guarda forestal de Tomás, doblada por la mitad',
  'Una mochila de excursionista llena de tierra',
  'Un nido de pelo negro y áspero',
  'Piedras apiladas en espiral, todas del mismo tamaño',
  'Una cámara de fotos antigua con el carrete velado',
  'Un mechero con las iniciales T. R.',
  'Un círculo de hierba quemada, perfecto',
  'Huesos pequeños ordenados de mayor a menor',
  'Una linterna encendida, con las pilas gastadas desde hace años',
];

const INTERVIEW_IDS = ['vecina', 'vecino', 'parroquiano1', 'parroquiano2', 'cura', 'remedios', 'tabernero', 'julian'];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

class RoleSystem {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.dayGroup = new THREE.Group();
    G.scene.add(this.group, this.dayGroup);
    this.role = null;
    this.mode = 'story';
    this.seed = 1;
    this.blood = [];
    this.prints = [];
    this.posters = [];
    this.buildProps();
    this.hunt = new HunterKit(this);
    this.reset();
  }

  get W() { return this.G.world; }
  get info() { return ROLE_INFO[this.role] || ROLE_INFO.ranger; }
  get nights() { return this.mode === 'mp' ? CFG.MP.NIGHTS : CFG.NIGHTS_TO_WIN; }

  // ======================= Lugares fijos =======================
  buildProps() {
    const L = this.W.landmarks;
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (g, w, h, d, m, x, y, z) => {
      const mesh = new THREE.Mesh(boxGeo(w, h, d, 1), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };

    // La caravana de la investigadora está en homes.js (de noche es su casa); la radio, dentro
    this.caravanPos = this.G.homes.caravan.radioPos;

    // ---------- Atril del pleno en el ayuntamiento ----------
    const lec = new THREE.Group();
    box(lec, 0.5, 1.05, 0.4, MAT.planks, 0, 0.52, 0);
    const top = box(lec, 0.6, 0.06, 0.5, MAT.planks, 0, 1.1, 0);
    top.rotation.z = 0.25;
    lec.position.set(170.55, 0, -12);
    lec.rotation.y = Math.PI;
    this.group.add(lec);
    this.lecternPos = new THREE.Vector3(170.55, 1.1, -12);

    // Material de los pasquines
    this.posterMat = new THREE.MeshLambertMaterial({
      map: makeTex(32, 40, (gg, w, h) => {
        gg.fillStyle = '#e8e0c8';
        gg.fillRect(0, 0, w, h);
        gg.fillStyle = '#7a1010';
        gg.font = 'bold 7px monospace';
        gg.textAlign = 'center';
        gg.fillText('¡EXISTE!', w / 2, 9);
        gg.fillStyle = '#222';
        gg.fillRect(8, 13, 16, 16);
        gg.fillStyle = '#c00';
        gg.fillRect(12, 18, 2, 2);
        gg.fillRect(18, 18, 2, 2);
        gg.font = '5px monospace';
        gg.fillStyle = '#333';
        gg.fillText('NO SALGAS', w / 2, 35);
      }, { clamp: true }),
    });
    this.footMat = new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.8 });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x4a0606, transparent: true, opacity: 0.85 });
  }

  // ======================= Partida nueva =======================
  reset() {
    this.got = { foto: 0, huellas: 0, voz: 0, sangre: 0, testimonio: 0 };
    this.sent = { foto: 0, huellas: 0, voz: 0, sangre: 0, testimonio: 0 };
    this.interviewed = new Set();
    this.ivDone = 0;
    this.exclusives = [];
    this.exSent = 0;
    this.tracked = new Map();
    this.sus = null;
    this.spyId = null;
    this.sentTotal = 0;
    this.dossier = false;
    this.recOn = false;
    this.flashCd = 0;
    this.recCd = 0;
    this.emfOn = false;
    this.emfT = 0;
    this.emfLevel = 0;
    this.anoms = [];
    this.anomGot = 0;
    this.anomSent = 0;
    this.rumors = ROLE_CFG.mayor.start;
    this.panic = false;
    this.calmed = new Set();
    this.neighbors = [];
    this.speechDay = 0;
    this.peerSeen = {};
    this.photosTonight = 0;
    this.W.restoreTrees();
    this.clearDay();
    if (this.hunt) this.hunt.reset();
    this.blood.forEach((b) => this.group.remove(b.mesh));
    this.blood = [];
  }

  // role: papel propio. opts: { mode: 'story'|'mp', seed, roster: [roles] }
  setup(role, opts = {}) {
    const G = this.G;
    this.role = role;
    this.mode = opts.mode || 'story';
    this.seed = opts.seed >>> 0 || ((Math.random() * 1e9) | 0);
    this.reset();
    // La investigadora graba con su cámara todo el rato (imagen y sonido)
    this.recOn = role === 'investigator';
    const W = G.weapons;
    W.owned.camera = role === 'investigator';
    const rc = ROLE_CFG[role];
    if (rc && rc.money) G.money = rc.money;
    if (role === 'hunter') this.hunt.setup();
    // Si alguien hace de alcalde, Don Severino no está (es esa persona)
    const roster = opts.roster || [role];
    const al = G.village.byId.alcalde;
    if (al) al.hidden = roster.includes('mayor');
    // Cada papel pasa la noche en su casa
    G.homes.activate(roster);
  }

  // Al terminar (volver al menú): el mundo vuelve a estar como al principio
  teardown() {
    this.role = null;
    this.reset();
    const al = this.G.village.byId.alcalde;
    if (al) al.hidden = false;
    this.G.homes.activate([]);
    this.G.weapons.owned.camera = false;
  }

  // Dónde empieza cada uno el primer día
  placeAtHome() {
    const G = this.G;
    const P = G.player;
    const L = this.W.landmarks;
    if (this.role === 'investigator') { P.pos.set(L.caravan.x + 0.9, 0, L.caravan.z - 2.6); P.yaw = Math.PI * 0.75; }
    else if (this.role === 'hunter') { P.pos.set(L.fort.x + 1.5, 0, L.fort.z + 6.2); P.yaw = 0.15; }
    else if (this.role === 'mayor') { P.pos.set(169.5, 0, -11.5); P.yaw = Math.PI / 2; }
    else return;
    P.pitch = -0.05;
  }

  // Seguro que el sitio no tiene un tronco encima
  freeSpot(x, z) {
    return !this.W.circlesNear(x, z).some((c) => c.y0 === 0 && Math.hypot(c.x - x, c.z - z) < c.r + 1.0);
  }

  // ======================= Día y noche =======================
  clearDay() {
    while (this.dayGroup.children.length) this.dayGroup.remove(this.dayGroup.children[0]);
    this.prints = [];
    this.posters = [];
    this.neighbors = [];
    this.anoms = [];
  }

  // Semilla del día: en multijugador es la misma para todos (huellas en el mismo sitio)
  dayRng(day, salt) { return U.mulberry32((this.seed ^ Math.imul(day + 1, 2654435761) ^ hashStr(salt)) >>> 0); }

  startDay(day) {
    this.clearDay();
    const r = this.role;
    if (r === 'investigator' || r === 'mayor') this.spawnPrints(day);
    if (r === 'mayor') this.spawnMayorDay(day);
    if (r === 'investigator') { this.photosTonight = 0; this.spawnAnoms(day); this.interviewed = new Set(); }
    if (r === 'hunter') this.hunt.startDay(day);
  }

  // Anomalías del día: escondidas en el bosque, solo las encuentra el medidor de campo
  spawnAnoms(day) {
    const rnd = this.dayRng(day, 'anomalias');
    const V = CFG.WORLD.village;
    const W = CFG.WORLD;
    const left = ANOMALIES.slice();
    for (let k = 0; k < ROLE_CFG.investigator.anoms; k++) {
      let p = null;
      for (let tries = 0; tries < 80 && !p; tries++) {
        const a = rnd() * Math.PI * 2, d = 18 + rnd() * 75;
        const x = 25 + Math.cos(a) * d, z = Math.sin(a) * d * 0.9;
        if (x < W.minX + 10 || x > W.maxX - 10 || z < W.minZ + 10 || z > W.maxZ - 10) continue;
        if (Math.hypot(x - V.x, z - V.z) < V.r + 4 || Math.hypot(x, z) < 14) continue;
        if (!this.freeSpot(x, z)) continue;
        if (this.anoms.some((q) => Math.hypot(q.pos.x - x, q.pos.z - z) < 20)) continue;
        p = { x, z };
      }
      if (!p) continue;
      const glint = glintSprite(0xa0e8ff, 0.7, 0.5);
      glint.position.set(p.x, 0.5, p.z);
      glint.visible = false;
      this.dayGroup.add(glint);
      const what = left.splice(Math.floor(rnd() * left.length), 1)[0];
      this.anoms.push({ k, pos: new THREE.Vector3(p.x, 0, p.z), glint, what, found: false });
    }
  }

  // Medidor de campo: pita más deprisa cuanto más cerca de una anomalía... o de él
  updateEmf(dt) {
    const G = this.G;
    const P = G.player;
    this.emfLevel = 0;
    if (this.role !== 'investigator' || !this.emfOn || P.dead) { this.anoms.forEach((a) => (a.glint.visible = false)); return; }
    const lv = (d, steps) => steps.reduce((n, lim, i) => (d < lim ? Math.max(n, 5 - i) : n), 0);
    let level = 0;
    this.anoms.forEach((a) => {
      const d = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z);
      a.glint.visible = !a.found && d < 4;
      if (a.glint.visible) a.glint.material.opacity = 0.4 + Math.sin(performance.now() * 0.008) * 0.3;
      if (!a.found) level = Math.max(level, lv(d, [2.5, 7, 13, 21, 30]));
    });
    const I = G.intruder;
    let m = null;
    if (I.netMode) m = G.mp && G.mp.monsterPos();
    else if (I.mesh.visible && !['off', 'gone'].includes(I.state)) m = I.pos;
    if (m) {
      const d = Math.hypot(m.x - P.pos.x, m.z - P.pos.z);
      const ml = lv(d, [8, 14, 22, 32, 45]);
      if (ml > level) { level = ml; this.emfMonster = true; } else this.emfMonster = false;
    } else this.emfMonster = false;
    this.emfLevel = level;
    if (!level) return;
    this.emfT -= dt;
    if (this.emfT <= 0) {
      this.emfT = [1.3, 0.85, 0.55, 0.32, 0.16][level - 1];
      SFX.emf(level);
    }
  }

  // Huellas del monstruo de la noche anterior (3 al día)
  spawnPrints(day) {
    const rnd = this.dayRng(day, 'huellas');
    const V = CFG.WORLD.village;
    const W = CFG.WORLD;
    for (let k = 0; k < 3; k++) {
      let p = null;
      for (let tries = 0; tries < 80 && !p; tries++) {
        const a = rnd() * Math.PI * 2, d = 22 + rnd() * 70;
        const x = 20 + Math.cos(a) * d, z = Math.sin(a) * d * 0.9;
        if (x < W.minX + 10 || x > W.maxX - 10 || z < W.minZ + 10 || z > W.maxZ - 10) continue;
        if (Math.hypot(x - V.x, z - V.z) < V.r + 6 || Math.hypot(x, z) < 16) continue;
        if (!this.freeSpot(x, z)) continue;
        if (this.prints.some((q) => Math.hypot(q.pos.x - x, q.pos.z - z) < 25)) continue;
        p = { x, z, a: rnd() * Math.PI * 2 };
      }
      if (!p) continue;
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(new THREE.CircleGeometry(0.22, 6), this.footMat);
        f.rotation.x = -Math.PI / 2;
        f.scale.set(0.6, 1.6, 1);
        f.rotation.z = p.a + (i % 2 ? 0.2 : -0.2);
        const along = (i - 2.5) * 0.9;
        f.position.set(Math.sin(p.a) * along + (i % 2 ? 0.25 : -0.25) * Math.cos(p.a), 0.035, Math.cos(p.a) * along - (i % 2 ? 0.25 : -0.25) * Math.sin(p.a));
        g.add(f);
      }
      const glint = glintSprite(0xe0d0b0, 0.4, 0.3);
      g.add(glint);
      g.position.set(p.x, 0, p.z);
      this.dayGroup.add(g);
      this.prints.push({
        k, pos: new THREE.Vector3(p.x, 0, p.z), mesh: g, doc: false, hidden: false,
        approx: new THREE.Vector3(p.x + (rnd() - 0.5) * 10, 0, p.z + (rnd() - 0.5) * 10),
      });
    }
  }

  spawnMayorDay(day) {
    const rnd = this.dayRng(day, 'alcalde');
    const spots = POSTER_SPOTS.slice();
    for (let i = 0; i < 2; i++) {
      const sp = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), this.posterMat);
      m.position.set(sp[0], sp[1], sp[2]);
      m.rotation.y = sp[3];
      m.rotation.z = (rnd() - 0.5) * 0.2;
      this.dayGroup.add(m);
      this.posters.push({ mesh: m, pos: new THREE.Vector3(sp[0], sp[1], sp[2]), torn: false });
    }
    const pool = NEIGHBOR_IDS.filter((id) => this.G.village.byId[id]);
    this.neighbors = [];
    while (this.neighbors.length < 3 && pool.length) this.neighbors.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    this.calmed = new Set();
  }

  onNight() {
    const G = this.G;
    if (this.role === 'mayor') {
      const C = ROLE_CFG.mayor;
      const prints = this.prints.filter((p) => !p.hidden).length;
      const posters = this.posters.filter((p) => !p.torn).length;
      const neigh = this.neighbors.filter((id) => !this.calmed.has(id)).length;
      const add = prints * C.perPrint + posters * C.perPoster + neigh * C.perNeighbor;
      if (add > 0) {
        const parts = [];
        if (prints) parts.push(`${prints} rastro${prints > 1 ? 's' : ''} sin borrar`);
        if (posters) parts.push(posters > 1 ? `${posters} pasquines` : '1 pasquín');
        if (neigh) parts.push(`${neigh} vecino${neigh > 1 ? 's' : ''} sin calmar`);
        this.addRumors(add, `Corren rumores en el pueblo: ${parts.join(', ')}`);
      }
    }
    this.clearDay();
    this.photosTonight = 0;
  }

  onDawn() {
    const G = this.G;
    // Las manchas de sangre de hace más de un día se las lleva la lluvia
    this.blood = this.blood.filter((b) => {
      if (b.day < G.day - 1) { this.group.remove(b.mesh); return false; }
      return true;
    });
    if (this.role === 'mayor') G.addMoney(ROLE_CFG.mayor.salary, 'Sueldo de alcalde');
  }

  addRumors(n, why) {
    if (this.role !== 'mayor' || this.panic) return;
    const C = ROLE_CFG.mayor;
    this.rumors = U.clamp(this.rumors + n, 0, C.max);
    if (why) this.G.hud.msg(`${why} (${n > 0 ? '+' : ''}${n} rumores)`, 6);
    if (this.rumors >= C.max) {
      this.panic = true;
      this.G.hud.banner('PÁNICO EN ROBLEDAL', 'Todo el pueblo habla del monstruo. Ya no hay quien lo tape.', 6);
      SFX.sting();
    }
  }

  // ======================= Objetivo =======================
  req() { return ROLE_CFG.investigator.req[this.mode === 'mp' ? 'mp' : 'story']; }

  goalText(role = this.role, mode = this.mode) {
    const mp = mode === 'mp';
    const n = mp ? CFG.MP.NIGHTS : CFG.NIGHTS_TO_WIN;
    switch (role) {
      case 'ranger': return mp ? `Aguantar ${n} noches` : `Aguantar ${n} noches y descubrir qué le pasó a Tomás`;
      case 'investigator': {
        const q = ROLE_CFG.investigator.req[mp ? 'mp' : 'story'];
        return `Enviar desde la caravana un expediente con ${q.huellas} huellas, ${q.foto} foto${q.foto > 1 ? 's' : ''} nítida${q.foto > 1 ? 's' : ''}, ${q.voz} grabaci${q.voz > 1 ? 'ones' : 'ón'} de su voz, ${q.sangre} muestra de sangre y ${q.testimonio} testimonio${q.testimonio > 1 ? 's' : ''} de vecinos`;
      }
      case 'hunter': return `Cobrarse la pieza: ${HUNTER_CFG.target[mp ? 'mp' : 'story']} puntos de caza (el daño que le hagas y cada cepo que salte)`;
      case 'mayor': return 'Que los rumores del pueblo no lleguen a 100';
      case 'monster': return 'Atrapar al menos a la mitad de los humanos';
      default: return '';
    }
  }

  // ¿Cumplido el objetivo propio? (además hay que seguir vivo al final)
  objective() {
    switch (this.role) {
      case 'investigator': {
        const q = this.req();
        const done = PROOF_KEYS.filter((k) => this.sent[k] >= q[k]).length;
        return { ok: this.dossier, txt: this.dossier ? 'Expediente enviado' : `Expediente ${done}/${PROOF_KEYS.length}` };
      }
      case 'hunter': {
        const t = this.hunt.target();
        return { ok: this.hunt.points >= t, txt: `Caza ${this.hunt.points}/${t}` };
      }
      case 'mayor': return { ok: !this.panic, txt: this.panic ? 'Pánico en el pueblo' : `Rumores ${this.rumors}/100` };
      default: return { ok: true, txt: '' };
    }
  }

  // ======================= Herramientas =======================
  get heavy() { return false; }

  useTool(id) {
    if (id === 'camera') this.photo();
  }

  key(code) {
    if (this.hunt.key(code)) return true;
    if (code === 'KeyV' && this.role === 'investigator') {
      this.emfOn = !this.emfOn;
      SFX.click(null, 0.5);
      this.G.hud.msg(this.emfOn
        ? 'Medidor de campo ENCENDIDO: pita más deprisa cuanto más cerca estás de algo raro. De noche, también de él.'
        : 'Medidor de campo apagado.', 4);
      return true;
    }
    return false;
  }

  // ---------- Cámara de fotos ----------
  // Foto con flash (clic): el fogonazo lo espanta y, si está cerca, sirve de prueba
  photo() {
    const G = this.G;
    const P = G.player;
    if (P.dead) return;
    const C = ROLE_CFG.investigator;
    if (this.flashCd > 0) {
      SFX.click(null, 0.25);
      if (!this.cdMsgT) {
        this.cdMsgT = 1;
        G.hud.msg(`El flash se está cargando (${Math.ceil(this.flashCd)} s).`, 2);
        setTimeout(() => (this.cdMsgT = 0), 1500);
      }
      return;
    }
    this.flashCd = C.flashCd;
    G.weapons.flashT = 0.16;
    G.hud.flash(0.5);
    SFX.shutter();
    const I = G.intruder;
    const eye = P.eyePos();
    const fwd = P.forward();
    if (G.mp) {
      const r2 = (v) => Math.round(v * 100) / 100;
      G.mp.emit({ t: 'flash', x: r2(eye.x), y: r2(eye.y), z: r2(eye.z), yw: r2(P.yaw), pt: r2(P.pitch) });
      if (this.spyId) this.spyPhoto(this.spyId);
    }
    if (!I.mesh.visible || I.state === 'off') return;
    const c = new THREE.Vector3(I.pos.x, I.pos.y + 1.6, I.pos.z);
    const to = c.clone().sub(eye);
    const d = to.length();
    to.divideScalar(d);
    // Con zoom (clic derecho) el encuadre es más estrecho, pero la foto sale nítida desde más lejos
    const zoom = P.aiming;
    if (fwd.dot(to) < (zoom ? 0.95 : 0.82) || d > C.photoMax || !G.world.lineOfSight(eye, c)) return;
    // Modo historia: el fogonazo lo espanta (en multijugador le ciega y le frena, ver mp.js)
    if (!I.netMode && d < C.scareR && I.state !== 'apparition') I.scare('El flash lo deslumbra: retrocede.');
    if (d <= (zoom ? C.photoZoom : C.photoClear)) {
      if (this.photosTonight >= 2 && G.phase === 'night') { G.hud.msg('Ya tienes buenas fotos de esta noche. Las demás salen repetidas.'); return; }
      this.photosTonight = (this.photosTonight || 0) + 1;
      this.got.foto++;
      SFX.sting();
      G.hud.msg(`¡FOTO NÍTIDA! Se le ve la cara. (Fotos sin enviar: ${this.got.foto})`, 6);
    } else G.hud.msg(zoom ? 'Movida incluso con zoom: está demasiado lejos (menos de 18 m).' : 'La foto ha salido movida: está demasiado lejos. Acércate (9 m) o usa el zoom (clic derecho, 18 m).', 5);
  }

  // Sonido del monstruo: si la grabadora está encendida y cerca, se graba
  monsterSound(pos) {
    if (this.role !== 'investigator' || !this.recOn || this.recCd > 0 || !pos) return;
    const P = this.G.player;
    if (P.dead || Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z) > ROLE_CFG.investigator.recRange) return;
    this.recCd = ROLE_CFG.investigator.recCd;
    this.got.voz++;
    const n = this.got.voz;
    setTimeout(() => this.G.hud.msg(`Tu cámara ha grabado su voz. (Grabaciones sin enviar: ${n})`, 5), 600);
  }

  // Mancha de sangre donde le han herido (la recoge la investigadora)
  addBlood(pos) {
    if (!pos) return;
    if (this.blood.some((b) => Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < 1.2)) return;
    const y = this.W.getFloorY(pos.x, pos.z, pos.y + 0.5);
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.4, 7), this.bloodMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(1, 0.6 + Math.random() * 0.6, 1);
    m.position.set(pos.x, y + 0.04, pos.z);
    this.group.add(m);
    this.blood.push({ mesh: m, pos: new THREE.Vector3(pos.x, y + 0.1, pos.z), day: this.G.day });
    if (this.blood.length > 10) this.group.remove(this.blood.shift().mesh);
  }

  // ======================= Interacción =======================
  get interactables() {
    const G = this.G;
    const r = this.role;
    const out = [];
    if (r === 'investigator') {
      out.push(this.caravanInter || (this.caravanInter = this.makeCaravanInter()));
      this.prints.forEach((p) => {
        if (p.hidden || p.doc) return;
        out.push(p.inter || (p.inter = {
          kind: 'role', pos: new THREE.Vector3(p.pos.x, 0.2, p.pos.z), r: 1.3,
          prompt: () => ({ title: 'Huellas enormes', lines: ['[E] Fotografiarlas y medirlas'], info: ['Pezuña alargada, de casi medio metro'] }),
          act: (key) => {
            if (key !== 'E') return false;
            p.doc = true;
            p.mesh.children[p.mesh.children.length - 1].visible = false;
            this.got.huellas++;
            SFX.shutter();
            G.hud.msg(`Huellas documentadas. (Huellas sin enviar: ${this.got.huellas})`);
            return true;
          },
        }));
      });
      if (this.emfOn) this.anoms.forEach((a) => {
        if (a.found || !a.glint.visible) return;
        out.push(a.inter || (a.inter = {
          kind: 'role', pos: new THREE.Vector3(a.pos.x, 0.4, a.pos.z), r: 1.6,
          prompt: () => ({ title: 'Anomalía electromagnética', lines: ['[E] Registrarla y fotografiarla'], info: ['El medidor está al rojo'] }),
          act: (key) => {
            if (key !== 'E') return false;
            a.found = true;
            a.glint.visible = false;
            this.anomGot++;
            SFX.shutter();
            SFX.chime(null, 0.8, 0.5);
            G.hud.banner('ANOMALÍA', a.what + '.', 4);
            G.hud.msg(`Anomalía registrada. La revista paga ${ROLE_CFG.investigator.payPerAnom} $ por cada una (envíala desde la radio).`, 5);
            return true;
          },
        }));
      });
      this.blood.forEach((b) => out.push(b.inter || (b.inter = {
        kind: 'role', pos: b.pos, r: 0.8,
        prompt: () => ({ title: 'Sangre negra y espesa', lines: ['[E] Tomar una muestra'], info: [] }),
        act: (key) => {
          if (key !== 'E') return false;
          this.blood = this.blood.filter((x) => x !== b);
          this.group.remove(b.mesh);
          this.got.sangre++;
          SFX.pickup();
          G.hud.msg(`Muestra de sangre guardada. (Muestras sin enviar: ${this.got.sangre})`);
          return true;
        },
      })));
    } else if (r === 'hunter') {
      this.hunt.interactables().forEach((i) => out.push(i));
    } else if (r === 'mayor') {
      this.prints.forEach((p) => {
        if (p.hidden) return;
        out.push(p.minter || (p.minter = {
          kind: 'role', pos: new THREE.Vector3(p.pos.x, 0.2, p.pos.z), r: 1.3,
          prompt: () => ({ title: 'Huellas enormes', lines: ['[E] Borrarlas con el pie'], info: ['Si las ve alguien, habrá rumores'] }),
          act: (key) => {
            if (key !== 'E') return false;
            p.hidden = true;
            p.mesh.visible = false;
            this.flagSus('borrando huellas del monstruo');
            SFX.step('grass', null, 0.8);
            G.hud.msg('Borras las huellas. Aquí no ha pasado nada.');
            return true;
          },
        }));
      });
      this.posters.forEach((p) => {
        if (p.torn) return;
        out.push(p.inter || (p.inter = {
          kind: 'role', pos: p.pos, r: 0.6,
          prompt: () => ({ title: 'Pasquín: «¡EL MONSTRUO EXISTE!»', lines: ['[E] Arrancarlo'], info: [] }),
          act: (key) => {
            if (key !== 'E') return false;
            p.torn = true;
            p.mesh.visible = false;
            this.flagSus('arrancando un pasquín');
            SFX.paper();
            G.hud.msg('Arrancas el pasquín y lo haces una bola.');
            return true;
          },
        }));
      });
      out.push(this.lecternInter || (this.lecternInter = {
        kind: 'role', pos: this.lecternPos, r: 0.8,
        prompt: () => {
          const why = G.pleno.why();
          return {
            title: 'Atril del pleno',
            lines: [why || '[E] Abrir el pleno municipal'],
            info: why ? [`Rumores: ${this.rumors}/100`] : ['Hora y media de preguntas de los vecinos', 'Acierta y bajan los rumores; falla y suben'],
          };
        },
        act: (key) => {
          if (key !== 'E') return false;
          const why = G.pleno.why();
          if (why) G.hud.msg(why + '.');
          else G.pleno.start();
          return true;
        },
      }));
    }
    return out;
  }

  makeCaravanInter() {
    const G = this.G;
    return {
      kind: 'role', pos: this.caravanPos, r: 0.9,
      prompt: () => {
        const n = PROOF_KEYS.reduce((a, k) => a + this.got[k], 0) + this.anomGot + this.exclusives.length;
        const q = this.req();
        return {
          title: 'Radio de la caravana',
          lines: [n ? `[E] Enviar ${n} prueba${n > 1 ? 's' : ''} a la revista` : 'No tienes pruebas nuevas que enviar'],
          info: PROOF_KEYS.map((k) => `${PROOF_NAMES[k]}: ${this.sent[k]}/${q[k]}${this.sent[k] >= q[k] ? ' ✓' : ''}`).concat([`Anomalías enviadas: ${this.anomSent}`, this.exclusives.length ? `Exclusivas por enviar: ${this.exclusives.length}` : '']).filter(Boolean),
        };
      },
      act: (key) => {
        if (key !== 'E') return false;
        const C = ROLE_CFG.investigator;
        const n = PROOF_KEYS.reduce((a, k) => a + this.got[k], 0);
        const na = this.anomGot;
        const nx = this.exclusives.length;
        if (!n && !na && !nx) { G.hud.msg('Antes tienes que conseguir pruebas.'); return true; }
        SFX.radio();
        if (nx) {
          this.exSent += nx;
          this.exclusives = [];
          G.addMoney(nx * C.payPerExclusive, `La revista paga ${nx} exclusiva${nx > 1 ? 's' : ''}`);
          if (!n && !na) { G.hud.say('Radio de la revista', '¡Esto vende más que el monstruo! Sigue espiando.', 4); return true; }
        }
        if (na) {
          const before = this.anomSent;
          this.anomSent += na;
          this.anomGot = 0;
          G.addMoney(na * C.payPerAnom, `La revista paga ${na} anomalía${na > 1 ? 's' : ''}`);
          if (before < C.specialAt && this.anomSent >= C.specialAt) {
            G.addMoney(C.specialPay, 'Número especial: «Lo que esconde el bosque de Robledal»');
            G.hud.banner('NÚMERO ESPECIAL', 'La revista dedica un número entero a tus anomalías.', 5);
          }
          if (!n) { G.hud.say('Radio de la revista', 'Material rarísimo. Sigue así, pero nos falta el expediente.', 4); return true; }
        }
        PROOF_KEYS.forEach((k) => { this.sent[k] += this.got[k]; this.got[k] = 0; });
        this.sentTotal += n;
        G.addMoney(n * C.payPerProof, `La revista paga ${n} prueba${n > 1 ? 's' : ''}`);
        const q = this.req();
        if (!this.dossier && PROOF_KEYS.every((k) => this.sent[k] >= q[k])) {
          this.dossier = true;
          G.hud.banner('EXPEDIENTE COMPLETO', 'La revista lo publicará. Ahora solo tienes que seguir vivo.', 6);
          SFX.sting();
        } else G.hud.say('Radio de la revista', 'Recibido. Necesitamos más. Mándanos todo lo que consigas.', 4);
        return true;
      },
    };
  }

  // Conversaciones propias del papel: el alcalde calma a los vecinos.
  // Devuelve el texto del aviso ([E] ...) o '' si no hay nada que hablar
  hasTalk(npcId) {
    if (this.role === 'mayor' && this.neighbors.includes(npcId) && !this.calmed.has(npcId)) return 'Calmar los ánimos';
    return '';
  }

  talkTo(npcId) {
    if (!this.hasTalk(npcId)) return false;
    const G = this.G;
    const n = G.village.byId[npcId];
    this.calmed.add(npcId);
    G.hud.say(n.name, U.pick(CALM_LINES), 5);
    this.addRumors(-ROLE_CFG.mayor.calm, 'Has calmado a un vecino');
    return true;
  }

  // ======================= Brújula y tareas =======================
  markers() {
    const G = this.G;
    const out = [];
    const r = this.role;
    const L = this.W.landmarks;
    if (r === 'investigator') {
      out.push({ pos: L.caravan, icon: '◆', cls: 'home' });
      if (G.phase === 'day') this.prints.forEach((p) => { if (!p.doc && !p.hidden) out.push({ pos: p.approx, icon: '?', cls: 'item' }); });
      this.blood.forEach((b) => out.push({ pos: b.pos, icon: '•', cls: 'story' }));
      // Jugadores a los que les sigue la pista (foto de vigilancia)
      const now = performance.now();
      if (G.mp) this.tracked.forEach((until, id) => {
        const a = G.mp.avatars.get(id);
        if (now > until || !a || !a.has) return;
        out.push({ pos: a.pos, icon: '◉', cls: 'story' });
      });
      if (G.phase === 'day') INTERVIEW_IDS.forEach((id) => {
        const n = G.village.byId[id];
        if (n && n.mesh.visible && !this.interviewed.has(id) && G.player.pos.distanceTo(n.mesh.position) < 40) out.push({ pos: n.mesh.position, icon: '“', cls: 'village' });
      });
    } else if (r === 'hunter') {
      this.hunt.markers().forEach((m) => out.push(m));
    } else if (r === 'mayor' && G.phase === 'day') {
      this.prints.forEach((p) => { if (!p.hidden) out.push({ pos: p.approx, icon: '?', cls: 'item' }); });
      this.posters.forEach((p) => { if (!p.torn) out.push({ pos: p.pos, icon: '?', cls: 'village' }); });
      this.neighbors.forEach((id) => {
        const n = G.village.byId[id];
        if (n && !this.calmed.has(id) && n.mesh.visible) out.push({ pos: n.mesh.position, icon: '!', cls: 'village' });
      });
      if (this.speechDay !== G.day) out.push({ pos: this.lecternPos, icon: '★', cls: 'story' });
    }
    return out;
  }

  head() {
    const o = this.objective();
    switch (this.role) {
      case 'investigator': return `INVESTIGACIÓN · ${o.txt.toUpperCase()}`;
      case 'hunter': return `CACERÍA · ${this.hunt.points}/${this.hunt.target()} PUNTOS`;
      case 'mayor': return this.panic ? 'PÁNICO EN EL PUEBLO' : `RUMORES EN EL PUEBLO · ${this.rumors}/100`;
      default: return '';
    }
  }

  // Tareas del día (las de la noche son comunes a todos)
  taskLines() {
    const G = this.G;
    const out = [];
    const r = this.role;
    if (r === 'investigator') {
      const q = this.req();
      const left = this.prints.filter((p) => !p.doc && !p.hidden).length;
      if (this.dossier) out.push({ t: 'Expediente enviado. Ahora sigue vivo.', done: true });
      else {
        PROOF_KEYS.forEach((k) => {
          const have = this.sent[k] + this.got[k];
          const hint = { foto: 'de noche, clic a menos de 9 m', huellas: 'de día, en el bosque (?)', voz: 'tu cámara graba su voz si está cerca', sangre: 'donde le hayan herido', testimonio: 'entrevista a los vecinos (Q al hablarles)' }[k];
          out.push({ t: `${PROOF_NAMES[k]} ${have}/${q[k]} · ${hint}`, done: this.sent[k] >= q[k] });
        });
        const n = PROOF_KEYS.reduce((a, k) => a + this.got[k], 0);
        if (n) out.push({ t: `Envía ${n} prueba${n > 1 ? 's' : ''} desde la radio de la caravana (◆)`, story: true });
      }
      if (G.phase === 'day' && left) out.push({ t: `Hoy hay ${left} rastro${left > 1 ? 's' : ''} de huellas sin fotografiar` });
      if (G.phase === 'day') {
        const left2 = INTERVIEW_IDS.filter((id) => !this.interviewed.has(id)).length;
        out.push({ t: `Entrevistas: quedan ${left2} vecinos por entrevistar hoy (Q al hablarles)` });
      }
      if (G.mp) out.push({ t: 'Zoom (clic dcho.) sobre otro jugador: ves qué lleva; clic: foto de vigilancia o exclusiva' });
      if (this.exclusives.length) out.push({ t: `Envía ${this.exclusives.length} exclusiva${this.exclusives.length > 1 ? 's' : ''} desde la radio (${ROLE_CFG.investigator.payPerExclusive} $ cada una)`, story: true });
      const an = this.anoms.filter((a) => !a.found).length;
      if (G.phase === 'day' && an) out.push({ t: `Medidor de campo (V): hoy hay ${an} anomalía${an > 1 ? 's' : ''} escondida${an > 1 ? 's' : ''} en el bosque${this.emfOn ? '' : ' · enciéndelo'}` });
      if (this.anomGot) out.push({ t: `Envía ${this.anomGot} anomalía${this.anomGot > 1 ? 's' : ''} desde la radio (${ROLE_CFG.investigator.payPerAnom} $ cada una)`, story: true });
    } else if (r === 'hunter') {
      this.hunt.taskLines().forEach((t) => out.push(t));
    } else if (r === 'mayor') {
      if (this.panic) out.push({ t: 'El pueblo ya sabe la verdad', warn: true });
      else if (G.phase === 'day') {
        const pr = this.prints.filter((p) => !p.hidden).length;
        const po = this.posters.filter((p) => !p.torn).length;
        const ne = this.neighbors.filter((id) => !this.calmed.has(id)).length;
        out.push({ t: `Borra las huellas del bosque (quedan ${pr})`, done: !pr });
        out.push({ t: `Arranca los pasquines del pueblo (quedan ${po})`, done: !po });
        out.push({ t: `Calma a los vecinos marcados con ! (quedan ${ne})`, done: !ne });
        out.push({ t: 'Pleno en el ayuntamiento: empiézalo entre las 9:00 y las 16:30 (dura hora y media)', done: this.speechDay === G.day });
        out.push({ t: 'Al anochecer, lo que quede sin hacer sube los rumores' });
      }
    }
    return out;
  }

  invLine() {
    switch (this.role) {
      case 'investigator': {
        const n = PROOF_KEYS.reduce((a, k) => a + this.got[k], 0);
        return `Pruebas sin enviar <b>${n}</b> · Cámara <b>● REC</b>`;
      }
      case 'hunter': return `Cepos <b>${this.hunt.carryTraps}</b> · Ramas <b>${this.hunt.carryCamo}</b> · Puntería <b>${this.hunt.skill}/${HUNTER_CFG.maxSkill}</b> · Caza <b>${this.hunt.points}</b>`;
      case 'mayor': return `Rumores <b>${this.rumors}/100</b>`;
      default: return '';
    }
  }

  // ======================= Bucle =======================
  update(dt) {
    const G = this.G;
    this.flashCd = Math.max(0, this.flashCd - dt);
    this.recCd = Math.max(0, this.recCd - dt);
    this.updateEmf(dt);
    this.hunt.update(dt);
    this.updateSpy(dt);
  }

  // ======================= Espiar con la cámara (investigadora, multijugador) =======================
  flagSus(t) { this.sus = { t, at: performance.now() }; }

  // Con el zoom puesto, la cámara enseña quién está en el centro del encuadre y qué lleva
  updateSpy(dt) {
    const G = this.G;
    const P = G.player;
    const el = this.spyEl || (this.spyEl = document.getElementById('spy-tag'));
    this.spyId = null;
    const on = this.role === 'investigator' && G.mp && P.aiming && G.weapons.current === 'none' && !P.dead && G.state === 'playing';
    if (on) {
      const eye = P.eyePos();
      const fwd = P.forward();
      let best = 0.985;
      G.mp.avatars.forEach((a, id) => {
        const peer = G.mp.peers.get(id);
        if (!a.has || !peer || peer.left || !peer.s || peer.role === 'monster') return;
        const c = new THREE.Vector3(a.pos.x, a.pos.y + 1.2, a.pos.z);
        const to = c.clone().sub(eye);
        const d = to.length();
        if (d > ROLE_CFG.investigator.spyRange || d < 1) return;
        const dot = fwd.dot(to.divideScalar(d));
        if (dot > best && G.world.lineOfSight(eye, c)) { best = dot; this.spyId = id; this.spyDist = d; }
      });
    }
    if (!el) return;
    if (!this.spyId) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    const peer = G.mp.peers.get(this.spyId);
    const s = peer.s;
    const WN = { none: 'las manos vacías', revolver: 'un revólver', shotgun: 'una escopeta', rifle: 'un rifle de caza', camera: 'una cámara' };
    const html = `<b>${ROLE_INFO[peer.role].name.toUpperCase()}</b> · ${Math.round(this.spyDist)} m<br>Lleva ${WN[s.wp] || 'algo'} · ${s.mo | 0} $${s.dd ? '<br>Está muerto' : ''}${s.sus ? `<br><em>⚠ ${s.sus}</em>` : ''}<br><small>clic: foto de vigilancia${s.sus ? ' (¡exclusiva!)' : ''}</small>`;
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    el.classList.remove('hidden');
  }

  // Foto a otro jugador: si le pilla haciendo algo feo, exclusiva; si no, le sigue la pista un rato
  spyPhoto(id) {
    const G = this.G;
    const peer = G.mp.peers.get(id);
    if (!peer || !peer.s) return;
    const who = ROLE_INFO[peer.role].the;
    this.tracked.set(id, performance.now() + ROLE_CFG.investigator.trackTime * 1000);
    if (peer.s.sus) {
      this.exclusives.push({ role: peer.role, what: peer.s.sus });
      SFX.sting();
      G.hud.banner('¡EXCLUSIVA!', `Has pillado a ${who} ${peer.s.sus}. Mándalo a la revista desde la radio.`, 5);
    } else G.hud.msg(`Foto de vigilancia de ${who}: le sigues la pista ${Math.round(ROLE_CFG.investigator.trackTime / 60)} minutos (◉ en la brújula).`, 5);
  }

  // ======================= Multijugador =======================
  // Lo que los demás necesitan saber de mi papel (va en mi estado)
  netState() {
    const o = this.objective();
    const s = { ob: [o.ok ? 1 : 0, o.txt] };
    if (this.role === 'investigator') { s.ps = this.sentTotal; s.xc = this.dossier ? 1 : 0; s.iv = this.ivDone; s.ex = this.exSent; }
    if (this.role === 'hunter' && this.hunt.hidden) s.hid = 1;
    // Lo que se le ve por la cámara de la investigadora: arma, dinero y lo que esté haciendo
    const G = this.G;
    s.wp = G.weapons.current;
    s.mo = G.money;
    if (this.sus && performance.now() - this.sus.at < 15000) s.sus = this.sus.t;
    if (this.role === 'mayor') { s.ih = this.prints.filter((p) => p.hidden).map((p) => p.k); s.ihd = this.G.day; }
    return s;
  }

  // Estado de otro humano: árboles talados, huellas borradas, pruebas publicadas, muertes
  onPeerState(id, role, s) {
    const G = this.G;
    const seen = this.peerSeen[id] || (this.peerSeen[id] = { ps: 0, xc: 0, dd: 0, iv: 0, ex: 0 });
    if (role === 'mayor' && Array.isArray(s.ih) && s.ihd === G.day && this.role === 'investigator') {
      s.ih.forEach((k) => {
        const p = this.prints.find((q) => q.k === k);
        if (p && !p.hidden) { p.hidden = true; p.mesh.visible = false; }
      });
    }
    if (role === 'investigator') {
      if ((s.ps | 0) > seen.ps) {
        const n = (s.ps | 0) - seen.ps;
        seen.ps = s.ps | 0;
        if (this.role === 'mayor') this.addRumors(n * ROLE_CFG.mayor.perProof, `La revista publica ${n} prueba${n > 1 ? 's' : ''} de la investigadora`);
        else G.hud.msg(`La investigadora ha enviado ${n} prueba${n > 1 ? 's' : ''} a la revista.`, 4);
      }
      if ((s.iv | 0) > seen.iv) {
        const n = (s.iv | 0) - seen.iv;
        seen.iv = s.iv | 0;
        if (this.role === 'mayor') this.addRumors(n * 3, 'Los vecinos le cuentan cosas a la investigadora');
      }
      if ((s.ex | 0) > seen.ex) {
        const n = (s.ex | 0) - seen.ex;
        seen.ex = s.ex | 0;
        if (this.role === 'mayor') this.addRumors(n * 8, 'La revista publica fotos comprometedoras de gente del pueblo');
        else G.hud.msg('La revista ha publicado fotos comprometedoras. ¿Saldrás tú?', 4);
      }
      if (s.xc && !seen.xc) {
        seen.xc = 1;
        if (this.role === 'mayor') this.addRumors(ROLE_CFG.mayor.dossier, 'El expediente de la investigadora sale en portada');
      }
    }
    if (s.dd && !seen.dd) {
      seen.dd = 1;
      if (this.role === 'mayor') this.addRumors(ROLE_CFG.mayor.perDeath, `Ha desaparecido ${ROLE_INFO[role].the}`);
    }
  }

  // ======================= Guardar (modo historia) =======================
  serialize() {
    return {
      role: this.role, seed: this.seed, got: this.got, sent: this.sent, sentTotal: this.sentTotal, dossier: this.dossier,
      anomGot: this.anomGot, anomSent: this.anomSent,
      hunt: this.hunt.serialize(),
      rumors: this.rumors, panic: this.panic,
    };
  }

  load(d) {
    if (!d) return;
    this.seed = d.seed >>> 0 || this.seed;
    if (d.got) Object.assign(this.got, d.got);
    if (d.sent) Object.assign(this.sent, d.sent);
    this.sentTotal = d.sentTotal || 0;
    this.dossier = !!d.dossier;
    this.anomGot = d.anomGot || 0;
    this.anomSent = d.anomSent || 0;
    this.hunt.load(d.hunt);
    this.rumors = d.rumors !== undefined ? d.rumors : ROLE_CFG.mayor.start;
    this.panic = !!d.panic;
  }
}
