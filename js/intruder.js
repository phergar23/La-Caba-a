'use strict';

// "El Visitante": la criatura que intenta entrar en la cabaña cada noche.
const KNOCK_LINES = [
  '¿Hola...? Me he perdido. Por favor, abre la puerta.',
  'Guarda... soy yo, Tomás. Déjame entrar. Hace frío.',
  'Sé que estás ahí dentro. Te oigo respirar.',
  'Abre. Solo quiero hablar contigo.',
  'Por favor... hay algo en el bosque... ábreme...',
];

class Intruder {
  constructor(G) {
    this.G = G;
    this.mesh = makeCreature();
    this.mesh.visible = false;
    G.scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.state = 'off';
    this.t = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.entry = null;
    this.lastEntry = null;
    this.nearness = 0;
    this.exposure = 0;
    this.anim = 'idle';
    this.facing = 0;
    this.stepAcc = 0;
    this.sub = null;
    this.scratchT = 0;
    this.path = null;
    this.replanT = 0;
    this.stuck = { t: 0, from: new THREE.Vector3(), detour: null, dt: 0 };
    this.retreated = false;
    this.seenThisNight = false;
    this.stareCd = 0;
    this.apparitionAt = null;
    this.apparition = null;
    this.twigT = 20;
    this.st = 0;
    this.busyT = 0;
    this.watch = { t: 0, from: new THREE.Vector3(), n: 0 };
    this.lunge = false;
    this.afterClimb = null;
    // Multijugador: el cuerpo lo mueve la otra persona (ver updateNet)
    this.netMode = false;
    this.netState = null;
    this.pendingDmg = 0;
    this.lit = 0;
  }

  get night() { return this.G.day; }

  // Modo historia con otro papel: el monstruo va a por su casa (caravana, caseta o ayuntamiento)
  get home() {
    const G = this.G;
    if (this.netMode || G.mp || !G.homes || !G.role || G.role === 'ranger') return null;
    return G.homes.get(G.role);
  }

  // Zona de una posición: la de la cabaña o, si hay otra casa, 'home' (dentro) / 'outside'
  zone(p) {
    const h = this.home;
    if (h) return h.contains(p) ? 'home' : 'outside';
    return this.G.cabin.zoneOf(p);
  }

  get center() { const h = this.home; return h ? h.center : { x: 0, z: 0 }; }

  // Lo que le obliga a apartarse: la bengala y lo que pongan las casas (farolas del alcalde...)
  repellers() {
    const G = this.G;
    const out = G.homes ? G.homes.repellers() : [];
    if (G.flare && G.flare.t > 0) out.push({ pos: G.flare.pos, r: 14, flare: true });
    return out;
  }

  repelledAt(p, extra = 0) {
    return this.repellers().find((r) => Math.hypot(r.pos.x - p.x, r.pos.z - p.z) < r.r + extra && Math.abs((r.pos.y || 0) - p.y) < 4) || null;
  }

  // Le espanta algo (trampa de flash, campana): se aparta un rato
  scare(msg) {
    if (['off', 'gone', 'apparition', 'flee', 'retreat', 'exit', 'hexit', 'jumpoff', 'fall'].includes(this.state)) return false;
    SFX.scream(this.pos, 1);
    this.voiced();
    if (msg) this.G.hud.msg(msg, 5);
    this.exposure = 0;
    this.beginFlee(false);
    return true;
  }
  get f() { return 1 + 0.22 * (this.night - 1) + (this.enraged ? 0.25 : 0); }

  headPos(out = new THREE.Vector3()) {
    return this.mesh.userData.head.getWorldPosition(out);
  }

  // ---------- Ciclo día/noche ----------
  startNight() {
    const G = this.G;
    if (this.netMode) { this.seenThisNight = false; return; }
    this.maxHp = CFG.INTRUDER.hp + CFG.INTRUDER.hpPerNight * (this.night - 1);
    this.hp = this.maxHp;
    this.retreated = false;
    this.seenThisNight = false;
    this.exposure = 0;
    this.lastEntry = null;
    this.apparition = null;
    this.mesh.visible = true;
    const pz = this.zone(G.player.pos);
    if (pz === 'outside') {
      const p = G.world.randomForestPoint(34, 44, G.player.pos, false);
      this.pos.set(p.x, 0, p.z);
      this.setState('hunt_out', 4);
      setTimeout(() => { SFX.growl(this.pos, 1.2); this.voiced(); }, 1500);
    } else {
      this.spawnFar();
      this.setState('far', U.range(8, 14) / this.f);
    }
  }

  endNight() {
    this.state = 'off';
    this.mesh.visible = false;
    this.nearness = 0;
    this.entry = null;
  }

  startDay() {
    this.endNight();
    const G = this.G;
    if (this.netMode) { this.apparitionQueue = []; this.apparitionAt = null; return; }
    // Una aparición diurna al día, a una hora aleatoria
    const n = Math.min(3, 1 + Math.floor((G.day - 1) / 2));
    const times = [];
    for (let i = 0; i < n; i++) times.push(U.range(9 * 60 + i * 150, 9 * 60 + (i + 1) * 150));
    if (G.day === 1) times[0] = U.range(10 * 60, 13 * 60);
    this.apparitionQueue = times;
    this.apparitionAt = this.apparitionQueue.shift();
  }

  spawnFar() {
    const G = this.G;
    let best = null;
    for (let i = 0; i < 12; i++) {
      const p = G.world.randomForestPoint(42, 58, this.center, true);
      const d = Math.hypot(p.x - G.player.pos.x, p.z - G.player.pos.z);
      if (!best || d > best.d) best = { p, d };
    }
    this.pos.set(best.p.x, 0, best.p.z);
  }

  setState(s, t = 0) {
    this.state = s;
    this.t = t;
    this.gathered = false;
    this.sub = null;
    this.path = null;
    this.stuck.detour = null;
    this.stuck.t = 0;
    this.stuck.from.copy(this.pos);
    this.st = 0;
    this.watch.t = 0;
    this.watch.from.copy(this.pos);
  }

  // Suceso nocturno: se hace pasar por un vecino que llama a la puerta
  beginMimic(entry, t) {
    if (!['far', 'circle', 'approach', 'entry', 'stare'].includes(this.state)) return false;
    if (this.zone(this.pos) !== 'outside') return false;
    this.entry = entry;
    this.pos.copy(entry.outside);
    this.mesh.visible = true;
    this.setState('mimic', t);
    return true;
  }

  // Se aparta un rato (mientras un vecino de verdad está en la puerta)
  holdOff(t) {
    if (!['far', 'circle', 'approach', 'entry', 'stare'].includes(this.state)) return;
    if (Math.hypot(this.pos.x, this.pos.z) < 35) this.spawnFar();
    this.entry = null;
    this.setState('far', t);
  }

  // ---------- Movimiento ----------
  moveTo(target, speed, dt, opts = {}) {
    const G = this.G;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) return d;
    let vx = dx / d, vz = dz / d;
    if (this.pos.y < 1 && this.zone(this.pos) === 'outside') {
      // Esquivar troncos: empuje lateral hacia el lado libre
      const near = G.world.circlesNear(this.pos.x, this.pos.z);
      let ax = 0, az = 0;
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        const ox = this.pos.x - c.x, oz = this.pos.z - c.z;
        const od = Math.hypot(ox, oz);
        const lim = c.r + 1.3;
        if (od < lim && od > 0.01 && -ox * vx - oz * vz > 0) {
          const k = (lim - od) / lim;
          const side = -vz * ox + vx * oz >= 0 ? 1 : -1;
          ax += -vz * side * k * 1.4 + (ox / od) * k * 0.6;
          az += vx * side * k * 1.4 + (oz / od) * k * 0.6;
        }
      }
      vx += ax; vz += az;
      const vl = Math.hypot(vx, vz) || 1;
      vx /= vl; vz /= vl;
    }
    if (this.stuck.detour) {
      vx = this.stuck.detour.x; vz = this.stuck.detour.z;
    }
    const step = Math.min(d, speed * dt);
    this.pos.x += vx * step;
    this.pos.z += vz * step;
    if (!opts.noCollide) G.world.collide(this.pos, 0.33, this.pos.y, 2.1, opts.ignore, this.zone(this.pos) !== 'outside');
    const fy = G.world.getFloorY(this.pos.x, this.pos.z, this.pos.y);
    if (fy > this.pos.y) this.pos.y = fy;
    else this.pos.y += (fy - this.pos.y) * Math.min(1, dt * 12);
    this.faceTo(this.pos.x + vx, this.pos.z + vz, dt);
    this.footsteps(step, speed);
    this.anim = speed > 3 ? 'run' : 'walk';
    this.checkStuck(dt, speed, vx, vz, d);
    return d - step;
  }

  // Si lleva un rato sin avanzar hacia un objetivo lejano, prueba a rodear el obstáculo
  checkStuck(dt, speed, vx, vz, dist) {
    const s = this.stuck;
    if (s.detour) {
      s.dt -= dt;
      if (s.dt <= 0) s.detour = null;
      return;
    }
    if (dist < 1.5 || speed < 1.2) {
      s.t = 0;
      s.from.copy(this.pos);
      return;
    }
    s.t += dt;
    if (s.t > 1.5) {
      const moved = Math.hypot(this.pos.x - s.from.x, this.pos.z - s.from.z);
      if (moved < speed * 1.5 * 0.25) {
        const side = Math.random() < 0.5 ? 1 : -1;
        s.detour = { x: -vz * side, z: vx * side };
        s.dt = 1.0;
      }
      s.t = 0;
      s.from.copy(this.pos);
    }
  }

  faceTo(x, z, dt, rate = 8) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.facing += U.wrapAngle(target - this.facing) * Math.min(1, dt * rate);
    this.mesh.rotation.y = this.facing;
  }

  footsteps(step, speed) {
    this.stepAcc += step;
    const stride = speed > 3 ? 1.9 : 1.3;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      const d = this.distToPlayer();
      if (d < 30) SFX.heavyStep(this.pos, speed > 3 ? 1.0 : 0.7);
    }
  }

  // No puede atacar a través de paredes, puertas cerradas o ventanas intactas
  canReach() {
    const P = this.G.player;
    const a = new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z);
    const b = new THREE.Vector3(P.pos.x, P.pos.y + 1.3, P.pos.z);
    return this.G.world.lineOfSight(a, b, (bx) => bx.solid && !(bx.owner && bx.owner.kind === 'window' && bx.owner.open));
  }

  distToPlayer() {
    const p = this.G.player.pos;
    return Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z);
  }

  // ---------- Reacciones ----------
  hitTest(o, d, maxT) {
    if (!this.mesh.visible || this.state === 'off') return null;
    const hp = this.headPos();
    const th = U.raySphere(o, d, hp, 0.26, maxT);
    const tb = U.rayCylinder(o, d, this.pos.x, this.pos.z, 0.36, this.pos.y, this.pos.y + 2.2, maxT);
    if (th < tb && th < Infinity) return { t: th, head: true };
    if (tb < Infinity) return { t: tb, head: false };
    return null;
  }

  damage(dmg, head) {
    const G = this.G;
    if (this.netMode) { this.pendingDmg += dmg * (head ? 1.8 : 1); return; }
    if (this.state === 'apparition') { this.vanish(); return; }
    if (this.state === 'off' || this.state === 'retreat') return;
    this.hp -= dmg * (head ? 1.8 : 1);
    SFX.scream(this.pos, 1.1);
    this.voiced();
    if (G.roles) G.roles.addBlood(this.pos);
    if (this.hp <= 0) {
      this.hp = 0;
      this.retreated = true;
      G.hud.banner('Ha huido malherido', 'Pero volverá. Siempre vuelve.', 4);
      this.beginFlee(true);
      return;
    }
    this.setState('stagger', 0.45);
  }

  onGunshot(from, hit) {
    if (this.netMode) { if (this.G.mp) this.G.mp.onShot(from); return; }
    // Un disparo cerca hace que se lo piense dos veces
    if (hit || this.state === 'off' || this.state === 'apparition') return;
    const d = Math.hypot(from.x - this.pos.x, from.z - this.pos.z);
    if (d < 8 && (this.state === 'entry' || this.state === 'approach') && Math.random() < 0.25) this.beginFlee(false);
  }

  // Ha hecho un ruido con la garganta (voz, gruñido, chillido): para la grabadora de la investigadora
  voiced() {
    if (this.G.roles) this.G.roles.monsterSound(this.pos);
  }

  vanish() {
    SFX.whisper(this.pos, 0.6);
    this.apparition = null;
    if (this.apparitionQueue && this.apparitionQueue.length && this.G.phase === 'day') {
      this.apparitionAt = Math.max(this.apparitionQueue.shift(), this.G.clock + 40);
    }
    this.state = 'off';
    this.mesh.visible = false;
  }

  beginFlee(forGood) {
    const G = this.G;
    this.exposure = 0;
    const zone = this.zone(this.pos);
    this.fleeForGood = forGood;
    if (zone === 'home') {
      this.setState('hexit');
      return;
    }
    if (zone === 'ground' || zone === 'upper' || zone === 'bunker') {
      this.setState('exit');
      return;
    }
    if (zone === 'roof') {
      this.setState('jumpoff');
      return;
    }
    if (this.state === 'climb') {
      this.setState('fall');
      return;
    }
    const pp = G.player.pos;
    let best = null;
    for (let i = 0; i < 10; i++) {
      const p = G.world.randomForestPoint(40, 55, this.center, true);
      const d = Math.hypot(p.x - pp.x, p.z - pp.z) + Math.hypot(p.x - this.pos.x, p.z - this.pos.z) * -0.4;
      if (!best || d > best.d) best = { p, d };
    }
    this.fleeTarget = new THREE.Vector3(best.p.x, 0, best.p.z);
    this.setState(forGood ? 'retreat' : 'flee', 12);
  }

  // Linterna: si le da de lleno un rato, se aparta
  updateExposure(dt) {
    const G = this.G;
    const P = G.player;
    if (this.mesh.visible && G.power && G.power.floodHits(new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z))) {
      this.exposure += dt * 1.6;
      return true;
    }
    if (P.flash.intensity < 0.4 || !this.mesh.visible) {
      this.exposure = Math.max(0, this.exposure - dt * 0.6);
      return false;
    }
    const e = P.eyePos();
    const c = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const to = c.clone().sub(e);
    const d = to.length();
    if (d > 24) { this.exposure = Math.max(0, this.exposure - dt * 0.6); return false; }
    to.divideScalar(d);
    const fwd = P.forward();
    const lit = fwd.dot(to) > Math.cos(0.36) && G.world.lineOfSight(e, c);
    if (lit) this.exposure += dt; else this.exposure = Math.max(0, this.exposure - dt * 0.6);
    return lit;
  }

  // ---------- Bucle principal ----------
  // Multijugador: sigue la posición que manda el otro jugador y calcula si la luz le da
  updateNet(dt) {
    const G = this.G;
    const n = this.netState;
    if (!n || !n.vis || !Array.isArray(n.p)) {
      this.mesh.visible = false;
      this.state = 'off';
      this.nearness += (0 - this.nearness) * Math.min(1, dt * 2);
      this.lit = 0;
      return;
    }
    const [tx, ty, tz] = n.p;
    if (!this.mesh.visible || Math.hypot(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z) > 6) {
      this.pos.set(tx, ty, tz);
      this.mesh.rotation.y = n.yw + Math.PI;
    }
    this.state = 'net';
    this.mesh.visible = true;
    const bx = this.pos.x, bz = this.pos.z;
    const k = Math.min(1, dt * 12);
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.y += (ty - this.pos.y) * k;
    this.pos.z += (tz - this.pos.z) * k;
    this.mesh.rotation.y += U.wrapAngle(n.yw + Math.PI - this.mesh.rotation.y) * k;
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    if (n.an === 'walk' || n.an === 'run') this.footsteps(moved, n.sp || 0);
    animateCreature(this.mesh, dt, n.an || 'idle', n.sp || 0);

    // ¿Le da la linterna o el foco?
    const P = G.player;
    const c = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const flood = G.power && G.power.floodHits(c);
    let flash = false;
    if (P.flash.intensity > 0.4 && !P.dead) {
      const e = P.eyePos();
      const to = c.clone().sub(e);
      const d = to.length();
      if (d < 24) flash = P.forward().dot(to.divideScalar(d)) > Math.cos(0.36) && G.world.lineOfSight(e, c);
    }
    this.lit = (flash ? 1 : 0) | (flood ? 2 : 0);
    const d = this.distToPlayer();
    if (this.lit && !this.seenThisNight && d < 22) {
      this.seenThisNight = true;
      SFX.sting();
    }
    const pz = this.zone(P.pos), mz = this.zone(this.pos);
    let near = U.clamp(1 - d / 22, 0, 1);
    if (mz !== 'outside' && pz !== 'outside' && mz === pz) near = Math.max(near, 0.8);
    this.nearness += (near - this.nearness) * Math.min(1, dt * 2);
  }

  update(dt) {
    const G = this.G;
    if (this.netMode) { this.updateNet(dt); return; }
    this.twigT -= dt;
    if (this.state === 'gone') {
      // Nunca se queda fuera toda la noche
      if (this.G.phase === 'night') this.recover();
      this.nearness = 0;
      return;
    }
    if (this.state === 'off' || this.state === 'apparition') {
      this.updateApparition(dt);
      this.nearness = 0;
      if (this.state === 'apparition') animateCreature(this.mesh, dt, this.anim, 0);
      return;
    }
    this.t -= dt;
    this.st += dt;
    this.busyT = Math.max(0, this.busyT - dt);
    this.anim = 'idle';
    this.stareCd -= dt;
    const P = G.player;
    const pz = this.zone(P.pos);
    const myZone = this.zone(this.pos);
    const I = CFG.INTRUDER;
    const f = this.f;

    // Exposición a la luz
    const lit = this.updateExposure(dt);
    const fleeAt = I.lightToFlee * (1 + 0.35 * (this.night - 1)) * (myZone === 'outside' ? 1 : 1.6) * (this.enraged ? 1.6 : 1);
    const rep = !['flee', 'retreat', 'exit', 'hexit', 'jumpoff', 'fall', 'stagger'].includes(this.state) ? this.repelledAt(this.pos) : null;
    if (rep) {
      SFX.scream(this.pos, 1);
      if (rep.lamp) {
        // Retrocede ante la farola... y a veces la revienta de una pedrada
        if (Math.random() < 0.5) G.homes.townhall.breakLamp(rep.lamp.k, false);
        else if (G.homes.townhall.owner) G.hud.msg(`La farola de ${rep.lamp.name} lo hace retroceder.`);
      } else G.hud.msg(rep.fire ? 'El fuego de la hoguera lo hace retroceder.' : 'La luz roja de la bengala lo hace retroceder.');
      this.beginFlee(false);
      return;
    }
    const canLightFlee = ['approach', 'entry', 'circle', 'far', 'hunt_out', 'stare', 'inside', 'hinside', 'roof', 'roofhunt', 'mimic'].includes(this.state);
    if (lit && !this.seenThisNight && this.distToPlayer() < 22) {
      this.seenThisNight = true;
      SFX.sting();
    }
    if (lit && canLightFlee && this.exposure > fleeAt) {
      SFX.scream(this.pos, 0.8);
      this.voiced();
      G.hud.msg('La luz lo ha espantado... por ahora.');
      this.beginFlee(false);
    } else if (lit && this.stareCd <= 0 && ['approach', 'circle', 'far'].includes(this.state) && this.distToPlayer() > 8) {
      this.stareCd = 14;
      this.prevState = this.state;
      this.prevT = this.t;
      this.prevEntry = this.entry;
      this.setState('stare', U.range(1.2, 2.2));
    }

    // Si el jugador sale de la cabaña de noche, va a por él
    const huntable = !['flee', 'retreat', 'stagger', 'attack', 'recoil', 'enter', 'exit', 'hexit', 'jumpoff', 'fall', 'climb', 'climbin', 'dropin', 'dropbunker', 'climbtrap', 'climbup'].includes(this.state);
    if (pz === 'outside' && myZone === 'outside' && huntable && this.state !== 'hunt_out') this.setState('hunt_out', 0);

    const handler = this['st_' + this.state];
    if (handler) handler.call(this, dt, { P, pz, myZone, I, f });
    this.watchdog(dt, this.zone(this.pos));

    // Ataque cuerpo a cuerpo
    if (!['attack', 'recoil', 'flee', 'retreat', 'stagger', 'exit', 'hexit', 'jumpoff', 'fall', 'climb', 'enter', 'climbin', 'dropin', 'dropbunker', 'climbtrap', 'climbup'].includes(this.state) && !P.climb && !P.dead) {
      const d = this.distToPlayer();
      if (d < 1.35 && Math.abs(P.pos.y - this.pos.y) < 1.2 && this.canReach()) {
        this.setState('attack', I.attackWindup);
      }
    }

    // Cercanía para la tensión (sonido, parpadeo de luces)
    const d = this.distToPlayer();
    let n = U.clamp(1 - d / 22, 0, 1);
    if (myZone !== 'outside' && pz !== 'outside' && myZone === pz) n = Math.max(n, 0.8);
    if (this.state === 'far' || this.state === 'retreat') n *= 0.3;
    this.nearness += (n - this.nearness) * Math.min(1, dt * 2);

    // Ramitas que crujen alrededor (paranoia)
    if (this.twigT <= 0) {
      this.twigT = U.range(18, 40);
      if (pz !== 'outside' || Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        SFX.twig({ x: P.pos.x + Math.cos(a) * 12, y: 0.5, z: P.pos.z + Math.sin(a) * 12 });
      }
    }

    animateCreature(this.mesh, dt, this.anim, 0);
  }

  // Si lleva un rato sin avanzar, lo recoloca: dentro de la cabaña lo lleva al nodo de su ruta;
  // fuera, lo empuja o lo devuelve al bosque. Así nunca se queda atascado toda la noche.
  watchdog(dt, myZone) {
    const w = this.watch;
    const moving = ['inside', 'hinside', 'exit', 'hexit', 'approach', 'circle', 'hunt_out', 'flee', 'retreat', 'roof', 'roofhunt'].includes(this.state);
    if (!moving || this.busyT > 0 || this.distToPlayer() < 2) {
      w.t = 0;
      w.from.copy(this.pos);
      return;
    }
    w.t += dt;
    if (w.t < 2.5) return;
    const moved = this.pos.distanceTo(w.from);
    w.t = 0;
    w.from.copy(this.pos);
    if (moved > 0.5) { w.n = 0; return; }
    w.n++;
    const G = this.G;
    if (myZone === 'outside') {
      if (w.n >= 3) {
        w.n = 0;
        if (['flee', 'retreat'].includes(this.state)) {
          this.mesh.visible = this.state !== 'retreat';
          if (this.state === 'retreat') this.recover();
          else { this.spawnFar(); this.setState('far', 4); }
        } else {
          this.spawnFar();
          this.setState('far', 3);
        }
      }
      return;
    }
    if (myZone === 'home') {
      // Dentro de otra casa: a la entrada por la que vino (o al centro)
      const e = this.entry && this.entry.home ? this.entry : this.home.entries[0];
      this.pos.copy(e.ref.insideSpot);
      w.n = 0;
      return;
    }
    let key = this.path && this.path[0];
    let n = key ? G.cabin.nodes[key] : null;
    if (!n || Math.abs(n.y - this.pos.y) > 1.5) n = G.cabin.nodes[G.cabin.nearestNode(this.pos)];
    this.pos.copy(n);
    this.path = null;
    this.stuck.detour = null;
    w.n = 0;
  }

  // Bajar al búnker por la trampilla del suelo (desde la planta baja)
  gateDownBunker(dt, speed) {
    const G = this.G;
    const T = G.cabin.trapdoor;
    const top = G.cabin.nodes.gT;
    if (Math.hypot(top.x - this.pos.x, top.z - this.pos.z) > 0.45) { this.moveTo(top, speed, dt); return; }
    this.busyT = 0.3;
    this.faceTo(T.cx, T.cz, dt);
    if (!T.open) {
      this.sub = this.sub || { t: 0, bang: 0 };
      this.sub.t += dt;
      if (T.bolted) {
        this.anim = 'bash';
        T.breach += dt / (CFG.INTRUDER.bunkerTime / this.f);
        this.sub.bang -= dt;
        if (this.sub.bang <= 0) {
          this.sub.bang = 1.3;
          SFX.bang(T.pos, 1.5);
          T.shake = 1;
          if (this.zone(G.player.pos) === 'bunker') G.player.shake = Math.max(G.player.shake, 0.35);
        }
        if (T.breach >= 1) {
          T.breach = 0;
          T.bolted = false;
          SFX.glass(T.pos);
          SFX.bang(T.pos, 1.6);
          if (this.zone(G.player.pos) === 'bunker') G.hud.msg('¡Ha reventado el cerrojo de la trampilla!');
        }
        return;
      }
      this.anim = 'pick';
      if (this.sub.t > 1.0) { T.setOpen(true, true); this.sub = null; }
      return;
    }
    this.climbFrom = this.pos.clone();
    this.setState('dropbunker', 1.0);
  }

  // Subir del búnker a la planta baja
  gateUpBunker(dt, speed, after) {
    const G = this.G;
    const T = G.cabin.trapdoor;
    const bottom = G.cabin.nodes.bL;
    if (Math.hypot(bottom.x - this.pos.x, bottom.z - this.pos.z) > 0.45) { this.moveTo(bottom, speed, dt); return; }
    this.busyT = 0.3;
    if (!T.open) {
      this.sub = this.sub || { t: 0 };
      this.sub.t += dt;
      this.anim = 'pick';
      if (this.sub.t > 0.4 && T.bolted) T.setBolt(false);
      if (this.sub.t > 1.2) { T.setOpen(true, true); this.sub = null; }
      return;
    }
    this.climbFrom = this.pos.clone();
    this.afterClimb = after || 'inside';
    this.setState('climbtrap', 1.0);
  }

  st_dropbunker() {
    const G = this.G;
    this.anim = 'climb';
    const k = U.clamp(1 - Math.max(0, this.t) / 1.0, 0, 1);
    const b = G.cabin.nodes.bL;
    this.pos.set(U.lerp(this.climbFrom.x, 2.7, Math.min(1, k * 3)), U.lerp(0, -3, k), U.lerp(this.climbFrom.z, k < 0.8 ? -1.2 : b.z, Math.min(1, k * 2)));
    if (this.t <= 0) {
      this.pos.copy(b);
      SFX.heavyStep(this.pos, 1.3);
      this.setState('inside');
      if (this.zone(G.player.pos) === 'bunker') {
        SFX.sting();
        G.hud.banner('ESTÁ EN EL BÚNKER', '', 2);
      }
    }
  }

  st_climbtrap() {
    const G = this.G;
    this.anim = 'climb';
    const k = U.clamp(1 - Math.max(0, this.t) / 1.0, 0, 1);
    const top = G.cabin.nodes.gT;
    this.pos.set(U.lerp(this.climbFrom.x, 2.7, Math.min(1, k * 3)), U.lerp(-3, 0, k), U.lerp(this.climbFrom.z, k < 0.8 ? -1.2 : top.z, Math.min(1, k * 2)));
    if (this.t <= 0) {
      this.pos.copy(top);
      const next = this.afterClimb || 'inside';
      this.afterClimb = null;
      const keepHunt = this.exitThenHunt;
      this.setState(next);
      this.exitThenHunt = keepHunt;
    }
  }

  // Imitando a un vecino ante la puerta: si le abren, se lanza dentro
  st_mimic(dt, c) {
    const ref = this.entry.ref;
    this.anim = 'idle';
    this.moveTo(this.entry.outside, 1, dt);
    this.faceTo(ref.pos.x, ref.pos.z, dt, 6);
    if (ref.open) {
      this.lunge = true;
      SFX.scream(this.pos, 1.2);
      this.setState('enter');
      return;
    }
    if (this.t <= 0) this.setState('entry');
  }

  // --- Estados ---
  st_far(dt, c) {
    this.anim = 'idle';
    this.faceTo(this.center.x, this.center.z, dt, 2);
    if (this.t <= 0) this.chooseAction(c);
  }

  chooseAction(c) {
    const G = this.G;
    const P = c.P;
    if (this.home) { this.chooseHomeEntry(c); return; }
    // El jugador en el tejado: a veces se queda mirándolo desde el claro
    if (c.pz === 'roof' && Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2;
      this.circleTarget = new THREE.Vector3(Math.cos(a) * 13, 0, Math.sin(a) * 13);
      this.setState('circle', U.range(10, 16));
      this.circleAngle = a;
      return;
    }
    const entries = G.cabin.entries.filter((e) => e.type !== 'hatch' || this.night >= 2);
    const weights = entries.map((e) => {
      let w = 1;
      if (this.repelledAt(e.outside, -2)) return 0.05;
      if (!e.ref.secure) w += 3;
      if (e.type === 'window' && !e.ref.glass) w += 2;
      if (e === this.lastEntry) w *= 0.4;
      const ins = e.type === 'hatch' ? new THREE.Vector3(-0.5, 3, -2.5) : e.ref.insideSpot;
      w += Math.hypot(ins.x - P.pos.x, ins.z - P.pos.z) * 0.18;
      if (e.type === 'hatch' && c.pz === 'roof') w += 3;
      return w;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = entries[0];
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i];
      if (r <= 0) { pick = entries[i]; break; }
    }
    this.entry = pick;
    this.lastEntry = pick;
    if (Math.random() < 0.3) {
      const a = Math.atan2(this.pos.z - this.center.z, this.pos.x - this.center.x);
      this.circleAngle = a;
      this.setState('circle', U.range(8, 14));
    } else this.setState('approach');
  }

  // Otra casa: elige puerta o ventana (evita la que protege el fuego)
  chooseHomeEntry(c) {
    const P = c.P;
    const entries = this.home.entries;
    const weights = entries.map((e) => {
      if (this.repelledAt(e.outside, 0.5)) return 0.04;
      let w = 1;
      if (!e.ref.secure) w += 3;
      if (e.type === 'window' && !e.ref.glass) w += 2;
      if (e === this.lastEntry) w *= 0.5;
      w += Math.hypot(e.ref.insideSpot.x - P.pos.x, e.ref.insideSpot.z - P.pos.z) * 0.1;
      return w;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = entries[0];
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i];
      if (r <= 0) { pick = entries[i]; break; }
    }
    this.entry = pick;
    this.lastEntry = pick;
    if (Math.random() < 0.25) {
      const cc = this.center;
      this.circleAngle = Math.atan2(this.pos.z - cc.z, this.pos.x - cc.x);
      this.setState('circle', U.range(6, 10));
    } else this.setState('approach');
  }

  st_circle(dt, c) {
    // Rodea la casa desde la linde del bosque
    const cc = this.center;
    const R = this.home ? 11 : 14;
    this.circleAngle += dt * 0.12;
    const tx = cc.x + Math.cos(this.circleAngle) * R, tz = cc.z + Math.sin(this.circleAngle) * R;
    const d = this.moveTo({ x: tx, z: tz }, CFG.INTRUDER.walk, dt);
    if (d < 0.3) this.faceTo(c.P.pos.x, c.P.pos.z, dt, 2);
    if (this.t <= 0) {
      if (!this.entry) this.chooseAction(c);
      else this.setState('approach');
    }
  }

  st_stare(dt, c) {
    this.anim = 'stare';
    this.faceTo(c.P.pos.x, c.P.pos.z, dt, 3);
    if (this.t <= 0) {
      const ps = this.prevState || 'approach';
      this.state = ps;
      this.t = this.prevT || 5;
      this.entry = this.prevEntry;
      this.sub = null;
      this.path = null;
    }
  }

  st_approach(dt, c) {
    const e = this.entry;
    if (!e) { this.setState('far', 2); return; }
    const G = this.G;
    const speed = CFG.INTRUDER.walk * (0.9 + this.f * 0.2) * (this.distToPlayer() > 30 ? 1.6 : 1);
    if (e.home) {
      if (!this.gathered && Math.hypot(e.gather.x - this.pos.x, e.gather.z - this.pos.z) < 1.2) this.gathered = true;
      const goal = this.gathered ? e.outside : e.gather;
      this.moveTo(e.home.routeAround(this.pos, goal), speed, dt);
      if (this.gathered && Math.hypot(e.outside.x - this.pos.x, e.outside.z - this.pos.z) < 0.35) this.setState('entry');
      return;
    }
    const target = G.cabin.routeAround(this.pos, e.outside);
    const d = this.moveTo(target, speed, dt);
    const dEnd = Math.hypot(e.outside.x - this.pos.x, e.outside.z - this.pos.z);
    if (dEnd < 0.35) {
      if (e.type === 'hatch') this.setState('climb', 4.5 / Math.min(this.f, 1.6));
      else this.setState('entry');
    }
  }

  st_entry(dt, c) {
    const G = this.G;
    const e = this.entry;
    const ref = e.ref;
    const I = c.I, f = c.f;
    this.moveTo(e.outside, 1, dt);
    this.faceTo(ref.pos.x, ref.pos.z, dt, 6);
    this.anim = 'idle';
    if (!this.sub) this.sub = { t: 0, bash: 0, knocked: false, wait: 0, relocateT: 0 };
    const s = this.sub;
    s.t += dt;

    // Si el jugador vigila justo esa entrada, a veces cambia de sitio
    const ins = ref.insideSpot;
    const pd = Math.hypot(c.P.pos.x - ins.x, c.P.pos.z - ins.z);
    if (pd < 3 && (c.pz === 'ground' || c.pz === 'home')) s.relocateT += dt; else s.relocateT = Math.max(0, s.relocateT - dt);
    if (s.relocateT > 5 && Math.random() < dt * 0.3 && ref.secure) {
      this.entry = null;
      this.setState('far', 0.1);
      this.chooseAction(c);
      return;
    }

    if (e.type === 'door') {
      if (ref.open) { this.setState('enter', 0); return; }
      if (ref.boards > 0) {
        this.anim = 'bash';
        s.bash -= dt;
        if (s.bash <= 0) {
          s.bash = I.bashEvery / f;
          SFX.bang(ref.pos, 1.3);
          ref.shake = 1;
          if (this.G.player.pos.distanceTo(ref.pos) < 7) this.G.player.shake = Math.max(this.G.player.shake, 0.35);
          ref.boardHp -= I.bashDamage;
          if (ref.boardHp <= 0) {
            ref.boards--;
            ref.boardHp = ref.boardHpMax || I.boardHp;
            SFX.woodCrack(ref.pos, 1.3);
            if (c.pz !== 'outside') G.hud.msg('¡Un tablón de la ' + ref.name.toLowerCase() + ' ha cedido!');
          }
        }
        return;
      }
      if (ref.bolted) {
        // Primeras noches: a veces llama antes de forzar
        if (!s.knocked && (ref === G.cabin.frontDoor || e.home) && this.night <= 3 && Math.random() < 0.6) {
          s.knocked = true;
          s.wait = 7;
          SFX.knock(ref.pos);
          setTimeout(() => {
            if (this.state !== 'entry') return;
            this.voiced();
            if (c.pz !== 'outside') G.hud.say('Voz al otro lado', U.pick(KNOCK_LINES));
          }, 900);
        }
        s.knocked = true;
        if (s.wait > 0) { s.wait -= dt; return; }
        this.anim = 'pick';
        const lvl = e.home ? ref.lockFactor || 1 : 1 + (G.lockLevel - 1) * 0.7;
        ref.pick += dt / ((I.pickTime * lvl) / f);
        this.scratchT -= dt;
        if (this.scratchT <= 0) {
          this.scratchT = U.range(0.8, 1.6);
          SFX.click(ref.pos, 0.25);
        }
        if (ref.pick >= 1) {
          ref.pick = 0;
          ref.bolted = false;
          SFX.bolt(ref.pos, false);
          if (c.pz !== 'outside') G.hud.msg('*CLIC* ...un pestillo acaba de abrirse.');
          s.wait = U.range(3, 6) / Math.min(f, 1.8);
        }
        return;
      }
      // Sin pestillo: espera un momento y abre
      if (s.wait > 0) { s.wait -= dt; this.anim = 'pick'; return; }
      ref.setOpen(true, true);
      this.setState('enter', 0);
      return;
    }

    if (e.type === 'window') {
      if (ref.boards > 0) {
        this.anim = 'bash';
        ref.rip += dt / (I.ripTime / f);
        s.bash -= dt;
        if (s.bash <= 0) {
          s.bash = U.range(0.9, 1.5);
          SFX.creak(ref.pos, 0.5, 0.35);
          ref.shake = 1;
        }
        if (ref.rip >= 1) {
          ref.rip = 0;
          ref.boards--;
          SFX.woodCrack(ref.pos, 1.3);
          if (c.pz !== 'outside') G.hud.msg('¡Están arrancando los tablones de una ventana!');
        }
        return;
      }
      if (ref.glass) {
        this.anim = 'bash';
        s.smash = (s.smash || 0) + dt;
        if (s.smash > I.smashTime / Math.min(f, 1.5)) {
          ref.smash();
          if (c.pz !== 'outside') G.hud.msg('¡Han roto el cristal de la ' + ref.name.toLowerCase() + '!');
        }
        return;
      }
      this.setState('climbin', I.climbInTime / Math.min(f, 1.6));
      this.climbFrom = this.pos.clone();
    }
  }

  st_enter(dt, c) {
    // Cruza la puerta hacia dentro
    const e = this.entry;
    const ref = e.ref;
    if (!ref.open) { this.setState('entry'); return; }
    const sp = this.lunge ? CFG.INTRUDER.run * 1.25 : CFG.INTRUDER.walk * 1.4;
    const d = this.moveTo(ref.insideSpot, sp, dt, { ignore: ref });
    if (d < 0.3 || this.st > 5) {
      if (this.st > 5) this.pos.copy(ref.insideSpot);
      this.becomeInside(e.node);
    }
  }

  st_climbin(dt, c) {
    const e = this.entry;
    const ref = e.ref;
    if (ref.boards > 0) { this.setState('entry'); return; }
    this.anim = 'climb';
    const dur = CFG.INTRUDER.climbInTime / Math.min(this.f, 1.6);
    const k = 1 - Math.max(0, this.t) / dur;
    this.pos.lerpVectors(this.climbFrom, ref.insideSpot, U.smooth(0, 1, k));
    this.pos.y = Math.sin(k * Math.PI) * 0.9;
    this.faceTo(ref.insideSpot.x, ref.insideSpot.z, dt);
    if (this.t <= 0) {
      this.pos.y = 0;
      this.becomeInside(e.node);
    }
  }

  becomeInside(node) {
    const G = this.G;
    this.setState(this.home ? 'hinside' : 'inside');
    this.lunge = false;
    this.curNode = node;
    SFX.growl(this.pos, 1);
    this.voiced();
    if (this.zone(G.player.pos) !== 'outside') {
      SFX.sting();
      G.hud.banner('ESTÁ DENTRO', '', 2);
    }
  }

  st_inside(dt, c) {
    const G = this.G;
    const P = c.P;
    if (c.pz === 'outside') {
      // El jugador ha huido fuera: sale a buscarlo
      this.setState('exit');
      this.exitThenHunt = true;
      return;
    }
    const speed = CFG.INTRUDER.run * (0.75 + 0.08 * this.night);
    const onStairs = this.pos.x > 3.5 && this.pos.z > -2.05 && this.pos.z < 2.6 && this.pos.y > 0.05;
    const sameLevel = !onStairs && Math.abs(P.pos.y - this.pos.y) < 0.2;
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    const pe = new THREE.Vector3(P.pos.x, P.pos.y + 1.4, P.pos.z);
    if (sameLevel && G.world.lineOfSight(eye, pe, (b) => b.solid)) {
      this.moveTo(P.pos, speed, dt);
      this.path = null;
      return;
    }
    // Solo recalcula la ruta si el jugador cambia de zona o se acaba el camino
    const to = c.pz === 'roof' ? 'rH' : G.cabin.nearestNode(P.pos);
    if (!this.path || this.path.length === 0 || to !== this.pathGoal) {
      this.pathGoal = to;
      const from = this.path && this.path.length ? this.path[0] : G.cabin.nearestNode(this.pos);
      this.path = G.cabin.path(from, to, true) || [from];
      if (this.path.length > 1 && this.path[0] === from) {
        const n0 = G.cabin.nodes[from];
        if (Math.hypot(n0.x - this.pos.x, n0.z - this.pos.z) < 0.6) this.path.shift();
      }
    }
    const nextKey = this.path[0];
    if (!nextKey) { this.moveTo(P.pos, speed, dt); return; }
    if (nextKey === 'bL' && this.pos.y > -1) { this.gateDownBunker(dt, speed); return; }
    if (nextKey === 'gT' && this.pos.y < -1) { this.gateUpBunker(dt, speed, 'inside'); return; }
    // Subir por la trampilla
    if (nextKey === 'rH') {
      const h = G.cabin.hatch;
      const under = G.cabin.nodes.uH;
      if (Math.hypot(under.x - this.pos.x, under.z - this.pos.z) > 0.5) { this.moveTo(under, speed, dt); return; }
      if (!h.open) {
        this.busyT = 0.3;
        this.sub = this.sub || { t: 0 };
        this.sub.t += dt;
        this.anim = 'pick';
        if (this.sub.t > 0.3 && h.bolted) h.setBolt(false);
        if (this.sub.t > 1.4) { h.setOpen(true, true); this.sub = null; }
        return;
      }
      this.setState('climbup', 1.2);
      this.climbFrom = this.pos.clone();
      return;
    }
    const n = G.cabin.nodes[nextKey];
    const d = this.moveTo(n, speed, dt);
    if (d < 0.35) this.path.shift();
  }

  // Dentro de otra casa (una sola habitación): va directo a por el jugador
  st_hinside(dt, c) {
    if (c.pz === 'outside') {
      this.setState('hexit');
      this.exitThenHunt = true;
      return;
    }
    const h = this.home;
    // Si se ha salido sin querer (empujado por algo), vuelve a buscar por dónde entrar
    if (h && !h.contains(this.pos) && this.st > 1) { this.setState('far', 0.5); return; }
    const goal = h && h.waypoint ? h.waypoint(this.pos, c.P.pos) : c.P.pos;
    this.moveTo(goal, CFG.INTRUDER.run * (0.7 + 0.08 * this.night), dt);
  }

  // Sale de otra casa por donde entró
  st_hexit(dt) {
    const e = this.entry && this.entry.home ? this.entry : this.home && this.home.entries[0];
    if (!e) { this.afterExit(); return; }
    const ref = e.ref;
    if (!this.sub) this.sub = { out: false };
    if (!this.sub.out) {
      const h = this.home;
      const goal = h && h.waypoint ? h.waypoint(this.pos, ref.insideSpot) : ref.insideSpot;
      const d = this.moveTo(goal, CFG.INTRUDER.run, dt);
      if ((goal === ref.insideSpot && d < 0.35) || this.st > 9) this.sub.out = true;
      return;
    }
    if (e.type === 'door') {
      if (ref.boards > 0) { ref.boards = 0; SFX.woodCrack(ref.pos, 1.2); }
      if (ref.bolted) ref.setBolt(false);
      if (!ref.open) ref.setOpen(true, true);
      const d = this.moveTo(ref.outside, CFG.INTRUDER.run, dt, { ignore: ref });
      if (d < 0.3 || this.st > 6) { this.pos.copy(ref.outside); this.afterExit(); }
    } else {
      if (ref.boards > 0) { ref.boards = 0; SFX.woodCrack(ref.pos, 1.2); }
      if (ref.glass) ref.smash();
      this.pos.copy(ref.outside);
      this.afterExit();
    }
  }

  st_climbup(dt) {
    this.anim = 'climb';
    const k = 1 - Math.max(0, this.t) / 1.2;
    const top = new THREE.Vector3(-0.5, 6, -1.9);
    this.pos.x = U.lerp(this.climbFrom.x, top.x, k);
    this.pos.z = U.lerp(this.climbFrom.z, -3.1, Math.min(1, k * 2));
    this.pos.y = U.lerp(this.climbFrom.y, 6, k);
    if (this.t <= 0) {
      this.pos.copy(top);
      this.setState('roofhunt');
    }
  }

  st_climb(dt, c) {
    // Trepa por la pared este hasta el tejado
    const I = c.I;
    this.anim = 'climb';
    const dur = 4.5 / Math.min(this.f, 1.6);
    const k = 1 - Math.max(0, this.t) / dur;
    this.pos.x = 5.55;
    this.pos.z = -1.0;
    this.pos.y = k * 6.1;
    this.facing = -Math.PI / 2;
    this.mesh.rotation.y = this.facing;
    this.scratchT -= dt;
    if (this.scratchT <= 0) {
      this.scratchT = 0.6;
      SFX.creak(this.pos, 0.35, 0.25);
    }
    if (this.t <= 0) {
      this.pos.set(4.4, 6, -1.0);
      if (c.pz === 'roof') {
        SFX.growl(this.pos, 1.2);
        this.setState('roofhunt');
      } else this.setState('roof');
    }
  }

  st_roof(dt, c) {
    const G = this.G;
    const I = c.I;
    if (c.pz === 'roof') { this.setState('roofhunt'); return; }
    const h = G.cabin.hatch;
    const spot = new THREE.Vector3(-0.5, 6, -2.2);
    const d = this.moveTo(spot, CFG.INTRUDER.walk, dt);
    if (d > 0.3) return;
    this.faceTo(-0.5, -3.1, dt);
    if (!this.sub) this.sub = { wait: 0 };
    if (h.open) {
      this.setState('dropin', 0.9);
      return;
    }
    if (h.bolted) {
      this.anim = 'pick';
      h.pick += dt / (I.hatchPickTime / c.f);
      this.scratchT -= dt;
      if (this.scratchT <= 0) {
        this.scratchT = U.range(0.7, 1.4);
        SFX.click(h.pos, 0.3);
        h.shake = 0.6;
      }
      if (h.pick >= 1) {
        h.pick = 0;
        h.bolted = false;
        SFX.bolt(h.pos, false);
        if (c.pz !== 'outside') G.hud.msg('*CLIC* ...algo ha abierto el pestillo de la trampilla.');
        this.sub.wait = 2.5;
      }
      return;
    }
    if (this.sub.wait > 0) { this.sub.wait -= dt; return; }
    h.setOpen(true, true);
    this.setState('dropin', 0.9);
  }

  st_dropin(dt) {
    this.anim = 'climb';
    const k = 1 - Math.max(0, this.t) / 0.9;
    this.pos.set(-0.5, U.lerp(6, 3, k), U.lerp(-2.2, -3.0, Math.min(1, k * 2)));
    if (this.t <= 0) {
      this.pos.set(-0.5, 3, -2.4);
      this.entry = this.G.cabin.entries.find((e) => e.type === 'hatch');
      this.becomeInside('uH');
    }
  }

  st_roofhunt(dt, c) {
    const P = c.P;
    if (c.pz !== 'roof') {
      // El jugador ha bajado: le sigue por la trampilla si está abierta
      const h = this.G.cabin.hatch;
      if (h.open) this.setState('dropin', 0.9);
      else this.setState('roof');
      return;
    }
    this.moveTo(P.pos, CFG.INTRUDER.run * 0.8, dt);
  }

  st_hunt_out(dt, c) {
    const G = this.G;
    const P = c.P;
    if (c.pz !== 'outside') {
      // El jugador se ha metido en casa: ataca la entrada más cercana a él
      let best = null, bd = Infinity;
      (this.home ? this.home.entries : G.cabin.entries).forEach((e) => {
        if (e.type === 'hatch') return;
        const d = Math.hypot(e.outside.x - this.pos.x, e.outside.z - this.pos.z);
        if (d < bd) { bd = d; best = e; }
      });
      this.entry = best;
      this.setState('approach');
      return;
    }
    if (this.t > 0) { this.anim = 'stare'; this.faceTo(P.pos.x, P.pos.z, dt, 2); return; }
    const speed = CFG.INTRUDER.run * (0.82 + 0.06 * this.night);
    // El cazador escondido: no lo ve ni lo huele; da vueltas buscándolo salvo que pase muy cerca
    const R = G.roles;
    if (R && R.hunt && R.hunt.hidden && this.distToPlayer() > 4.5) {
      const a = performance.now() * 0.00025 + this.night;
      const goal = new THREE.Vector3(P.pos.x + Math.cos(a) * 15, 0, P.pos.z + Math.sin(a) * 15);
      this.anim = 'walk';
      this.moveTo(G.cabin.routeAround(this.pos, goal), CFG.INTRUDER.walk, dt);
      return;
    }
    const target = G.cabin.routeAround(this.pos, P.pos);
    this.moveTo(target, speed, dt);
  }

  st_attack(dt, c) {
    const G = this.G;
    const P = c.P;
    this.anim = 'attack';
    this.faceTo(P.pos.x, P.pos.z, dt, 12);
    if (this.t <= 0) {
      const d = this.distToPlayer();
      if (d < 1.9 && Math.abs(P.pos.y - this.pos.y) < 1.3 && !P.dead && this.canReach()) {
        G.jumpscare(this);
        P.hurt(9999);
      }
      this.setState('recoil', 2.2);
      this.recoilFrom = new THREE.Vector3(P.pos.x, 0, P.pos.z);
    }
  }

  st_recoil(dt, c) {
    // Se aparta un momento después de golpear
    const away = new THREE.Vector3(this.pos.x - this.recoilFrom.x, 0, this.pos.z - this.recoilFrom.z);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    away.normalize();
    if (this.t > 1.0) this.moveTo({ x: this.pos.x + away.x, z: this.pos.z + away.z }, 2.0, dt);
    this.anim = 'stare';
    this.faceTo(c.P.pos.x, c.P.pos.z, dt, 6);
    if (this.t <= 0) {
      if (c.myZone === 'roof') this.setState('roofhunt');
      else if (c.myZone === 'outside') {
        if (c.pz === 'outside') this.setState('hunt_out', 0);
        else if (this.entry) this.setState('approach');
        else this.setState('far', 1);
      }
      else this.setState(this.home ? 'hinside' : 'inside');
    }
  }

  st_stagger(dt) {
    this.anim = 'stare';
    if (this.t <= 0) this.beginFlee(false);
  }

  st_exit(dt, c) {
    // Sale de la cabaña por donde entró (o por la puerta más cercana)
    const G = this.G;
    if (this.pos.y < -1) { this.gateUpBunker(dt, CFG.INTRUDER.run, 'exit'); return; }
    let e = this.entry;
    if (!e || e.type === 'hatch') {
      // Si entró por la trampilla, busca la puerta principal
      e = G.cabin.entries[0];
    }
    const ref = e.ref;
    const goalNode = e.node;
    if (!this.path) {
      const from = G.cabin.nearestNode(this.pos);
      this.path = G.cabin.path(from, goalNode, false) || [goalNode];
    }
    if (this.path.length) {
      const n = G.cabin.nodes[this.path[0]];
      const d = this.moveTo(n, CFG.INTRUDER.run, dt);
      if (d < 0.35) this.path.shift();
      return;
    }
    // En el nodo junto a la salida
    if (e.type === 'door') {
      if (ref.boards > 0) { ref.boards = 0; SFX.woodCrack(ref.pos, 1.2); }
      if (ref.bolted) ref.setBolt(false);
      if (!ref.open) ref.setOpen(true, true);
      const d = this.moveTo(ref.outside, CFG.INTRUDER.run, dt, { ignore: ref });
      if (d < 0.3) this.afterExit();
    } else {
      if (ref.boards > 0) { ref.boards = 0; SFX.woodCrack(ref.pos, 1.2); }
      if (ref.glass) ref.smash();
      this.pos.copy(ref.outside);
      this.afterExit();
    }
  }

  afterExit() {
    if (this.exitThenHunt) {
      this.exitThenHunt = false;
      this.setState('hunt_out', 0.5);
      return;
    }
    this.beginFlee(this.fleeForGood);
  }

  st_jumpoff(dt) {
    // Salta del tejado hacia el bosque
    this.anim = 'run';
    const d = this.moveTo({ x: 5.2, z: 1.5 }, CFG.INTRUDER.run, dt, { noCollide: true });
    if (d < 0.4) {
      this.pos.set(6.5, 0, 1.5);
      SFX.heavyStep(this.pos, 1.3);
      this.beginFlee(this.fleeForGood);
    }
  }

  st_fall() {
    this.pos.y = Math.max(0, this.pos.y - 0.2);
    if (this.pos.y <= 0) {
      this.pos.set(6.5, 0, -1);
      SFX.heavyStep(this.pos, 1.3);
      this.beginFlee(this.fleeForGood);
    }
  }

  st_flee(dt, c) {
    const d = this.moveTo(this.fleeTarget, CFG.INTRUDER.run * 1.1, dt);
    if (d < 1 || this.t <= 0) {
      this.entry = null;
      this.setState('far', U.range(8, 15) / this.f);
    }
  }

  st_retreat(dt) {
    const d = this.moveTo(this.fleeTarget, CFG.INTRUDER.run * 1.1, dt);
    if (d < 1 || this.t <= 0) this.recover();
  }

  // Tras huir malherido, se lame las heridas en el bosque y vuelve con parte de la vida
  recover() {
    this.retreated = false;
    this.hp = Math.round(this.maxHp * 0.6);
    this.entry = null;
    this.spawnFar();
    this.mesh.visible = true;
    this.setState('far', U.range(28, 42) / Math.min(this.f, 1.6));
  }

  // ---------- Apariciones de día ----------
  updateApparition(dt) {
    const G = this.G;
    if (G.phase !== 'day') return;
    const P = G.player;
    if (!this.apparition) {
      if (this.apparitionAt === null || G.clock < this.apparitionAt) return;
      if (this.zone(P.pos) !== 'outside' || G.village.contains(P.pos)) return;
      // Aparece a lo lejos, delante del jugador, entre los árboles
      const fwd = P.forward();
      const yaw = Math.atan2(fwd.x, fwd.z) + U.range(-0.4, 0.4);
      const dist = U.range(30, 38);
      const x = P.pos.x + Math.sin(yaw) * dist, z = P.pos.z + Math.cos(yaw) * dist;
      if (Math.hypot(x, z) < 18 || G.village.contains({ x, z })) return;
      const near = G.world.circlesNear(x, z);
      if (near.some((cc) => Math.hypot(cc.x - x, cc.z - z) < cc.r + 0.6)) return;
      this.apparitionAt = null;
      this.pos.set(x, 0, z);
      this.mesh.visible = true;
      this.state = 'apparition';
      this.anim = 'stare';
      this.apparition = { seen: 0, life: 25, noticed: false };
      this.faceTo(P.pos.x, P.pos.z, 1, 100);
      return;
    }
    const a = this.apparition;
    a.life -= dt;
    this.faceTo(P.pos.x, P.pos.z, dt, 3);
    const e = P.eyePos();
    const to = new THREE.Vector3(this.pos.x - e.x, this.pos.y + 1.7 - e.y, this.pos.z - e.z);
    const d = to.length();
    to.divideScalar(d);
    const inView = P.forward().dot(to) > 0.9;
    if (inView) {
      a.seen += dt;
      if (!a.noticed && a.seen > 0.4) { a.noticed = true; SFX.sting(); }
    }
    if ((d < 20 && !a.close) || d < 3 || a.life <= 0 || (a.noticed && !inView && a.seen > 0.8) || a.seen > 3.5) this.vanish();
  }
}
