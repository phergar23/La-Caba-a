'use strict';

// Misiones del día: 4 cada jornada, mezclando turistas del bosque y encargos del pueblo.
const TOURIST_NAMES = ['Lucía', 'Marcos', 'Elena', 'Javier', 'Carmen', 'Pablo', 'Sara', 'Diego', 'Nuria', 'Andrés', 'Irene', 'Hugo', 'Marta', 'Raúl', 'Alba', 'Óscar', 'Julia', 'Iván'];
const CHILD_NAMES = ['Dani', 'Lola', 'Mateo', 'Vera', 'Leo', 'Noa'];
const DOG_NAMES = ['Thor', 'Luna', 'Coco', 'Rocky', 'Kira', 'Toby'];
const ITEM_KINDS = [
  { id: 'cámara', art: 'la', fem: true },
  { id: 'cartera', art: 'la', fem: true },
  { id: 'móvil', art: 'el', fem: false },
  { id: 'mochila', art: 'la', fem: true },
  { id: 'prismáticos', art: 'los', fem: false },
];
const JACKETS = [0xc8402a, 0xe0a020, 0x2a8ac8, 0x3aa048, 0xa040b0, 0xe06a20, 0x20a0a0];
const FOREST_TYPES = ['lost', 'item', 'injured', 'child', 'dog', 'photo'];
const VILLAGE_TYPES = ['mushrooms', 'delivery', 'trailcam', 'firewood', 'signs'];
const DUTY_TYPES = ['traps', 'campfire'];

// Punto de interacción que sigue a un personaje (a la altura del pecho)
function liveAt(actor, dy) {
  return {
    get x() { return actor.pos.x; },
    get y() { return actor.pos.y + dy; },
    get z() { return actor.pos.z; },
  };
}

// Personaje que se mueve por el bosque (turista, niño o perro)
class Actor {
  constructor(G, kind, pos, look = {}) {
    this.G = G;
    this.kind = kind;
    if (kind === 'dog') this.mesh = makeDog(look.color);
    else {
      this.mesh = makeHuman(Object.assign({
        shirt: U.pick(JACKETS), pants: U.pick([0x2c2c34, 0x4a3a2a, 0x2a3a4a]),
        hair: U.pick([0x3b2716, 0x111111, 0x8a6a30, 0x6a2a10]),
        backpack: kind === 'child' ? null : U.pick([0x3a4a2a, 0x7a2a1a, 0x2a2a4a]),
        hat: Math.random() < 0.35 ? U.pick([0xd0c070, 0x2a5a2a, 0xa02020]) : null,
      }, look));
      if (kind === 'child') this.mesh.scale.setScalar(0.62);
    }
    this.mesh.position.set(pos.x, 0, pos.z);
    this.mesh.rotation.y = Math.random() * 6.28;
    G.scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.speed = 0;
    this.pose = {};
  }

  dist() { const p = this.G.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  face(t, dt) {
    const a = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
    this.mesh.rotation.y += U.wrapAngle(a - this.mesh.rotation.y) * Math.min(1, dt * 5);
  }

  step(target, speed, dt) {
    const G = this.G;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const s = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    const y = Math.max(0, this.pos.y);
    G.world.collide(this.pos, 0.3, y, 1.7);
    this.pos.y = G.world.getFloorY(this.pos.x, this.pos.z, y);
    this.face(target, dt);
    this.speed = speed;
    return d - s;
  }

  // Sigue al jugador; si se queda muy atrás, reaparece detrás de él
  follow(dt, name) {
    const G = this.G;
    const P = G.player;
    const d = this.dist();
    if (d > 38) {
      const f = P.forward();
      this.pos.set(P.pos.x - f.x * 6, Math.max(0, P.pos.y), P.pos.z - f.z * 6);
      if (name) G.hud.say(name, '¡Espera! ¡No me dejes atrás!');
    } else if (d > 2.4) {
      this.step(P.pos, U.clamp((d - 2.2) * 1.6, 0, 6.3), dt);
      // Si se queda enganchado en un árbol, aparece un poco detrás del jugador
      this.stuckT = (this.stuckT || 0) + dt;
      if (!this.lastPos) this.lastPos = this.pos.clone();
      if (this.stuckT > 1.5) {
        if (this.pos.distanceTo(this.lastPos) < 0.6 && d > 4) {
          const p = G.world.randomForestPoint(2.5, 4, P.pos, false);
          const free = G.cabin.zoneOf(P.pos) === 'outside' ? p : P.pos;
          this.pos.set(free.x, Math.max(0, P.pos.y), free.z);
        }
        this.stuckT = 0;
        this.lastPos.copy(this.pos);
      }
    } else this.face(P.pos, dt);
  }

  animate(dt) {
    if (this.kind === 'dog') animateDog(this.mesh, dt, this.speed);
    else {
      animateHuman(this.mesh, dt, this.speed, this.pose);
      if (this.pose.sit) this.mesh.position.y = -0.35 * this.mesh.scale.y;
    }
    this.speed = 0;
  }

  remove() { this.G.scene.remove(this.mesh); }
}

class Mission {
  constructor(G, type) {
    this.G = G;
    this.type = type;
    this.state = 'available';
    this.reward = CFG.REWARDS[type];
    this.actors = [];
    this.props = [];
    this.inter = [];
    this.fade = 0;
  }

  get active() { return this.state !== 'done' && this.state !== 'failed'; }
  label() { return ''; }
  markers() { return []; }
  talk() { return false; }
  hasTalk() { return false; }
  update() {}

  interactables() { return this.active ? this.inter.filter((i) => !i.enabled || i.enabled()) : []; }

  addProp(mesh, pos) {
    mesh.position.set(pos.x, pos.y || 0, pos.z);
    this.G.scene.add(mesh);
    this.props.push(mesh);
    return mesh;
  }

  complete(who, text) {
    const G = this.G;
    if (who && text) G.hud.say(who, text);
    G.addMoney(this.reward, 'Encargo cumplido');
    G.stats.helped++;
    this.state = 'done';
    this.fade = 18;
    SFX.ui();
  }

  fail() {
    if (!this.active) return;
    this.state = 'failed';
  }

  cleanup() {
    this.actors.forEach((a) => a.remove());
    this.props.forEach((p) => this.G.scene.remove(p));
    this.actors = [];
    this.props = [];
  }

  glint(dt) {
    const s = 0.35 + Math.abs(Math.sin(performance.now() * 0.004)) * 0.45;
    this.props.forEach((p) => { if (p.visible && p.userData.glint) p.userData.glint.scale.set(s, s, s); });
  }
}

// ---------- Misiones del bosque (empiezan hablando con un turista) ----------
class ForestMission extends Mission {
  constructor(G, type, spot) {
    super(G, type);
    this.name = G.missions.takeName(TOURIST_NAMES);
    this.giver = new Actor(G, 'human', spot);
    this.actors.push(this.giver);
    this.callT = U.range(2, 6);
    const self = this;
    this.inter.push({
      kind: 'tourist', pos: liveAt(this.giver, 1.1), r: 0.9,
      enabled: () => self.giver.mesh.visible,
      prompt: (GG) => ({ title: self.name + ' (turista)', lines: [self.giverLine(GG)], info: [] }),
      act: (key, GG) => (key === 'E' ? (self.onGiver(GG), true) : false),
    });
  }

  giverLine() { return '[E] Hablar'; }
  say(t, d) { this.G.hud.say(this.name, t, d); }

  update(dt) {
    const g = this.giver;
    if (this.state === 'done') {
      this.fade -= dt;
      const V = CFG.WORLD.village;
      g.step({ x: V.x, z: V.z + 4 }, this.type === 'injured' ? 1.0 : 1.6, dt);
      if (this.type === 'injured') g.pose = { hurt: true };
      if (this.fade <= 0 && g.dist() > 15) this.actors.forEach((a) => (a.mesh.visible = false));
    } else if (this.state !== 'failed') this.idleGiver(dt);
    this.actors.forEach((a) => a.mesh.visible && a.animate(dt));
    this.glint(dt);
  }

  idleGiver(dt) {
    const g = this.giver;
    const d = g.dist();
    if (this.state === 'following') return;
    g.pose = { sit: this.type === 'injured', wave: this.state === 'available' && d > 4 && d < 25 };
    if (d < 25) g.face(this.G.player.pos, dt);
    this.callT -= dt;
    if (this.callT <= 0 && this.state === 'available' && d < 55) {
      this.callT = U.range(7, 13);
      SFX.call({ x: g.pos.x, y: 1.6, z: g.pos.z });
      if (d < 30 && d > 5) this.say(U.pick(['¿¡Hola!? ¿¡Hay alguien!?', '¡Eh! ¡Aquí!', '¡Ayuda, por favor!']), 2.5);
    }
  }

  markers() {
    if (!this.active) return [];
    return [{ pos: this.giver.pos, icon: this.state === 'available' ? '!' : '•', cls: 'tourist' }];
  }

  fail() {
    if (!this.active) return;
    if (this.state === 'following' && this.giver.dist() < 30) {
      SFX.scream(this.giver.pos, 0.7);
      this.G.hud.msg(`Ya no oyes los pasos de ${this.name} detrás de ti...`);
    }
    super.fail();
    this.actors.forEach((a) => (a.mesh.visible = false));
    this.props.forEach((p) => (p.visible = false));
  }
}

class LostMission extends ForestMission {
  label() { return this.state === 'following' ? `Acompaña a ${this.name} al pueblo` : `${this.name} parece perdido/a`; }
  onGiver() {
    if (this.state === 'available') {
      this.say(U.pick([
        '¡Por fin alguien! Me he perdido y el móvil no tiene cobertura. ¿Me llevas al pueblo?',
        'Llevo horas dando vueltas... Todos los árboles son iguales. ¿Me acompañas al pueblo?',
        'Oí algo entre los árboles y eché a correr. Ya no sé dónde estoy. ¿Me sacas de aquí?',
      ]));
      this.state = 'following';
      SFX.ui();
    } else this.say(U.pick(['Voy detrás de ti, no corras tanto.', '¿Falta mucho? Se está haciendo tarde...', 'No me dejes aquí, por favor.']));
  }
  update(dt) {
    if (this.state === 'following') {
      this.giver.pose = {};
      this.giver.follow(dt, this.name);
      const V = this.G.village.center;
      if (Math.hypot(this.giver.pos.x - V.x, this.giver.pos.z - V.z) < 24) {
        this.complete(this.name, U.pick(['¡El pueblo! Gracias, gracias. Toma, por las molestias.', '¡Por fin! Te debo una. Toma esto.']));
      }
    }
    super.update(dt);
  }
}

class ItemMission extends ForestMission {
  constructor(G, type, spot) {
    super(G, type, spot);
    this.kindItem = U.pick(ITEM_KINDS);
    this.held = false;
  }
  get itemName() { return `${this.kindItem.art} ${this.kindItem.id}`; }
  label() {
    if (this.state === 'search') return this.held ? `Devuelve ${this.itemName} a ${this.name}` : `Busca ${this.itemName} de ${this.name}`;
    return `${this.name} busca algo`;
  }
  giverLine() { return this.held ? `[E] Devolver ${this.kindItem.id}` : '[E] Hablar'; }
  onGiver() {
    if (this.held) {
      this.complete(this.name, `¡Mi ${this.kindItem.id}! ¡Muchísimas gracias! Toma, te lo has ganado.`);
      return;
    }
    if (this.state === 'available') {
      this.say(`Se me ha caído ${this.itemName} por aquí cerca, entre los árboles. Si ${this.kindItem.fem ? 'la' : 'lo'} encuentras, te pagaré.`);
      this.state = 'search';
      const p = this.G.world.randomForestPoint(14, 28, this.giver.pos, true);
      const mesh = this.addProp(makeQuestItem(this.kindItem.id), p);
      this.approx = new THREE.Vector3(p.x + U.range(-5, 5), 0, p.z + U.range(-5, 5));
      const self = this;
      this.inter.push({
        kind: 'item', pos: new THREE.Vector3(p.x, 0.2, p.z), r: 0.8,
        enabled: () => mesh.visible,
        prompt: () => ({ title: `${self.kindItem.id} de ${self.name}`, lines: ['[E] Recoger'], info: [] }),
        act: (key, GG) => {
          if (key !== 'E') return false;
          mesh.visible = false;
          self.held = true;
          SFX.pickup();
          GG.hud.msg(`Has encontrado ${self.itemName} de ${self.name}. Devuélveselo.`);
          return true;
        },
      });
      SFX.ui();
    } else this.say('Debería estar a unos pocos metros de aquí... Brilla un poco con la luz.');
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'search' && !this.held) m.push({ pos: this.approx, icon: '?', cls: 'item' });
    return m;
  }
}

class InjuredMission extends ForestMission {
  label() { return this.state === 'needkit' ? `Lleva un botiquín a ${this.name}` : `${this.name} está herido/a`; }
  giverLine(G) { return G.inv.medkits > 0 ? `[E] Usar botiquín (${G.inv.medkits})` : '[E] Hablar'; }
  onGiver(G) {
    if (G.inv.medkits > 0) {
      G.inv.medkits--;
      this.complete(this.name, 'Ay... Mucho mejor. Gracias, de verdad. Ahora podré volver al pueblo.');
      return;
    }
    this.say(U.pick([
      'Me he torcido el tobillo y no puedo andar. ¿Tienes un botiquín? En el pueblo venden.',
      'Por favor, date prisa con el botiquín... No quiero estar aquí cuando anochezca.',
    ]));
    this.state = 'needkit';
  }
}

// Padre o madre que ha perdido a su hijo: hay que encontrar al niño y traerlo
class ChildMission extends ForestMission {
  constructor(G, type, spot) {
    super(G, type, spot);
    this.childName = G.missions.takeName(CHILD_NAMES);
    this.cryT = 0;
  }
  label() {
    if (this.state === 'search') return `Busca a ${this.childName}, el hijo de ${this.name}`;
    if (this.state === 'following') return `Lleva a ${this.childName} con ${this.name}`;
    return `${this.name} parece desesperado/a`;
  }
  onGiver() {
    if (this.state === 'available') {
      this.say(`¡Mi hijo! ${this.childName} salió corriendo detrás de un ciervo y no vuelve. ¡Por favor, búscalo! No puede andar lejos.`);
      this.state = 'search';
      const p = this.G.world.randomForestPoint(25, 40, this.giver.pos, true);
      this.child = new Actor(this.G, 'child', p, { shirt: U.pick(JACKETS) });
      this.actors.push(this.child);
      this.approx = new THREE.Vector3(p.x + U.range(-6, 6), 0, p.z + U.range(-6, 6));
      const self = this;
      this.inter.push({
        kind: 'child', pos: liveAt(this.child, 0.5), r: 0.7,
        enabled: () => self.state === 'search',
        prompt: () => ({ title: self.childName, lines: ['[E] "Ven conmigo, te llevo con tu familia"'], info: [] }),
        act: (key, GG) => {
          if (key !== 'E') return false;
          GG.hud.say(self.childName, '*snif* Había un señor muy alto mirándome entre los árboles... ¿Me llevas con mi familia?');
          self.state = 'following';
          SFX.ui();
          return true;
        },
      });
      SFX.ui();
    } else if (this.state === 'search') this.say(`Se fue por allí... ¡${this.childName}! ¡${this.childName}!`);
    else this.say('¡Tráemelo, por favor!');
  }
  update(dt) {
    if (this.child && this.state === 'search') {
      this.child.pose = { sit: true };
      this.child.face(this.G.player.pos, dt);
      this.cryT -= dt;
      if (this.cryT <= 0 && this.child.dist() < 45) {
        this.cryT = U.range(5, 9);
        SFX.cry({ x: this.child.pos.x, y: 0.8, z: this.child.pos.z });
      }
    }
    if (this.state === 'following') {
      this.child.pose = {};
      this.child.follow(dt, this.childName);
      this.giver.face(this.child.pos, dt);
      if (Math.hypot(this.child.pos.x - this.giver.pos.x, this.child.pos.z - this.giver.pos.z) < 5) {
        this.complete(this.name, `¡${this.childName}! Gracias, gracias... No sé cómo pagártelo. Toma, es todo lo que llevo.`);
      }
    }
    if (this.state === 'done' && this.child) this.child.step(this.giver.pos, 1.8, dt);
    super.update(dt);
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'search') m.push({ pos: this.approx, icon: '?', cls: 'item' });
    return m;
  }
}

// Perro perdido: encontrarlo, llamarlo y devolverlo a su dueño
class DogMission extends ForestMission {
  constructor(G, type, spot) {
    super(G, type, spot);
    this.dogName = U.pick(DOG_NAMES);
    this.barkT = 0;
  }
  label() {
    if (this.state === 'search') return `Busca a ${this.dogName}, el perro de ${this.name}`;
    if (this.state === 'following') return `Lleva a ${this.dogName} con ${this.name}`;
    return `${this.name} busca a alguien`;
  }
  onGiver() {
    if (this.state === 'available') {
      this.say(`Se me ha escapado ${this.dogName}, mi perro. Se puso a gruñir hacia el bosque y salió disparado. ¿Me ayudas a encontrarlo?`);
      this.state = 'search';
      const p = this.G.world.randomForestPoint(25, 45, this.giver.pos, true);
      this.dog = new Actor(this.G, 'dog', p, { color: U.pick([0x7a5a3a, 0x2a2420, 0xc8a878]) });
      this.actors.push(this.dog);
      this.approx = new THREE.Vector3(p.x + U.range(-6, 6), 0, p.z + U.range(-6, 6));
      const self = this;
      this.inter.push({
        kind: 'dog', pos: liveAt(this.dog, 0.45), r: 0.6,
        enabled: () => self.state === 'search',
        prompt: () => ({ title: self.dogName, lines: [`[E] Llamar a ${self.dogName}`], info: [] }),
        act: (key) => {
          if (key !== 'E') return false;
          SFX.bark(self.dog.pos);
          self.G.hud.msg(`${self.dogName} mueve la cola y te sigue.`);
          self.state = 'following';
          return true;
        },
      });
      SFX.ui();
    } else this.say(`¡${this.dogName}! ¡${this.dogName}, ven aquí!`);
  }
  update(dt) {
    if (this.dog && this.state === 'search') {
      this.dog.face(this.G.player.pos, dt);
      this.barkT -= dt;
      if (this.barkT <= 0 && this.dog.dist() < 50) {
        this.barkT = U.range(4, 8);
        SFX.bark(this.dog.pos);
      }
    }
    if (this.state === 'following') {
      this.dog.follow(dt);
      if (Math.hypot(this.dog.pos.x - this.giver.pos.x, this.dog.pos.z - this.giver.pos.z) < 5) {
        SFX.bark(this.dog.pos);
        this.complete(this.name, `¡${this.dogName}! ¡Qué susto me has dado! Muchas gracias, guarda.`);
      }
    }
    if (this.state === 'done' && this.dog) this.dog.step(this.giver.pos, 2.5, dt);
    super.update(dt);
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'search') m.push({ pos: this.approx, icon: '?', cls: 'item' });
    return m;
  }
}

// ---------- Encargos del pueblo (empiezan hablando con un vecino) ----------
class VillageMission extends Mission {
  constructor(G, type, giverId) {
    super(G, type);
    this.giverId = giverId;
  }
  get giverNpc() { return this.G.village.byId[this.giverId]; }
  get giverName() { return this.giverNpc.name.replace(/ \(.*\)$/, ''); }
  say(t, d) { this.G.hud.say(this.giverNpc.name, t, d); }
  hasTalk(id) { return id === this.giverId && (this.state === 'available' || this.state === 'return'); }
  markers() {
    if (!this.active) return [];
    if (this.state === 'available' || this.state === 'return') return [{ pos: this.giverNpc.mesh.position, icon: '!', cls: 'village' }];
    return [];
  }
  update(dt) { this.glint(dt); }
  fail() {
    super.fail();
    this.props.forEach((p) => (p.visible = false));
    this.actors.forEach((a) => (a.mesh.visible = false));
  }
}

class MushroomMission extends VillageMission {
  constructor(G) {
    super(G, 'mushrooms', 'remedios');
    this.need = 5;
    this.got = 0;
  }
  label() {
    if (this.state === 'available') return 'Remedios (curandera) necesita ayuda';
    if (this.state === 'collect') return `Recoge setas rojas para Remedios (${this.got}/${this.need})`;
    return 'Lleva las setas a Remedios';
  }
  talk() {
    if (this.state === 'available') {
      this.say('Necesito setas de sombrero rojo para mis curas. Crecen juntas en un claro del bosque, brillan un poco. Tráeme cinco y te pago bien.');
      this.state = 'collect';
      const c = this.G.world.randomForestPoint(35, 80, { x: 70, z: 0 }, true);
      this.center = new THREE.Vector3(c.x, 0, c.z);
      for (let i = 0; i < 7; i++) {
        const p = this.G.world.randomForestPoint(1, 9, c, true);
        const m = this.addProp(makeMushroom(), p);
        const self = this;
        this.inter.push({
          kind: 'mushroom', pos: new THREE.Vector3(p.x, 0.1, p.z), r: 0.5,
          enabled: () => m.visible && self.state === 'collect',
          prompt: () => ({ title: 'Seta roja', lines: ['[E] Recoger'], info: [] }),
          act: (key, GG) => {
            if (key !== 'E') return false;
            m.visible = false;
            self.got++;
            SFX.pickup();
            if (self.got >= self.need) {
              self.state = 'return';
              GG.hud.msg('Ya tienes suficientes setas. Llévaselas a Remedios.');
            } else GG.hud.msg(`Setas: ${self.got}/${self.need}`);
            return true;
          },
        });
      }
      SFX.ui();
      return true;
    }
    if (this.state === 'return') {
      this.complete(this.giverNpc.name, 'Mmm, buenas, muy buenas. Toma tu dinero. Y un consejo: lo que ronda tu cabaña odia el fuego y la luz. Pero tiene paciencia.');
      return true;
    }
    return false;
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'collect') m.push({ pos: this.center, icon: '?', cls: 'item' });
    return m;
  }
}

class DeliveryMission extends VillageMission {
  constructor(G) {
    super(G, 'delivery', 'anselmo');
    const L = G.world.landmarks.camp;
    this.campName = G.missions.takeName(TOURIST_NAMES);
    this.camper = new Actor(G, 'human', { x: L.x + 2.5, z: L.z + 2 });
    this.actors.push(this.camper);
    const self = this;
    this.inter.push({
      kind: 'camper', pos: liveAt(this.camper, 0.8), r: 0.9,
      enabled: () => self.camper.mesh.visible,
      prompt: () => ({ title: self.campName + ' (campista)', lines: [self.state === 'carry' ? '[E] Entregar el paquete' : '[E] Hablar'], info: [] }),
      act: (key, GG) => {
        if (key !== 'E') return false;
        if (self.state === 'carry') {
          self.complete(self.campName, 'Por fin, la comida y las pilas. Anselmo dijo que vendrías. Toma, para ti.');
        } else GG.hud.say(self.campName, 'Estamos esperando un paquete de la tienda del pueblo. Si vas para allá...');
        return true;
      },
    });
  }
  label() {
    if (this.state === 'available') return 'Anselmo (armería) tiene un recado';
    return `Lleva el paquete de Anselmo al campamento del norte (${this.campName})`;
  }
  talk() {
    if (this.state !== 'available') return false;
    this.say('Tú vas mucho por el bosque. Lleva este paquete a los campistas del claro del norte, junto a la tienda de campaña vieja. Te pagarán ellos.');
    this.state = 'carry';
    SFX.pickup();
    return true;
  }
  hasTalk(id) { return id === 'anselmo' && this.state === 'available'; }
  update(dt) {
    const c = this.camper;
    if (c.mesh.visible) {
      c.pose = { sit: this.state !== 'done' };
      if (c.dist() < 20) c.face(this.G.player.pos, dt);
      c.animate(dt);
    }
    super.update(dt);
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'carry') m.push({ pos: this.camper.pos, icon: '◆', cls: 'item' });
    return m;
  }
}

class TrailcamMission extends VillageMission {
  constructor(G) {
    super(G, 'trailcam', 'alcalde');
    this.got = 0;
    this.cams = [];
  }
  label() {
    if (this.state === 'available') return 'El alcalde quiere hablar contigo';
    if (this.state === 'collect') return `Recoge las tarjetas de las cámaras de fototrampeo (${this.got}/2)`;
    return 'Lleva las tarjetas al alcalde';
  }
  talk() {
    if (this.state === 'available') {
      this.say('Guarda, el ayuntamiento puso dos cámaras de fototrampeo en el bosque. Tráigame las tarjetas de memoria. Sin preguntas.');
      this.state = 'collect';
      for (let i = 0; i < 2; i++) {
        const p = this.G.world.randomForestPoint(30, 85, { x: 40 + i * 40, z: i ? -30 : 30 }, true);
        const m = this.addProp(makeTrailCam(), p);
        m.rotation.y = Math.random() * 6;
        const approx = new THREE.Vector3(p.x + U.range(-5, 5), 0, p.z + U.range(-5, 5));
        const cam = { mesh: m, approx, taken: false };
        this.cams.push(cam);
        const self = this;
        this.inter.push({
          kind: 'trailcam', pos: new THREE.Vector3(p.x, 1.15, p.z), r: 0.6,
          enabled: () => !cam.taken && self.state === 'collect',
          prompt: () => ({ title: 'Cámara de fototrampeo', lines: ['[E] Sacar la tarjeta de memoria'], info: [] }),
          act: (key, GG) => {
            if (key !== 'E') return false;
            cam.taken = true;
            m.userData.glint.visible = false;
            self.got++;
            SFX.click(null, 0.6);
            if (self.got >= 2) {
              self.state = 'return';
              GG.hud.msg('Tienes las dos tarjetas. Llévaselas al alcalde.');
            } else GG.hud.msg('Tarjeta 1/2. La pantallita muestra una foto borrosa: dos puntos rojos.');
            return true;
          },
        });
      }
      SFX.ui();
      return true;
    }
    if (this.state === 'return') {
      this.complete(this.giverNpc.name, 'Bien. Muy bien. No ha visto las fotos, ¿verdad? Mejor así. Tome su paga.');
      setTimeout(() => this.G.hud.msg('Antes de entregarlas viste una foto: una figura altísima con cuernos, mirando a la cámara.', 7), 3500);
      return true;
    }
    return false;
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'collect') this.cams.forEach((c) => { if (!c.taken) m.push({ pos: c.approx, icon: '?', cls: 'item' }); });
    return m;
  }
}

// Fotógrafo que quiere que lo lleves a un sitio del bosque
class PhotoMission extends ForestMission {
  constructor(G, type, spot) {
    super(G, type, spot);
    const L = G.world.landmarks;
    const places = [
      { name: 'el pozo viejo', pos: L.well },
      { name: 'la tumba del claro', pos: L.grave },
      { name: 'el campamento abandonado', pos: L.camp },
      { name: 'las figuras de palos', pos: L.totems[0] },
    ];
    const dist = (p) => Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z);
    places.sort((a, b) => dist(a) - dist(b));
    this.place = places.find((p) => dist(p) > 25) || places[places.length - 1];
    this.shootT = 0;
    this.clickT = 0;
  }
  label() {
    if (this.state === 'following') return `Guía a ${this.name} (fotógrafo/a) hasta ${this.place.name}`;
    if (this.state === 'shooting') return `${this.name} está haciendo fotos...`;
    return `${this.name} lleva una cámara colgada`;
  }
  onGiver() {
    if (this.state === 'available') {
      this.say(`Hago fotos para una revista. En el pueblo me hablaron de ${this.place.name}... ¿Me llevas? No me atrevo a ir sin alguien que conozca el bosque.`);
      this.state = 'following';
      SFX.ui();
    } else this.say('Tú delante, yo te sigo.');
  }
  update(dt) {
    const g = this.giver;
    if (this.state === 'following') {
      g.pose = {};
      g.follow(dt, this.name);
      if (Math.hypot(g.pos.x - this.place.pos.x, g.pos.z - this.place.pos.z) < 8) {
        this.state = 'shooting';
        this.shootT = 5;
        this.say('¡Aquí es! No te muevas, unas cuantas fotos...');
      }
    } else if (this.state === 'shooting') {
      g.face(this.place.pos, dt);
      this.shootT -= dt;
      this.clickT -= dt;
      if (this.clickT <= 0) {
        this.clickT = 0.9;
        SFX.click(g.pos, 0.6);
        if (g.dist() < 25) this.G.hud.flash(0.05);
      }
      if (this.shootT <= 0) this.complete(this.name, 'Increíble. Esto va a quedar genial... Oye, en la última foto sale alguien detrás de los árboles. No, nada. Toma, te lo has ganado.');
    }
    super.update(dt);
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'following') m.push({ pos: this.place.pos, icon: '◆', cls: 'item' });
    return m;
  }
}

// Leña para la taberna
class FirewoodMission extends VillageMission {
  constructor(G) {
    super(G, 'firewood', 'tabernero');
    this.need = 4;
    this.got = 0;
  }
  label() {
    if (this.state === 'available') return 'Ramón (taberna) necesita ayuda';
    if (this.state === 'collect') return `Recoge haces de leña junto al camino (${this.got}/${this.need})`;
    return 'Lleva la leña a la taberna';
  }
  talk() {
    if (this.state === 'available') {
      this.say('Me quedo sin leña y de noche no salgo ni loco. Los leñadores dejaron haces junto al camino. Tráeme cuatro.');
      this.state = 'collect';
      const pts = this.G.world.pathPts;
      for (let i = 0; i < 6; i++) {
        const base = pts[Math.floor(pts.length * (0.2 + i * 0.11))];
        const p = this.G.world.randomForestPoint(4, 9, base, true);
        const m = this.addProp(makeFirewood(), p);
        m.rotation.y = Math.random() * 6;
        const self = this;
        this.inter.push({
          kind: 'firewood', pos: new THREE.Vector3(p.x, 0.2, p.z), r: 0.6,
          enabled: () => m.visible && self.state === 'collect',
          prompt: () => ({ title: 'Haz de leña', lines: ['[E] Cargar'], info: [] }),
          act: (key, GG) => {
            if (key !== 'E') return false;
            m.visible = false;
            self.got++;
            SFX.pickup();
            if (self.got >= self.need) { self.state = 'return'; GG.hud.msg('Ya tienes leña suficiente. Llévasela a Ramón.'); }
            else GG.hud.msg(`Leña: ${self.got}/${self.need}`);
            return true;
          },
        });
      }
      SFX.ui();
      return true;
    }
    if (this.state === 'return') {
      this.complete(this.giverNpc.name, 'Eso es. Esta noche no me falta fuego. Toma, y la próxima ronda corre de mi cuenta.');
      return true;
    }
    return false;
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'collect') this.props.forEach((p) => { if (p.visible) m.push({ pos: p.position, icon: '?', cls: 'item' }); });
    return m;
  }
}

// Postes del sendero rotos (encargo de Julián)
class SignsMission extends VillageMission {
  constructor(G) {
    super(G, 'signs', 'julian');
    this.got = 0;
    this.posts = [];
  }
  label() {
    if (this.state === 'available') return 'Julián (ferretería) tiene un trabajo';
    if (this.state === 'fix') return `Arregla los postes rotos del sendero (${this.got}/3)`;
    return 'Vuelve a la ferretería a cobrar';
  }
  talk() {
    if (this.state === 'available') {
      this.say('Algo ha tirado los postes del sendero. Tres, nada menos, y con marcas de arañazos. Ve y arréglalos, que los turistas se pierden.');
      this.state = 'fix';
      const pts = this.G.world.pathPts;
      [0.22, 0.48, 0.74].forEach((f, i) => {
        const a = pts[Math.floor(pts.length * f)], b = pts[Math.floor(pts.length * f) + 2];
        const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
        const side = i % 2 ? 1 : -1;
        const p = { x: a.x - (tz / tl) * 2.4 * side, z: a.z + (tx / tl) * 2.4 * side };
        const m = this.addProp(makeSignpost(), p);
        m.rotation.y = Math.atan2(tx, tz);
        m.userData.post.rotation.z = 1.2 * side;
        const post = { mesh: m, fixed: false, pos: new THREE.Vector3(p.x, 0, p.z) };
        this.posts.push(post);
        const self = this;
        this.inter.push({
          kind: 'signpost', pos: new THREE.Vector3(p.x, 0.7, p.z), r: 0.9,
          enabled: () => !post.fixed && self.state === 'fix',
          prompt: () => ({ title: 'Poste del sendero (roto)', lines: ['[E] Enderezarlo y clavarlo'], info: [] }),
          act: (key, GG) => {
            if (key !== 'E') return false;
            post.fixed = true;
            m.userData.post.rotation.z = 0;
            m.userData.glint.visible = false;
            SFX.hammer(post.pos);
            self.got++;
            if (self.got >= 3) { self.state = 'return'; GG.hud.msg('Postes arreglados. Julián te pagará.'); }
            else GG.hud.msg(`Postes arreglados: ${self.got}/3`);
            return true;
          },
        });
      });
      SFX.ui();
      return true;
    }
    if (this.state === 'return') {
      this.complete(this.giverNpc.name, 'Buen trabajo. Si vuelven a aparecer tirados, no quiero saber qué los tira. Toma.');
      return true;
    }
    return false;
  }
  markers() {
    const m = super.markers();
    if (this.active && this.state === 'fix') this.posts.forEach((p) => { if (!p.fixed) m.push({ pos: p.pos, icon: '?', cls: 'item' }); });
    return m;
  }
}

// Tareas del guarda que llegan por radio (no hay que hablar con nadie)
class DutyMission extends Mission {
  constructor(G, type) {
    super(G, type);
    this.state = 'active';
  }
  pay(text) {
    this.complete(null, null);
    this.G.hud.say('Radio del ayuntamiento', text, 5);
  }
}

// Cepos de un furtivo: desmontarlos (y no pisarlos)
class TrapsMission extends DutyMission {
  constructor(G) {
    super(G, 'traps');
    this.got = 0;
    const c = G.world.randomForestPoint(35, 90, { x: 20, z: 0 }, true);
    this.center = new THREE.Vector3(c.x, 0, c.z);
    this.traps = [];
    for (let i = 0; i < 3; i++) {
      const p = G.world.randomForestPoint(3, 14, c, true);
      const m = this.addProp(makeBearTrap(), p);
      const trap = { mesh: m, done: false, pos: new THREE.Vector3(p.x, 0, p.z) };
      this.traps.push(trap);
      const self = this;
      this.inter.push({
        kind: 'trap', pos: new THREE.Vector3(p.x, 0.1, p.z), r: 0.6,
        enabled: () => !trap.done,
        prompt: () => ({ title: 'Cepo de un furtivo', lines: ['[E] Desmontarlo con cuidado'], info: ['No lo pises'] }),
        act: (key) => {
          if (key !== 'E') return false;
          self.disarm(trap, false);
          return true;
        },
      });
    }
  }
  label() { return `Desmonta los cepos de un furtivo (${this.got}/3)`; }
  disarm(trap, sprung) {
    trap.done = true;
    trap.mesh.userData.glint.visible = false;
    trap.mesh.rotation.x = sprung ? 0 : 0.3;
    SFX.click(trap.pos, 1);
    SFX.bang(trap.pos, sprung ? 0.8 : 0.3);
    this.got++;
    if (this.got >= 3) this.pay('...gracias por retirar esos cepos, guarda. Se le ingresa su gratificación...');
    else this.G.hud.msg(`Cepos: ${this.got}/3`);
  }
  update(dt) {
    const P = this.G.player;
    if (this.active) {
      this.traps.forEach((t) => {
        if (!t.done && Math.hypot(P.pos.x - t.pos.x, P.pos.z - t.pos.z) < 0.45 && P.pos.y < 0.5) {
          P.hurt(25);
          P.vel.set(0, 0, 0);
          this.G.hud.msg('¡Has pisado un cepo!');
          this.disarm(t, true);
        }
      });
    }
    this.glint(dt);
  }
  markers() {
    return this.active ? [{ pos: this.center, icon: '?', cls: 'item' }] : [];
  }
  fail() { super.fail(); this.props.forEach((p) => (p.visible = false)); }
}

// Hoguera abandonada que hay que apagar antes de que se extienda
class CampfireMission extends DutyMission {
  constructor(G) {
    super(G, 'campfire');
    const p = G.world.randomForestPoint(40, 100, { x: 20, z: 0 }, true);
    this.pos = new THREE.Vector3(p.x, 0, p.z);
    this.fire = this.addProp(makeCampfire(), p);
    this.lit = true;
    const self = this;
    this.inter.push({
      kind: 'campfire', pos: new THREE.Vector3(p.x, 0.3, p.z), r: 0.9,
      enabled: () => self.lit && self.active,
      prompt: () => ({ title: 'Hoguera abandonada', lines: ['[E] Apagarla con tierra'], info: [] }),
      act: (key) => {
        if (key !== 'E') return false;
        self.lit = false;
        SFX.woodCrack(self.pos, 0.4);
        self.G.hud.msg('Apagas la hoguera. Hay huellas enormes alrededor de las brasas.');
        self.pay('...el ayuntamiento agradece que haya apagado ese fuego antes de que se extendiera...');
        return true;
      },
    });
  }
  label() { return 'Apaga la hoguera abandonada antes de las 16:00 (sigue el humo)'; }
  update(dt) {
    animateCampfire(this.fire, dt, performance.now() * 0.001, this.lit && this.state !== 'failed');
    if (this.active && this.G.clock > 16 * 60) {
      this.fail();
      this.lit = false;
      this.G.hud.msg('La hoguera se ha extendido por el sotobosque. Han tenido que apagarla desde el pueblo.', 6);
    }
  }
  markers() { return this.active ? [{ pos: this.pos, icon: '◆', cls: 'item' }] : []; }
  fail() { if (this.active) this.state = 'failed'; }
}

const MISSION_CLASSES = {
  lost: LostMission, item: ItemMission, injured: InjuredMission, child: ChildMission, dog: DogMission, photo: PhotoMission,
  mushrooms: MushroomMission, delivery: DeliveryMission, trailcam: TrailcamMission, firewood: FirewoodMission, signs: SignsMission,
  traps: TrapsMission, campfire: CampfireMission,
};

class MissionManager {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.usedNames = new Set();
  }

  takeName(pool) {
    const free = pool.filter((n) => !this.usedNames.has(n));
    const n = U.pick(free.length ? free : pool);
    this.usedNames.add(n);
    return n;
  }

  clear() {
    this.list.forEach((m) => m.cleanup());
    this.list = [];
    this.usedNames.clear();
  }

  pickTypes(day) {
    const N = CFG.MISSIONS_PER_DAY;
    if (day === 1) return ['lost', 'item', 'delivery', 'mushrooms'].slice(0, N);
    const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);
    const nv = Math.random() < 0.5 ? 1 : 2;
    const nd = Math.random() < 0.5 ? 1 : 0;
    const al = this.G.village.byId.alcalde;
    const v = shuffle(VILLAGE_TYPES.filter((t) => t !== 'trailcam' || !(al && al.hidden))).slice(0, nv);
    const d = shuffle(DUTY_TYPES).slice(0, nd);
    const f = shuffle(FOREST_TYPES).slice(0, N - nv - nd);
    return [...f, ...v, ...d];
  }

  spawnDay(day) {
    this.clear();
    const G = this.G;
    const types = this.pickTypes(day);
    const placed = [];
    types.forEach((type) => {
      let m;
      if (VILLAGE_TYPES.includes(type) || DUTY_TYPES.includes(type)) m = new MISSION_CLASSES[type](G);
      else {
        let p = null;
        for (let i = 0; i < 30; i++) {
          const c = G.world.randomForestPoint(day === 1 ? 24 : 30, day === 1 ? 70 : 105, { x: 20, z: 0 }, true);
          if (placed.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 22)) { p = c; break; }
        }
        if (!p) p = G.world.randomForestPoint(30, 100);
        placed.push(p);
        m = new MISSION_CLASSES[type](G, type, p);
      }
      this.list.push(m);
    });
  }

  nightFalls() {
    this.list.forEach((m) => m.fail());
  }

  update(dt) { this.list.forEach((m) => m.update(dt)); }

  get interactables() {
    const out = [];
    this.list.forEach((m) => m.interactables().forEach((i) => out.push(i)));
    return out;
  }

  get activeCount() { return this.list.filter((m) => m.active).length; }

  taskLines() { return this.list.filter((m) => m.active).map((m) => m.label()); }

  doneCount() { return this.list.filter((m) => m.state === 'done').length; }

  markers() {
    const out = [];
    this.list.forEach((m) => m.markers().forEach((k) => out.push(k)));
    return out;
  }

  hasTalk(npcId) { return this.list.some((m) => m.active && m.hasTalk(npcId)); }

  talkTo(npcId) {
    const m = this.list.find((x) => x.active && x.hasTalk(npcId));
    return m ? m.talk(npcId) : false;
  }
}
