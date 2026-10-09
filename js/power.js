'use strict';

// Generador de la planta de arriba y todo lo que funciona con él:
// luces, foco del tejado, cámaras de seguridad y detectores de movimiento.
const MOUNT_DEFS = [
  { name: 'Fachada', pos: [4.55, 2.45, 4.12], look: [-1.5, 0.4, 7.5], ground: [0.5, 5.5] },
  { name: 'Trasera', pos: [-4.55, 2.45, -4.12], look: [1.5, 0.4, -7.5], ground: [-0.5, -5.5] },
  { name: 'Oeste', pos: [-5.12, 2.45, 3.55], look: [-7.5, 0.4, -1.5], ground: [-6.5, 0] },
  { name: 'Este', pos: [5.12, 2.45, -3.55], look: [7.5, 0.4, 1.5], ground: [6.5, 0] },
  { name: 'Tejado', pos: [4.95, 7.15, -3.95], look: [-1.5, 5.4, 2.5], roof: true },
];

class Power {
  constructor(G) {
    this.G = G;
    this.fuel = CFG.POWER.startFuel;
    this.running = false;
    this.lightsOn = true;
    this.flood = false;
    this.dipT = 0;
    this.failed = false;
    this.pulls = 0;
    this.interactables = [];
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.buildGenerator();
    this.buildFlood();
    this.buildMounts();
  }

  get powered() { return this.running && this.fuel > 0 && this.dipT <= 0; }
  get lightsActive() { return this.powered && this.lightsOn; }

  drainRate() {
    const C = CFG.POWER;
    let r = C.idle;
    if (this.lightsOn) r += C.lights;
    if (this.flood) r += C.flood;
    this.mounts.forEach((m) => {
      if (m.cam) r += C.camera;
      if (m.det) r += C.detector;
    });
    if (this.G.monitor) r += C.monitor;
    return r;
  }

  // ---------- Generador ----------
  buildGenerator() {
    const W = this.G.world;
    const g = this.group;
    const x0 = -4.65, x1 = -3.75, z0 = -1.85, z1 = -1.05, y = 3;
    const red = new THREE.MeshLambertMaterial({ color: 0x7a2a1e });
    const mk = (w, h, d, mat, x, yy, z) => {
      const m = new THREE.Mesh(boxGeo(w, h, d, 1), mat);
      m.position.set(x, yy, z);
      g.add(m);
      return m;
    };
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    mk(0.9, 0.08, 0.8, MAT.dark, cx, y + 0.04, cz);
    mk(0.8, 0.45, 0.7, red, cx, y + 0.32, cz);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 8), red);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(cx, y + 0.68, cz);
    g.add(tank);
    mk(0.06, 0.06, 0.06, MAT.metal, cx + 0.32, y + 0.85, cz);
    const muff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6), MAT.metal);
    muff.rotation.x = Math.PI / 2;
    muff.position.set(cx - 0.3, y + 0.35, cz);
    g.add(muff);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), MAT.metal);
    pipe.position.set(-4.68, y + 0.75, cz);
    g.add(pipe);
    mk(0.02, 0.2, 0.3, MAT.dark, x1 + 0.01, y + 0.35, cz);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x300000 });
    const led = new THREE.Mesh(boxGeo(0.02, 0.05, 0.05, 1), this.ledMat);
    led.position.set(x1 + 0.025, y + 0.4, cz - 0.08);
    g.add(led);
    this.genBody = g;
    W.addBox(x0, x1, y, y + 0.9, z0, z1, { furniture: true, sight: false, bullets: false });
    this.genPos = new THREE.Vector3(cx, y + 0.5, cz);

    this.generator = {
      kind: 'generator', pos: new THREE.Vector3(cx + 0.2, y + 0.6, cz), r: 0.7,
      prompt: (G) => {
        const lines = [this.running ? '[E] Apagar' : '[E] Arrancar (tirar del cable)'];
        lines.push(`[Q] Repostar (bidones: ${G.inv.fuel})`);
        const mins = this.running ? Math.round(this.fuel / this.drainRate() / 60 * 10) / 10 : null;
        const info = [
          `Depósito: ${Math.round(this.fuel)}% · ${this.running ? 'EN MARCHA' : 'PARADO'}`,
          this.running ? `Al ritmo actual dura unos ${mins} min` : 'Da luz, cámaras, detectores y el foco',
        ];
        return { title: 'Generador', lines, info };
      },
      act: (key, G) => {
        if (key === 'E') {
          if (this.running) {
            this.running = false;
            SFX.sputter(this.genPos);
            G.hud.msg('Apagas el generador.');
            return true;
          }
          this.pull();
          return true;
        }
        if (key === 'Q') {
          if (G.inv.fuel <= 0) { G.hud.msg('No tienes bidones de gasolina (ferretería del pueblo).'); return true; }
          if (this.fuel >= 99) { G.hud.msg('El depósito está lleno.'); return true; }
          G.inv.fuel--;
          this.fuel = Math.min(100, this.fuel + CFG.POWER.fuelPerCan);
          SFX.glug(this.genPos);
          G.hud.msg(`Rellenas el depósito (${Math.round(this.fuel)}%).`);
          return true;
        }
        return false;
      },
    };
    this.interactables.push(this.generator);
  }

  pull() {
    const G = this.G;
    if (this.fuel <= 0) {
      SFX.pull(this.genPos, false);
      G.hud.msg('El depósito está vacío. Necesitas gasolina.');
      return;
    }
    this.pulls++;
    const ok = Math.random() < (this.failed ? 0.35 : 0.7) || this.pulls >= 4;
    SFX.pull(this.genPos, ok);
    if (ok) {
      this.running = true;
      this.failed = false;
      this.pulls = 0;
      G.hud.msg('El generador arranca con un rugido.');
    } else G.hud.msg('El motor tose pero no arranca... Tira otra vez (E).');
  }

  // Avería (evento nocturno)
  fail() {
    if (!this.running) return false;
    this.running = false;
    this.failed = true;
    SFX.sputter(this.genPos);
    return true;
  }

  dip(t) {
    if (!this.powered) return false;
    this.dipT = t;
    SFX.sputter(this.genPos, 0.5);
    return true;
  }

  // ---------- Foco del tejado ----------
  buildFlood() {
    const g = this.group;
    const housing = new THREE.Mesh(boxGeo(0.4, 0.3, 0.35, 1), MAT.dark);
    housing.position.set(3.6, 7.25, 4.05);
    g.add(housing);
    this.floodLensMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), this.floodLensMat);
    lens.position.set(3.6, 7.25, 4.23);
    g.add(lens);
    this.floodHousing = housing;
    this.floodLight = new THREE.SpotLight(0xfff4dc, 0, 48, 0.3, 0.35, 0.9);
    this.floodLight.position.set(3.6, 7.3, 4.1);
    this.floodLight.target.position.set(0, 0, 18);
    g.add(this.floodLight, this.floodLight.target);
    this.floodAim = new THREE.Vector3(0, 0, 18);
    this.floodSwitch = {
      kind: 'flood', pos: new THREE.Vector3(3.6, 7.2, 4.0), r: 0.6,
      prompt: (G) => ({
        title: 'Foco del tejado',
        lines: [this.flood ? '[E] Apagar el foco' : '[E] Encender el foco'],
        info: [this.powered ? 'Apunta hacia donde mires. Gasta muchísima gasolina.' : 'Sin corriente'],
      }),
      act: (key, G) => {
        if (key !== 'E') return false;
        this.flood = !this.flood;
        SFX.click(this.floodSwitch.pos, 0.7);
        if (this.flood && !this.powered) G.hud.msg('No se enciende: el generador está parado.');
        return true;
      },
    };
    this.interactables.push(this.floodSwitch);
  }

  get floodOn() { return this.flood && this.powered; }

  // ¿Ilumina el foco este punto?
  floodHits(p) {
    if (!this.floodOn) return false;
    const L = this.floodLight.position;
    const dir = this.floodAim.clone().sub(L).normalize();
    const to = new THREE.Vector3(p.x - L.x, p.y - L.y, p.z - L.z);
    const d = to.length();
    if (d > 48) return false;
    to.divideScalar(d);
    return dir.dot(to) > Math.cos(0.3) && this.G.world.lineOfSight(L, p);
  }

  // ---------- Soportes para cámaras y detectores ----------
  buildMounts() {
    const W = this.G.world;
    this.mounts = MOUNT_DEFS.map((d, i) => {
      const pos = new THREE.Vector3(...d.pos);
      const bracket = new THREE.Mesh(boxGeo(0.16, 0.16, 0.16, 1), MAT.metal);
      bracket.position.copy(pos);
      this.group.add(bracket);
      const cam = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(0.14, 0.12, 0.28, 1), new THREE.MeshLambertMaterial({ color: 0xd0d0c8 }));
      cam.add(body);
      const lens = new THREE.Mesh(boxGeo(0.07, 0.07, 0.04, 1), MAT.black);
      lens.position.z = 0.16;
      cam.add(lens);
      const camLed = new THREE.MeshBasicMaterial({ color: 0x200000 });
      const cl = new THREE.Mesh(boxGeo(0.025, 0.025, 0.02, 1), camLed);
      cl.position.set(0.04, 0.05, 0.15);
      cam.add(cl);
      cam.position.copy(pos).add(new THREE.Vector3(0, 0.14, 0));
      cam.lookAt(new THREE.Vector3(...d.look));
      cam.visible = false;
      this.group.add(cam);
      const det = new THREE.Group();
      det.add(new THREE.Mesh(boxGeo(0.12, 0.16, 0.08, 1), new THREE.MeshLambertMaterial({ color: 0xe8e4d8 })));
      const detLed = new THREE.MeshBasicMaterial({ color: 0x200000 });
      const dl = new THREE.Mesh(boxGeo(0.03, 0.03, 0.02, 1), detLed);
      dl.position.set(0, 0.04, 0.05);
      det.add(dl);
      det.position.copy(pos).add(new THREE.Vector3(0, -0.18, 0));
      det.lookAt(new THREE.Vector3(d.look[0], pos.y - 0.18, d.look[2]));
      det.visible = false;
      this.group.add(det);
      const viewCam = new THREE.PerspectiveCamera(78, 16 / 9, 0.1, 90);
      viewCam.position.copy(pos).add(new THREE.Vector3(0, 0.1, 0));
      viewCam.lookAt(new THREE.Vector3(...d.look));
      const m = {
        idx: i, name: d.name, def: d, pos, cam: false, det: false, camMesh: cam, detMesh: det,
        camLed, detLed, viewCam, cool: 0, alertT: 0,
      };
      m.interact = {
        kind: 'mount', pos: pos.clone(), r: 0.45,
        prompt: (G) => {
          const lines = [];
          if (!m.cam) lines.push(G.inv.cameras > 0 ? `[E] Montar cámara (${G.inv.cameras})` : '[E] Montar cámara (no tienes)');
          if (!m.det) lines.push(G.inv.detectors > 0 ? `[Q] Montar detector (${G.inv.detectors})` : '[Q] Montar detector (no tienes)');
          const info = [`Cámara: ${m.cam ? 'sí' : 'no'} · Detector: ${m.det ? 'sí' : 'no'}`];
          if (!m.cam || !m.det) info.push('Se compran en la ferretería del pueblo');
          return { title: 'Soporte de seguridad · ' + m.name, lines, info };
        },
        act: (key, G) => {
          if (key === 'E' && !m.cam) {
            if (G.inv.cameras <= 0) { G.hud.msg('No tienes cámaras. La ferretería de Julián las vende.'); return true; }
            G.inv.cameras--;
            m.cam = true;
            SFX.hammer(m.pos);
            G.hud.msg(`Cámara montada (${m.name}). Se ve desde el panel del búnker.`);
            return true;
          }
          if (key === 'Q' && !m.det) {
            if (G.inv.detectors <= 0) { G.hud.msg('No tienes detectores. La ferretería de Julián los vende.'); return true; }
            G.inv.detectors--;
            m.det = true;
            SFX.hammer(m.pos);
            G.hud.msg(`Detector montado (${m.name}).`);
            return true;
          }
          return false;
        },
      };
      this.interactables.push(m.interact);
      return m;
    });
  }

  // Algo se mueve cerca de un detector
  checkDetect(m, p) {
    if (m.def.roof) return p.y > 3.5 && Math.hypot(p.x, p.z) < 8;
    if (p.y > 3) return false;
    return Math.hypot(p.x - m.def.ground[0], p.z - m.def.ground[1]) < CFG.POWER.detectorRange;
  }

  update(dt) {
    const G = this.G;
    // remote: en multijugador solo quien lleva el mundo gasta gasolina; los demás ven lo que manda
    if (!this.remote) this.dipT = Math.max(0, this.dipT - dt);
    if (this.running && !this.remote) {
      this.fuel -= this.drainRate() * dt;
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.running = false;
        SFX.sputter(this.genPos);
        G.hud.msg('El generador se ha quedado sin gasolina.', 6);
      } else if (this.fuel < 15 && !this.warnedLow) {
        this.warnedLow = true;
        G.hud.msg('El generador está en reserva (menos del 15%).', 6);
      }
    }
    if (this.fuel >= 15) this.warnedLow = false;
    SFX.setHum(this.genPos, this.running && this.dipT <= 0);
    const t = performance.now() * 0.001;
    this.ledMat.color.set(this.running ? (this.fuel < 15 && Math.sin(t * 8) > 0 ? 0x603000 : 0x30ff40) : 0x500000);

    // Foco: apunta donde mira el jugador si está en el tejado
    const P = G.player;
    if (this.floodOn && !P.isMonster && !P.dead && G.cabin.zoneOf(P.pos) === 'roof' && !G.monitor) {
      const target = P.eyePos().add(P.forward().multiplyScalar(25));
      if (target.y < 0) target.y = 0;
      this.floodAim.lerp(target, Math.min(1, dt * 6));
    }
    this.floodLight.target.position.copy(this.floodAim);
    this.floodLight.intensity = this.floodOn ? 3.6 : 0;
    this.floodLensMat.color.set(this.floodOn ? 0xfff6dc : 0x222222);
    this.floodHousing.lookAt(this.floodAim);

    // Cámaras y detectores
    const movers = [];
    const I = G.intruder;
    if (I && I.mesh.visible && !['off', 'gone', 'apparition'].includes(I.state)) movers.push(I.pos);
    if (G.events) G.events.movers().forEach((p) => movers.push(p));
    this.mounts.forEach((m) => {
      m.camMesh.visible = m.cam;
      m.detMesh.visible = m.det;
      m.camLed.color.set(m.cam && this.powered && Math.sin(t * 3) > 0 ? 0xff2010 : 0x200000);
      m.cool = Math.max(0, m.cool - dt);
      m.alertT = Math.max(0, m.alertT - dt);
      const on = m.det && this.powered;
      m.detLed.color.set(on ? (m.alertT > 0 && Math.sin(t * 20) > 0 ? 0xff2010 : 0x40c040) : 0x200000);
      if (!on || P.isMonster) return;
      const hit = movers.some((p) => this.checkDetect(m, p));
      if (hit) {
        m.alertT = 2.5;
        if (m.cool <= 0) {
          m.cool = 9;
          SFX.alarm();
          G.hud.alert(`MOVIMIENTO · ${m.name.toUpperCase()}`);
        }
      }
    });
  }

  installedCams() { return this.mounts.filter((m) => m.cam); }

  serialize() {
    return { fuel: this.fuel, lightsOn: this.lightsOn, mounts: this.mounts.map((m) => ({ cam: m.cam, det: m.det })) };
  }

  load(d) {
    this.fuel = d && d.fuel !== undefined ? d.fuel : CFG.POWER.startFuel;
    this.lightsOn = d && d.lightsOn !== undefined ? d.lightsOn : true;
    this.running = false;
    this.flood = false;
    this.failed = false;
    this.dipT = 0;
    this.mounts.forEach((m, i) => {
      const s = d && d.mounts && d.mounts[i];
      m.cam = !!(s && s.cam);
      m.det = !!(s && s.det);
    });
  }
}
