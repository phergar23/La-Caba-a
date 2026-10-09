'use strict';

// Historia: el rastro de Tomás y la guarida del monstruo. Avanza a lo largo de los días,
// con un paso disponible cada jornada y sucesos relacionados con la criatura.
const STORY_STAGES = [
  { id: 'note', day: 1, label: 'Lee la nota que dejó Tomás (mesa de la cabaña)' },
  { id: 'tavern', day: 1, label: 'Pregunta por Tomás en la taberna del pueblo' },
  { id: 'diary', day: 2, label: 'Busca el diario de Tomás junto al pozo viejo' },
  { id: 'claws', day: 3, label: 'Sigue las marcas de garras desde el pozo' },
  { id: 'lair', day: 3, label: 'Busca pistas de Tomás en la guarida' },
  { id: 'priest', day: 4, label: 'Lleva la linterna de Tomás al padre Elías (iglesia)' },
  { id: 'burn', day: 5, label: 'Quema la guarida con un bidón de gasolina antes de que anochezca' },
  { id: 'night', day: 5, label: 'Sobrevive a esta noche: está furioso' },
  { id: 'end', day: 999, label: '' },
];

const TAVERN_STORY = [
  '¿Tomás? Venía cada tarde. Se sentaba ahí, de espaldas a la pared, mirando la puerta.',
  'La última semana estaba obsesionado. Decía que lo había visto DE DÍA, junto al pozo viejo del oeste.',
  'Llevaba un diario a todas partes. Una tarde volvió sin él, blanco como la cal. Dos días después desapareció.',
];

const PRIEST_STORY = [
  'Esta linterna... era de Tomás. Así que llegó hasta la guarida.',
  'Los viejos lo llaman el Ciervo Blanco. Fue un cazador de Robledal que se perdió en el bosque hace cien años. El bosque se quedó con él.',
  'Toma estas bengalas de magnesio. Su luz roja lo hace retroceder al instante: lánzalas con la G. Julián tiene más.',
  'Y escucha bien: el fuego no lo mata, pero quemar su guarida lo dejará sin refugio. Hazlo de día, con gasolina. Y prepárate para esa noche.',
];

const TOMAS_LINES = [
  'Guarda... soy yo. Soy Tomás. He vuelto.',
  'Ábreme, por favor. Hace tanto frío aquí fuera... tanto frío...',
  'He visto dónde duerme. Ábreme y te lo cuento. Ábreme. ÁBREME.',
  'Mi linterna... ¿tienes mi linterna? Ábreme y me la das.',
];

class Story {
  constructor(G) {
    this.G = G;
    this.stage = 0;
    this.flags = {};
    this.claws = [];
    this.inter = [];
    this.dayProps = [];
    this.dayInter = [];
    this.dayMarkers = [];
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.build();
  }

  get cur() { return STORY_STAGES[this.stage]; }
  get id() { return this.cur.id; }
  get ready() { return this.G.day >= this.cur.day; }

  sayLines(who, lines, gap = 5.5) {
    lines.forEach((l, i) => setTimeout(() => this.G.hud.say(who, l, gap), i * gap * 1000));
    return lines.length * gap;
  }

  advance() {
    this.stage++;
    SFX.ui();
    const c = this.cur;
    if (!c.label) return;
    if (this.ready) this.G.hud.msg('Historia: ' + c.label, 6);
    else this.G.hud.msg('La historia de Tomás continuará mañana.', 5);
  }

  // ---------- Escenario: guarida y árboles marcados ----------
  build() {
    const G = this.G;
    const W = G.world;
    const L = W.landmarks;
    const lair = L.lair;
    this.lairPos = new THREE.Vector3(lair.x, 0, lair.z);
    const g = this.group;
    const rockMat = new THREE.MeshLambertMaterial({ map: TEX.stone, color: 0x8a8478 });
    this.rockMat = rockMat;
    // Anillo de rocas abierto hacia el pozo
    const open = Math.atan2(L.well.z - lair.z, L.well.x - lair.x);
    for (let i = 0; i < 11; i++) {
      const a = open + 0.55 + (i / 10) * (Math.PI * 2 - 1.1);
      const r = 4.6 + (i % 3) * 0.4;
      const s = 1.2 + ((i * 7) % 5) * 0.18;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
      rock.scale.set(s, s * 1.2, s);
      rock.rotation.set(i, i * 2, 0);
      rock.position.set(lair.x + Math.cos(a) * r, s * 0.6, lair.z + Math.sin(a) * r);
      g.add(rock);
      W.addCircle(rock.position.x, rock.position.z, s * 0.95, s * 2);
    }
    // Huesos, astas y ropa de excursionistas
    const bone = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 });
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(boxGeo(0.06, 0.06, 0.35 + (i % 3) * 0.15, 1), bone);
      b.position.set(lair.x + Math.cos(i * 2.3) * (1 + (i % 4) * 0.7), 0.04, lair.z + Math.sin(i * 2.3) * (1 + (i % 4) * 0.7));
      b.rotation.y = i * 1.7;
      g.add(b);
    }
    [[-1.6, 0.8], [1.2, -1.4]].forEach(([dx, dz], i) => {
      const sk = makeDeerSkull();
      sk.position.set(lair.x + dx, 0, lair.z + dz);
      sk.rotation.y = i * 2;
      g.add(sk);
    });
    [0xc8402a, 0x2a8ac8, 0xe0a020].forEach((c, i) => {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
      cloth.rotation.x = -Math.PI / 2;
      cloth.rotation.z = i;
      cloth.position.set(lair.x - 2 + i * 1.6, 0.03, lair.z - 1.5 + (i % 2) * 2.5);
      g.add(cloth);
    });
    for (let i = 0; i < 14; i++) {
      const br = new THREE.Mesh(boxGeo(0.05, 0.05, 1.6, 1), MAT.deadbark);
      const a = (i / 14) * Math.PI * 2;
      br.position.set(lair.x + Math.cos(a) * 1.4 - 1, 0.12, lair.z + Math.sin(a) * 1.4 - 0.6);
      br.rotation.y = a + 1.2;
      br.rotation.z = 0.2;
      g.add(br);
    }
    // La criatura dormida (solo se ve una vez)
    this.sleeper = makeCreature();
    this.sleeper.rotation.z = Math.PI / 2;
    this.sleeper.rotation.y = 0.6;
    this.sleeper.position.set(lair.x - 1, 0.35, lair.z - 0.6);
    this.sleeper.visible = false;
    g.add(this.sleeper);
    // Linterna de Tomás
    this.lantern = makeOldLantern();
    this.lantern.position.set(lair.x + 1.4, 0, lair.z + 0.9);
    this.lantern.visible = false;
    g.add(this.lantern);
    // Fuego (cuando se quema la guarida)
    this.fires = [];
    for (let i = 0; i < 5; i++) {
      const f = makeCampfire();
      f.scale.setScalar(2.2);
      f.position.set(lair.x + Math.cos(i * 1.25) * 2, 0, lair.z + Math.sin(i * 1.25) * 2);
      f.visible = false;
      g.add(f);
      this.fires.push(f);
    }
    // Diario junto al pozo
    this.diary = makeJournal();
    this.diary.position.set(L.well.x + 2.3, 0, L.well.z - 1.7);
    this.diary.rotation.y = 0.7;
    this.diary.visible = false;
    g.add(this.diary);
    // Árboles con marcas de garras
    const scratch = new THREE.MeshBasicMaterial({ color: 0xcfc4a8, side: THREE.DoubleSide });
    L.claws.forEach((c, i) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.36, 7, 7), MAT.deadbark);
      trunk.position.y = 3.5;
      t.add(trunk);
      const toward = i < L.claws.length - 1 ? L.claws[i + 1] : lair;
      const face = Math.atan2(L.well.x - c.x, L.well.z - c.z);
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.1), scratch);
        const a = face + (k - 1.5) * 0.18;
        s.position.set(Math.sin(a) * 0.33, 1.9 + k * 0.08, Math.cos(a) * 0.33);
        s.rotation.y = a;
        s.rotation.z = 0.35;
        t.add(s);
      }
      t.position.set(c.x, 0, c.z);
      g.add(t);
      W.addCircle(c.x, c.z, 0.36, 7);
      this.claws.push({ pos: new THREE.Vector3(c.x, 0, c.z), seen: false, toward });
    });

    // Interacciones de la historia
    const self = this;
    this.inter.push({
      kind: 'story', pos: new THREE.Vector3(this.diary.position.x, 0.15, this.diary.position.z), r: 0.6,
      enabled: () => self.id === 'diary' && self.ready,
      prompt: () => ({ title: 'Una libreta empapada', lines: ['[E] Recoger'], info: [] }),
      act: (key, G2) => {
        if (key !== 'E') return false;
        self.diary.visible = false;
        SFX.paper();
        G2.readNote(NOTES.diary1, 'diary1');
        self.advance();
        return true;
      },
    });
    this.claws.forEach((c, i) => {
      this.inter.push({
        kind: 'story', pos: new THREE.Vector3(c.pos.x, 1.9, c.pos.z), r: 0.9,
        enabled: () => self.id === 'claws' && self.ready,
        prompt: () => ({ title: 'Árbol muerto', lines: ['[E] Examinar las marcas'], info: [c.seen ? 'Ya lo has examinado' : ''] }),
        act: (key) => {
          if (key !== 'E') return false;
          self.seeClaw(i);
          return true;
        },
      });
    });
    this.inter.push({
      kind: 'story', pos: new THREE.Vector3(this.lantern.position.x, 0.15, this.lantern.position.z), r: 0.6,
      enabled: () => self.id === 'lair' && self.ready,
      prompt: () => ({ title: 'Una linterna vieja', lines: ['[E] Recoger'], info: ['Tiene grabado: T. VIDAL'] }),
      act: (key, G2) => {
        if (key !== 'E') return false;
        self.lantern.visible = false;
        SFX.pickup();
        self.flags.lantern = true;
        G2.readNote(NOTES.diary2, 'diary2');
        self.advance();
        return true;
      },
    });
    this.inter.push({
      kind: 'story', pos: new THREE.Vector3(lair.x, 0.6, lair.z), r: 1.4,
      enabled: () => self.id === 'burn' && self.ready && G.phase === 'day',
      prompt: (G2) => ({ title: 'La guarida', lines: [`[E] Rociar con gasolina y prenderle fuego (bidones: ${G2.inv.fuel})`], info: [] }),
      act: (key, G2) => {
        if (key !== 'E') return false;
        if (G2.inv.fuel <= 0) { G2.hud.msg('Necesitas un bidón de gasolina (ferretería del pueblo).'); return true; }
        G2.inv.fuel--;
        self.burn();
        return true;
      },
    });
  }

  seeClaw(i) {
    const c = this.claws[i];
    if (c.seen) return;
    c.seen = true;
    SFX.twig(c.pos);
    const n = this.claws.filter((k) => k.seen).length;
    if (n >= this.claws.length) {
      this.G.hud.msg('Las marcas acaban en un círculo de rocas. Huele a carne podrida.', 6);
      this.advance();
    } else this.G.hud.msg(`Arañazos a dos metros de altura, frescos. Siguen hacia el suroeste (${n}/${this.claws.length}).`, 5);
  }

  burn() {
    const G = this.G;
    this.flags.burned = true;
    this.flags.burnNight = G.day;
    SFX.glug(this.lairPos);
    setTimeout(() => {
      SFX.bang(this.lairPos, 1.5);
      this.fires.forEach((f) => (f.visible = true));
      this.rockMat.color.set(0x3a3430);
    }, 1200);
    setTimeout(() => SFX.scream(new THREE.Vector3(this.lairPos.x - 40, 2, this.lairPos.z), 1.6), 3500);
    G.hud.banner('LA GUARIDA ARDE', 'Esta noche vendrá a por ti con todo lo que tiene.', 5);
    this.advance();
  }

  // ---------- Conversaciones ----------
  hasTalk(npcId) {
    if (!this.G.storyOn || !this.ready) return false;
    return (this.id === 'tavern' && npcId === 'tabernero') || (this.id === 'priest' && npcId === 'cura');
  }

  talkTo(npcId) {
    if (!this.hasTalk(npcId)) return false;
    const G = this.G;
    if (this.id === 'tavern') {
      const t = this.sayLines('Ramón (tabernero)', TAVERN_STORY);
      this.advance();
      setTimeout(() => G.hud.msg('Mañana podrás buscar el diario junto al pozo viejo (oeste).', 6), t * 1000);
      return true;
    }
    if (this.id === 'priest') {
      this.sayLines('Padre Elías', PRIEST_STORY, 6);
      G.inv.flares += 3;
      this.flags.flares = true;
      G.hud.msg('+3 bengalas (G para lanzar)', 6);
      this.advance();
      return true;
    }
    return false;
  }

  // ---------- Tareas, brújula y objetos ----------
  label() {
    if (!this.G.storyOn) return null;
    const c = this.cur;
    if (!c.label || !this.ready) return null;
    if (c.id === 'claws') return `${c.label} (${this.claws.filter((k) => k.seen).length}/${this.claws.length})`;
    return c.label;
  }

  markers() {
    if (!this.G.storyOn) return [];
    const out = this.dayMarkers.slice();
    if (!this.ready || this.G.phase !== 'day') return out;
    const L = this.G.world.landmarks;
    const id = this.id;
    if (id === 'note') out.push({ pos: { x: -1.4, z: 1.15 }, icon: '★', cls: 'story' });
    if (id === 'tavern') out.push({ pos: this.G.village.byId.tabernero.mesh.position, icon: '★', cls: 'story' });
    if (id === 'diary') out.push({ pos: L.well, icon: '★', cls: 'story' });
    if (id === 'claws') {
      const next = this.claws.find((c) => !c.seen);
      if (next) out.push({ pos: next.pos, icon: '★', cls: 'story' });
    }
    if (id === 'lair' || id === 'burn') out.push({ pos: this.lairPos, icon: '★', cls: 'story' });
    if (id === 'priest') out.push({ pos: this.G.village.byId.cura.mesh.position, icon: '★', cls: 'story' });
    return out;
  }

  get interactables() {
    if (!this.G.storyOn) return [];
    const all = this.inter.concat(this.dayInter);
    return all.filter((i) => !i.enabled || i.enabled());
  }

  // ---------- Sucesos del día ligados al monstruo ----------
  clearDay() {
    this.dayProps.forEach((p) => this.group.remove(p));
    this.dayProps = [];
    this.dayInter = [];
    this.dayMarkers = [];
    this.dayEvent = null;
  }

  addDayProp(mesh) {
    this.group.add(mesh);
    this.dayProps.push(mesh);
    return mesh;
  }

  startDay(day) {
    const G = this.G;
    this.clearDay();
    if (!G.storyOn) return;
    if (day === 2) {
      // Un "regalo" en el porche
      const sk = this.addDayProp(makeDeerSkull());
      sk.position.set(0.9, 0.04, 5.2);
      sk.rotation.y = Math.PI;
      for (let i = 0; i < 3; i++) {
        const crow = this.addDayProp(new THREE.Mesh(boxGeo(0.28, 0.1, 0.14, 1), MAT.dark));
        crow.position.set(-0.9 + i * 0.5, 0.06, 5.0 + (i % 2) * 0.5);
        crow.rotation.y = i * 1.4;
      }
      this.dayInter.push({
        kind: 'story', pos: new THREE.Vector3(0.9, 0.3, 5.2), r: 0.7,
        prompt: () => ({ title: 'Algo en el porche', lines: ['[E] Examinar'], info: [] }),
        act: (key) => {
          if (key !== 'E') return false;
          G.hud.msg('Un cráneo de ciervo con las cuencas manchadas de rojo y tres cuervos sin cabeza. Te está marcando.', 7);
          return true;
        },
      });
      setTimeout(() => G.phase === 'day' && G.hud.msg('Al abrir los ojos oyes graznidos. Hay algo en el porche.', 6), 6000);
    } else if (day === 3) {
      // Huellas enormes alrededor de la cabaña que se pierden hacia la guarida
      const footMat = new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.75 });
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * 7.5, z: Math.sin(a) * 6.5, a });
      }
      const L = G.world.landmarks;
      for (let i = 1; i <= 8; i++) pts.push({ x: U.lerp(-6, L.well.x, i / 12), z: U.lerp(-5, L.well.z, i / 12), a: 0 });
      pts.forEach((p, i) => {
        const f = this.addDayProp(new THREE.Mesh(new THREE.CircleGeometry(0.22, 6), footMat));
        f.rotation.x = -Math.PI / 2;
        f.scale.set(0.6, 1.6, 1);
        f.rotation.z = p.a + (i % 2 ? 0.2 : -0.2);
        f.position.set(p.x + (i % 2 ? 0.3 : -0.3), 0.04, p.z);
      });
      this.dayEvent = { type: 'prints', done: false };
    } else if (day === 4) {
      this.dayEvent = { type: 'voice', at: 13 * 60 + U.range(-40, 40), done: false };
    } else if (day >= 5) {
      this.dayEvent = { type: 'radio', at: 8 * 60 + 30, done: false };
    }
  }

  update(dt) {
    const G = this.G;
    if (!G.storyOn) { this.sleeper.visible = false; this.diary.visible = false; this.lantern.visible = false; return; }
    const P = G.player;
    const t = performance.now() * 0.001;
    // Avances automáticos
    if (this.id === 'note' && G.notesRead.has('n1')) this.advance();
    this.diary.visible = this.id === 'diary' && this.ready;
    this.lantern.visible = this.id === 'lair' && this.ready;
    if (this.id === 'claws' && this.ready) {
      this.claws.forEach((c, i) => { if (!c.seen && Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z) < 3) this.seeClaw(i); });
    }
    // La criatura dormida en la guarida: se esfuma al acercarte o al alumbrarla
    const dl = Math.hypot(P.pos.x - this.lairPos.x, P.pos.z - this.lairPos.z);
    if (this.id === 'lair' && this.ready && !this.flags.sawSleeping && G.phase === 'day') {
      this.sleeper.visible = true;
      animateCreature(this.sleeper, dt, 'idle', 0);
      const lit = P.flash.intensity > 0.4 && dl < 18 && P.forward().dot(this.lairPos.clone().sub(P.eyePos()).normalize()) > 0.95;
      if (dl < 8.5 || lit) {
        this.flags.sawSleeping = true;
        SFX.sting();
        setTimeout(() => SFX.whisper(this.lairPos, 1), 300);
        this.sleeper.visible = false;
        G.hud.msg('Estaba ahí, enroscado entre los huesos, respirando. Has parpadeado y ya no está.', 7);
      }
    } else this.sleeper.visible = false;
    if (this.flags.burned) this.fires.forEach((f) => { if (f.visible) animateCampfire(f, dt, t, true); });

    // Sucesos del día
    const e = this.dayEvent;
    if (e && !e.done && G.phase === 'day') {
      if (e.type === 'prints' && G.cabin.zoneOf(P.pos) === 'outside' && Math.hypot(P.pos.x, P.pos.z) < 10) {
        e.done = true;
        G.hud.msg('Huellas enormes, de pezuña alargada. Ha dado vueltas a la cabaña toda la noche. Se pierden hacia el pozo.', 7);
      } else if (e.type === 'voice' && G.clock >= e.at && G.cabin.zoneOf(P.pos) !== 'bunker' && !G.village.contains(P.pos)) {
        e.done = true;
        this.startVoice();
      } else if (e.type === 'radio' && G.clock >= e.at) {
        e.done = true;
        SFX.radio();
        G.hud.say('Radio Valle', `...ya son ${3 + G.day} los excursionistas desaparecidos en Robledal. Se recomienda no salir al bosque... sobre todo al anochecer...`, 7);
      }
    }
    if (this.voice) this.updateVoice(dt);
  }

  // Día 4: la voz de Tomás llama desde el bosque. Es un señuelo.
  startVoice() {
    const G = this.G;
    const P = G.player;
    const p = G.world.randomForestPoint(40, 60, P.pos, true);
    const jacket = this.addDayProp(new THREE.Group());
    const cloth = new THREE.Mesh(boxGeo(0.5, 0.65, 0.12, 1), new THREE.MeshLambertMaterial({ color: 0x3b4a2a }));
    cloth.position.y = 1.6;
    jacket.add(cloth);
    const branch = new THREE.Mesh(boxGeo(0.05, 2.2, 0.05, 1), MAT.deadbark);
    branch.position.set(-0.3, 1.1, 0);
    jacket.add(branch);
    jacket.position.set(p.x, 0, p.z);
    this.voice = { pos: new THREE.Vector3(p.x, 0, p.z), t: 0, callT: 0, seen: false };
    this.dayMarkers.push({ pos: this.voice.pos, icon: '★', cls: 'story' });
    this.dayInter.push({
      kind: 'story', pos: new THREE.Vector3(p.x, 1.5, p.z), r: 0.7,
      prompt: () => ({ title: 'Una chaqueta colgada', lines: ['[E] Registrarla'], info: [] }),
      act: (key) => {
        if (key !== 'E') return false;
        G.hud.msg('Es la chaqueta de guarda de Tomás, empapada y llena de arañazos. En el bolsillo, un papel: "NO SIGAS MI VOZ".', 8);
        return true;
      },
    });
    G.hud.say('Voz de Tomás', '¡Guarda! ¡Guarda, estoy aquí! ¡Ayúdame, por favor!', 5);
    SFX.call({ x: p.x, y: 1.6, z: p.z });
  }

  updateVoice(dt) {
    const G = this.G;
    const v = this.voice;
    const P = G.player;
    v.callT -= dt;
    const d = Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z);
    if (!v.seen && v.callT <= 0 && d > 10 && G.phase === 'day') {
      v.callT = 14;
      SFX.call({ x: v.pos.x, y: 1.6, z: v.pos.z });
      if (d < 70) G.hud.say('Voz de Tomás', U.pick(['¡Por aquí! ¡Date prisa!', '¡No me dejes aquí otra vez!', 'Guarda... ¿por qué no vienes?']), 3);
    }
    if (!v.seen && d < 9) {
      v.seen = true;
      // Al llegar, la criatura está justo detrás de la chaqueta
      const I = G.intruder;
      if (I.state === 'off' || I.state === 'apparition') {
        const away = new THREE.Vector3(v.pos.x - P.pos.x, 0, v.pos.z - P.pos.z).normalize();
        I.pos.set(v.pos.x + away.x * 4, 0, v.pos.z + away.z * 4);
        I.mesh.visible = true;
        I.state = 'apparition';
        I.anim = 'stare';
        I.apparition = { seen: 0, life: 1.6, noticed: true, close: true };
        I.faceTo(P.pos.x, P.pos.z, 1, 100);
      }
      SFX.sting();
      this.dayMarkers = [];
    }
  }

  // ---------- Noche y amanecer ----------
  onNight() {
    if (!this.G.storyOn) return;
    const enraged = this.id === 'night' && this.flags.burnNight === this.G.day;
    this.G.intruder.enraged = enraged;
    if (enraged) setTimeout(() => SFX.scream(new THREE.Vector3(-50, 2, -60), 1.6), 3000);
  }

  // Devuelve true si se ha alcanzado el final de la historia
  onDawn(survived) {
    this.G.intruder.enraged = false;
    if (!this.G.storyOn) return false;
    if (this.id === 'night' && this.flags.burnNight === survived) {
      this.advance();
      return true;
    }
    if (this.flags.burned) this.fires.forEach((f) => (f.visible = false));
    return false;
  }

  serialize() {
    return { stage: this.stage, flags: this.flags, claws: this.claws.map((c) => c.seen) };
  }

  load(d) {
    this.stage = d ? Math.min(d.stage || 0, STORY_STAGES.length - 1) : 0;
    this.flags = d && d.flags ? Object.assign({}, d.flags) : {};
    this.claws.forEach((c, i) => (c.seen = !!(d && d.claws && d.claws[i])));
    this.rockMat.color.set(this.flags.burned ? 0x3a3430 : 0x8a8478);
    this.fires.forEach((f) => (f.visible = false));
    this.voice = null;
    this.clearDay();
  }
}
