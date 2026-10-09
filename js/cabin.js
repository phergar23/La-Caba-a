'use strict';

// La cabaña de dos plantas: paredes, puertas con pestillo, ventanas, trampilla al tejado.
// Planta: x ∈ [-5, 5], z ∈ [-4, 4]. Planta baja y=0, primera planta y=3, tejado y=6.

class Door {
  constructor(cabin, o) {
    this.cabin = cabin;
    this.kind = 'door';
    this.name = o.name;
    this.x0 = o.x0; this.x1 = o.x1; this.zc = o.zc; this.inside = o.inside;
    this.open = false;
    this.anim = 0;
    this.bolted = false;
    this.boards = 0;
    this.boardHp = CFG.INTRUDER.boardHp;
    this.pick = 0;
    this.shake = 0;
    const w = this.x1 - this.x0;

    this.pivot = new THREE.Group();
    this.pivot.position.set(this.x0, 0, this.zc);
    const panel = new THREE.Mesh(boxGeo(w - 0.02, 2.18, 0.08, 1.2), MAT.door);
    panel.position.set(w / 2, 1.1, 0);
    this.pivot.add(panel);
    const knob = new THREE.Mesh(boxGeo(0.06, 0.06, 0.24, 1), MAT.metal);
    knob.position.set(w - 0.15, 1.0, 0);
    this.pivot.add(knob);
    this.boltMesh = new THREE.Mesh(boxGeo(0.22, 0.05, 0.05, 1), MAT.metal);
    this.boltMesh.position.set(w - 0.2, 1.3, this.inside * 0.07);
    this.pivot.add(this.boltMesh);
    cabin.group.add(this.pivot);
    // Cerradero fijo en el marco
    const catchM = new THREE.Mesh(boxGeo(0.08, 0.1, 0.08, 1), MAT.metal);
    catchM.position.set(this.x1 + 0.04, 1.3, this.zc + this.inside * 0.12);
    cabin.group.add(catchM);

    this.boardMeshes = [];
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(boxGeo(w + 0.4, 0.2, 0.05, 1), MAT.plankBoard);
      b.position.set((this.x0 + this.x1) / 2, 0.8 + i * 0.8, this.zc + this.inside * 0.2);
      b.rotation.z = i ? 0.08 : -0.1;
      b.visible = false;
      cabin.group.add(b);
      this.boardMeshes.push(b);
    }

    this.collider = cabin.world.addBox(this.x0, this.x1, 0, 2.25, this.zc - 0.13, this.zc + 0.13, { owner: this });
    this.openCollider = cabin.world.addBox(this.x0 - 0.25, this.x0 + 0.05, 0, 2.2,
      Math.min(this.zc, this.zc + this.inside * 1.2), Math.max(this.zc, this.zc + this.inside * 1.2), { owner: this, sight: false });
    this.openCollider.solid = false;

    this.pos = new THREE.Vector3((this.x0 + this.x1) / 2, 1.2, this.zc);
    this.r = 0.75;
    this.outside = new THREE.Vector3(this.pos.x, 0, this.zc - this.inside * 0.85);
    this.insideSpot = new THREE.Vector3(this.pos.x, 0, this.zc + this.inside * 0.9);
  }

  isPlayerInside(p) { return (p.z - this.zc) * this.inside > 0; }

  setOpen(v, byIntruder) {
    if (this.open === v) return;
    this.open = v;
    SFX.creak(this.pos, byIntruder ? 1 : 0.6, v ? 0.9 : 0.5);
    if (!v) setTimeout(() => SFX.bang(this.pos, 0.35), 350);
  }

  setBolt(v) {
    if (this.bolted === v) return;
    this.bolted = v;
    if (v) this.pick = 0;
    SFX.bolt(this.pos, v);
  }

  get secure() { return !this.open && (this.bolted || this.boards > 0); }

  addBoard() {
    this.boards++;
    this.boardHp = CFG.INTRUDER.boardHp;
    SFX.hammer(this.pos);
  }

  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim += U.clamp(target - this.anim, -dt * 2.2, dt * 2.2);
    const sh = this.shake > 0 ? Math.sin(performance.now() * 0.08) * 0.03 * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.pivot.rotation.y = -this.inside * this.anim * 1.75 + sh;
    this.collider.solid = this.anim < 0.5;
    this.collider.sight = this.anim < 0.5;
    this.collider.bullets = this.anim < 0.5;
    this.openCollider.solid = this.anim > 0.9;
    this.boltMesh.position.x = (this.x1 - this.x0) - (this.bolted ? 0.05 : 0.25);
    this.boardMeshes.forEach((b, i) => (b.visible = i < this.boards));
  }

  prompt(G) {
    const p = G.player.pos;
    const inside = this.isPlayerInside(p);
    const lines = [];
    const info = [];
    if (inside) {
      if (this.boards > 0) {
        lines.push('[E] Quitar tablón');
        if (this.boards < 2) lines.push(`[T] Atrancar con tablón (${G.inv.planks})`);
        lines.push(this.bolted ? '[Q] Quitar pestillo' : '[Q] Echar pestillo');
      } else if (this.open) {
        lines.push('[E] Cerrar');
      } else {
        lines.push(this.bolted ? '[E] Abrir (tiene el pestillo)' : '[E] Abrir');
        lines.push(this.bolted ? '[Q] Quitar pestillo' : '[Q] Echar pestillo');
        lines.push(`[T] Atrancar con tablón (${G.inv.planks})`);
      }
      info.push('Pestillo: ' + (this.bolted ? 'ECHADO' : 'quitado'));
      if (this.boards) info.push('Tablones: ' + this.boards + '/2');
      if (this.pick > 0.05 && this.bolted) info.push('Hay arañazos recientes en el cerrojo...');
    } else {
      lines.push(this.open ? '[E] Cerrar' : '[E] Abrir');
    }
    return { title: this.name, lines, info };
  }

  act(key, G) {
    const inside = this.isPlayerInside(G.player.pos);
    if (key === 'E') {
      if (inside && this.boards > 0) {
        this.boards--;
        G.inv.planks++;
        SFX.woodCrack(this.pos, 0.5);
        G.hud.msg('Quitas un tablón (+1 tablón)');
        return true;
      }
      if (this.open) { this.setOpen(false); return true; }
      if (this.bolted) {
        SFX.click(this.pos, 0.5);
        G.hud.msg(inside ? 'Tiene el pestillo echado (Q para quitarlo).' : 'Está cerrada por dentro.');
        return true;
      }
      this.setOpen(true);
      return true;
    }
    if (key === 'Q' && inside) {
      if (this.open) { G.hud.msg('Cierra la puerta primero.'); return true; }
      this.setBolt(!this.bolted);
      return true;
    }
    if (key === 'T' && inside) {
      if (this.open) { G.hud.msg('Cierra la puerta primero.'); return true; }
      if (this.boards >= 2) { G.hud.msg('No caben más tablones.'); return true; }
      if (G.inv.planks <= 0) { G.hud.msg('No tienes tablones. Cómpralos en el pueblo.'); return true; }
      G.inv.planks--;
      this.addBoard();
      G.hud.msg('Atrancas la puerta con un tablón.');
      return true;
    }
    return false;
  }
}

class CabinWindow {
  constructor(cabin, o) {
    this.cabin = cabin;
    this.kind = 'window';
    this.name = o.name;
    this.axis = o.axis; // 'x': pared a lo largo de X (normal Z); 'z': pared a lo largo de Z (normal X)
    this.a0 = o.a0; this.a1 = o.a1; this.y0 = o.y0; this.y1 = o.y1;
    this.wc = o.wc; this.inside = o.inside;
    this.glass = true;
    this.boards = 0;
    this.rip = 0;
    this.shake = 0;
    const w = this.a1 - this.a0, h = this.y1 - this.y0;
    const am = (this.a0 + this.a1) / 2, ym = (this.y0 + this.y1) / 2;
    const P = (a, y, n) => (this.axis === 'x' ? new THREE.Vector3(a, y, this.wc + n) : new THREE.Vector3(this.wc + n, y, a));
    const rotY = this.axis === 'x' ? 0 : Math.PI / 2;

    const pane = new THREE.PlaneGeometry(w, h);
    this.glassMesh = new THREE.Mesh(pane, MAT.glass);
    this.glassMesh.position.copy(P(am, ym, 0));
    this.glassMesh.rotation.y = rotY;
    this.brokenMesh = new THREE.Mesh(pane, MAT.glassBroken);
    this.brokenMesh.position.copy(this.glassMesh.position);
    this.brokenMesh.rotation.y = rotY;
    this.brokenMesh.visible = false;
    cabin.group.add(this.glassMesh, this.brokenMesh);

    // Marco
    const fr = (ww, hh, a, y) => {
      const g = this.axis === 'x' ? boxGeo(ww, hh, 0.3, 1) : boxGeo(0.3, hh, ww, 1);
      const m = new THREE.Mesh(g, MAT.door);
      m.position.copy(P(a, y, 0));
      cabin.group.add(m);
    };
    fr(w + 0.16, 0.08, am, this.y0 - 0.02);
    fr(w + 0.16, 0.08, am, this.y1 + 0.02);
    fr(0.06, h, am, ym);

    this.boardMeshes = [];
    for (let i = 0; i < 3; i++) {
      const g = this.axis === 'x' ? boxGeo(w + 0.35, 0.22, 0.05, 1) : boxGeo(0.05, 0.22, w + 0.35, 1);
      const b = new THREE.Mesh(g, MAT.plankBoard);
      b.position.copy(P(am, this.y0 + 0.2 + i * (h - 0.4) / 2, this.inside * 0.2));
      if (this.axis === 'x') b.rotation.z = (i - 1) * 0.12; else b.rotation.x = (i - 1) * 0.12;
      b.visible = false;
      cabin.group.add(b);
      this.boardMeshes.push(b);
    }

    const bx = this.axis === 'x'
      ? [this.a0, this.a1, this.y0, this.y1, this.wc - 0.13, this.wc + 0.13]
      : [this.wc - 0.13, this.wc + 0.13, this.y0, this.y1, this.a0, this.a1];
    this.collider = cabin.world.addBox(bx[0], bx[1], bx[2], bx[3], bx[4], bx[5], { owner: this, sight: false, bullets: false });
    this.pos = P(am, ym, 0);
    this.r = 0.75;
    this.outside = P(am, 0, -this.inside * 0.85);
    this.outside.y = 0;
    this.insideSpot = P(am, 0, this.inside * 0.9);
    this.insideSpot.y = 0;
  }

  isPlayerInside(p) {
    const c = this.axis === 'x' ? p.z : p.x;
    return (c - this.wc) * this.inside > 0;
  }

  get open() { return !this.glass && this.boards === 0; }

  get secure() { return this.boards > 0; }

  smash() {
    if (!this.glass) return;
    this.glass = false;
    SFX.glass(this.pos);
  }

  update(dt) {
    this.glassMesh.visible = this.glass;
    this.brokenMesh.visible = !this.glass;
    this.boardMeshes.forEach((b, i) => (b.visible = i < this.boards));
    this.collider.sight = this.boards >= 2;
    this.collider.bullets = this.boards > 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      this.boardMeshes.forEach((b, i) => {
        if (i < this.boards) b.position.y += Math.sin(performance.now() * 0.09 + i) * 0.004 * this.shake;
      });
    }
  }

  prompt(G) {
    if (!this.isPlayerInside(G.player.pos)) return { title: this.name, lines: [], info: [this.glass ? 'Cristal intacto' : 'Cristal ROTO'] };
    const lines = [];
    if (this.boards < 3) lines.push(`[T] Tapiar con tablón (${G.inv.planks})`);
    if (!this.glass && this.boards === 0) lines.push(`[E] Poner cristal (${G.inv.glass})`);
    else if (this.boards > 0) lines.push('[E] Quitar tablón');
    const info = [this.glass ? 'Cristal intacto' : 'Cristal ROTO', 'Tablones: ' + this.boards + '/3'];
    return { title: this.name, lines, info };
  }

  act(key, G) {
    if (!this.isPlayerInside(G.player.pos)) return false;
    if (key === 'T') {
      if (this.boards >= 3) { G.hud.msg('Ya está bien tapiada.'); return true; }
      if (G.inv.planks <= 0) { G.hud.msg('No tienes tablones. Cómpralos en el pueblo.'); return true; }
      G.inv.planks--;
      this.boards++;
      this.rip = 0;
      SFX.hammer(this.pos);
      G.hud.msg('Clavas un tablón en la ventana.');
      return true;
    }
    if (key === 'E') {
      if (!this.glass && this.boards === 0) {
        if (G.inv.glass <= 0) { G.hud.msg('Necesitas un cristal de repuesto (tienda del pueblo).'); return true; }
        G.inv.glass--;
        this.glass = true;
        SFX.hammer(this.pos);
        G.hud.msg('Cambias el cristal.');
        return true;
      }
      if (this.boards > 0) {
        this.boards--;
        G.inv.planks++;
        SFX.woodCrack(this.pos, 0.4);
        G.hud.msg('Quitas un tablón (+1 tablón)');
        return true;
      }
    }
    return false;
  }
}

class Hatch {
  constructor(cabin) {
    this.cabin = cabin;
    this.kind = 'hatch';
    this.name = 'Trampilla del tejado';
    this.open = false;
    this.anim = 0;
    this.bolted = false;
    this.pick = 0;
    this.shake = 0;
    this.pivot = new THREE.Group();
    this.pivot.position.set(-0.5, 5.9, -2.6);
    const lid = new THREE.Mesh(boxGeo(1.0, 0.08, 1.0, 1), MAT.door);
    lid.position.set(0, 0, -0.5);
    this.pivot.add(lid);
    this.boltMesh = new THREE.Mesh(boxGeo(0.05, 0.05, 0.22, 1), MAT.metal);
    this.boltMesh.position.set(0.3, -0.07, -0.3);
    this.pivot.add(this.boltMesh);
    cabin.group.add(this.pivot);
    this.pos = new THREE.Vector3(-0.5, 5.9, -3.1);
    this.r = 0.7;
  }

  setOpen(v, byIntruder) {
    if (this.open === v) return;
    this.open = v;
    SFX.creak(this.pos, byIntruder ? 1 : 0.5, 0.6);
  }

  setBolt(v) {
    if (this.bolted === v) return;
    this.bolted = v;
    if (v) this.pick = 0;
    SFX.bolt(this.pos, v);
  }

  get secure() { return !this.open && this.bolted; }

  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim += U.clamp(target - this.anim, -dt * 2.5, dt * 2.5);
    const sh = this.shake > 0 ? Math.sin(performance.now() * 0.09) * 0.03 * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.pivot.rotation.x = this.anim * 1.9 + sh;
    this.boltMesh.position.z = this.bolted ? -0.1 : -0.3;
  }

  prompt(G) {
    const onRoof = G.player.pos.y > 5;
    if (onRoof) {
      return { title: this.name, lines: this.open ? ['[E] Bajar por la trampilla'] : ['[E] Abrir trampilla'], info: [] };
    }
    const lines = [];
    if (this.open) lines.push('[E] Cerrar trampilla');
    else {
      lines.push(this.bolted ? '[E] Abrir (tiene el pestillo)' : '[E] Abrir trampilla');
      lines.push(this.bolted ? '[Q] Quitar pestillo' : '[Q] Echar pestillo');
    }
    return { title: this.name, lines, info: ['Pestillo: ' + (this.bolted ? 'ECHADO' : 'quitado')] };
  }

  act(key, G) {
    const onRoof = G.player.pos.y > 5;
    if (key === 'E') {
      if (onRoof) {
        if (!this.open) {
          if (this.bolted) { G.hud.msg('Está cerrada por dentro.'); SFX.click(this.pos); return true; }
          this.setOpen(true);
          return true;
        }
        G.player.climbTo(new THREE.Vector3(-0.5, 3.0, -2.25), Math.PI);
        return true;
      }
      if (this.open) { this.setOpen(false); return true; }
      if (this.bolted) { G.hud.msg('Tiene el pestillo echado (Q).'); SFX.click(this.pos); return true; }
      this.setOpen(true);
      return true;
    }
    if (key === 'Q' && !onRoof) {
      if (this.open) { G.hud.msg('Cierra la trampilla primero.'); return true; }
      this.setBolt(!this.bolted);
      return true;
    }
    return false;
  }
}

// Trampilla de acero en el suelo de la planta baja que baja al búnker
class FloorHatch {
  constructor(cabin) {
    this.cabin = cabin;
    this.kind = 'trapdoor';
    this.name = 'Trampilla del búnker';
    this.open = false;
    this.anim = 0;
    this.bolted = false;
    this.breach = 0;
    this.shake = 0;
    this.cx = 2.7; this.cz = -1.2;
    this.pivot = new THREE.Group();
    this.pivot.position.set(this.cx, 0.03, -1.7);
    const lid = new THREE.Mesh(boxGeo(1.0, 0.07, 1.0, 1), MAT.metal);
    lid.position.set(0, 0, 0.5);
    this.pivot.add(lid);
    const handle = new THREE.Mesh(boxGeo(0.3, 0.04, 0.06, 1), MAT.dark);
    handle.position.set(0, 0.05, 0.85);
    this.pivot.add(handle);
    this.boltMesh = new THREE.Mesh(boxGeo(0.06, 0.06, 0.3, 1), MAT.dark);
    this.boltMesh.position.set(0.35, -0.07, 0.5);
    this.pivot.add(this.boltMesh);
    cabin.group.add(this.pivot);
    this.holeCollider = cabin.world.addBox(2.2, 3.2, 0, 1.0, -1.7, -0.7, { solid: false, sight: false, bullets: false });
    this.pos = new THREE.Vector3(this.cx, 0, this.cz);
    this.r = 0.75;
  }

  get secure() { return !this.open && this.bolted; }

  setOpen(v, byIntruder) {
    if (this.open === v) return;
    this.open = v;
    SFX.creak(this.pos, byIntruder ? 1 : 0.6, 0.7);
    if (!v) setTimeout(() => SFX.bang(this.pos, 0.5), 400);
  }

  setBolt(v) {
    if (this.bolted === v) return;
    this.bolted = v;
    if (v) this.breach = 0;
    SFX.bolt(this.pos, v);
  }

  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim += U.clamp(target - this.anim, -dt * 2.4, dt * 2.4);
    const sh = this.shake > 0 ? Math.sin(performance.now() * 0.1) * 0.03 * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.pivot.rotation.x = -this.anim * 1.9 + sh;
    this.holeCollider.solid = this.anim > 0.2;
    this.boltMesh.position.x = this.bolted ? 0.2 : 0.38;
  }

  prompt(G) {
    const below = G.player.pos.y < -1;
    const lines = [];
    if (below) {
      if (this.open) lines.push('[E] Subir a la cabaña', '[Q] Cerrar trampilla');
      else {
        lines.push(this.bolted ? '[E] Abrir (tiene el cerrojo)' : '[E] Abrir trampilla');
        lines.push(this.bolted ? '[Q] Quitar cerrojo' : '[Q] Echar cerrojo');
      }
      return { title: this.name, lines, info: ['Cerrojo: ' + (this.bolted ? 'ECHADO' : 'quitado')] };
    }
    if (this.open) lines.push('[E] Bajar al búnker', '[Q] Cerrar trampilla');
    else lines.push('[E] Abrir trampilla');
    const info = [];
    if (this.breach > 0.05) info.push('El acero está abollado...');
    return { title: this.name, lines, info };
  }

  act(key, G) {
    const below = G.player.pos.y < -1;
    const via = { x: this.cx, z: this.cz };
    if (key === 'E') {
      if (this.open) {
        if (below) G.player.climbTo(new THREE.Vector3(this.cx, 0, 0.0), Math.PI, via);
        else G.player.climbTo(new THREE.Vector3(this.cx, -3, -0.35), Math.PI, via);
        return true;
      }
      if (this.bolted) {
        SFX.click(this.pos, 0.5);
        G.hud.msg(below ? 'Tiene el cerrojo echado (Q).' : 'Está cerrada desde abajo.');
        return true;
      }
      this.setOpen(true);
      return true;
    }
    if (key === 'Q') {
      if (this.open) { this.setOpen(false); return true; }
      if (below) { this.setBolt(!this.bolted); return true; }
    }
    return false;
  }
}

class Cabin {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.doors = [];
    this.windows = [];
    this.lights = [];
    this.flicker = 0;
  }

  box(minX, maxX, minY, maxY, minZ, maxZ, mat, collide = true, texSize = 1.6, opts) {
    const m = new THREE.Mesh(boxGeo(maxX - minX, maxY - minY, maxZ - minZ, texSize), mat);
    m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.group.add(m);
    if (collide) this.world.addBox(minX, maxX, minY, maxY, minZ, maxZ, opts);
    return m;
  }

  // Pared con huecos. axis 'x' = corre a lo largo de X (grosor f0..f1 en Z)
  wall(axis, f0, f1, a0, a1, y0, y1, holes) {
    const hs = holes.slice().sort((p, q) => p.a0 - q.a0);
    let cur = a0;
    const segs = [];
    hs.forEach((h) => {
      if (h.a0 > cur) segs.push([cur, h.a0, y0, y1]);
      if (h.y0 > y0) segs.push([h.a0, h.a1, y0, h.y0]);
      if (h.y1 < y1) segs.push([h.a0, h.a1, h.y1, y1]);
      cur = h.a1;
    });
    if (cur < a1) segs.push([cur, a1, y0, y1]);
    segs.forEach(([s0, s1, t0, t1]) => {
      if (axis === 'x') this.box(s0, s1, t0, t1, f0, f1, MAT.logs);
      else this.box(f0, f1, t0, t1, s0, s1, MAT.logs);
    });
  }

  build() {
    const W = this.world;
    const X0 = -5, X1 = 5, Z0 = -4, Z1 = 4, T = 0.25;
    const H1 = 3, H2 = 5.8;
    const xi0 = X0 + T, xi1 = X1 - T, zi0 = Z0 + T, zi1 = Z1 - T;

    // Ventanas y puertas (planta baja)
    const winDefs = [
      { name: 'Ventana delantera izquierda', axis: 'x', a0: -3.6, a1: -2.4, y0: 1.0, y1: 2.1, wc: Z1 - T / 2, inside: -1 },
      { name: 'Ventana delantera derecha', axis: 'x', a0: 1.8, a1: 3.0, y0: 1.0, y1: 2.1, wc: Z1 - T / 2, inside: -1 },
      { name: 'Ventana de la cocina', axis: 'x', a0: -3.0, a1: -1.8, y0: 1.05, y1: 2.1, wc: Z0 + T / 2, inside: 1 },
      { name: 'Ventana lateral', axis: 'z', a0: -0.6, a1: 0.6, y0: 1.0, y1: 2.1, wc: X0 + T / 2, inside: 1 },
    ];
    const frontHoles = [{ a0: -0.6, a1: 0.6, y0: 0, y1: 2.25 }];
    const backHoles = [{ a0: 0.9, a1: 2.1, y0: 0, y1: 2.25 }];
    const westHoles = [], eastHoles = [];
    winDefs.forEach((d) => {
      const h = { a0: d.a0, a1: d.a1, y0: d.y0, y1: d.y1 };
      if (d.axis === 'x') (d.inside < 0 ? frontHoles : backHoles).push(h);
      else westHoles.push(h);
    });
    this.wall('x', Z1 - T, Z1, X0, X1, 0, H1, frontHoles);
    this.wall('x', Z0, Z0 + T, X0, X1, 0, H1, backHoles);
    this.wall('z', X0, X0 + T, zi0, zi1, 0, H1, westHoles);
    this.wall('z', X1 - T, X1, zi0, zi1, 0, H1, eastHoles);

    // Primera planta: ventanas decorativas (no se abren)
    const up = [
      { axis: 'x', a0: -2.4, a1: -1.4, wc: Z1 - T / 2 },
      { axis: 'x', a0: 1.0, a1: 2.0, wc: Z0 + T / 2 },
      { axis: 'z', a0: -0.5, a1: 0.5, wc: X0 + T / 2 },
      { axis: 'z', a0: -3.4, a1: -2.6, wc: X1 - T / 2 },
    ];
    const upH = (axis, wc) => up.filter((u) => u.axis === axis && u.wc === wc).map((u) => ({ a0: u.a0, a1: u.a1, y0: 4.0, y1: 5.0 }));
    this.wall('x', Z1 - T, Z1, X0, X1, H1, H2, upH('x', Z1 - T / 2));
    this.wall('x', Z0, Z0 + T, X0, X1, H1, H2, upH('x', Z0 + T / 2));
    this.wall('z', X0, X0 + T, zi0, zi1, H1, H2, upH('z', X0 + T / 2));
    this.wall('z', X1 - T, X1, zi0, zi1, H1, H2, upH('z', X1 - T / 2));
    up.forEach((u) => {
      const w = u.a1 - u.a0;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1), MAT.glass);
      const am = (u.a0 + u.a1) / 2;
      if (u.axis === 'x') m.position.set(am, 4.5, u.wc);
      else { m.position.set(u.wc, 4.5, am); m.rotation.y = Math.PI / 2; }
      this.group.add(m);
      const bx = u.axis === 'x' ? [u.a0, u.a1, 4, 5, u.wc - 0.13, u.wc + 0.13] : [u.wc - 0.13, u.wc + 0.13, 4, 5, u.a0, u.a1];
      W.addBox(bx[0], bx[1], bx[2], bx[3], bx[4], bx[5], { sight: false, bullets: false });
    });

    // Postes de esquina (troncos cruzados)
    [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]].forEach(([x, z]) => {
      const m = new THREE.Mesh(boxGeo(0.4, H2 + 0.1, 0.4, 1.6), MAT.logs);
      m.position.set(x, (H2 + 0.1) / 2, z);
      this.group.add(m);
    });

    // Suelos
    // Suelo de la planta baja con el hueco de la trampilla del búnker (x 2.2..3.2, z -1.7..-0.7)
    const FY0 = -0.3, FY1 = 0.02;
    this.box(xi0, xi1, FY0, FY1, -0.7, zi1, MAT.planks, false, 2);
    this.box(xi0, xi1, FY0, FY1, zi0, -1.7, MAT.planks, false, 2);
    this.box(xi0, 2.2, FY0, FY1, -1.7, -0.7, MAT.planks, false, 2);
    this.box(3.2, xi1, FY0, FY1, -1.7, -0.7, MAT.planks, false, 2);
    [[X0 - 0.2, X1 + 0.2, Z0 - 0.2, Z0 + 0.05], [X0 - 0.2, X1 + 0.2, Z1 - 0.05, Z1 + 0.2],
      [X0 - 0.2, X0 + 0.05, Z0, Z1], [X1 - 0.05, X1 + 0.2, Z0, Z1]].forEach(([a, b, c, d]) => this.box(a, b, -0.4, 0.0, c, d, MAT.stone, false, 2));
    const slab = (a, b, c, d) => {
      this.box(a, b, H1 - 0.2, H1, c, d, MAT.planks, false, 2);
      W.addFloor(a, b, c, d, H1);
      W.addBox(a, b, H1 - 0.2, H1, c, d, { solid: false, slab: true });
    };
    slab(xi0, 3.6, zi0, zi1);
    slab(3.6, xi1, zi0, -2.0);
    slab(3.6, xi1, 2.5, zi1);

    // Escalera (rampa de x 3.6..4.75, de z 2.5 (abajo) a z -2.0 (arriba))
    const SX0 = 3.6, SX1 = xi1, SZb = 2.5, SZt = -2.0;
    const run = SZb - SZt;
    for (let i = 0; i < 12; i++) {
      const zA = SZb - (i * run) / 12, zB = SZb - ((i + 1) * run) / 12;
      this.box(SX0, SX1, 0, ((i + 1) * H1) / 12, zB, zA, MAT.planks, false, 1.2);
    }
    W.addFloor(SX0, SX1, SZt, SZb, (x, z) => U.clamp(((SZb - z) / run) * H1, 0, H1));
    W.addBox(3.5, 3.6, 0, H1, SZt, 2.0);
    W.addBox(SX0, SX1, 0, H1 - 0.2, SZt - 0.1, SZt);
    // Barandilla superior
    this.box(3.5, 3.6, H1 + 0.9, H1 + 1.0, SZt, SZb + 0.1, MAT.planks, false, 1);
    this.box(3.5, SX1, H1 + 0.9, H1 + 1.0, SZb, SZb + 0.1, MAT.planks, false, 1);
    for (let z = SZt; z <= SZb + 0.01; z += 0.75) this.box(3.52, 3.58, H1, H1 + 0.9, z - 0.03, z + 0.03, MAT.planks, false, 1);
    W.addBox(3.5, 3.6, H1, H1 + 1.0, SZt, SZb + 0.1, { sight: false, bullets: false });
    W.addBox(3.5, SX1, H1, H1 + 1.0, SZb, SZb + 0.1, { sight: false, bullets: false });

    // Tejado plano (mirador) con hueco para la trampilla
    const RY0 = H2, RY1 = 6.0;
    const RX0 = X0 - 0.3, RX1 = X1 + 0.3, RZ0 = Z0 - 0.3, RZ1 = Z1 + 0.3;
    [[RX0, RX1, -2.6, RZ1], [RX0, -1.0, RZ0, -2.6], [0.0, RX1, RZ0, -2.6], [-1.0, 0.0, RZ0, -3.6]].forEach(([a, b, c, d]) => {
      this.box(a, b, RY0, RY1, c, d, MAT.roof, false, 2);
      W.addBox(a, b, RY0, RY1, c, d, { solid: false, slab: true });
    });
    W.addFloor(RX0, RX1, RZ0, RZ1, RY1);
    // Barandilla del tejado
    const rail = (a, b, c, d) => {
      this.box(a, b, RY1 + 0.9, RY1 + 1.0, c, d, MAT.planks, false, 1);
      this.box(a, b, RY1 + 0.4, RY1 + 0.48, c, d, MAT.planks, false, 1);
      W.addBox(a, b, RY1, RY1 + 1.1, c, d, { sight: false, bullets: false });
    };
    rail(RX0, RX1, RZ1 - 0.12, RZ1);
    rail(RX0, RX1, RZ0, RZ0 + 0.12);
    rail(RX1 - 0.12, RX1, RZ0, RZ1);
    rail(RX0, RX0 + 0.12, RZ0, RZ1);
    for (let x = RX0; x <= RX1 + 0.01; x += 1.325) {
      this.box(x - 0.05, x + 0.05, RY1, RY1 + 1.0, RZ1 - 0.1, RZ1, MAT.planks, false, 1);
      this.box(x - 0.05, x + 0.05, RY1, RY1 + 1.0, RZ0, RZ0 + 0.1, MAT.planks, false, 1);
    }
    for (let z = RZ0; z <= RZ1 + 0.01; z += 1.15) {
      this.box(RX1 - 0.1, RX1, RY1, RY1 + 1.0, z - 0.05, z + 0.05, MAT.planks, false, 1);
      this.box(RX0, RX0 + 0.1, RY1, RY1 + 1.0, z - 0.05, z + 0.05, MAT.planks, false, 1);
    }

    // Chimenea
    this.box(xi0, -4.15, 0, 1.4, -3.2, -2.9, MAT.stone, false, 1.5);
    this.box(xi0, -4.15, 0, 1.4, -2.1, -1.8, MAT.stone, false, 1.5);
    this.box(xi0, -4.15, 0.9, 1.4, -2.9, -2.1, MAT.stone, false, 1.5);
    this.box(xi0, -4.6, 0, 0.9, -2.9, -2.1, MAT.dark, false, 1.5);
    W.addBox(xi0, -4.15, 0, 1.4, -3.2, -1.8);
    this.box(xi0, -4.4, 1.4, H1, -3.0, -2.0, MAT.stone, true, 1.5);
    this.box(xi0, -4.4, H1, H2, -3.0, -2.0, MAT.stone, true, 1.5);
    this.box(-4.9, -4.2, RY1, 7.6, -3.1, -1.9, MAT.stone, true, 1.5);
    this.fire = new THREE.Group();
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
    const fireMat2 = new THREE.MeshBasicMaterial({ color: 0xffd060 });
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.1 + (i % 2) * 0.05, 0.4, 4), i % 2 ? fireMat : fireMat2);
      f.position.set(-4.4, 0.2, -2.8 + i * 0.2);
      this.fire.add(f);
    }
    this.group.add(this.fire);

    // Porche
    this.box(-2.8, 2.8, -0.12, 0.03, Z1, Z1 + 2.2, MAT.planks, false, 2);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb050 });
    this.lanternMat = lampMat;
    [-2.6, 2.6].forEach((x) => {
      this.box(x - 0.08, x + 0.08, 0, 1.5, Z1 + 1.97, Z1 + 2.13, MAT.logs, true, 1.6);
      const l = new THREE.Mesh(boxGeo(0.2, 0.22, 0.2, 1), lampMat);
      l.position.set(x, 1.62, Z1 + 2.05);
      this.group.add(l);
    });
    const lantern = new THREE.Mesh(boxGeo(0.14, 0.2, 0.14, 1), lampMat);
    lantern.position.set(0.95, 2.35, Z1 + 0.12);
    this.group.add(lantern);
    this.porchLantern = lantern;

    // Muebles planta baja
    this.box(-2.3, -0.7, 0.72, 0.8, 0.75, 1.65, MAT.planks, false, 1);
    [[-2.2, 0.85], [-0.8, 0.85], [-2.2, 1.55], [-0.8, 1.55]].forEach(([x, z]) => this.box(x - 0.04, x + 0.04, 0, 0.72, z - 0.04, z + 0.04, MAT.planks, false, 1));
    W.addBox(-2.3, -0.7, 0, 0.8, 0.75, 1.65, { sight: false, bullets: false, furniture: true });
    this.box(-1.8, -1.4, 0, 0.45, 2.0, 2.4, MAT.planks, false, 1);
    this.box(-1.8, -1.4, 0.45, 1.0, 2.35, 2.4, MAT.planks, false, 1);
    this.box(-3.8, -1.2, 0, 0.9, zi0, -3.2, MAT.planks, true, 1, { furniture: true });
    this.box(-2.6, -1.8, 0, 0.55, -1.9, -1.1, MAT.fabric, true, 1, { furniture: true });
    this.box(-2.6, -1.8, 0.55, 1.1, -1.9, -1.75, MAT.fabric, false, 1);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), MAT.fabric);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.8, 0.03, -0.6);
    this.group.add(rug);
    // Estantería con latas junto a la puerta trasera
    this.box(2.4, 3.3, 0, 1.8, zi0, -3.4, MAT.planks, true, 1, { furniture: true });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 6), MAT.metal);
      c.position.set(2.5 + i * 0.17, 1.87, -3.55);
      this.group.add(c);
    }

    // Lámparas
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    const bulb1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), bulbMat);
    bulb1.position.set(0.5, 2.5, 0.2);
    const cord1 = new THREE.Mesh(boxGeo(0.02, 0.3, 0.02, 1), MAT.dark);
    cord1.position.set(0.5, 2.7, 0.2);
    const bulb2 = bulb1.clone();
    bulb2.position.set(0, 5.4, 0.3);
    const cord2 = cord1.clone();
    cord2.position.set(0, 5.6, 0.3);
    this.group.add(bulb1, cord1, bulb2, cord2);
    this.bulbMat = bulbMat;

    this.fireLight = new THREE.PointLight(0xff7a30, 1.6, 9, 1.4);
    this.fireLight.position.set(-3.9, 0.7, -2.5);
    this.lamp1 = new THREE.PointLight(0xffc27a, 1.3, 10, 1.2);
    this.lamp1.position.set(0.5, 2.35, 0.2);
    this.lamp2 = new THREE.PointLight(0xffb070, 1.1, 9, 1.2);
    this.lamp2.position.set(0, 5.25, 0.3);
    this.porchLight = new THREE.PointLight(0xffa850, 0.9, 9, 1.5);
    this.porchLight.position.set(0.95, 2.2, Z1 + 0.5);
    this.group.add(this.fireLight, this.lamp1, this.lamp2, this.porchLight);

    // Primera planta: cama, mesilla, baúl, armario, escalera de mano
    this.box(xi0, -3.25, H1, H1 + 0.45, 0.8, 3.0, MAT.planks, true, 1, { furniture: true });
    this.box(xi0 + 0.05, -3.3, H1 + 0.45, H1 + 0.6, 0.85, 2.95, MAT.fabric, false, 1);
    const pillow = new THREE.Mesh(boxGeo(1.2, 0.12, 0.4, 1), new THREE.MeshLambertMaterial({ color: 0xcfc6b0 }));
    pillow.position.set(-4.0, H1 + 0.66, 2.7);
    this.group.add(pillow);
    this.box(xi0, -4.3, H1, H1 + 0.6, 0.2, 0.7, MAT.planks, true, 1, { furniture: true });
    this.box(1.0, 2.2, H1, H1 + 0.6, zi0, -3.15, MAT.door, true, 1, { furniture: true });
    this.box(1.5, 2.7, H1, H1 + 2.1, 3.2, zi1, MAT.door, true, 1, { furniture: true });
    // Escalera de mano hasta la trampilla
    [-0.92, -0.08].forEach((x) => this.box(x - 0.04, x + 0.04, H1, RY1, -3.72, -3.6, MAT.planks, false, 1));
    for (let y = H1 + 0.3; y < RY1; y += 0.35) this.box(-0.9, -0.1, y - 0.025, y + 0.025, -3.7, -3.62, MAT.planks, false, 1);
    W.addBox(-1.0, 0.0, H1, H2, zi0, -3.55, { sight: false, bullets: false });

    // Puertas, ventanas, trampilla
    this.frontDoor = new Door(this, { name: 'Puerta principal', x0: -0.6, x1: 0.6, zc: Z1 - T / 2, inside: -1 });
    this.backDoor = new Door(this, { name: 'Puerta trasera', x0: 0.9, x1: 2.1, zc: Z0 + T / 2, inside: 1 });
    this.doors = [this.frontDoor, this.backDoor];
    this.windows = winDefs.map((d) => new CabinWindow(this, d));
    this.hatch = new Hatch(this);
    this.trapdoor = new FloorHatch(this);
    this.buildBunker();

    // Interruptor de la luz junto a la puerta principal
    const sw = new THREE.Mesh(boxGeo(0.1, 0.16, 0.03, 1), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
    sw.position.set(-0.95, 1.35, zi1 - 0.015);
    this.group.add(sw);
    this.lightSwitch = {
      kind: 'switch', pos: new THREE.Vector3(-0.95, 1.35, zi1 - 0.05), r: 0.35,
      prompt: (G) => ({
        title: 'Interruptor de la luz',
        lines: [G.power.lightsOn ? '[E] Apagar las luces' : '[E] Encender las luces'],
        info: [G.power.powered ? 'Luces de la cabaña, el porche y el búnker' : 'No hay corriente: arranca el generador (planta de arriba)'],
      }),
      act: (key, G) => {
        if (key !== 'E') return false;
        G.power.lightsOn = !G.power.lightsOn;
        SFX.click(this.lightSwitch.pos, 0.6);
        return true;
      },
    };

    this.ladder = {
      kind: 'ladder',
      pos: new THREE.Vector3(-0.5, 4.2, -3.6),
      r: 0.6,
      prompt: (G) => (G.player.pos.y > 2.5 && G.player.pos.y < 5
        ? { title: 'Escalera de mano', lines: [this.hatch.open ? '[E] Subir al tejado' : '[E] Subir (abre antes la trampilla)'], info: [] }
        : null),
      act: (key, G) => {
        if (key !== 'E') return false;
        if (!this.hatch.open) { G.hud.msg('La trampilla está cerrada. Mira hacia arriba para abrirla.'); return true; }
        G.player.climbTo(new THREE.Vector3(-0.5, RY1, -1.9), Math.PI);
        return true;
      },
    };

    // Nodos de navegación interior para el intruso
    const N = (x, y, z) => new THREE.Vector3(x, y, z);
    this.nodes = {
      gF: N(0, 0, 3.0), gB: N(1.5, 0, -3.0), gW1: N(-3, 0, 3.0), gW2: N(2.4, 0, 3.0),
      gW3: N(-2.4, 0, -2.6), gW4: N(-3.9, 0, 0.2), gC: N(0.5, 0, -0.4), gS: N(4.2, 0, 3.2),
      sT: N(4.2, H1, -2.5), uL: N(3.0, H1, -3.0), uC: N(0.5, H1, 0), uW: N(-2.5, H1, -0.5),
      uF: N(0, H1, 2.9), uH: N(-0.5, H1, -2.3), rH: N(-0.5, RY1, -1.8),
      gT: N(2.7, 0, 0.05), bL: N(2.7, -3, -0.3), bC: N(1.5, -3, 0.8), bD: N(0.4, -3, -2.2),
    };
    const E = [
      ['gF', 'gW1'], ['gF', 'gW2'], ['gF', 'gC'], ['gF', 'gS'], ['gW2', 'gS'], ['gW2', 'gC'],
      ['gC', 'gB'], ['gC', 'gW3'], ['gC', 'gW4'], ['gW3', 'gW4'], ['gW3', 'gB'], ['gW4', 'gW1'],
      ['gS', 'sT'], ['sT', 'uL'], ['uL', 'uC'], ['uL', 'uH'], ['uC', 'uW'], ['uC', 'uF'], ['uC', 'uH'],
      ['uW', 'uH'], ['uW', 'uF'], ['uH', 'rH'],
      ['gT', 'gC'], ['gT', 'gW2'], ['gT', 'bL'], ['bL', 'bC'], ['bL', 'bD'], ['bC', 'bD'],
    ];
    this.adj = {};
    Object.keys(this.nodes).forEach((k) => (this.adj[k] = []));
    E.forEach(([a, b]) => { this.adj[a].push(b); this.adj[b].push(a); });

    // Puntos de entrada para el intruso
    const nodeFor = ['gW1', 'gW2', 'gW3', 'gW4'];
    this.entries = [
      { type: 'door', ref: this.frontDoor, outside: this.frontDoor.outside, node: 'gF' },
      { type: 'door', ref: this.backDoor, outside: this.backDoor.outside, node: 'gB' },
      ...this.windows.map((w, i) => ({ type: 'window', ref: w, outside: w.outside, node: nodeFor[i] })),
      { type: 'hatch', ref: this.hatch, outside: new THREE.Vector3(5.8, 0, -1.0), node: 'uH' },
    ];

    this.interactables = [...this.doors, ...this.windows, this.hatch, this.ladder, this.trapdoor, this.lightSwitch, this.securityPanel];
    this.navRect = { minX: -5.45, maxX: 5.45, minZ: -4.45, maxZ: 4.45 };
    this.navCorners = [N(-6.0, 0, -5.0), N(6.0, 0, -5.0), N(6.0, 0, 5.0), N(-6.0, 0, 5.0)];
    return this;
  }

  // Búnker bajo la cabaña: x -1.5..4.5, z -3.5..2.5, suelo a y = -3
  buildBunker() {
    const W = this.world;
    const BX0 = -1.5, BX1 = 4.5, BZ0 = -3.5, BZ1 = 2.5, BY = -3.0, TOP = -0.3;
    const C = MAT.concrete;
    this.box(BX0 - 0.3, BX1 + 0.3, BY - 0.2, BY, BZ0 - 0.3, BZ1 + 0.3, C, false, 2);
    W.addFloor(BX0, BX1, BZ0, BZ1, BY);
    this.box(BX0 - 0.3, BX0, BY, TOP, BZ0 - 0.3, BZ1 + 0.3, C, true, 2);
    this.box(BX1, BX1 + 0.3, BY, TOP, BZ0 - 0.3, BZ1 + 0.3, C, true, 2);
    this.box(BX0, BX1, BY, TOP, BZ0 - 0.3, BZ0, C, true, 2);
    this.box(BX0, BX1, BY, TOP, BZ1, BZ1 + 0.3, C, true, 2);
    // Techo del búnker (bloquea la vista y las balas entre plantas)
    [[BX0, BX1, -0.7, BZ1], [BX0, BX1, BZ0, -1.7], [BX0, 2.2, -1.7, -0.7], [3.2, BX1, -1.7, -0.7]].forEach(([a, b, c, d]) => {
      W.addBox(a, b, TOP, 0.02, c, d, { solid: false, slab: true });
    });
    // Escalera de mano bajo la trampilla
    [2.3, 3.1].forEach((x) => this.box(x - 0.04, x + 0.04, BY, 0, -1.68, -1.6, MAT.metal, false, 1));
    for (let y = BY + 0.3; y < 0; y += 0.35) this.box(2.3, 3.1, y - 0.025, y + 0.025, -1.66, -1.62, MAT.metal, false, 1);
    // Mesa con monitores
    this.box(-0.9, 1.7, BY + 0.72, BY + 0.8, BZ0, BZ0 + 0.65, MAT.metal, false, 1);
    [[-0.85, BZ0 + 0.05], [1.65, BZ0 + 0.05], [-0.85, BZ0 + 0.6], [1.65, BZ0 + 0.6]].forEach(([x, z]) => this.box(x - 0.03, x + 0.03, BY, BY + 0.72, z - 0.03, z + 0.03, MAT.dark, false, 1));
    W.addBox(-0.9, 1.7, BY, BY + 0.8, BZ0, BZ0 + 0.65, { furniture: true, sight: false, bullets: false });
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0x0c100c });
    [-0.3, 0.6, 1.3].forEach((x, i) => {
      const s = i === 2 ? 0.4 : 0.6;
      const body = new THREE.Mesh(boxGeo(s, s * 0.75, 0.35, 1), MAT.dark);
      body.position.set(x, BY + 0.8 + s * 0.4, BZ0 + 0.3);
      this.group.add(body);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.85, s * 0.6), this.screenMat);
      scr.position.set(x, BY + 0.8 + s * 0.4, BZ0 + 0.48);
      this.group.add(scr);
    });
    this.box(-0.2, 0.9, BY + 0.8, BY + 0.83, BZ0 + 0.5, BZ0 + 0.62, MAT.dark, false, 1);
    // Silla
    this.box(0.15, 0.65, BY, BY + 0.45, -2.6, -2.1, MAT.metal, false, 1);
    this.box(0.15, 0.65, BY + 0.45, BY + 1.0, -2.15, -2.1, MAT.metal, false, 1);
    // Estanterías con provisiones
    this.box(BX0, BX0 + 0.5, BY, BY + 1.8, -2.6, 1.6, MAT.metal, true, 1, { furniture: true });
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(boxGeo(0.3, 0.25, 0.25, 1), new THREE.MeshLambertMaterial({ color: [0x5a4a2a, 0x3a5a3a, 0x6a3a2a][i % 3] }));
      b.position.set(BX0 + 0.3, BY + 0.2 + (i % 3) * 0.6, -2.3 + Math.floor(i / 3) * 0.95);
      this.group.add(b);
    }
    // Catre
    this.box(3.6, BX1, BY, BY + 0.45, 0.2, 2.3, MAT.metal, true, 1, { furniture: true });
    this.box(3.65, BX1 - 0.05, BY + 0.45, BY + 0.55, 0.25, 2.25, MAT.fabric, false, 1);
    // Sacos terreros y tuberías
    for (let i = 0; i < 5; i++) this.box(-0.5 + i * 0.7, 0.1 + i * 0.7, BY, BY + 0.3, BZ1 - 0.45, BZ1, MAT.dirt, false, 1);
    [-2.8, 1.8].forEach((z) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, BX1 - BX0, 6), MAT.metal);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set((BX0 + BX1) / 2, TOP - 0.15, z);
      this.group.add(pipe);
    });
    // Bombilla enjaulada
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), this.bulbMat);
    bulb.position.set(1.2, TOP - 0.3, -0.4);
    this.group.add(bulb);
    this.bunkerLight = new THREE.PointLight(0xffe0b0, 1.4, 9, 1.2);
    this.bunkerLight.position.set(1.2, TOP - 0.45, -0.4);
    this.group.add(this.bunkerLight);
    // Panel de seguridad
    this.securityPanel = {
      kind: 'monitor', pos: new THREE.Vector3(0.6, BY + 1.15, BZ0 + 0.45), r: 0.85,
      prompt: (G) => ({
        title: 'Panel de seguridad',
        lines: ['[E] Ver las cámaras'],
        info: [G.power.powered ? `Cámaras: ${G.power.mounts.filter((m) => m.cam).length} · Detectores: ${G.power.mounts.filter((m) => m.det).length}` : 'Sin corriente'],
      }),
      act: (key, G) => {
        if (key !== 'E') return false;
        G.openMonitor();
        return true;
      },
    };
  }

  zoneOf(p) {
    if (p.y < -20) return 'cave';
    if (p.y < -1) return p.x > -1.6 && p.x < 4.6 && p.z > -3.6 && p.z < 2.6 ? 'bunker' : 'outside';
    if (p.x > -5.3 && p.x < 5.3 && p.z > -4.3 && p.z < 4.3 && p.y > 5.5) return 'roof';
    if (p.x > -4.75 && p.x < 4.75 && p.z > -3.75 && p.z < 3.75) return p.y > 2.5 ? 'upper' : 'ground';
    return 'outside';
  }

  isInside(p) {
    const z = this.zoneOf(p);
    return z === 'ground' || z === 'upper' || z === 'bunker';
  }

  // Punto más cercano del grafo a una posición (misma planta)
  nearestNode(p) {
    let best = null, bd = Infinity;
    for (const k in this.nodes) {
      const n = this.nodes[k];
      const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 4;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // gates: { hatch, trap } permiten cruzar la trampilla del tejado o la del búnker
  path(fromKey, toKey, gates) {
    const g = typeof gates === 'object' && gates ? gates : { hatch: !!gates, trap: !!gates };
    const prev = {}, dist = {};
    Object.keys(this.nodes).forEach((k) => (dist[k] = Infinity));
    dist[fromKey] = 0;
    const open = new Set(Object.keys(this.nodes));
    while (open.size) {
      let u = null, ud = Infinity;
      open.forEach((k) => { if (dist[k] < ud) { ud = dist[k]; u = k; } });
      if (!u || u === toKey) break;
      open.delete(u);
      this.adj[u].forEach((v) => {
        if (!g.hatch && ((u === 'uH' && v === 'rH') || (u === 'rH' && v === 'uH'))) return;
        if (!g.trap && ((u === 'gT' && v === 'bL') || (u === 'bL' && v === 'gT'))) return;
        const d = ud + this.nodes[u].distanceTo(this.nodes[v]);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      });
    }
    if (dist[toKey] === Infinity) return null;
    const out = [];
    let c = toKey;
    while (c) { out.unshift(c); c = prev[c]; }
    return out;
  }

  // Ruta exterior rodeando la cabaña: devuelve el siguiente punto al que ir
  routeAround(from, to) {
    const R = this.navRect;
    if (!U.segRect(from.x, from.z, to.x, to.z, R)) return to;
    const C = this.navCorners;
    const clear = (a, b) => !U.segRect(a.x, a.z, b.x, b.z, R);
    let best = null, bl = Infinity;
    for (let i = 0; i < 4; i++) {
      const ci = C[i];
      if (!clear(from, ci)) continue;
      const d0 = Math.hypot(ci.x - from.x, ci.z - from.z);
      if (clear(ci, to)) {
        const l = d0 + Math.hypot(to.x - ci.x, to.z - ci.z);
        if (l < bl) { bl = l; best = ci; }
      }
      [C[(i + 1) % 4], C[(i + 3) % 4]].forEach((cj) => {
        if (clear(cj, to)) {
          const l = d0 + ci.distanceTo(cj) + Math.hypot(to.x - cj.x, to.z - cj.z);
          if (l < bl) { bl = l; best = ci; }
        }
      });
    }
    return best || to;
  }

  update(dt, G) {
    this.doors.forEach((d) => d.update(dt));
    this.windows.forEach((w) => w.update(dt));
    this.hatch.update(dt);
    this.trapdoor.update(dt);
    // Parpadeo de luces: más fuerte si el intruso anda cerca
    const t = performance.now() * 0.001;
    const danger = G.intruder ? G.intruder.nearness : 0;
    this.fireLight.intensity = 1.5 + Math.sin(t * 13) * 0.2 + Math.sin(t * 7.3) * 0.15 + Math.random() * 0.15;
    this.fire.children.forEach((f, i) => (f.scale.y = 0.8 + Math.sin(t * 11 + i * 2) * 0.3));
    this.flicker -= dt;
    let lampOn = true;
    if (danger > 0.35 && Math.random() < danger * dt * 6) this.flicker = 0.05 + Math.random() * 0.15;
    if (this.flicker > 0) lampOn = false;
    if (G.power && !G.power.lightsActive) lampOn = false;
    this.lamp1.intensity = lampOn ? 1.3 : 0;
    this.lamp2.intensity = lampOn ? 1.1 : 0;
    this.porchLight.intensity = lampOn ? 0.9 : 0;
    this.bunkerLight.intensity = lampOn ? 1.4 : 0;
    this.bulbMat.color.set(lampOn ? 0xffd8a0 : 0x302010);
    this.lanternMat.color.set(lampOn ? 0xffb050 : 0x2a1a0a);
    const screens = G.power && G.power.powered;
    this.screenMat.color.set(screens ? (Math.random() < 0.03 ? 0x6a8a6a : 0x8fb08a) : 0x0c100c);
  }
}
