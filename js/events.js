'use strict';

// Sucesos nocturnos: vecinos que llaman a la puerta (de verdad o no), averías, ruidos...
const VISITORS = [
  {
    name: 'Paco (vecino)', look: { shirt: 0x5a4a2a, pants: 0x2a2a30, hair: 0x3a2a1a, hat: 0x6a5a3a },
    lines: [
      '¡Guarda! Soy Paco, el de la granja de abajo. Se me ha roto la furgoneta en el camino. ¿Me dejas pasar hasta que amanezca?',
      'Llevo el farol casi sin aceite... Hay algo moviéndose entre los árboles. Por favor, ábreme.',
      'Te lo pagaré, de verdad. Solo hasta que salga el sol.',
    ],
  },
  {
    name: 'Marisa (vecina)', look: { shirt: 0x7a3a5a, pants: 0x2a2a2a, hair: 0x8a5a2a },
    lines: [
      '¿Hola? Soy Marisa, la de la taberna. Volvía de casa de mi hermana y me he perdido. ¿Puedo entrar?',
      'Se me ha apagado el móvil y no veo nada... Llevo el farol, mírame por la ventana si quieres.',
      'Por favor, guarda. Tengo mucho miedo.',
    ],
  },
  {
    name: 'Excursionista', look: { shirt: 0xe0a020, pants: 0x2a3a4a, hair: 0x111111, backpack: 0x2a4a7a },
    lines: [
      '¡Por favor! ¿Hay alguien? Mis amigos se han ido detrás de unas luces rojas y no han vuelto...',
      'He visto luz en tu ventana. ¡Ábreme, por favor, te lo suplico!',
      'Algo nos ha seguido toda la tarde. Ábreme, no quiero estar aquí fuera.',
    ],
  },
];

const MIMIC_LINES = [
  'Soy Paco... Paco, del pueblo. Abre. Ábreme, guarda.',
  'Se me ha roto la furgoneta. La furgoneta. Abre la puerta.',
  'Hace frío aquí fuera. Mucho frío. Mucho. Déjame entrar.',
  'Guarda... soy Anselmo. Te traigo balas. Abre la puerta para las balas.',
  'Soy tu vecina. Tu vecina. Ábreme. ÁBREME.',
  'Sé que estás ahí. Te oigo respirar. Abre.',
];

const GIFTS = [
  { k: 'planks', n: 2, t: 'dos tablones' },
  { k: 'batteries', n: 1, t: 'unas pilas' },
  { k: 'fuel', n: 1, t: 'un bidón de gasolina' },
  { k: 'ammo38', n: 6, t: 'seis balas' },
  { k: 'medkits', n: 1, t: 'un botiquín' },
];

class VisitorEvent {
  constructor(N, real, tomas) {
    this.N = N;
    this.G = N.G;
    this.real = real && !tomas;
    this.tomas = !!tomas;
    this.mimicLines = tomas ? TOMAS_LINES : MIMIC_LINES;
    this.done = false;
    this.t = 0;
    this.knockT = 0;
    this.lineI = 0;
  }

  start() {
    const G = this.G;
    const I = G.intruder;
    if (G.cabin.zoneOf(G.player.pos) === 'outside') return false;
    if (!['far', 'circle', 'approach', 'entry', 'stare'].includes(I.state) || G.cabin.zoneOf(I.pos) !== 'outside') return false;
    this.entry = Math.random() < 0.7 ? G.cabin.entries[0] : G.cabin.entries[1];
    this.door = this.entry.ref;
    if (this.door.open) return false;
    if (this.real) {
      this.v = U.pick(VISITORS);
      I.holdOff(80);
      this.npc = makeHuman(this.v.look);
      const lantern = new THREE.Mesh(boxGeo(0.14, 0.2, 0.14, 1), new THREE.MeshBasicMaterial({ color: 0xffc060 }));
      lantern.position.set(0, -0.62, 0.06);
      this.npc.userData.armR.children[0].add(lantern);
      this.npc.position.copy(this.entry.outside);
      this.G.scene.add(this.npc);
      this.phase = 'knock';
      this.lantern = lantern;
    } else {
      if (!I.beginMimic(this.entry, 34)) return false;
      this.phase = 'mimic';
    }
    this.knockT = 0.5;
    return true;
  }

  movers() { return this.npc && this.npc.visible ? [this.npc.position] : []; }

  speak(text) {
    const G = this.G;
    // Si es el monstruo imitando una voz, la grabadora de la investigadora la recoge
    if (this.phase === 'mimic' && G.roles) G.roles.monsterSound(G.intruder.pos);
    if (G.cabin.zoneOf(G.player.pos) === 'outside') return;
    const name = this.tomas ? 'Voz de Tomás al otro lado de la puerta' : 'Voz al otro lado de la puerta';
    G.hud.say(name, text, 5);
  }

  update(dt) {
    const G = this.G;
    this.t += dt;
    if (this.phase === 'mimic') {
      const I = G.intruder;
      if (I.state !== 'mimic') { this.done = true; return; }
      this.knockT -= dt;
      if (this.knockT <= 0) {
        this.knockT = U.range(6, 8);
        SFX.knock(this.door.pos);
        const line = this.tomas ? this.mimicLines[Math.min(this.lineI++, this.mimicLines.length - 1)] : U.pick(this.mimicLines);
        setTimeout(() => this.speak(line), 900);
      }
      return;
    }
    const npc = this.npc;
    if (this.phase === 'knock') {
      npc.rotation.y = Math.atan2(this.door.pos.x - npc.position.x, this.door.pos.z - npc.position.z);
      animateHuman(npc, dt, 0);
      this.knockT -= dt;
      if (this.knockT <= 0) {
        this.knockT = 8;
        SFX.knock(this.door.pos);
        const line = this.v.lines[Math.min(this.lineI++, this.v.lines.length - 1)];
        setTimeout(() => this.speak(line), 900);
      }
      if (this.door.open) {
        this.phase = 'enter';
        G.hud.say(this.v.name, '¡Gracias! Gracias... Cierra, cierra rápido.');
      } else if (this.t > 36) {
        this.phase = 'leave';
        this.speak('Vale... Vale. Me iré andando. Gracias por nada.');
        const a = Math.atan2(npc.position.z, npc.position.x);
        this.leaveTo = new THREE.Vector3(Math.cos(a) * 30, 0, Math.sin(a) * 30);
      }
      return;
    }
    if (this.phase === 'enter') {
      const front = this.door === G.cabin.frontDoor;
      const seat = front ? new THREE.Vector3(-1.6, 0, 2.2) : new THREE.Vector3(-2.2, 0, -1.4);
      const target = this.reachedInside ? seat : this.door.insideSpot;
      const d = this.walk(target, 1.8, dt, this.door);
      if (d < (this.reachedInside ? 0.7 : 0.3)) {
        if (!this.reachedInside) this.reachedInside = true;
        else {
          this.phase = 'guest';
          npc.position.copy(seat);
          npc.rotation.y = front ? Math.PI : 0;
          const gift = U.pick(GIFTS);
          G.inv[gift.k] += gift.n;
          G.hud.say(this.v.name, `Toma, ${gift.t}. Es lo menos que puedo hacer. Me quedo aquí calladito hasta que amanezca.`);
          G.hud.msg(`+ ${gift.t}`);
          this.N.guests.push(this);
          this.done = true;
        }
      }
      return;
    }
    if (this.phase === 'leave') {
      const d = this.walk(this.leaveTo, 1.5, dt);
      if (d < 1 || this.t > 70) {
        npc.visible = false;
        this.phase = 'gone';
        setTimeout(() => {
          SFX.scream({ x: this.leaveTo.x, y: 1.5, z: this.leaveTo.z }, 0.6);
          if (G.phase === 'night') G.hud.msg('A lo lejos, un grito se apaga entre los árboles.');
        }, 6000);
        this.done = true;
      }
    }
  }

  walk(target, speed, dt, ignore) {
    const npc = this.npc;
    const dx = target.x - npc.position.x, dz = target.z - npc.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const s = Math.min(d, speed * dt);
      npc.position.x += (dx / d) * s;
      npc.position.z += (dz / d) * s;
      this.G.world.collide(npc.position, 0.3, 0, 1.7, ignore);
      npc.rotation.y = Math.atan2(dx, dz);
    }
    animateHuman(npc, dt, d > 0.05 ? speed : 0);
    return d;
  }

  guestUpdate(dt) {
    animateHuman(this.npc, dt, 0, { sit: true });
    this.npc.position.y = -0.35;
  }

  remove() { if (this.npc) this.G.scene.remove(this.npc); }
}

// Sucesos cortos (sin personajes)
const SIMPLE_EVENTS = {
  generator(G) {
    if (!G.power.fail()) return false;
    G.hud.msg('¡El generador se ha parado! Hay que volver a arrancarlo (planta de arriba).', 7);
    return true;
  },
  lights(G) {
    if (!G.power.dip(7)) return false;
    G.hud.msg('Las luces parpadean y se apagan un momento...');
    return true;
  },
  roofsteps(G) {
    const P = G.player;
    const z = G.cabin.zoneOf(P.pos);
    if (z === 'outside' || z === 'roof' || G.cabin.zoneOf(G.intruder.pos) === 'roof') return false;
    for (let i = 0; i < 7; i++) {
      setTimeout(() => SFX.heavyStep({ x: -3 + i * 0.9, y: 6.1, z: -1 + Math.sin(i) * 1.5 }, 0.9), i * 650);
    }
    return true;
  },
  windowtap(G) {
    const w = U.pick(G.cabin.windows);
    if (G.cabin.zoneOf(G.player.pos) === 'outside') return false;
    SFX.knock(w.pos);
    setTimeout(() => G.hud.msg('Algo ha golpeado el cristal de una ventana...'), 800);
    return true;
  },
  radio(G) {
    SFX.radio();
    setTimeout(() => SFX.whisper(G.radio.pos, 0.8), 600);
    G.hud.say('Radio (se ha encendido sola)', '...abre... abre la puerta, guarda... te estamos esperando...', 6);
    return true;
  },
  namecall(G) {
    const P = G.player;
    const a = Math.random() * Math.PI * 2;
    SFX.call({ x: P.pos.x + Math.cos(a) * 28, y: 1.6, z: P.pos.z + Math.sin(a) * 28 });
    G.hud.say('Voz lejana', U.pick(['¡Guaaarda! ¡Ayúdame! ¡Estoy herido!', '¡Tomás! ¡Tomás, ¿dónde estás?!', '¡Socorro! ¡Que alguien me ayude!']), 4);
    return true;
  },
};

class NightEvents {
  constructor(G) {
    this.G = G;
    this.queue = [];
    this.active = null;
    this.guests = [];
  }

  startNight(night) {
    this.clear();
    // En multijugador no hay visitas: quien llama a la puerta es siempre la otra persona
    const mp = !!this.G.mp;
    // Con otro papel no se está en la cabaña: solo voces que llaman desde el bosque
    if (!mp && this.G.role && this.G.role !== 'ranger') {
      const t0 = CFG.TIME.NIGHT_START + 60, t1 = CFG.TIME.NIGHT_END - 90;
      this.queue = [{ type: 'namecall', at: U.range(t0, t1), tries: 0 }];
      return;
    }
    const n = mp ? 2 : Math.min(5, 2 + Math.floor(night / 2));
    const types = mp ? [] : [night === 3 ? 'tomas' : 'visitor'];
    if (!mp && night >= 2 && Math.random() < 0.6) types.push('visitor');
    const pool = mp ? ['generator', 'lights', 'roofsteps', 'windowtap', 'radio'] : ['generator', 'lights', 'roofsteps', 'windowtap', 'radio', 'namecall'];
    while (types.length < n) types.push(U.pick(pool));
    const times = [];
    const t0 = CFG.TIME.NIGHT_START + 35, t1 = CFG.TIME.NIGHT_END - 70;
    const span = (t1 - t0) / types.length;
    types.sort(() => Math.random() - 0.5).forEach((type, i) => {
      times.push({ type, at: t0 + span * i + Math.random() * span * 0.7, tries: 0 });
    });
    this.queue = times;
  }

  clear() {
    if (this.active) this.active.remove();
    this.guests.forEach((g) => g.remove());
    this.active = null;
    this.guests = [];
    this.queue = [];
  }

  // Al amanecer, los invitados se marchan y dejan propina
  dawn() {
    const n = this.guests.length;
    if (n) this.G.addMoney(25 * n, n > 1 ? 'Tus invitados te dan las gracias' : 'Tu invitado te da las gracias');
    this.clear();
  }

  movers() {
    const out = [];
    if (this.active && this.active.movers) this.active.movers().forEach((p) => out.push(p));
    return out;
  }

  update(dt) {
    const G = this.G;
    if (G.phase !== 'night') return;
    this.guests.forEach((g) => g.guestUpdate(dt));
    if (this.active) {
      this.active.update(dt);
      if (this.active.done) {
        if (this.active.phase !== 'guest') this.active.remove();
        this.active = null;
      }
      return;
    }
    const next = this.queue[0];
    if (!next || G.clock < next.at) return;
    let ok;
    if (next.type === 'visitor' || next.type === 'tomas') {
      const real = next.type === 'visitor' && Math.random() < (G.day === 1 ? 0.6 : 0.5);
      const ev = new VisitorEvent(this, real, next.type === 'tomas');
      ok = ev.start();
      if (ok) this.active = ev;
    } else ok = SIMPLE_EVENTS[next.type](G);
    if (ok || next.tries >= 3) this.queue.shift();
    else {
      next.tries++;
      next.at += 25;
    }
  }
}
