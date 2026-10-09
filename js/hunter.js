'use strict';

// Cazador: vive en el fortín (homes.js) y su objetivo es cobrarse la pieza.
// - Rifle de caza con mira (clic derecho). Su puntería mejora practicando en el campo de tiro.
// - Cepos (B): se dejan en el bosque; si el monstruo pisa uno, queda atrapado unos segundos.
// - Escondites (C): ramas y troncos; dentro no lo ven ni lo huelen (salvo muy cerca).
// - Marca de caza: cuando lo hiere, ve su rastro de sangre en la brújula un rato.
// - En multijugador sus disparos también hieren a los otros jugadores.
// Puntos de caza: el daño que le hace al monstruo y cada cepo que salta.

class HunterKit {
  constructor(R) {
    this.R = R;
    this.G = R.G;
    this.group = new THREE.Group();
    this.G.scene.add(this.group);
    this.trapMat = new THREE.MeshLambertMaterial({ color: 0x6a665e });
    this.reset();
  }

  get on() { return this.R.role === 'hunter'; }
  get fort() { return this.G.homes.fort; }

  reset() {
    (this.traps || []).forEach((t) => this.group.remove(t.mesh));
    (this.blinds || []).forEach((b) => this.group.remove(b.mesh));
    this.traps = [];
    this.blinds = [];
    this.points = 0;
    this.skill = 0;
    this.skillDay = 0;
    this.carryTraps = 0;
    this.carryCamo = 0;
    this.crateTraps = 0;
    this.crateCamo = 0;
    this.ammoDay = 0;
    this.markT = 0;
    this.alertPos = null;
    this.alertT = 0;
    this.hidden = false;
    this.round = null;
    this.best = 0;
    if (this.fort) this.fort.targets.forEach((t) => (t.want = 0));
  }

  setup() {
    const G = this.G;
    const W = G.weapons;
    W.owned.rifle = true;
    W.mag.rifle = CFG.WEAPONS.rifle.mag;
    G.inv.ammo308 = 15;
    this.carryTraps = 2;
    this.carryCamo = 1;
  }

  startDay(day) {
    // El arsenal se repone cada mañana
    this.crateTraps = 4;
    this.crateCamo = 2;
  }

  target() { return HUNTER_CFG.target[this.R.mode === 'mp' ? 'mp' : 'story']; }

  // Puntería: menos dispersión y más daño con el rifle
  aim() { return { spread: 1 - 0.15 * this.skill, damage: 1 + 0.08 * this.skill }; }

  // Durante una ronda de tiro, las balas son de prácticas (no gastan munición)
  practicing() { return !!this.round && this.G.weapons.current === 'rifle'; }

  addPoints(n, why) {
    if (!this.on) return;
    const before = this.points;
    this.points += Math.round(n);
    const t = this.target();
    if (before < t && this.points >= t) {
      this.G.hud.banner('PIEZA COBRADA', 'Ya tienes tu trofeo. Ahora solo tienes que seguir vivo.', 6);
      SFX.sting();
    } else if (why) this.G.hud.msg(`${why} (+${Math.round(n)} puntos de caza)`, 3);
  }

  // Le he dado (desde game.hitscan)
  onMonsterHit(dmg) {
    if (!this.on) return;
    this.markT = HUNTER_CFG.markTime;
    this.addPoints(dmg);
  }

  // ---------- Disparos: dianas y otros jugadores ----------
  // Devuelve la distancia al impacto si da a una diana levantada (o Infinity)
  hitTargets(o, d, tMax) {
    if (!this.round) return Infinity;
    let best = Infinity, hit = null;
    this.fort.targets.forEach((tg) => {
      if (tg.up < 0.8 || tg.done) return;
      const oc = new THREE.Vector3().subVectors(o, tg.center);
      const b = oc.dot(d), c2 = oc.lengthSq() - tg.r * tg.r;
      const disc = b * b - c2;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < tMax && t < best) { best = t; hit = tg; }
    });
    if (hit) {
      hit.done = true;
      hit.want = 0;
      this.round.hits++;
      SFX.knock(hit.center);
      this.G.hud.msg(`¡Diana! (${this.round.hits})`, 1.2);
    }
    return best;
  }

  // ---------- Cepos ----------
  placeTrap() {
    const G = this.G;
    const P = G.player;
    if (!this.on || P.dead) return;
    if (this.carryTraps <= 0) { G.hud.msg('No llevas cepos. Coge más en el arsenal del fortín.'); return; }
    if (this.traps.length >= HUNTER_CFG.maxTraps) { G.hud.msg(`Ya tienes ${HUNTER_CFG.maxTraps} cepos puestos. Recoge alguno antes.`); return; }
    const f = P.forward();
    const x = P.pos.x + f.x * 1.3, z = P.pos.z + f.z * 1.3;
    if (G.village.contains({ x, z }) || G.homes.homeAt(new THREE.Vector3(x, 0.5, z)) || G.cabin.zoneOf(new THREE.Vector3(x, 0.5, z)) !== 'outside') { G.hud.msg('Aquí no: los cepos van en el bosque.'); return; }
    this.carryTraps--;
    const t = { pos: new THREE.Vector3(x, 0, z), armed: true, mesh: this.trapMesh() };
    t.mesh.position.set(x, G.world.getFloorY(x, z, 0.5) + 0.02, z);
    t.mesh.rotation.y = Math.random() * 6;
    this.group.add(t.mesh);
    this.traps.push(t);
    this.setJaws(t);
    SFX.bolt(t.pos, true);
    G.hud.msg(`Cepo armado y tapado con hojas. (Llevas ${this.carryTraps})`);
  }

  trapMesh() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), this.trapMat);
    g.add(base);
    const jaws = [-1, 1].map((sd) => {
      const pv = new THREE.Group();
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 12, Math.PI), this.trapMat);
      jaw.rotation.x = Math.PI / 2;
      pv.add(jaw);
      for (let i = 0; i < 5; i++) {
        const a = ((i + 0.5) / 5) * Math.PI;
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), this.trapMat);
        tooth.position.set(Math.cos(a) * 0.28, 0.035, Math.sin(a) * 0.28);
        pv.add(tooth);
      }
      pv.rotation.y = sd > 0 ? 0 : Math.PI;
      g.add(pv);
      return pv;
    });
    const leaves = new THREE.Mesh(new THREE.CircleGeometry(0.34, 7), new THREE.MeshLambertMaterial({ color: 0x4a3a20, transparent: true, opacity: 0.55 }));
    leaves.rotation.x = -Math.PI / 2;
    leaves.position.y = 0.03;
    g.add(leaves);
    g.userData.jaws = jaws;
    g.userData.leaves = leaves;
    return g;
  }

  setJaws(t) {
    t.mesh.userData.jaws.forEach((pv, i) => (pv.rotation.z = t.armed ? 0 : (i ? 1 : -1) * 1.35));
    t.mesh.userData.leaves.visible = t.armed;
  }

  springTrap(t) {
    const G = this.G;
    t.armed = false;
    this.setJaws(t);
    SFX.bang(t.pos, 1.2);
    SFX.bolt(t.pos, false);
    this.alertPos = t.pos.clone();
    this.alertT = 30;
    G.hud.alert('¡CEPO! HA CAÍDO EN UNA TRAMPA');
    if (G.mp) G.mp.emit({ t: 'cepo', x: Math.round(t.pos.x * 10) / 10, z: Math.round(t.pos.z * 10) / 10 });
    else {
      const I = G.intruder;
      I.damage(HUNTER_CFG.trapDmg, false);
      if (I.hp > 0 && I.state !== 'flee') I.setState('stagger', HUNTER_CFG.trapHold);
      G.hud.msg('Lo tienes atrapado: ¡dispara ahora!', 4);
    }
    this.addPoints(HUNTER_CFG.trapPoints, 'Ha caído en un cepo');
  }

  // ---------- Escondites ----------
  buildBlind() {
    const G = this.G;
    const P = G.player;
    if (!this.on || P.dead) return;
    if (this.carryCamo <= 0) { G.hud.msg('No llevas ramas de camuflaje. Coge en el arsenal del fortín.'); return; }
    if (this.blinds.length >= HUNTER_CFG.maxBlinds) { G.hud.msg(`Ya tienes ${HUNTER_CFG.maxBlinds} escondites. Desmonta alguno (E) para hacer otro.`); return; }
    if (G.village.contains(P.pos) || G.homes.homeAt(P.pos) || G.cabin.zoneOf(P.pos) !== 'outside') { G.hud.msg('Los escondites van en el bosque.'); return; }
    if (this.blinds.some((b) => b.pos.distanceTo(P.pos) < 8)) { G.hud.msg('Ya hay un escondite muy cerca.'); return; }
    this.carryCamo--;
    const b = { pos: new THREE.Vector3(P.pos.x, 0, P.pos.z), mesh: this.blindMesh(P.yaw) };
    b.mesh.position.copy(b.pos);
    this.group.add(b.mesh);
    this.blinds.push(b);
    SFX.twig(b.pos);
    G.hud.msg('Escondite montado. Dentro no te ven ni te huelen, salvo que estén encima.', 5);
  }

  blindMesh(yaw) {
    const g = new THREE.Group();
    const logMats = [new THREE.MeshLambertMaterial({ map: MAT.bark.map, color: 0x9a7a52 })];
    // Media luna de ramas y un parapeto de troncos, abierta por detrás
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      const br = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.5 + (i % 3) * 0.2, 5), MAT.needles);
      br.position.set(Math.sin(a) * 1.0, 0.7, -Math.cos(a) * 1.0);
      br.rotation.set(-Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      g.add(br);
    }
    for (let i = 0; i < 2; i++) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), logMats[0]);
      lg.rotation.z = Math.PI / 2;
      lg.position.set(0, 0.15 + i * 0.24, -0.95);
      g.add(lg);
    }
    g.rotation.y = yaw;
    return g;
  }

  // ---------- Campo de tiro ----------
  startRound() {
    const G = this.G;
    if (this.round) return;
    if (!G.weapons.owned.rifle) { G.hud.msg('Necesitas el rifle.'); return; }
    G.weapons.select('rifle');
    if (G.weapons.mag.rifle <= 0) G.weapons.mag.rifle = 1;
    const order = this.fort.targets.map((t) => t.k).sort(() => Math.random() - 0.5);
    this.round = { order, i: -1, t: 1.2, hits: 0 };
    this.fort.targets.forEach((t) => { t.want = 0; t.done = false; });
    SFX.click(null, 0.6);
    G.hud.msg('Ronda de tiro: seis dianas, una detrás de otra. Mira con el clic derecho. Las balas de prácticas no gastan munición.', 5);
  }

  updateRound(dt) {
    const r = this.round;
    if (!r) return;
    const G = this.G;
    const T = this.fort.targets;
    // Si se aleja del banco, se acaba
    if (G.player.pos.distanceTo(this.fort.bench) > 6) { this.endRound(true); return; }
    r.t -= dt;
    if (r.t > 0) return;
    if (r.i >= 0) T[r.order[r.i]].want = 0;
    r.i++;
    if (r.i >= r.order.length) { this.endRound(false); return; }
    const tg = T[r.order[r.i]];
    tg.want = 1;
    tg.done = false;
    r.t = HUNTER_CFG.targetUp - this.skill * 0.12;
    SFX.click(tg.center, 0.5);
  }

  endRound(aborted) {
    const G = this.G;
    const r = this.round;
    this.round = null;
    this.fort.targets.forEach((t) => (t.want = 0));
    if (aborted) { G.hud.msg('Te has ido del banco: ronda cancelada.'); return; }
    this.best = Math.max(this.best, r.hits);
    let txt = `${r.hits} de 6 dianas.`;
    if (r.hits >= 4 && this.skillDay !== G.day && this.skill < HUNTER_CFG.maxSkill) {
      this.skill++;
      this.skillDay = G.day;
      txt += ` Tu puntería sube a ${this.skill}/${HUNTER_CFG.maxSkill}: el rifle tiembla menos y hace más daño.`;
      SFX.chime(null, 1.2, 0.5);
    } else if (r.hits >= 4 && this.skillDay === G.day) txt += ' Buena ronda (la puntería solo sube una vez al día).';
    else txt += ' Hacen falta 4 para mejorar la puntería.';
    G.hud.banner('RONDA DE TIRO', txt, 5);
  }

  // ---------- Interacción ----------
  interactables() {
    if (!this.on) return [];
    const G = this.G;
    const F = this.fort;
    const out = [];
    const c = F.center;
    if (!this.arsenal) {
      const up = F.FY;
      this.arsenal = [
        {
          kind: 'role', pos: new THREE.Vector3(c.x - 0.6, up + 1.1, c.z - 3.9), r: 1.1,
          prompt: () => ({ title: 'Armero del fortín', lines: [this.ammoDay === G.day ? 'Ya has cogido la munición de hoy' : '[E] Coger munición (+10 balas de rifle)'], info: [`Balas de rifle: ${G.inv.ammo308} · Puntería ${this.skill}/${HUNTER_CFG.maxSkill}`] }),
          act: (key) => {
            if (key !== 'E') return false;
            if (this.ammoDay === G.day) return true;
            this.ammoDay = G.day;
            G.inv.ammo308 += 10;
            SFX.reload('rifle');
            G.hud.msg('Te llenas los bolsillos de balas de rifle.');
            return true;
          },
        },
        {
          kind: 'role', pos: new THREE.Vector3(c.x + 3.9, up + 1.3, c.z - 1.3), r: 1.0,
          prompt: () => ({ title: 'Cepos', lines: [this.crateTraps ? `[E] Coger cepos (quedan ${this.crateTraps})` : 'No quedan cepos hasta mañana'], info: [`Llevas ${this.carryTraps}/${HUNTER_CFG.carryTraps} · B: colocar uno delante`] }),
          act: (key) => {
            if (key !== 'E') return false;
            const n = Math.min(this.crateTraps, HUNTER_CFG.carryTraps - this.carryTraps);
            if (n <= 0) { G.hud.msg(this.crateTraps ? 'No puedes cargar más cepos.' : 'No quedan cepos hasta mañana.'); return true; }
            this.crateTraps -= n;
            this.carryTraps += n;
            SFX.bolt(null, true);
            G.hud.msg(`Coges ${n} cepo${n > 1 ? 's' : ''}. Con B lo dejas armado delante de ti.`);
            return true;
          },
        },
        {
          kind: 'role', pos: new THREE.Vector3(c.x + 0.5, up + 0.9, c.z + 0.2), r: 1.0,
          prompt: () => ({ title: 'Ramas de camuflaje', lines: [this.crateCamo ? `[E] Coger ramas (quedan ${this.crateCamo})` : 'No quedan ramas hasta mañana'], info: [`Llevas ${this.carryCamo}/${HUNTER_CFG.carryCamo} · C: montar un escondite donde estés`] }),
          act: (key) => {
            if (key !== 'E') return false;
            const n = Math.min(this.crateCamo, HUNTER_CFG.carryCamo - this.carryCamo);
            if (n <= 0) { G.hud.msg(this.crateCamo ? 'No puedes cargar más.' : 'No quedan ramas hasta mañana.'); return true; }
            this.crateCamo -= n;
            this.carryCamo += n;
            SFX.twig(null);
            G.hud.msg(`Coges ramas para ${n} escondite${n > 1 ? 's' : ''}. Con C lo montas donde estés.`);
            return true;
          },
        },
        {
          kind: 'role', pos: new THREE.Vector3(F.bench.x, 1.0, F.bench.z), r: 1.3,
          prompt: () => ({ title: 'Banco de tiro', lines: [this.round ? 'Ronda en marcha' : '[E] Empezar una ronda de tiro'], info: [`Puntería ${this.skill}/${HUNTER_CFG.maxSkill} · mejor ronda ${this.best}/6`, 'Acierta 4 de 6 para mejorar (una vez al día)'] }),
          act: (key) => {
            if (key !== 'E') return false;
            if (G.phase !== 'day') { G.hud.msg('De noche no se practica: se caza.'); return true; }
            this.startRound();
            return true;
          },
        },
      ];
    }
    this.arsenal.forEach((i) => out.push(i));
    this.traps.forEach((t) => out.push(t.inter || (t.inter = {
      kind: 'role', pos: new THREE.Vector3(t.pos.x, 0.3, t.pos.z), r: 1.0,
      prompt: () => ({ title: 'Cepo', lines: [t.armed ? '[E] Recogerlo' : '[E] Volver a armarlo', t.armed ? '' : '[Q] Recogerlo'].filter(Boolean), info: [t.armed ? 'Armado' : 'Ha saltado'] }),
      act: (key) => {
        if (key === 'E' && !t.armed) { t.armed = true; this.setJaws(t); SFX.bolt(t.pos, true); G.hud.msg('Cepo armado otra vez.'); return true; }
        if (key === 'E' || key === 'Q') {
          this.traps = this.traps.filter((x) => x !== t);
          this.group.remove(t.mesh);
          this.carryTraps = Math.min(HUNTER_CFG.carryTraps, this.carryTraps + 1);
          SFX.pickup();
          return true;
        }
        return false;
      },
    })));
    this.blinds.forEach((b) => out.push(b.inter || (b.inter = {
      kind: 'role', pos: new THREE.Vector3(b.pos.x, 0.8, b.pos.z), r: 1.6,
      prompt: () => ({ title: 'Escondite', lines: ['[Q] Desmontarlo'], info: [this.hidden ? 'Estás escondido' : 'Métete dentro para que no te vean'] }),
      act: (key) => {
        if (key !== 'Q') return false;
        this.blinds = this.blinds.filter((x) => x !== b);
        this.group.remove(b.mesh);
        this.carryCamo = Math.min(HUNTER_CFG.carryCamo, this.carryCamo + 1);
        SFX.twig(b.pos);
        return true;
      },
    })));
    return out;
  }

  key(code) {
    if (!this.on) return false;
    if (code === 'KeyB') { this.placeTrap(); return true; }
    if (code === 'KeyC') { this.buildBlind(); return true; }
    return false;
  }

  // ---------- Bucle ----------
  monsterPos() {
    const G = this.G;
    const I = G.intruder;
    if (I.netMode) return G.mp && G.mp.monsterPos();
    if (I.mesh.visible && !['off', 'gone', 'apparition'].includes(I.state)) return I.pos;
    return null;
  }

  update(dt) {
    if (!this.on) { this.hidden = false; return; }
    const G = this.G;
    const P = G.player;
    this.markT = Math.max(0, this.markT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    this.updateRound(dt);
    this.hidden = !P.dead && this.blinds.some((b) => Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z) < 1.15);
    const m = this.monsterPos();
    if (m) this.traps.forEach((t) => {
      if (t.armed && Math.hypot(m.x - t.pos.x, m.z - t.pos.z) < HUNTER_CFG.trapR && Math.abs(m.y - t.pos.y) < 1.5) this.springTrap(t);
    });
  }

  markers() {
    if (!this.on) return [];
    const out = [{ pos: this.fort.center, icon: '◆', cls: 'home' }];
    this.traps.forEach((t) => out.push({ pos: t.pos, icon: t.armed ? '⊓' : '⊔', cls: t.armed ? 'item' : 'story' }));
    this.blinds.forEach((b) => out.push({ pos: b.pos, icon: '♣', cls: 'item' }));
    if (this.alertT > 0 && this.alertPos) out.push({ pos: this.alertPos, icon: '◎', cls: 'story' });
    const m = this.markT > 0 && this.monsterPos();
    if (m) out.push({ pos: m, icon: '✚', cls: 'story' });
    return out;
  }

  taskLines() {
    const G = this.G;
    const out = [];
    const t = this.target();
    out.push({ t: `Puntos de caza ${this.points}/${t}: daño que le hagas y cepos que salten`, done: this.points >= t });
    if (G.phase === 'day') {
      out.push({ t: `Campo de tiro (al este del fortín): puntería ${this.skill}/${HUNTER_CFG.maxSkill}`, done: this.skillDay === G.day });
      out.push({ t: `Cepos: llevas ${this.carryTraps}, puestos ${this.traps.filter((x) => x.armed).length} (B para colocar)` });
      out.push({ t: `Escondites: ${this.blinds.length}/${HUNTER_CFG.maxBlinds} (C para montar uno con ramas)` });
    }
    if (this.hidden) out.push({ t: 'ESCONDIDO: no te ve ni te huele', story: true });
    if (this.markT > 0) out.push({ t: `Le has dado: su rastro de sangre (✚) se ve ${Math.ceil(this.markT)} s`, story: true });
    return out;
  }

  serialize() {
    return {
      points: this.points, skill: this.skill, best: this.best, carryTraps: this.carryTraps, carryCamo: this.carryCamo,
      traps: this.traps.map((t) => [Math.round(t.pos.x * 10) / 10, Math.round(t.pos.z * 10) / 10, t.armed ? 1 : 0]),
      blinds: this.blinds.map((b) => [Math.round(b.pos.x * 10) / 10, Math.round(b.pos.z * 10) / 10]),
    };
  }

  load(d) {
    if (!d) return;
    this.points = d.points || 0;
    this.skill = d.skill || 0;
    this.best = d.best || 0;
    this.carryTraps = d.carryTraps || 0;
    this.carryCamo = d.carryCamo || 0;
    (d.traps || []).forEach(([x, z, a]) => {
      const t = { pos: new THREE.Vector3(x, 0, z), armed: !!a, mesh: this.trapMesh() };
      t.mesh.position.set(x, this.G.world.getFloorY(x, z, 0.5) + 0.02, z);
      this.group.add(t.mesh);
      this.traps.push(t);
      this.setJaws(t);
    });
    (d.blinds || []).forEach(([x, z]) => {
      const b = { pos: new THREE.Vector3(x, 0, z), mesh: this.blindMesh(Math.random() * 6) };
      b.mesh.position.copy(b.pos);
      this.group.add(b.mesh);
      this.blinds.push(b);
    });
  }
}

const HUNTER_CFG = {
  target: { story: 350, mp: 220 },
  markTime: 45,
  maxTraps: 6, carryTraps: 4, trapR: 1.1, trapDmg: 20, trapHold: 3.5, trapPoints: 40,
  maxBlinds: 3, carryCamo: 2,
  maxSkill: 5, targetUp: 2.4,
  pvp: 0.6,            // los disparos a otros jugadores hacen esta parte del daño
};
