'use strict';

const SAVE_KEY = 'cabana_save_v1';
const SETTINGS_KEY = 'cabana_settings_v1';

class Game {
  constructor() {
    this.state = 'loading';
    this.settings = { sens: 1, vol: 0.85, fov: 72, quality: 0 };
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (s) Object.assign(this.settings, s);
    } catch (e) { /* sin almacenamiento */ }
    this.day = 1;
    this.clock = CFG.TIME.DAY_START;
    this.phase = 'day';
    this.money = CFG.START.money;
    this.inv = Object.assign({}, CFG.START);
    this.lockLevel = 1;
    this.notesRead = new Set();
    this.stats = { helped: 0, nights: 0 };
    this.daylight = 1;
    this.viewLight = 0.5;
    this.target = null;
    this.inp = { fwd: false, back: false, left: false, right: false, sprint: false, fire: false, turnL: false, turnR: false, mdx: 0, mdy: 0 };
    // Ratón: locked = capturado (gira sin límite); freeMouse = el navegador no deja capturarlo
    this.locked = false;
    this.everLocked = false;
    this.freeMouse = false;
    this.lockReq = null;
    this.lockFails = 0;
    this.mouse = { x: 0, y: 0, inside: false };
    this.lockHintOn = false;
    this.hbT = 0;
    this.last = performance.now();
    this.menuT = 0;
    this.wonShown = false;
    this.monitor = null;
    this.buffs = { coffee: false };
    // Papel del jugador: 'ranger', 'investigator', 'hunter', 'mayor' (y 'monster' en multijugador).
    // mp es la sesión multijugador activa
    this.role = null;
    this.roles = null;
    this.mp = null;
    this.lobby = null;
  }

  init() {
    const canvas = (this.canvas = document.getElementById('view'));
    THREE.ColorManagement.enabled = false;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.useLegacyLights = true;
    r.autoClear = false;
    r.setPixelRatio(1);
    // Look retro: la escena se dibuja pequeña en una textura y luego se amplía con píxeles nítidos
    // al tamaño real de la pantalla. Así no depende de que el navegador respete image-rendering
    // (Safari en el iPad suavizaba la ampliación y todo se veía borroso).
    this.lowRT = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    });
    this.blitScene = new THREE.Scene();
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.lowRT.texture, depthTest: false, depthWrite: false }));
    blit.frustumCulled = false;
    this.blitScene.add(blit);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 170);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    buildTextures();
    this.world = new World(this.scene).build();
    this.cabin = new Cabin(this.world).build();
    this.village = new Village(this.world).build();
    this.homes = new HomeManager(this);
    this.player = new Player(this);
    this.weapons = new Weapons(this);
    this.intruder = new Intruder(this);
    this.power = new Power(this);
    this.missions = new MissionManager(this);
    this.events = new NightEvents(this);
    this.story = new Story(this);
    this.roles = new RoleSystem(this);
    this.pleno = new Pleno(this);
    this.interview = new Interview(this);
    // Bengala (una a la vez): luz roja que espanta al monstruo
    this.flare = null;
    this.flareMesh = makeFlare();
    this.flareMesh.visible = false;
    this.scene.add(this.flareMesh);
    this.flareLight = new THREE.PointLight(0xff3020, 0, 16, 1.2);
    this.scene.add(this.flareLight);
    this.hud = new Hud(this);
    this.lobby = new Multiplayer(this);
    this.buildProps();

    this.bindInput();
    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    SFX.volume = this.settings.vol;

    document.getElementById('loading').classList.add('hidden');
    this.state = 'menu';
    this.setupMenuScene();
    this.refreshMenu();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- Objetos con los que interactuar ----------
  buildProps() {
    const n = (key, pos, rot, wall) => new NoteProp(this, key, pos, rot, wall);
    const L = this.world.landmarks;
    this.notes = [
      n('n1', { x: -1.4, y: 0.815, z: 1.15 }, 0.3),
      n('n2', { x: -4.5, y: 3.615, z: 0.45 }, -0.2),
      n('n3', { x: 0.6, y: 4.3, z: -3.73 }, 0, true),
      n('n4', { x: L.well.x + 1.8, y: 0.03, z: L.well.z + 1.2 }, 1.1),
      n('n5', { x: L.totems[1].x + 1, y: 0.03, z: L.totems[1].z - 1.5 }, 2.1),
      n('n6', { x: L.grave.x + 0.4, y: 0.27, z: L.grave.z + 1.0 }, 0.4),
      n('n7', { x: L.camp.x + 1.6, y: 0.03, z: L.camp.z - 1.3 }, -0.6),
      n('n8', { x: 1.25, y: -2.18, z: -3.1 }, 0.2),
    ];

    // Radio sobre la encimera
    const radio = new THREE.Group();
    const rb = new THREE.Mesh(boxGeo(0.4, 0.22, 0.16, 1), new THREE.MeshLambertMaterial({ color: 0x4a3020 }));
    const rs = new THREE.Mesh(boxGeo(0.18, 0.14, 0.01, 1), MAT.dark);
    rs.position.set(-0.08, 0, 0.08);
    const ant = new THREE.Mesh(boxGeo(0.01, 0.4, 0.01, 1), MAT.metal);
    ant.position.set(0.15, 0.3, 0);
    ant.rotation.z = -0.4;
    radio.add(rb, rs, ant);
    radio.position.set(-2.4, 1.01, -3.45);
    this.scene.add(radio);
    this.radio = {
      kind: 'radio', pos: new THREE.Vector3(-2.4, 1.05, -3.45), r: 0.45,
      prompt: () => ({ title: 'Radio', lines: ['[E] Escuchar'], info: [] }),
      act: (key) => {
        if (key !== 'E') return false;
        SFX.radio();
        const line = RADIO_LINES[Math.min(this.day - 1, RADIO_LINES.length - 1)];
        const n = this.missions.activeCount;
        this.hud.say('Radio', line, 7);
        if (this.phase === 'day') setTimeout(() => this.hud.say('Radio', `...encargos pendientes en la zona: ${n}...`, 4), 3000);
        return true;
      },
    };

    this.bed = {
      kind: 'bed', pos: new THREE.Vector3(-4.0, 3.6, 1.9), r: 0.9,
      prompt: () => ({ title: 'Cama', lines: [this.phase === 'day' && this.clock < CFG.TIME.SLEEP_TO - 30 ? '[E] Dormir hasta las 18:00' : '[E] Dormir'], info: [] }),
      act: (key) => {
        if (key !== 'E') return false;
        if (this.phase === 'night') { this.hud.msg('No puedes dormir con eso ahí fuera.'); return true; }
        if (this.mp && !this.mp.canSleep()) { this.hud.msg('Los demás siguen despiertos: en una partida con más gente no se puede dormir.'); return true; }
        if (this.clock >= CFG.TIME.SLEEP_TO - 30) { this.hud.msg('Ya casi anochece. No es momento de dormir.'); return true; }
        this.sleep();
        return true;
      },
    };
  }

  interactables() {
    return [
      // Modo historia con otro papel: la cabaña del guarda está cerrada con llave
      ...(this.cabinLocked ? [] : this.cabin.interactables), ...this.village.interactables, ...this.homes.interactables,
      ...this.missions.interactables, ...this.power.interactables,
      ...this.story.interactables, ...this.roles.interactables,
      ...this.notes, this.radio, this.bed,
    ];
  }

  findTarget() {
    const P = this.player;
    if (P.dead) return null;
    const eye = P.eyePos();
    const fwd = P.forward();
    let best = null, bestScore = Infinity;
    const list = this.role === 'monster' && this.mp ? this.mp.monsterInteractables() : this.interactables();
    const reach = P.cfg.reach;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.enabled && !it.enabled()) continue;
      const tx = it.pos.x - eye.x, ty = it.pos.y - eye.y, tz = it.pos.z - eye.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > reach + it.r) continue;
      const t = tx * fwd.x + ty * fwd.y + tz * fwd.z;
      if (t < 0) continue;
      const perp = Math.sqrt(Math.max(0, dist * dist - t * t));
      if (perp > it.r) continue;
      const own = it.owner || it;
      const blocked = this.world.raycastBoxes(eye, fwd, Math.max(0, t - it.r * 0.6), (b) => b.sight && b.owner !== own && b.solid !== false);
      if (blocked.t < t - it.r * 0.6) continue;
      const slab = this.world.raycastBoxes(eye, fwd, Math.max(0, t - 0.1), (b) => b.slab);
      if (slab.t < t - 0.1) continue;
      if (!it.prompt(this)) continue;
      const score = perp / it.r + t * 0.15;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  interact(key) {
    const t = this.target;
    if (!t || this.player.climb) return;
    t.act(key, this);
  }

  // ---------- Hora del día ----------
  daylightAt(c) {
    if (c < CFG.TIME.NIGHT_START) {
      if (c < 7.5 * 60) return U.lerp(0.28, 1, U.smooth(6 * 60, 7.5 * 60, c));
      if (c > 18 * 60) return U.lerp(1, 0.0, U.smooth(18 * 60, 20 * 60, c));
      return 1;
    }
    if (c > 29 * 60) return U.lerp(0, 0.28, U.smooth(29 * 60, 30 * 60, c));
    return 0;
  }

  duskAt(c) {
    if (c > 17 * 60 && c < 20.5 * 60) return Math.sin(((c - 17 * 60) / (3.5 * 60)) * Math.PI);
    if (c > 29 * 60) return 0.4 * U.smooth(29 * 60, 30 * 60, c);
    return 0;
  }

  shopOpen() { return this.phase === 'day' && this.clock >= 7 * 60 && this.clock < CFG.TIME.SHOP_CLOSE; }

  // La historia de Tomás solo existe en el modo historia con el guardabosques
  get storyOn() { return !this.mp && (this.role || 'ranger') === 'ranger'; }

  get cabinLocked() { return !this.mp && !!this.role && this.role !== 'ranger'; }

  // Casa en la que duerme el jugador (null = la cabaña del guardabosques)
  get myHome() {
    const h = this.homes && this.homes.get(this.role);
    return h && h.active ? h : null;
  }

  homeName() {
    return { investigator: 'tu caravana', hunter: 'tu fortín', mayor: 'el ayuntamiento' }[this.role] || 'la cabaña';
  }

  // «a la cabaña», «al ayuntamiento»... y «de la cabaña», «del ayuntamiento»...
  homeTo() { return this.role === 'mayor' ? 'al ayuntamiento' : 'a ' + this.homeName(); }
  homeOf() { return this.role === 'mayor' ? 'del ayuntamiento' : 'de ' + this.homeName(); }

  // Mensaje con retraso que solo sale si sigue la misma partida
  later(ms, fn) {
    const tok = this.playToken;
    setTimeout(() => { if (tok === this.playToken && this.state !== 'menu') fn(); }, ms);
  }

  // ¿Está el jugador a cubierto en su casa?
  atHome() {
    const h = this.myHome;
    return h ? h.contains(this.player.pos) : this.cabin.zoneOf(this.player.pos) !== 'outside';
  }

  updateTime(dt) {
    const T = CFG.TIME;
    // Multijugador: la hora la lleva un solo jugador (el guardabosques); los demás la siguen
    const follower = this.mp && !this.mp.isAuthority();
    if (follower) this.mp.advanceClock(dt);
    else {
      const rate = this.phase === 'day'
        ? (T.NIGHT_START - T.DAY_START) / T.DAY_REAL
        : (T.NIGHT_END - T.NIGHT_START) / T.NIGHT_REAL;
      this.clock += dt * rate;
    }
    if (this.phase === 'day') {
      if (!this.warnedDusk && this.clock >= T.DUSK_WARN) {
        this.warnedDusk = true;
        this.hud.msg(`Está anocheciendo. Vuelve ${this.homeTo()} y prepárate para la noche.`, 6);
      }
      if (!this.belled && this.clock >= T.SHOP_CLOSE) {
        this.belled = true;
        SFX.bell(this.village.bellPos);
        if (this.village.contains(this.player.pos)) this.hud.say('Anselmo', this.role === 'mayor' ? 'Cierro, alcalde. Enciérrese en el ayuntamiento y eche el pestillo.' : `Cierro. Vete ${this.homeTo()} y echa los pestillos.`);
      }
      if (!follower && this.clock >= T.NIGHT_START) this.startNight();
    } else if (!follower && this.clock >= T.NIGHT_END) this.dawn();
  }

  // Cae la noche (modo historia o quien lleva la hora en multijugador)
  startNight() {
    if (this.role === 'monster') return;
    this.phase = 'night';
    this.clock = CFG.TIME.NIGHT_START;
    this.events.startNight(this.day);
    this.onNightLocal();
  }

  // Lo que pasa en cada aparato al caer la noche
  onNightLocal() {
    this.missions.nightFalls();
    this.intruder.startNight();
    this.story.onNight();
    this.roles.onNight();
    this.buffs.coffee = false;
    this.homes.onNight();
    if (this.player.dead) return;
    const outside = !this.atHome();
    const out = `¡Estás fuera ${this.homeOf()}! Corre.`;
    this.hud.banner('NOCHE ' + this.day, outside ? out : this.mp ? 'El monstruo sale de su guarida. Mantén los pestillos echados.' : 'Mantén los pestillos echados.', 5);
    if (!outside && !this.myHome && !this.power.running) setTimeout(() => this.hud.msg('Sin el generador no hay luz ni cámaras. Está en la planta de arriba.', 6), 4000);
    const tip = {
      investigator: 'Las trampas de flash de fuera saltan solas si se acerca. Si alguna está disparada, re-ármala... si te atreves a salir.',
      hunter: 'Sube a la planta de arriba: por las troneras se dispara bien. Si suenan los cencerros, mira de qué lado viene.',
      mayor: 'Echa el pestillo del ayuntamiento. Si fuerza la puerta, toca la campana de alarma (3 veces por noche).',
    }[this.role];
    if (tip && !outside) this.later(3500, () => this.hud.msg(tip, 7));
    SFX.sting();
  }

  dawn() {
    const survived = this.day;
    this.events.dawn();
    this.day++;
    this.phase = 'day';
    this.clock = CFG.TIME.DAY_START;
    this.onDawnLocal(survived);
    if (this.mp) {
      if (survived >= CFG.MP.NIGHTS) this.mp.finishAll('dawn');
      return;
    }
    const storyEnd = this.storyOn && this.story.onDawn(survived);
    if (this.storyOn) this.story.startDay(this.day);
    if (storyEnd) this.storyDone = true;
    this.save();
    if (storyEnd) {
      this.wonShown = true;
      this.later(2500, () => this.showEnd(true, 'story'));
    } else if (survived >= CFG.NIGHTS_TO_WIN && !this.wonShown) {
      this.wonShown = true;
      this.later(2500, () => this.showEnd(true, this.role === 'ranger' ? null : 'role'));
    }
  }

  // Lo que pasa en cada aparato al amanecer (survived: la noche que se acaba de superar)
  onDawnLocal(survived) {
    this.intruder.startDay();
    this.homes.onDawn();
    if (this.monitor) this.closeMonitor();
    this.warnedDusk = false;
    this.belled = false;
    if (this.player.dead) return;
    this.stats.nights++;
    this.player.heal(25);
    if (this.role === 'ranger') {
      this.missions.spawnDay(this.day);
      this.addMoney(10, 'Sueldo del ayuntamiento');
    }
    this.roles.onDawn(survived);
    this.roles.startDay(this.day);
    const N = this.mp ? CFG.MP.NIGHTS : 0;
    if (this.mp && survived >= N) this.hud.banner('AMANECE', `Has aguantado ${survived} noches.`, 5);
    else if (this.mp) this.hud.banner('AMANECE', `Has sobrevivido a la noche ${survived}. Quedan ${N - survived}.`, 5);
    else this.hud.banner('AMANECE', `Has sobrevivido a la noche ${survived}.`, 5);
  }

  sleep() {
    this.state = 'sleeping';
    this.hud.fade(true);
    setTimeout(() => {
      this.clock = CFG.TIME.SLEEP_TO;
      this.player.heal(20);
      this.missions.nightFalls();
      setTimeout(() => {
        this.hud.fade(false);
        this.state = 'playing';
        this.hud.msg('Te despiertas al atardecer. Los encargos de hoy se han quedado sin hacer.', 5);
      }, 900);
    }, 900);
  }

  // ---------- Dinero, disparos, curas ----------
  addMoney(n, why) {
    this.money += n;
    SFX.cash();
    this.hud.msg(`+$${n} · ${why}`);
  }

  hitscan(o, d, range, dmg) {
    let tMax = range;
    if (d.y < -1e-4) tMax = Math.min(tMax, -o.y / d.y);
    const rb = this.world.raycastBoxes(o, d, tMax, (b) => b.bullets);
    if (rb.t < tMax) tMax = rb.t;
    const tt = this.world.raycastTrees(o, d, tMax);
    if (tt < tMax) tMax = tt;
    this.cabin.windows.forEach((w) => {
      if (w.glass && w.boards === 0 && U.rayBox(o, d, w.collider, tMax) < tMax) w.smash();
    });
    const p = new THREE.Vector3();
    // Dianas del campo de tiro (cazador)
    const tg = this.roles.hunt.hitTargets(o, d, tMax);
    if (tg < tMax) {
      p.copy(o).addScaledVector(d, tg);
      this.weapons.addPuff(p, 0xe8dcc0);
      return false;
    }
    const hi = this.intruder.hitTest(o, d, tMax);
    // En multijugador, las balas del cazador también hieren a los otros jugadores
    const pv = this.pvpTest(o, d, hi ? hi.t : tMax);
    if (pv) {
      p.copy(o).addScaledVector(d, pv.t);
      this.weapons.addPuff(p, 0x8a1010);
      const n = Math.round(dmg * HUNTER_CFG.pvp);
      this.mp.emit({ t: 'pvp', to: pv.id, d: n });
      this.roles.flagSus('disparando a otro jugador');
      this.hud.msg(`Le das a ${ROLE_INFO[pv.role].the}.`, 2);
      return true;
    }
    if (hi) {
      p.copy(o).addScaledVector(d, hi.t);
      this.weapons.addPuff(p, 0x6a0a05);
      this.intruder.damage(dmg, hi.head);
      this.roles.hunt.onMonsterHit(dmg * (hi.head ? 1.8 : 1));
      return true;
    }
    if (tMax < range) {
      p.copy(o).addScaledVector(d, tMax - 0.05);
      this.weapons.addPuff(p, 0xb8a888);
    }
    return false;
  }

  // ¿Una bala del cazador le da a otro jugador antes que a nada? (multijugador)
  pvpTest(o, d, tMax) {
    if (!this.mp || this.role !== 'hunter') return null;
    let best = null;
    this.mp.avatars.forEach((a, id) => {
      const peer = this.mp.peers.get(id);
      if (!a.has || !peer || peer.left || !peer.s || peer.s.dd || peer.role === 'monster') return;
      const t = U.rayCylinder(o, d, a.pos.x, a.pos.z, 0.38, a.pos.y, a.pos.y + 1.85, tMax);
      if (t < tMax && (!best || t < best.t)) best = { t, id, role: peer.role };
    });
    return best;
  }

  useFlare() {
    const P = this.player;
    if (this.inv.flares <= 0) { this.hud.msg(this.story.flags.flares || this.mp || this.role !== 'ranger' ? 'No te quedan bengalas (ferretería de Julián).' : 'No tienes bengalas.'); return; }
    if (P.climb) return;
    this.inv.flares--;
    const f = P.forward();
    let p = new THREE.Vector3(P.pos.x + f.x * 3, P.pos.y, P.pos.z + f.z * 3);
    if (!this.world.lineOfSight(P.eyePos(), new THREE.Vector3(p.x, P.pos.y + 0.4, p.z), (b) => b.solid)) p = P.pos.clone();
    p.y = this.world.getFloorY(p.x, p.z, P.pos.y + 0.5);
    this.flare = { pos: p, t: 30 };
    this.flareMesh.position.copy(p);
    this.flareMesh.visible = true;
    SFX.flare(p);
    this.hud.msg('Enciendes una bengala. Todo se tiñe de rojo.');
    if (this.mp) this.mp.onFlare(p);
  }

  updateFlare(dt) {
    const f = this.flare;
    if (!f) { this.flareLight.intensity = 0; return; }
    f.t -= dt;
    if (f.t <= 0) {
      this.flare = null;
      this.flareMesh.visible = false;
      this.flareLight.intensity = 0;
      return;
    }
    const k = Math.min(1, f.t / 4);
    this.flareLight.position.set(f.pos.x, f.pos.y + 0.5, f.pos.z);
    this.flareLight.intensity = (2.1 + Math.random() * 0.6) * k;
    const s = (1.2 + Math.random() * 0.4) * k;
    this.flareMesh.userData.glow.scale.set(s, s, s);
  }

  useMedkit() {
    const P = this.player;
    if (this.inv.medkits <= 0) { this.hud.msg('No tienes botiquines.'); return; }
    if (P.health >= CFG.PLAYER.maxHealth) { this.hud.msg('No estás herido.'); return; }
    this.inv.medkits--;
    P.heal(60);
    SFX.paper();
    this.hud.msg('Te vendas las heridas (+60 salud).');
  }

  jumpscare(intr) {
    SFX.jumpscare();
    this.hud.flash(0.45);
    this.player.forceLook = { target: intr.headPos(), t: 0.7 };
    this.player.shake = 1.6;
  }

  onDeath() {
    this.hud.fade(false);
    if (this.mp) { this.mp.onHumanDeath(); return; }
    this.later(1600, () => this.showEnd(false));
  }

  // ---------- Partida nueva / guardar / cargar ----------
  resetWorldState() {
    if (this.pleno) this.pleno.reset();
    if (this.interview) this.interview.reset();
    this.cabin.doors.forEach((d) => { d.open = false; d.anim = 0; d.bolted = false; d.boards = 0; d.pick = 0; });
    this.cabin.windows.forEach((w) => { w.glass = true; w.boards = 0; w.rip = 0; });
    const h = this.cabin.hatch;
    h.open = false; h.anim = 0; h.bolted = false; h.pick = 0;
    const td = this.cabin.trapdoor;
    td.open = false; td.anim = 0; td.bolted = false; td.breach = 0;
    this.power.load(null);
    this.events.clear();
    this.buffs = { coffee: false };
    if (this.monitor) this.closeMonitor();
    this.flare = null;
    this.intruder.enraged = false;
    this.weapons.owned = { revolver: false, shotgun: false, rifle: false, camera: false };
    this.weapons.mag = { revolver: 0, shotgun: 0 };
    this.weapons.current = 'none';
    this.weapons.reloading = 0;
    const P = this.player;
    P.pos.set(1.2, 0, 1.8);
    P.vel.set(0, 0, 0);
    P.vy = 0;
    P.yaw = 1.35;
    P.pitch = -0.25;
    P.health = CFG.PLAYER.maxHealth;
    P.stamina = 100;
    P.battery = 100;
    P.flashOn = false;
    P.dead = false;
    P.climb = null;
    P.forceLook = null;
    P.shake = 0;
    P.aiming = false;
    this.intruder.endNight();
    this.intruder.state = 'off';
  }

  newGame(role = 'ranger') {
    this.role = role;
    this.resetWorldState();
    this.day = 1;
    this.clock = CFG.TIME.DAY_START + 20;
    this.phase = 'day';
    this.money = CFG.START.money;
    this.inv = Object.assign({}, CFG.START);
    this.lockLevel = 1;
    this.notesRead = new Set();
    this.stats = { helped: 0, nights: 0 };
    this.warnedDusk = false;
    this.belled = false;
    this.wonShown = false;
    this.roles.setup(role, { mode: 'story' });
    this.story.load(null);
    if (role === 'ranger') {
      this.missions.spawnDay(1);
      this.story.startDay(1);
    } else {
      this.missions.clear();
      this.story.clearDay();
      this.roles.placeAtHome();
    }
    this.roles.startDay(1);
    this.intruder.startDay();
    this.save();
    this.beginPlay();
    this.introBanner();
  }

  // Presentación del primer día según el papel
  introBanner() {
    const r = this.role;
    const goal = this.roles.goalText();
    if (r === 'ranger' && !this.mp) {
      this.hud.banner('DÍA 1', 'Eres el nuevo guarda forestal del bosque de Robledal.', 5);
      this.later(2500, () => this.hud.msg('Hay una nota sobre la mesa. Acércate y pulsa E.', 6));
      return;
    }
    const name = ROLE_INFO[r].name.toUpperCase();
    const where = {
      ranger: 'Prepárate de día en la cabaña y en el pueblo.',
      investigator: 'Empiezas en tu caravana, junto al camino (◆ en la brújula).',
      hunter: 'Empiezas en tu fortín, en mitad del bosque (◆ en la brújula). El rifle está en la tecla 4; clic derecho para la mira.',
      mayor: 'Empiezas en el ayuntamiento del pueblo.',
    }[r];
    this.hud.banner('DÍA 1 · ' + name, 'Objetivo: ' + goal + '.', 7);
    this.later(3000, () => this.hud.msg(where, 7));
    this.later(9000, () => this.hud.msg(`De noche el monstruo sale a cazar: enciérrate en ${this.homeName()} (${r === 'ranger' ? '⌂' : '◆'}) antes de las 20:00.`, 8));
    const how = {
      investigator: 'Tu caravana tiene tres trampas de flash alrededor: si se acerca, lo ciegan y le sacan una foto. Con V enciendes el medidor de campo: busca anomalías en el bosque y, de noche, pita si él se acerca.',
      hunter: 'En el fortín tienes munición, cepos y ramas. B deja un cepo delante de ti; C monta un escondite donde estés. Al este hay un campo de tiro para mejorar la puntería.',
      mayor: 'El ayuntamiento tiene dos plantas. Arriba, en tu despacho: el mapa del pueblo para encender farolas (lo espantan), el monitor de las cámaras del bosque y la campana de alarma.',
    }[r];
    if (how) this.later(20000, () => this.hud.msg(how, 9));
    if (r === 'investigator') this.later(15000, () => this.hud.msg('Lo ves todo a través de tu cámara: graba sonido sola. Clic = foto con flash (lo espanta; se recarga en 7 s). Clic derecho = zoom. Envía las pruebas desde la radio de la caravana.', 9));
  }

  save() {
    try {
      const data = {
        v: 1, day: this.day, money: this.money, inv: this.inv, lockLevel: this.lockLevel,
        health: this.player.health, battery: this.player.battery, notes: [...this.notesRead], stats: this.stats,
        wonShown: this.wonShown,
        weapons: { owned: this.weapons.owned, mag: this.weapons.mag },
        doors: this.cabin.doors.map((d) => ({ bolted: d.bolted, boards: d.boards })),
        windows: this.cabin.windows.map((w) => ({ glass: w.glass, boards: w.boards })),
        hatch: { bolted: this.cabin.hatch.bolted },
        trapdoor: { bolted: this.cabin.trapdoor.bolted },
        power: this.power.serialize(),
        story: this.story.serialize(),
        role: this.role || 'ranger',
        roles: this.roles.serialize(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* sin almacenamiento */ }
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    if (!d) { this.newGame(); return; }
    this.resetWorldState();
    const role = HUMAN_ROLES.includes(d.role) ? d.role : 'ranger';
    this.role = role;
    this.roles.setup(role, { mode: 'story', seed: d.roles && d.roles.seed });
    this.roles.load(d.roles || null);
    this.day = d.day;
    this.clock = CFG.TIME.DAY_START;
    this.phase = 'day';
    this.money = d.money;
    this.inv = Object.assign({}, CFG.START, d.inv);
    this.lockLevel = d.lockLevel || 1;
    this.notesRead = new Set(d.notes || []);
    this.stats = d.stats || { helped: 0, nights: 0 };
    this.wonShown = !!d.wonShown;
    this.player.health = Math.max(40, d.health || 100);
    this.player.battery = d.battery !== undefined ? d.battery : 100;
    if (d.weapons) {
      this.weapons.owned = Object.assign({ revolver: false, shotgun: false }, d.weapons.owned);
      this.weapons.mag = Object.assign({ revolver: 0, shotgun: 0 }, d.weapons.mag);
    }
    if (role === 'hunter') this.weapons.owned.rifle = true;
    this.weapons.owned.camera = role === 'investigator';
    (d.doors || []).forEach((s, i) => { const dd = this.cabin.doors[i]; if (dd) { dd.bolted = s.bolted; dd.boards = s.boards; } });
    (d.windows || []).forEach((s, i) => { const w = this.cabin.windows[i]; if (w) { w.glass = s.glass; w.boards = s.boards; } });
    if (d.hatch) this.cabin.hatch.bolted = d.hatch.bolted;
    if (d.trapdoor) this.cabin.trapdoor.bolted = d.trapdoor.bolted;
    this.power.load(d.power || null);
    this.story.load(d.story || null);
    if (role === 'ranger') {
      this.story.startDay(this.day);
      this.missions.spawnDay(this.day);
    } else this.missions.clear();
    this.roles.startDay(this.day);
    this.warnedDusk = false;
    this.belled = false;
    this.intruder.startDay();
    this.beginPlay();
    this.hud.banner('DÍA ' + this.day + (role === 'ranger' ? '' : ' · ' + ROLE_INFO[role].name.toUpperCase()), 'Amanece en el bosque.', 4);
  }

  // Empieza una partida multijugador con el papel que toque. roster: papeles de todos
  startMatch(role, roster, seed) {
    this.role = role;
    this.mp = this.lobby;
    this.resetWorldState();
    this.day = 1;
    this.clock = CFG.TIME.DAY_START + 20;
    this.phase = 'day';
    this.money = CFG.START.money;
    this.inv = Object.assign({}, CFG.START);
    this.lockLevel = 1;
    this.notesRead = new Set();
    this.stats = { helped: 0, nights: 0 };
    this.warnedDusk = false;
    this.belled = false;
    this.wonShown = false;
    this.story.load(null);
    this.story.clearDay();
    this.missions.clear();
    this.roles.setup(role, { mode: 'mp', seed, roster });
    this.mp.setup(role);
    if (role !== 'monster') {
      if (role === 'ranger') this.missions.spawnDay(1);
      this.roles.placeAtHome();
      this.roles.startDay(1);
      this.intruder.startDay();
    }
    this.beginPlay(false);
    const others = roster.length - 1;
    if (role === 'ranger') {
      this.hud.banner('DÍA 1 · GUARDABOSQUES', `El monstruo lo controla otra persona. Prepárate de día y aguanta ${CFG.MP.NIGHTS} noches.`, 6);
      setTimeout(() => this.mp === this.lobby && this.hud.msg('En multijugador la ferretería de Julián vende bengalas desde el primer día.', 6), 6500);
      if (others > 1) setTimeout(() => this.mp === this.lobby && this.hud.msg('Tú llevas la hora y la cabaña. Los demás pasan la noche en sus casas: la caravana, el fortín del cazador y el ayuntamiento.', 7), 13000);
    } else if (role === 'monster') {
      this.hud.banner('DÍA 1 · MONSTRUO', others > 1 ? `De día, hazte más fuerte en tu guarida. De noche caza: ganas si atrapas al menos a ${Math.ceil(others / 2)} de los ${others} humanos.` : 'De día, hazte más fuerte en tu guarida. A las 20:00 se abren los túneles.', 7);
      setTimeout(() => this.mp === this.lobby && this.hud.msg('Recorre la cueva: cada marca de la brújula es una actividad que te mejora. Una vez al día cada una.', 7), 6500);
    } else this.introBanner();
  }

  showMPEnd(won, title, sub, stats) {
    if (this.state === 'mpend' || !this.mp) return;
    this.state = 'mpend';
    this.exitLock();
    const $ = (id) => document.getElementById(id);
    $('go-title').textContent = title;
    $('go-sub').textContent = sub;
    $('go-stats').innerHTML = stats;
    $('gameover').classList.toggle('won', !!won);
    $('btn-go-continue').classList.add('hidden');
    $('btn-retry').classList.add('hidden');
    ['pause', 'shop', 'note', 'townmap'].forEach((id) => $(id).classList.add('hidden'));
    this.pleno.reset();
    this.interview.reset();
    if (this.monitor) this.closeMonitor();
    $('gameover').classList.remove('hidden');
    this.hud.show(false);
    SFX.sting();
  }

  // gesture: se llama desde un clic o una tecla (en multijugador la partida empieza sola)
  beginPlay(gesture = true) {
    this.playToken = (this.playToken || 0) + 1;
    this.ccT = 0;
    this.hud.alertT = 0;
    this.hud.el.alert.classList.remove('show');
    this.hud.subsList = [];
    this.hud.renderSubs();
    SFX.init();
    SFX.setVolume(this.settings.vol);
    this.state = 'playing';
    this.player.fov = this.settings.fov;
    this.intruder.mesh.visible = false;
    ['menu', 'mp', 'roles', 'pause', 'gameover', 'shop', 'note', 'townmap'].forEach((id) => document.getElementById(id).classList.add('hidden'));
    document.getElementById('pause-mp').classList.toggle('hidden', !this.mp);
    this.hud.show(true);
    this.requestLock(gesture);
  }

  // ---------- Monitor de cámaras (búnker de la cabaña o despacho del ayuntamiento) ----------
  openMonitor(cams, source = 'cabin', start = 0) {
    if (source === 'cabin') {
      if (!this.power.powered) { this.hud.msg('Las pantallas están apagadas: no hay corriente.'); return; }
      cams = this.power.installedCams();
      if (!cams.length) { this.hud.msg('No hay cámaras montadas. Cómpralas en la ferretería y móntalas en los soportes de fuera.', 6); return; }
    }
    if (this.state === 'map') this.closeTownMap(false);
    this.monitor = { i: start, cams, noise: 0.4, source };
    this.clearInput();
    document.body.classList.add('cam-view');
    document.getElementById('camui').classList.remove('hidden');
    SFX.click(null, 0.5);
  }

  closeMonitor() {
    this.monitor = null;
    document.body.classList.remove('cam-view');
    document.getElementById('camui').classList.add('hidden');
  }

  switchCam(dir) {
    const m = this.monitor;
    if (!m) return;
    if (m.source === 'cabin') m.cams = this.power.installedCams();
    m.i = (m.i + dir + m.cams.length) % m.cams.length;
    m.noise = 0.3;
    SFX.click(null, 0.3);
  }

  updateMonitor(dt) {
    const m = this.monitor;
    if (!m) return;
    if (this.player.dead || (m.source === 'cabin' && !this.power.powered)) { this.closeMonitor(); this.hud.msg('Las pantallas se han quedado en negro.'); return; }
    m.noise = Math.max(0, m.noise - dt);
    const cam = m.cams[m.i];
    const $ = (id) => document.getElementById(id);
    $('cam-name').textContent = `CAM ${m.i + 1}/${m.cams.length} · ${cam.name.toUpperCase()}`;
    $('cam-time').textContent = '● REC  ' + U.fmtTime(this.clock);
    $('cam-static').style.opacity = (0.12 + m.noise * 2 + (Math.random() < 0.02 ? 0.4 : 0)).toFixed(2);
    if (m.source === 'town') {
      const th = this.homes.townhall;
      const now = performance.now();
      const seen = m.cams.filter((c) => c.seenT > 0 && now - c.seenT < 15000).map((c) => `<div class="alert">⚠ Movimiento · ${c.name}</div>`).join('');
      const sg = th.sighting;
      $('cam-side').innerHTML = '<div>Cámaras del ayuntamiento</div>' + (seen || '<div>Sin movimiento</div>') + (sg ? `<div>Última vez: ${sg.by} (hace ${Math.round((now - sg.t) / 1000)} s)</div>` : '');
      return;
    }
    const dets = this.power.mounts.filter((x) => x.det).map((x) => `<div class="${x.alertT > 0 ? 'alert' : ''}">${x.alertT > 0 ? '⚠' : '·'} Detector ${x.name}</div>`).join('');
    $('cam-side').innerHTML = `<div>Generador ${Math.round(this.power.fuel)}%</div>` + (dets || '<div>Sin detectores</div>');
  }

  // ---------- Mapa del pueblo (despacho del alcalde) ----------
  openTownMap() {
    this.state = 'map';
    this.exitLock();
    this.clearInput();
    this.mapView = this.mapView || 'pueblo';
    document.getElementById('townmap').classList.remove('hidden');
    SFX.paper();
    this.mapSideT = 0;
    this.drawTownMap(0);
  }

  closeTownMap(lock = true) {
    document.getElementById('townmap').classList.add('hidden');
    if (this.state === 'map') this.state = 'playing';
    if (lock) this.requestLock();
  }

  // Encuadre del mapa: el pueblo de cerca o todo el bosque
  mapFrame() {
    const cv = document.getElementById('map-canvas');
    const B = CFG.WORLD;
    const v = this.mapView === 'pueblo' ? { x0: 118, x1: 186, z0: -36, z1: 22 } : { x0: B.minX, x1: B.maxX, z0: B.minZ, z1: B.maxZ };
    const k = Math.min((cv.width - 20) / (v.x1 - v.x0), (cv.height - 20) / (v.z1 - v.z0));
    const ox = (cv.width - (v.x1 - v.x0) * k) / 2, oz = (cv.height - (v.z1 - v.z0) * k) / 2;
    return { v, k, sx: (x) => ox + (x - v.x0) * k, sz: (z) => oz + (z - v.z0) * k, wx: (px) => v.x0 + (px - ox) / k, wz: (pz) => v.z0 + (pz - oz) / k };
  }

  // Fondo fijo de cada encuadre (pergamino, bosque, camino, edificios), dibujado una vez al día
  mapBackground(F) {
    const key = this.mapView + ':' + this.day;
    this.mapBg = this.mapBg || {};
    if (!this.mapBg[key]) {
      const cv = document.getElementById('map-canvas');
      this.mapBg[key] = TownMapArt.background(this, F, this.mapView, cv.width, cv.height);
    }
    return this.mapBg[key];
  }

  drawTownMap(dt) {
    // Si lo atrapan con el mapa abierto, el mapa se cierra
    if (this.player.dead) { this.closeTownMap(false); return; }
    const cv = document.getElementById('map-canvas');
    if (!cv) return;
    const g = cv.getContext('2d');
    const F = this.mapFrame();
    const th = this.homes.townhall;
    g.drawImage(this.mapBackground(F), 0, 0);
    const now = performance.now();
    const pueblo = this.mapView === 'pueblo';
    const hot = TownMapArt.overlay(this, g, F, this.mapHover);
    cv.style.cursor = hot ? 'pointer' : 'crosshair';
    const sg = th.sighting;
    // Panel lateral (unas pocas veces por segundo)
    this.mapSideT -= dt;
    if (this.mapSideT > 0) return;
    this.mapSideT = 0.25;
    const lamps = th.lamps.map((l, k) => `<button class="map-row${l.on && !l.broken ? ' on' : ''}${l.broken ? ' broken' : ''}" data-lamp="${k}"><b>${k + 1}</b> ${l.name}<i>${l.broken ? 'ROTA' : l.on ? 'ENCENDIDA' : 'apagada'}</i></button>`).join('');
    const cams = th.cams.map((c, k) => `<button class="map-row cam${c.seenT > 0 && now - c.seenT < 10000 ? ' seen' : ''}" data-cam="${k}">▶ ${c.name}</button>`).join('');
    const sgt = sg ? `<p class="map-sight">Visto por última vez: ${sg.by}, hace ${Math.round((now - sg.t) / 1000)} s</p>` : '<p class="map-sight">Ninguna cámara lo ha visto todavía.</p>';
    const html = `<p>Farolas encendidas <b>${th.litCount()}/${th.maxLit}</b>${this.phase === 'night' ? '' : ' · de día no se encienden'}</p>${lamps}<p>Cámaras del bosque</p>${cams}${sgt}`;
    const side = document.getElementById('map-side');
    if (side.dataset.html !== html) { side.dataset.html = html; side.innerHTML = html; }
    document.getElementById('btn-map-view').textContent = pueblo ? 'Ver todo el bosque' : 'Ver el pueblo';
  }

  // Clic en el mapa: farola (encender/apagar) o cámara (verla)
  mapClick(e) {
    const cv = document.getElementById('map-canvas');
    const R = cv.getBoundingClientRect();
    const mx = ((e.clientX - R.left) / R.width) * cv.width, my = ((e.clientY - R.top) / R.height) * cv.height;
    const F = this.mapFrame();
    const th = this.homes.townhall;
    let best = null, bd = 16;
    th.lamps.forEach((l, k) => { const d = Math.hypot(F.sx(l.pos.x) - mx, F.sz(l.pos.z) - my); if (d < bd) { bd = d; best = { lamp: k }; } });
    th.cams.forEach((c, k) => { const d = Math.hypot(F.sx(c.pos.x) - mx, F.sz(c.pos.z) - my); if (d < bd) { bd = d; best = { cam: k }; } });
    if (!best) return;
    if (best.lamp !== undefined) { th.toggleLamp(best.lamp); this.mapSideT = 0; }
    else this.openMonitor(th.cams, 'town', best.cam);
  }

  // kind: 'story' (final de Tomás), 'role' (final de los otros papeles) o nada
  showEnd(won, kind) {
    if (this.mp) return;
    this.state = won ? 'victory' : 'dead';
    this.exitLock();
    const $ = (id) => document.getElementById(id);
    $('townmap').classList.add('hidden');
    this.pleno.reset();
    this.interview.reset();
    if (this.monitor) this.closeMonitor();
    const o = this.roles.objective();
    const roleWin = kind === 'role' && o.ok;
    let title = kind === 'story' ? 'EL BOSQUE ARDE' : won ? 'SOBREVIVISTE' : 'HAS MUERTO';
    let sub = kind === 'story'
      ? 'Quemaste su guarida y aguantaste su última embestida. Has terminado lo que Tomás empezó... pero algo sigue rondando el bosque cada noche.'
      : won
        ? `${CFG.NIGHTS_TO_WIN} noches. El bosque te deja en paz... por ahora.`
        : `Te atrapó durante la noche ${this.day}. Un solo golpe basta.`;
    if (kind === 'role') {
      title = roleWin ? 'OBJETIVO CUMPLIDO' : 'SOBREVIVISTE, PERO...';
      sub = {
        investigator: roleWin ? 'Tu expediente sale en portada: el mundo sabe que el monstruo de Robledal existe. Y tú sigues vivo para contarlo.' : 'Sigues vivo, pero sin pruebas suficientes nadie te creerá.',
        hunter: roleWin ? 'Te has cobrado la pieza. En el fortín hay sitio en la pared para su cabeza... algún día.' : 'Sigues vivo, pero la pieza se te ha escapado.',
        mayor: roleWin ? 'Robledal sigue durmiendo tranquilo. Nadie habla de lo que pasa de noche. Tu cargo está a salvo.' : 'Sigues vivo, pero todo el pueblo habla del monstruo. Mañana pedirán tu dimisión.',
      }[this.role] || sub;
    }
    $('go-title').textContent = title;
    $('go-sub').textContent = sub;
    let stats = `Noches superadas: ${this.stats.nights}<br>`;
    if (this.role === 'ranger') stats += `Encargos cumplidos: ${this.stats.helped}<br>Notas encontradas: ${[...this.notesRead].filter((k) => k[0] === 'n').length} / 8`;
    else stats += `${ROLE_INFO[this.role].name}: ${this.roles.goalText()}<br>Resultado: ${o.txt}`;
    $('go-stats').innerHTML = stats;
    $('gameover').classList.toggle('won', !!won && (kind !== 'role' || roleWin));
    $('btn-go-continue').classList.toggle('hidden', !won);
    $('btn-retry').classList.toggle('hidden', won);
    $('gameover').classList.remove('hidden');
    this.hud.show(false);
  }

  // ---------- Notas ----------
  readNote(note, key) {
    if (key && !this.notesRead.has(key)) {
      this.notesRead.add(key);
      if (key[0] === 'n') this.hud.msg(`Notas encontradas: ${[...this.notesRead].filter((k) => k[0] === 'n').length} / 8`);
    }
    SFX.paper();
    this.state = 'reading';
    document.getElementById('note-title').textContent = note.title;
    document.getElementById('note-body').innerHTML = note.body.map((p) => `<p>${p}</p>`).join('');
    document.getElementById('note').classList.remove('hidden');
    this.clearInput();
  }

  closeNote() {
    document.getElementById('note').classList.add('hidden');
    this.state = 'playing';
    SFX.paper();
  }

  // ---------- Tienda ----------
  openShop(vendorId = 'anselmo') {
    this.state = 'shop';
    this.vendor = CFG.VENDORS[vendorId];
    this.exitLock();
    this.clearInput();
    document.getElementById('shop-title').textContent = this.vendor.title;
    document.getElementById('shop-line').textContent = '«' + U.pick(vendorLines(vendorId, this.role) || this.vendor.lines) + '»';
    this.renderShop();
    document.getElementById('shop').classList.remove('hidden');
  }

  renderShop() {
    document.getElementById('shop-money').textContent = 'Tienes $' + this.money;
    const box = document.getElementById('shop-items');
    box.innerHTML = '';
    this.vendor.items.forEach((entry) => {
      const id = typeof entry === 'string' ? entry : entry.id;
      const it = Object.assign({ id }, CFG.ITEMS[id], typeof entry === 'string' ? {} : entry);
      if (it.requires && !this.story.flags[it.requires] && !this.mp && this.role === 'ranger') return;
      let owned = '';
      let disabled = this.money < it.price;
      if (this.noGuns(it)) {
        owned = this.role === 'mayor' ? 'Al alcalde no se le venden armas' : 'A la prensa no se le venden armas';
        disabled = true;
      } else if (it.kind === 'weapon') {
        if (this.weapons.owned[it.id]) { owned = 'Ya la tienes'; disabled = true; }
      } else if (it.kind === 'upgrade') {
        owned = `Nivel actual: ${this.lockLevel}`;
        if (this.lockLevel >= it.max) { owned = 'Nivel máximo'; disabled = true; }
      } else if (it.kind === 'consume') {
        if (it.id === 'coffee' && this.buffs.coffee) { owned = 'Ya te lo has tomado'; disabled = true; }
        if (it.id === 'stew' && this.player.health >= CFG.PLAYER.maxHealth) owned = 'No estás herido';
      } else owned = `Tienes: ${this.inv[it.id]}`;
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.innerHTML = `<div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div><div class="own">${owned}</div></div>`;
      const b = document.createElement('button');
      b.textContent = '$' + it.price;
      b.disabled = disabled;
      b.addEventListener('click', () => this.buy(it));
      row.appendChild(b);
      box.appendChild(row);
    });
  }

  // El alcalde y la investigadora no pueden comprar armas (ni su munición)
  noGuns(it) {
    return (this.role === 'mayor' || this.role === 'investigator') && (it.kind === 'weapon' || it.id === 'ammo38' || it.id === 'shells' || it.id === 'ammo308');
  }

  buy(it) {
    if (this.money < it.price || this.noGuns(it)) return;
    if (it.kind === 'weapon') {
      if (this.weapons.owned[it.id]) return;
      this.weapons.give(it.id);
      const w = CFG.WEAPONS[it.id];
      this.inv[w.ammo] += it.id === 'revolver' ? 6 : it.id === 'rifle' ? 5 : 4;
    } else if (it.kind === 'upgrade') {
      if (this.lockLevel >= it.max) return;
      this.lockLevel++;
    } else if (it.kind === 'consume') {
      if (it.id === 'coffee') {
        if (this.buffs.coffee) return;
        this.buffs.coffee = true;
        this.player.stamina = 100;
        this.hud.msg('El café te espabila: correr cansa la mitad hasta la noche.');
      } else if (it.id === 'stew') {
        this.player.heal(100);
        this.hud.msg('El estofado te devuelve el cuerpo a su sitio.');
      }
    } else this.inv[it.id] += it.qty;
    this.money -= it.price;
    SFX.cash();
    this.renderShop();
  }

  closeShop() {
    document.getElementById('shop').classList.add('hidden');
    this.state = 'playing';
    this.requestLock();
  }

  // ---------- Entrada ----------
  clearInput() {
    const i = this.inp;
    i.fwd = i.back = i.left = i.right = i.sprint = i.fire = i.turnL = i.turnR = i.use = false;
    this.player.aiming = false;
  }

  // Captura el ratón para girar sin límites. Los navegadores solo la conceden justo después de
  // un clic o una tecla (gesture); si se pide sin eso, el fallo no cuenta y se pide un clic.
  requestLock(gesture = true) {
    if (this.locked || (this.freeMouse && !gesture)) return;
    const c = this.canvas;
    if (!c.requestPointerLock) { this.useFreeMouse(); return; }
    const req = (this.lockReq = { gesture, done: false });
    try {
      const p = c.requestPointerLock();
      if (p && p.catch) p.catch(() => this.lockFailed(req));
    } catch (e) {
      this.lockFailed(req);
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  lockFailed(req = this.lockReq) {
    if (!req || req.done || this.locked) return;
    req.done = true;
    if (!req.gesture) return;
    // Dos clics seguidos sin conseguirlo: el navegador no lo permite (p. ej. dentro de algunas páginas)
    this.lockFails++;
    if (this.lockFails >= 2 && !this.everLocked) this.useFreeMouse();
  }

  useFreeMouse() {
    if (this.freeMouse) return;
    this.freeMouse = true;
    document.body.classList.add('free-mouse');
    if (this.hud) this.hud.msg(this.mouseAdvice(), 10);
  }

  // Por qué no se captura el ratón y qué hacer (se ve en el mensaje y en la pausa)
  mouseAdvice() {
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    return framed
      ? 'Dentro de esta página no se puede capturar el ratón. Para jugar bien, abre el juego en su propia pestaña (por ejemplo, en tu GitHub Pages). Mientras, gira con los bordes de la pantalla o con ← →.'
      : 'El navegador no deja capturar el ratón. Prueba en pantalla completa (Esc → Pantalla completa). Mientras, gira llevando el puntero a los bordes de la pantalla o con ← →.';
  }

  // Pantalla completa: el puntero ya no puede salirse de la ventana y el navegador suele dejar capturarlo
  toggleFullscreen() {
    const d = document;
    const el = d.documentElement;
    const isFull = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (isFull) {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        return;
      }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) { this.hud.msg('Este navegador no permite pantalla completa desde la página. En Mac: Ctrl + Cmd + F.', 6); return; }
      const p = req.call(el);
      const then = () => {
        if (this.state === 'paused') this.resume();
        else this.requestLock(true);
      };
      if (p && p.then) p.then(then, () => this.hud.msg('No se pudo poner la pantalla completa. En Mac: Ctrl + Cmd + F.', 6));
      else setTimeout(then, 200);
    } catch (e) {
      this.hud.msg('No se pudo poner la pantalla completa. En Mac: Ctrl + Cmd + F.', 6);
    }
  }

  // Sin captura: girar llevando el puntero a los bordes de la ventana
  edgeTurn(dt) {
    const m = this.mouse;
    if (!this.freeMouse || this.locked || !m.inside || this.monitor || this.state !== 'playing') return;
    const P = this.player;
    const E = 0.12;
    const x = m.x / innerWidth, y = m.y / innerHeight;
    const s = this.settings.sens;
    if (x < E) P.yaw += ((E - x) / E) * 2.6 * s * dt;
    else if (x > 1 - E) P.yaw -= ((x - (1 - E)) / E) * 2.6 * s * dt;
    if (y < E) P.pitch = Math.min(1.45, P.pitch + ((E - y) / E) * 1.4 * s * dt);
    else if (y > 1 - E) P.pitch = Math.max(-1.45, P.pitch - ((y - (1 - E)) / E) * 1.4 * s * dt);
  }

  // Aviso de «haz clic» mientras el ratón no está capturado
  updateLockHint() {
    const on = this.state === 'playing' && !this.locked && !this.freeMouse && !this.monitor && !this.player.dead;
    if (on === this.lockHintOn) return;
    this.lockHintOn = on;
    document.getElementById('lockhint').classList.toggle('hidden', !on);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.clearInput();
    this.exitLock();
    const pm = document.getElementById('pause-mouse');
    pm.textContent = this.freeMouse ? this.mouseAdvice() : '';
    pm.classList.toggle('hidden', !this.freeMouse);
    document.getElementById('btn-fullscreen').textContent = document.fullscreenElement || document.webkitFullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
    document.getElementById('pause').classList.remove('hidden');
  }

  resume() {
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing';
    this.requestLock();
  }

  bindInput() {
    const map = {
      KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', KeyD: 'right',
      ArrowLeft: 'turnL', ArrowRight: 'turnR', ShiftLeft: 'sprint', ShiftRight: 'sprint',
    };
    window.addEventListener('keydown', (e) => {
      if (this.state === 'playing' && this.monitor) {
        if (e.repeat) return;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.switchCam(-1);
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.switchCam(1);
        else if (e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'Escape' || e.code === 'Space') this.closeMonitor();
        else if (e.code === 'KeyP') this.pause();
        return;
      }
      if (this.state === 'playing') {
        if (map[e.code]) { this.inp[map[e.code]] = true; e.preventDefault(); }
        if (e.code === 'KeyE') this.inp.use = true;
        if (e.repeat) return;
        if (this.role === 'monster' && this.mp) {
          if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
          else this.mp.monsterKey(e.code);
          return;
        }
        switch (e.code) {
          case 'KeyE': this.interact('E'); break;
          case 'KeyQ': this.interact('Q'); break;
          case 'KeyT': this.interact('T'); break;
          case 'KeyF': this.player.toggleFlash(); break;
          case 'KeyR': this.weapons.reload(); break;
          case 'KeyH': this.useMedkit(); break;
          case 'KeyG': this.useFlare(); break;
          case 'Digit1': this.weapons.select('none'); break;
          case 'Digit2': this.weapons.select('revolver'); break;
          case 'Digit3': this.weapons.select('shotgun'); break;
          case 'Digit4':
            if (this.weapons.owned.camera) { this.weapons.select('none'); this.hud.msg('Tu cámara siempre está grabando: haz clic para sacar una foto con flash.'); }
            else if (this.weapons.owned.rifle) this.weapons.select('rifle');
            else this.hud.msg('La tecla 4 es el rifle de caza (lo venden en la armería).');
            break;
          case 'KeyV': this.roles.key('KeyV'); break;
          case 'KeyB': case 'KeyC': this.roles.key(e.code); break;
          case 'Escape': case 'KeyP': this.pause(); break;
          default: break;
        }
      } else if (this.state === 'reading') {
        if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Space') this.closeNote();
      } else if (this.state === 'talk') {
        const slot = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        if (slot !== undefined) this.interview.answer(slot);
        else if (e.code === 'Escape' || e.code === 'KeyE') this.interview.close();
      } else if (this.state === 'pleno') {
        // Pleno: 1, 2, 3 para contestar; Esc dos veces para irse
        const slot = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        if (slot !== undefined) this.pleno.answer(slot);
        else if (e.code === 'Escape') {
          if (this.plenoEscT && performance.now() - this.plenoEscT < 3000) this.pleno.finish(true);
          else { this.plenoEscT = performance.now(); this.hud.msg('Pulsa Esc otra vez para abandonar el pleno (los rumores subirán).', 3); }
        }
      } else if (this.state === 'map') {
        if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyM') this.closeTownMap();
        else if (e.code === 'Tab' || e.code === 'KeyB') { e.preventDefault(); this.mapView = this.mapView === 'pueblo' ? 'bosque' : 'pueblo'; this.mapSideT = 0; }
      } else if (this.state === 'shop') {
        if (e.code === 'Escape' || e.code === 'KeyE') this.closeShop();
      } else if (this.state === 'paused') {
        if ((e.code === 'Escape' && this.freeMouse) || e.code === 'KeyP') this.resume();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (map[e.code]) this.inp[map[e.code]] = false;
      if (e.code === 'KeyE') this.inp.use = false;
    });
    window.addEventListener('blur', () => { this.clearInput(); if (this.state === 'playing' && this.freeMouse) this.pause(); });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (this.monitor) { if (e.button === 0) this.switchCam(1); return; }
      if (!this.locked) {
        this.requestLock(true);
        if (!this.freeMouse) return;
      }
      if (this.role === 'monster' && this.mp) { if (e.button === 0) this.mp.monsterClick(); return; }
      if (this.player.dead && this.mp) { if (e.button === 0) this.mp.nextSpectate(); return; }
      if (e.button === 0) this.inp.fire = true;
      // Clic derecho: apuntar con el arma o, la investigadora, hacer zoom con la cámara
      if (e.button === 2) this.player.aiming = this.weapons.current !== 'none' || (this.role === 'investigator' && this.weapons.current === 'none');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.player.aiming = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const m = this.mouse;
      const cdx = m.has ? e.clientX - m.x : 0, cdy = m.has ? e.clientY - m.y : 0;
      m.x = e.clientX;
      m.y = e.clientY;
      m.inside = true;
      m.has = true;
      if (this.state !== 'playing') return;
      if (!this.locked && !this.freeMouse) return;
      if (this.monitor) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      // Sin captura, algunos navegadores (Safari en iPad) no dan el desplazamiento: se calcula a mano
      if (!this.locked && dx === 0 && dy === 0) { dx = cdx; dy = cdy; }
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.player.look(dx, dy);
      this.inp.mdx += dx;
      this.inp.mdy += dy;
    });
    window.addEventListener('wheel', (e) => {
      if (this.state === 'playing' && this.role !== 'monster') this.weapons.cycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) this.mouse.inside = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        this.everLocked = true;
        this.lockFails = 0;
        if (this.lockReq) this.lockReq.done = true;
        if (this.freeMouse) { this.freeMouse = false; document.body.classList.remove('free-mouse'); }
      }
      if (!this.locked && this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
  }

  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => {
      SFX.init();
      $('menu').classList.add('hidden');
      $('roles').classList.remove('hidden');
    });
    document.querySelectorAll('#roles [data-role]').forEach((b) => b.addEventListener('click', () => {
      $('roles').classList.add('hidden');
      this.newGame(b.dataset.role);
    }));
    document.querySelectorAll('#roles [data-goal]').forEach((el) => (el.textContent = this.roles.goalText(el.dataset.goal, 'story')));
    $('btn-roles-back').addEventListener('click', () => {
      $('roles').classList.add('hidden');
      $('menu').classList.remove('hidden');
    });
    $('btn-continue').addEventListener('click', () => { SFX.init(); this.load(); });
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    $('btn-pausa').addEventListener('click', (e) => { e.stopPropagation(); this.pause(); });
    // iPad con ratón y sin teclado: tocar la pantalla con el dedo suelta el ratón (y se abre la pausa)
    window.addEventListener('touchstart', () => { if (this.locked) this.exitLock(); }, { passive: true });
    if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) document.body.classList.add('touch');
    document.querySelectorAll('.game-version').forEach((el) => (el.textContent = GAME_VERSION));
    $('btn-quit').addEventListener('click', () => this.toMenu());
    $('btn-go-menu').addEventListener('click', () => this.toMenu());
    $('btn-retry').addEventListener('click', () => this.load());
    $('btn-go-continue').addEventListener('click', () => {
      $('gameover').classList.add('hidden');
      this.hud.show(true);
      this.state = 'playing';
      this.requestLock();
    });
    $('btn-shop-close').addEventListener('click', () => this.closeShop());
    $('map-canvas').addEventListener('mousedown', (e) => { if (this.state === 'map') this.mapClick(e); });
    $('talk-opts').addEventListener('click', (e) => {
      if (this.state !== 'talk') return;
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.close) this.interview.close();
      else if (b.dataset.slot !== undefined) this.interview.answer(+b.dataset.slot);
    });
    $('pleno-opts').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-slot]');
      if (b && this.state === 'pleno') this.pleno.answer(+b.dataset.slot);
    });
    $('map-canvas').addEventListener('mousemove', (e) => {
      const cv = e.currentTarget;
      const R = cv.getBoundingClientRect();
      this.mapHover = { x: ((e.clientX - R.left) / R.width) * cv.width, y: ((e.clientY - R.top) / R.height) * cv.height };
    });
    $('map-canvas').addEventListener('mouseleave', () => { this.mapHover = null; });
    $('btn-map-close').addEventListener('click', () => this.closeTownMap());
    $('btn-map-view').addEventListener('click', () => { this.mapView = this.mapView === 'pueblo' ? 'bosque' : 'pueblo'; this.mapSideT = 0; });
    $('map-side').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const th = this.homes.townhall;
      if (b.dataset.lamp !== undefined) { th.toggleLamp(+b.dataset.lamp); this.mapSideT = 0; }
      else if (b.dataset.cam !== undefined) this.openMonitor(th.cams, 'town', +b.dataset.cam);
    });
    const q = $('btn-quality');
    const setQ = () => { q.textContent = 'Calidad: ' + CFG.QUALITY[this.settings.quality].name; };
    setQ();
    q.addEventListener('click', () => {
      this.settings.quality = (this.settings.quality + 1) % CFG.QUALITY.length;
      setQ();
      this.resize();
      this.saveSettings();
    });
    const sens = $('opt-sens'), vol = $('opt-vol'), fov = $('opt-fov');
    sens.value = this.settings.sens;
    vol.value = this.settings.vol;
    fov.value = this.settings.fov;
    sens.addEventListener('input', () => { this.settings.sens = +sens.value; this.saveSettings(); });
    vol.addEventListener('input', () => { this.settings.vol = +vol.value; SFX.setVolume(+vol.value); this.saveSettings(); });
    fov.addEventListener('input', () => { this.settings.fov = +fov.value; this.saveSettings(); });
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* nada */ }
  }

  toMenu() {
    this.exitLock();
    if (this.mp) {
      this.mp.leave();
      this.mp = null;
      this.resetWorldState();
    }
    this.role = null;
    this.pleno.reset();
    this.interview.reset();
    this.roles.teardown();
    document.getElementById('gameover').classList.remove('won');
    ['pause', 'gameover', 'shop', 'note', 'townmap'].forEach((id) => document.getElementById(id).classList.add('hidden'));
    this.hud.show(false);
    this.state = 'menu';
    this.setupMenuScene();
    this.refreshMenu();
    document.getElementById('menu').classList.remove('hidden');
  }

  refreshMenu() {
    const b = document.getElementById('btn-continue');
    b.classList.toggle('hidden', !this.hasSave());
    let role = 'ranger';
    try { role = (JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {}).role || 'ranger'; } catch (e) { /* nada */ }
    b.textContent = 'Continuar la historia' + (role !== 'ranger' && ROLE_INFO[role] ? ' (' + ROLE_INFO[role].name + ')' : '');
  }

  setupMenuScene() {
    this.missions.clear();
    this.events.clear();
    this.story.clearDay();
    this.flare = null;
    this.flareMesh.visible = false;
    this.flareLight.intensity = 0;
    if (this.monitor) this.closeMonitor();
    this.intruder.state = 'off';
    const m = this.intruder.mesh;
    m.visible = true;
    m.position.set(-7, 0, 15.5);
    m.rotation.y = Math.atan2(0 - -7, 0 - 15.5);
    this.player.flashOn = false;
    this.player.flash.intensity = 0;
  }

  updateMenu(dt) {
    this.menuT += dt;
    const a = this.menuT * 0.05 + 0.6;
    this.camera.position.set(Math.sin(a) * 19, 4.2, Math.cos(a) * 19);
    this.camera.lookAt(0, 2.5, 0);
    this.world.updateSky(0.1, 0.7);
    this.world.update(dt, this.menuT);
    this.daylight = 0.1;
    this.cabin.update(dt, this);
    animateCreature(this.intruder.mesh, dt, 'stare', 0);
  }

  resize() {
    const s = CFG.QUALITY[this.settings.quality].scale;
    const w = innerWidth, h = innerHeight;
    // El lienzo va a la resolución real de la pantalla; la escena, a la resolución baja
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.lowRT.setSize(Math.max(1, Math.ceil(w / s)), Math.max(1, Math.ceil(h / s)));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.weapons) this.weapons.resize(w / h);
  }

  // ---------- Bucle ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.05, raw);
    this.last = now;
    // La red va con el tiempo real (aunque el ordenador vaya a pocos fotogramas)
    if (this.lobby) this.lobby.tick(Math.min(1, raw));
    this.updateLockHint();
    // En multijugador el mundo no se para aunque abras la pausa, una tienda o una nota
    // El mapa del alcalde no para el mundo: se ve moverse al monstruo mientras se encienden farolas
    if (this.state === 'playing' || this.state === 'map' || this.state === 'pleno' || this.state === 'talk' || (this.mp && ['paused', 'shop', 'reading', 'sleeping'].includes(this.state))) this.update(dt);
    if (this.state === 'map') this.drawTownMap(dt);
    else if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'dead') {
      // Cámara caída
      const P = this.player;
      P.pos.y = Math.max(this.world.getFloorY(P.pos.x, P.pos.z, P.pos.y) - 1.2, P.pos.y - dt * 2);
      P.applyCamera(dt);
    }
    this.updateCamcorder(dt);
    this.render();
    const grain = this.state === 'menu' ? 0.16 : 0.1 + (1 - this.daylight) * 0.06 + (this.intruder ? this.intruder.nearness * 0.12 : 0);
    this.hud.grain(dt, grain);
  }

  // Visor de la investigadora: ve siempre a través de su cámara (REC), con visión nocturna de noche
  updateCamcorder(dt) {
    const P = this.player;
    // Mira telescópica del rifle
    const scoped = this.weapons.current === 'rifle' && P.aiming && this.state === 'playing' && !P.dead && !this.monitor;
    if (document.body.classList.contains('scoped') !== scoped) document.body.classList.toggle('scoped', scoped);
    const on = this.role === 'investigator' && !P.dead && !this.monitor && ['playing', 'paused', 'shop', 'reading', 'sleeping'].includes(this.state);
    const night = on && this.daylight < 0.35;
    const B = document.body.classList;
    if (B.contains('camcorder') !== on) B.toggle('camcorder', on);
    if (B.contains('nightshot') !== night) B.toggle('nightshot', night);
    if (!on) return;
    if (night) {
      // El modo nocturno amplifica la poca luz que hay (en verde): ves más lejos, pero no muy lejos
      const W = this.world;
      W.hemi.intensity = Math.max(W.hemi.intensity, 0.5);
      W.ambient.intensity = Math.max(W.ambient.intensity, 0.1);
      W.scene.fog.density = Math.min(W.scene.fog.density, 0.036);
    }
    if (this.state === 'playing') this.ccT = (this.ccT || 0) + dt;
    this.ccUiT = (this.ccUiT || 0) - dt;
    if (this.ccUiT > 0) return;
    this.ccUiT = 0.1;
    const $ = (id) => document.getElementById(id);
    const t = Math.floor(this.ccT || 0);
    const p2 = (n) => String(n).padStart(2, '0');
    $('cc-time').textContent = `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`;
    $('cc-mode').textContent = (P.aiming ? 'ZOOM ×3 · ' : '') + (night ? 'NIGHTSHOT' : 'AUTO');
    const R = this.roles;
    const emf = $('cc-emf');
    emf.classList.toggle('hidden', !R.emfOn);
    if (R.emfOn) {
      emf.innerHTML = 'EMF ' + [1, 2, 3, 4, 5].map((i) => `<span class="${i <= R.emfLevel ? 'l' + i : ''}">●</span>`).join('');
      emf.classList.toggle('mon', !!R.emfMonster && R.emfLevel >= 3);
    }
    const cd = this.roles.flashCd || 0;
    const k = 1 - cd / ROLE_CFG.investigator.flashCd;
    $('cc-flash-bar').firstChild.style.width = Math.round(U.clamp(k, 0, 1) * 100) + '%';
    $('cc-flash-txt').textContent = cd > 0 ? 'CARGANDO ' + Math.ceil(cd) + ' s' : 'LISTO · CLIC';
    $('cc-flash').classList.toggle('wait', cd > 0);
    const b = U.clamp(Math.ceil((P.battery / 100) * 4), 0, 4);
    $('cc-batt').textContent = 'BAT ' + '▮'.repeat(b) + '▯'.repeat(4 - b);
  }

  update(dt) {
    if (this.role === 'monster' && this.mp) { this.updateMonster(dt); return; }
    const P = this.player;
    this.updateTime(dt);
    this.daylight = this.daylightAt(this.clock);
    this.world.updateSky(this.daylight, this.duskAt(this.clock));
    const inp = this.monitor || this.state === 'pleno' || this.state === 'talk' ? this.idleInput || (this.idleInput = { mdx: 0, mdy: 0 }) : this.inp;
    this.edgeTurn(dt);
    P.update(dt, inp);
    this.weapons.update(dt, inp);
    this.power.update(dt);
    this.cabin.update(dt, this);
    this.village.update(dt, this);
    this.homes.update(dt);
    this.missions.update(dt);
    this.intruder.update(dt);
    this.events.update(dt);
    this.story.update(dt);
    this.roles.update(dt);
    this.pleno.update(dt);
    this.interview.update(dt);
    this.updateFlare(dt);
    this.updateMonitor(dt);
    if (this.mp) this.mp.update(dt);
    // Multijugador: muerto, se ve la partida desde los ojos de otro humano
    if (this.mp && P.dead) this.mp.spectate(dt);
    this.world.update(dt, performance.now() * 0.001);
    this.target = this.state === 'pleno' || this.state === 'talk' ? null : this.findTarget();

    const zone = this.cabin.zoneOf(P.pos);
    let vl = 0.06 + this.daylight * 0.7;
    if ((zone === 'ground' || zone === 'upper' || zone === 'bunker') && this.power.lightsActive) vl = Math.max(vl, 0.42);
    if (zone === 'bunker') vl = Math.max(this.power.lightsActive ? 0.42 : 0.04, this.daylight * 0.15);
    if (this.phase === 'night' && this.village.contains(P.pos)) vl = Math.max(vl, 0.3);
    const inHome = this.homes.homeAt(P.pos);
    if (inHome) vl = Math.max(vl, 0.32);
    this.viewLight = vl;

    SFX.setListener(this.camera.position, P.forward());
    const danger = this.intruder.nearness;
    SFX.updateAmbience(dt, this.daylight, danger, (zone !== 'outside' && zone !== 'roof') || !!inHome, P.pos);
    this.hbT -= dt;
    if (danger > 0.45 && this.hbT <= 0 && !P.dead) {
      SFX.heartbeat(0.25 + danger * 0.5);
      this.hbT = 1.15 - danger * 0.55;
    }
    this.hud.update(dt);
    this.inp.mdx = 0;
    this.inp.mdy = 0;
  }

  // Bucle del monstruo (multijugador): la hora y la cabaña llegan del guardabosques
  updateMonster(dt) {
    const P = this.player;
    const mp = this.mp;
    mp.advanceClock(dt);
    this.daylight = this.daylightAt(this.clock);
    this.world.updateSky(this.daylight, this.duskAt(this.clock));
    this.edgeTurn(dt);
    P.update(dt, this.state === 'playing' ? this.inp : this.idleInput || (this.idleInput = { mdx: 0, mdy: 0 }));
    this.weapons.update(dt, this.inp);
    this.power.update(dt);
    this.cabin.update(dt, this);
    this.village.update(dt, this);
    this.homes.update(dt);
    mp.update(dt);
    this.roles.update(dt);
    this.updateFlare(dt);
    this.world.update(dt, performance.now() * 0.001);
    this.target = this.findTarget();
    this.viewLight = 0.45;
    SFX.setListener(this.camera.position, P.forward());
    const indoors = mp.inCave || this.cabin.isInside(P.pos);
    SFX.updateAmbience(dt, mp.inCave ? 0.05 : this.daylight, mp.danger, indoors, P.pos);
    this.hud.update(dt);
    this.inp.mdx = 0;
    this.inp.mdy = 0;
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.lowRT);
    r.clear();
    this.drawScene();
    // Ampliación a pantalla completa con píxeles nítidos
    r.setRenderTarget(null);
    r.clear();
    r.render(this.blitScene, this.blitCam);
  }

  drawScene() {
    const r = this.renderer;
    if (this.monitor && this.state === 'playing' || (this.monitor && this.state === 'paused')) {
      // Visión nocturna de la cámara de seguridad
      const W = this.world;
      const cam = this.monitor.cams[this.monitor.i];
      cam.viewCam.aspect = this.camera.aspect;
      cam.viewCam.updateProjectionMatrix();
      const save = [W.hemi.intensity, W.ambient.intensity, this.scene.fog.density, this.player.flash.intensity];
      W.hemi.intensity = Math.max(save[0], 0.75);
      W.ambient.intensity = Math.max(save[1], 0.35);
      this.scene.fog.density = Math.min(save[2], 0.03);
      this.player.flash.intensity = 0;
      r.render(this.scene, cam.viewCam);
      [W.hemi.intensity, W.ambient.intensity, this.scene.fog.density, this.player.flash.intensity] = save;
      return;
    }
    r.render(this.scene, this.camera);
    if (this.state !== 'menu' && this.state !== 'loading') {
      r.clearDepth();
      r.render(this.weapons.scene, this.weapons.cam);
    }
  }
}

const GAME = new Game();
window.__G = GAME;
// Arranca en cuanto la página está lista (sin esperar a fuentes ni imágenes)
function startGame() {
  try {
    GAME.init();
  } catch (e) {
    console.error(e);
    const l = document.getElementById('loading');
    l.classList.remove('hidden');
    l.textContent = 'Error al iniciar: ' + e.message + ' (¿WebGL disponible? Prueba con Chrome, Edge o Firefox actualizados)';
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame);
else startGame();
