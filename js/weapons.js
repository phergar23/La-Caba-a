'use strict';

// Armas y modelo en primera persona (se dibuja en una escena aparte encima del mundo).
class Weapons {
  constructor(G) {
    this.G = G;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambient);
    this.fill = new THREE.PointLight(0xfff0d0, 0, 4, 1);
    this.fill.position.set(0.1, 0.1, 0.3);
    this.scene.add(this.fill);
    this.vmMuzzle = new THREE.PointLight(0xffb050, 0, 3, 1);
    this.vmMuzzle.position.set(0.2, -0.1, -0.8);
    this.scene.add(this.vmMuzzle);

    this.worldMuzzle = new THREE.PointLight(0xffb050, 0, 16, 1.4);
    G.camera.add(this.worldMuzzle);
    this.worldMuzzle.position.set(0.2, -0.1, -0.8);

    // camera: herramienta de la investigadora (sin munición). rifle: el del cazador (también se vende)
    this.owned = { revolver: false, shotgun: false, rifle: false, camera: false };
    this.mag = { revolver: 0, shotgun: 0, rifle: 0 };
    this.current = 'none';
    this.cool = 0;
    this.reloading = 0;
    this.switchT = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.sway = { x: 0, y: 0 };

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.buildModels();
    this.buildClaws();
    this.puffs = [];
    this.monster = false;
    this.swipeT = 0;
  }

  static isTool(id) { return id === 'camera'; }

  // Brazos del monstruo (multijugador)
  buildClaws() {
    const skin = new THREE.MeshLambertMaterial({ color: 0x1c1714 });
    const bone = new THREE.MeshLambertMaterial({ color: 0xc9bfa6 });
    this.claws = new THREE.Group();
    [-1, 1].forEach((side) => {
      const arm = new THREE.Group();
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.55), skin);
      fore.position.set(0, 0, 0.12);
      arm.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.12), skin);
      hand.position.set(0, 0, -0.2);
      arm.add(hand);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.24), bone);
        f.position.set(-0.035 + i * 0.035, -0.01, -0.36);
        f.rotation.x = -0.18;
        arm.add(f);
      }
      arm.position.set(side * 0.27, -0.3, -0.45);
      arm.rotation.set(0.12, -side * 0.2, side * 0.25);
      arm.userData = { side, base: arm.position.clone(), rot: arm.rotation.clone() };
      this.claws.add(arm);
    });
    this.claws.visible = false;
    this.root.add(this.claws);
  }

  setMonster(on) {
    this.monster = on;
    this.claws.visible = on;
    this.torch.visible = !on;
    for (const id in this.models) this.models[id].visible = false;
    this.muzzleSprite.visible = false;
    if (on) {
      this.current = 'none';
      this.reloading = 0;
    }
  }

  swipe() { this.swipeT = 0.4; }

  updateMonster(dt, inp) {
    const G = this.G;
    const P = G.player;
    this.swipeT = Math.max(0, this.swipeT - dt);
    this.ambient.intensity = 0.5;
    this.key.intensity = 0.45;
    this.fill.intensity = 0;
    this.worldMuzzle.intensity = 0;
    this.vmMuzzle.intensity = 0;
    this.sway.x += (-inp.mdx * 0.0006 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (inp.mdy * 0.0006 - this.sway.y) * Math.min(1, dt * 8);
    const bob = P.bobAmt;
    const bx = Math.cos(P.bobT) * 0.02 * bob, by = Math.abs(Math.sin(P.bobT)) * 0.028 * bob;
    const work = G.mp && G.mp.working >= 0;
    const t = performance.now() * 0.001;
    this.claws.children.forEach((arm) => {
      const u = arm.userData;
      const sd = u.side;
      let px = u.base.x + bx * sd + this.sway.x, py = u.base.y + by + this.sway.y, pz = u.base.z;
      let rx = u.rot.x, ry = u.rot.y, rz = u.rot.z;
      if (this.swipeT > 0 && sd > 0) {
        const k = 1 - this.swipeT / 0.4;
        const sw = Math.sin(k * Math.PI);
        px = u.base.x - k * 0.55;
        py += sw * 0.12;
        pz -= sw * 0.18;
        ry = u.rot.y + k * 1.5;
        rz = u.rot.z - sw * 0.7;
      } else if (work) {
        const j = Math.sin(t * 14 + sd * 1.7) * 0.05;
        pz -= 0.12 + j;
        py += 0.07;
        rx = u.rot.x - 0.45;
      } else py += Math.sin(t * 1.3 + sd) * 0.008;
      arm.position.set(px, py, pz);
      arm.rotation.set(rx, ry, rz);
    });
  }

  buildModels() {
    const metal = new THREE.MeshLambertMaterial({ color: 0x55595f });
    const dark = new THREE.MeshLambertMaterial({ color: 0x33363b });
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a4a26 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc8987a });
    const band = new THREE.MeshLambertMaterial({ color: 0x9a8040 });
    const b = (w, h, d, m, x, y, z, parent) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    this.key = new THREE.DirectionalLight(0xfff2dc, 0.4);
    this.key.position.set(-0.6, 1.2, 0.8);
    this.scene.add(this.key);

    // Linterna (mano izquierda)
    this.torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.18, 8), metal);
    body.rotation.x = Math.PI / 2;
    this.torch.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.023, 0.05, 8), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.11;
    this.torch.add(head);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.02, 8), band);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.02;
    this.torch.add(ring);
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 8), this.lensMat);
    lens.position.z = -0.136;
    this.torch.add(lens);
    b(0.06, 0.05, 0.08, skin, 0.005, -0.02, 0.03, this.torch);
    this.torch.position.set(-0.24, -0.23, -0.5);
    this.torch.rotation.y = 0.12;
    this.root.add(this.torch);

    // Revólver
    const rv = new THREE.Group();
    b(0.026, 0.028, 0.2, metal, 0, 0.03, -0.15, rv);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.07, 8), dark);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(0, 0.012, -0.02);
    rv.add(cyl);
    b(0.034, 0.06, 0.09, metal, 0, 0.0, 0.045, rv);
    const grip = b(0.036, 0.11, 0.048, wood, 0, -0.07, 0.09, rv);
    grip.rotation.x = 0.35;
    b(0.008, 0.018, 0.01, dark, 0, 0.052, -0.24, rv);
    b(0.06, 0.06, 0.07, skin, 0, -0.075, 0.1, rv);
    rv.position.set(0.19, -0.19, -0.4);
    rv.userData.base = rv.position.clone();
    rv.userData.aim = new THREE.Vector3(0.0, -0.105, -0.34);
    rv.userData.muzzle = new THREE.Vector3(0, 0.03, -0.27);
    rv.visible = false;
    this.root.add(rv);

    // Escopeta
    const sg = new THREE.Group();
    [-0.019, 0.019].forEach((x) => {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.66, 8), metal);
      br.rotation.x = Math.PI / 2;
      br.position.set(x, 0.02, -0.4);
      sg.add(br);
    });
    b(0.06, 0.04, 0.3, wood, 0, -0.015, -0.28, sg);
    b(0.065, 0.07, 0.13, dark, 0, 0.0, -0.02, sg);
    const stock = b(0.05, 0.09, 0.3, wood, 0, -0.05, 0.18, sg);
    stock.rotation.x = -0.12;
    b(0.065, 0.06, 0.09, skin, 0, -0.05, -0.3, sg);
    sg.position.set(0.19, -0.19, -0.36);
    sg.userData.base = sg.position.clone();
    sg.userData.aim = new THREE.Vector3(0.0, -0.1, -0.3);
    sg.userData.muzzle = new THREE.Vector3(0, 0.02, -0.8);
    sg.visible = false;
    this.root.add(sg);

    // Rifle de caza (cazador): cañón largo, cerrojo y mira telescópica
    const rf = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.62, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.48);
    rf.add(barrel);
    b(0.05, 0.05, 0.42, wood, 0, -0.005, -0.3, rf);
    b(0.045, 0.06, 0.16, dark, 0, 0.012, -0.06, rf);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 10), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, -0.12);
    rf.add(scope);
    [-0.22, -0.02].forEach((z) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 10), metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.075, z);
      rf.add(ring);
    });
    b(0.015, 0.035, 0.015, metal, 0, 0.045, -0.07, rf);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), metal);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(0.04, 0.03, -0.02);
    rf.add(bolt);
    const rstock = b(0.055, 0.1, 0.3, wood, 0, -0.04, 0.18, rf);
    rstock.rotation.x = -0.1;
    b(0.065, 0.06, 0.09, skin, 0, -0.05, -0.32, rf);
    rf.position.set(0.19, -0.2, -0.36);
    rf.userData.base = rf.position.clone();
    rf.userData.aim = new THREE.Vector3(0.0, -0.075, -0.2);
    rf.userData.muzzle = new THREE.Vector3(0, 0.025, -0.8);
    rf.visible = false;
    this.root.add(rf);

    // Cámara de fotos (investigadora)
    const cm = new THREE.Group();
    b(0.16, 0.1, 0.06, dark, 0, 0, 0, cm);
    const lensC = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.06, 10), metal);
    lensC.rotation.x = Math.PI / 2;
    lensC.position.set(0.02, 0, -0.06);
    cm.add(lensC);
    b(0.04, 0.025, 0.03, new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }), -0.05, 0.06, -0.01, cm);
    b(0.06, 0.06, 0.07, skin, 0.09, -0.04, 0.02, cm);
    cm.position.set(0.17, -0.17, -0.36);
    cm.userData.base = cm.position.clone();
    cm.userData.aim = new THREE.Vector3(0.02, -0.08, -0.25);
    cm.userData.muzzle = new THREE.Vector3(0.02, 0, -0.1);
    cm.visible = false;
    this.root.add(cm);

    this.models = { revolver: rv, shotgun: sg, rifle: rf, camera: cm };

    const flashMat = new THREE.SpriteMaterial({ map: TEX.flash, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.muzzleSprite = new THREE.Sprite(flashMat);
    this.muzzleSprite.scale.set(0.25, 0.25, 0.25);
    this.muzzleSprite.visible = false;
    this.root.add(this.muzzleSprite);
  }

  give(id) {
    this.owned[id] = true;
    this.mag[id] = CFG.WEAPONS[id].mag;
    this.select(id);
  }

  select(id) {
    if (id !== 'none' && !this.owned[id]) {
      this.G.hud.msg({ revolver: 'No tienes revólver.', shotgun: 'No tienes escopeta.', rifle: 'No tienes rifle.', camera: 'No tienes cámara.' }[id] || 'No lo tienes.');
      return;
    }
    if (this.current === id) return;
    this.current = id;
    this.reloading = 0;
    this.switchT = 0.35;
    SFX.click(null, 0.3);
  }

  cycle(dir) {
    const list = ['none', 'revolver', 'shotgun', 'rifle', 'camera'].filter((k) => k === 'none' || this.owned[k]);
    const i = list.indexOf(this.current);
    this.select(list[(i + dir + list.length) % list.length]);
  }

  reload() {
    const id = this.current;
    if (id === 'none' || Weapons.isTool(id) || this.reloading > 0) return;
    const w = CFG.WEAPONS[id];
    if (this.mag[id] >= w.mag) return;
    if (this.G.inv[w.ammo] <= 0) {
      this.G.hud.msg('No te queda munición.');
      return;
    }
    this.reloading = w.reload;
    SFX.reload(id);
  }

  fire() {
    const G = this.G;
    // La investigadora siempre lleva la cámara en la cara: con las manos libres, el clic hace la foto
    const id = this.current === 'none' && G.role === 'investigator' ? 'camera' : this.current;
    if (id === 'none' || this.cool > 0 || this.reloading > 0 || this.switchT > 0 || G.player.climb) return;
    if (Weapons.isTool(id)) { if (G.roles) G.roles.useTool(id); return; }
    const w = CFG.WEAPONS[id];
    if (this.mag[id] <= 0) {
      SFX.dryFire();
      this.cool = 0.3;
      if (G.inv[w.ammo] > 0) this.reload();
      else G.hud.msg('Sin munición.');
      return;
    }
    // En el campo de tiro las balas son de prácticas
    const hunt = G.roles && G.roles.hunt;
    if (!(hunt && hunt.practicing() && id === 'rifle')) this.mag[id]--;
    this.cool = w.rate;
    this.recoil = 1;
    this.flashT = 0.06;
    SFX.shot(id);
    G.player.shake = Math.max(G.player.shake, id === 'shotgun' ? 0.7 : id === 'rifle' ? 0.6 : 0.4);
    const eye = G.player.eyePos();
    const fwd = G.player.forward();
    const right = new THREE.Vector3(Math.cos(G.player.yaw), 0, -Math.sin(G.player.yaw));
    const up = new THREE.Vector3().crossVectors(right, fwd);
    let hits = 0;
    // Con el rifle cuenta la puntería del cazador (sube practicando); desde un escondite, pulso firme
    const skill = id === 'rifle' && hunt && hunt.on ? hunt.aim() : { spread: 1, damage: 1 };
    const steady = hunt && hunt.hidden ? 0.6 : 1;
    for (let i = 0; i < w.pellets; i++) {
      const spread = w.spread * skill.spread * steady * (G.player.aiming ? (id === 'rifle' ? 0.3 : 0.5) : id === 'rifle' ? 4 : 1) * (G.player.speed > 1 ? 1.6 : 1);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const d = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      if (G.hitscan(eye, d, w.range, w.damage * skill.damage)) hits++;
    }
    if (G.intruder) G.intruder.onGunshot(eye, hits > 0);
  }

  addPuff(p, color) {
    const m = new THREE.SpriteMaterial({ map: TEX.glint, color, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.position.copy(p);
    s.scale.set(0.3, 0.3, 0.3);
    this.G.scene.add(s);
    this.puffs.push({ s, t: 0.35 });
  }

  update(dt, inp) {
    if (this.monster) { this.updateMonster(dt, inp); return; }
    const G = this.G;
    const P = G.player;
    this.cool = Math.max(0, this.cool - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const id = this.current;
        if (id !== 'none' && !Weapons.isTool(id)) {
          const w = CFG.WEAPONS[id];
          const take = Math.min(w.mag - this.mag[id], G.inv[w.ammo]);
          this.mag[id] += take;
          G.inv[w.ammo] -= take;
        }
      }
    }
    const cam = G.role === 'investigator';
    // Cada clic se usa una vez (aunque se suelte antes del siguiente fotograma)
    if (inp.fire) {
      if ((this.current !== 'none' || cam) && !G.player.dead) this.fire();
      inp.fire = false;
    }

    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.flashT = Math.max(0, this.flashT - dt);
    const fl = this.flashT > 0 ? 1 : 0;
    this.worldMuzzle.intensity = fl * 3.5;
    this.vmMuzzle.intensity = fl * 3;
    this.lensMat.color.set(P.flash.intensity > 0.4 ? 0xfff6d8 : 0x333333);
    this.fill.intensity = P.flash.intensity > 0.4 ? 0.9 : 0;
    this.ambient.intensity = G.viewLight;
    this.key.intensity = G.viewLight * 0.9;

    // Posición del arma: balanceo, retroceso, recarga, cambio
    this.sway.x += (-inp.mdx * 0.0006 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (inp.mdy * 0.0006 - this.sway.y) * Math.min(1, dt * 8);
    const bob = P.bobAmt;
    const bx = Math.cos(P.bobT) * 0.012 * bob, by = Math.abs(Math.sin(P.bobT)) * 0.016 * bob;
    // La investigadora mira a través de la cámara: no se ven ni la linterna ni la cámara en la mano
    this.torch.visible = !cam;
    for (const id in this.models) {
      const m = this.models[id];
      m.visible = this.current === id && !(cam && id === 'camera') && !(id === 'rifle' && P.aiming && G.camera.fov < 30);
      if (!m.visible) continue;
      const base = P.aiming ? m.userData.aim : m.userData.base;
      const reloadDip = this.reloading > 0 && CFG.WEAPONS[id] ? Math.sin(Math.min(1, 1 - this.reloading / CFG.WEAPONS[id].reload) * Math.PI) : 0;
      const sw = this.switchT / 0.35;
      m.position.x += (base.x + bx + this.sway.x - m.position.x) * Math.min(1, dt * 14);
      m.position.y += (base.y + by + this.sway.y - reloadDip * 0.15 - sw * 0.3 - m.position.y) * Math.min(1, dt * 14);
      m.position.z = base.z + this.recoil * 0.08;
      m.rotation.x = this.recoil * 0.35 + reloadDip * 0.6;
      m.rotation.z = reloadDip * 0.5;
      if (fl) {
        this.muzzleSprite.position.copy(m.userData.muzzle).applyMatrix4(m.matrix);
        this.muzzleSprite.material.rotation = Math.random() * 6;
      }
    }
    this.muzzleSprite.visible = !!fl && !cam && this.current !== 'none';
    this.torch.position.x = -0.24 + bx * 0.8 + this.sway.x;
    this.torch.position.y = -0.23 + by * 0.8 + this.sway.y - (P.aiming ? 0.12 : 0);

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t -= dt;
      p.s.scale.multiplyScalar(1 + dt * 3);
      p.s.material.opacity = Math.max(0, p.t / 0.35);
      if (p.t <= 0) {
        G.scene.remove(p.s);
        p.s.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  resize(aspect) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }
}
